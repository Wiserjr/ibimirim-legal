"""Encontra leis que alteram outras, e audita o alerta de vigência.

O alerta nasce de uma declaração explícita: em ``fontes.json``, o documento que
altera outro traz o campo ``altera``, com o documento alvo e a lista de artigos.
O aplicativo cruza isso com o ``fundamento`` de cada cobrança e acende o aviso.

Declarar à mão é o que torna o alerta confiável — mas é também o que o deixa
desatualizado quando entra lei nova. Este programa cobre os dois lados:

``--propor``  varre o texto atrás das fórmulas de alteração e mostra o que ainda
              não está declarado. NÃO grava nada: a fórmula localiza o trecho, e
              quem confere o artigo é uma pessoa, na página. Foi assim que se
              descobriu que a LC 007/2024 de Ingazeira altera cinco artigos, e
              não os quatro que estavam anotados.

``--auditar`` mostra, para cada município, quais cobranças o alerta vai acender
              hoje. Serve para responder "declarei e não aconteceu nada?" — em
              geral porque a cobrança se ancora na lei nova, o que é o certo.

    python tools/vigencia.py --auditar
    python tools/vigencia.py --propor
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# As três fórmulas que a legislação municipal da região usa para alterar outra
# lei. "passa a ter" é a de LC 004/2017 de Ingazeira, que refez um Título
# inteiro e escapava das outras duas.
ALTERACAO = re.compile(
    r"passa[m]?\s+a\s+vigorar|passa[m]?\s+a\s+ter\s+a\s+seguinte\s+reda[cç][aã]o|"
    r"d[áa]\s+nova\s+reda[cç][aã]o",
    re.I,
)
# O artigo alterado aparece entre aspas, encabeçando o texto novo. É o sinal
# mais limpo: o número solto antes de "da Lei" costuma ser o da lei que altera.
ARTIGO_NOVO = re.compile(r"[\"“”']\s*Art\.?\s*(\d{1,4}(?:\s*-\s*[A-Z])?)", re.I)
ARTIGO_CITADO = re.compile(r"\barts?\.?\s*(\d{1,4})|\bartigos?\s+(\d{1,4})", re.I)
# o número da lei alterada, para saber se ela está na biblioteca
LEI_ALVO = re.compile(r"Lei\s+(?:Complementar\s+)?(?:Municipal\s+)?n?[.º°\s]{0,4}(\d{1,4})", re.I)


def municipios() -> list[Path]:
    return sorted(p for p in (ROOT / "municipios").iterdir() if p.is_dir())


def corpus(pasta: Path) -> dict | None:
    f = pasta / "data" / "laws.js"
    if not f.exists():
        return None
    bruto = f.read_text(encoding="utf-8").strip()
    return json.loads(json.loads(bruto[bruto.index("(") + 1 : bruto.rindex(")")]))


def cobrancas(pasta: Path) -> list[dict]:
    f = pasta / "cobrancas.json"
    return json.loads(f.read_text(encoding="utf-8"))["cobrancas"] if f.exists() else []


def artigos_de(texto: str) -> set[int]:
    achados = set()
    for m in ARTIGO_CITADO.finditer(str(texto or "")):
        achados.add(int(m.group(1) or m.group(2)))
    return achados


def cobre(declarado: str, numero: int) -> bool:
    faixa = re.fullmatch(r"(\d{1,4})-(\d{1,4})", str(declarado))
    if faixa:
        return int(faixa.group(1)) <= numero <= int(faixa.group(2))
    return re.sub(r"-[A-Za-z]+$", "", str(declarado)) == str(numero)


def propor() -> int:
    achou = 0
    for pasta in municipios():
        dados = corpus(pasta)
        if not dados:
            continue
        declarados = {
            (d["id"], a["doc"])
            for d in dados["documents"]
            for a in d.get("altera", [])
        }
        linhas = []
        for doc in dados["documents"]:
            if doc.get("kind") in ("federal", "historical"):
                continue
            texto = re.sub(r"\s+", " ", " ".join(p["text"] for p in doc["pages"]))
            if not ALTERACAO.search(texto):
                continue
            # O número entre aspas é o artigo ALTERADO. Mas o reconhecimento
            # óptico às vezes fecha aspas ao redor do artigo da própria lei que
            # altera ("Art. 2º - O art. 312..."), e aí o 2 entra na lista. Como
            # a lei que altera tem poucos artigos e os numera do 1 em diante,
            # descartam-se os números que também aparecem como artigo próprio.
            proprios = {
                int(m.group(1))
                for m in re.finditer(r"(?<![\"“”'])Art\.?\s*(\d{1,2})\s*[º°]", texto)
            }
            alvos = sorted(
                {m.group(1).replace(" ", "") for m in ARTIGO_NOVO.finditer(texto)},
                key=lambda x: int(re.sub(r"\D", "", x) or 0),
            )
            alvos = [a for a in alvos if int(re.sub(r"\D", "", a) or 0) not in proprios]
            ja = [b for (a, b) in declarados if a == doc["id"]]
            if ja and alvos:
                # já declarado; confere só se a lista de artigos bate
                for a in doc.get("altera", []):
                    faltando = [x for x in alvos if not any(cobre(d, int(re.sub(r"\D", "", x) or 0)) for d in a["artigos"])]
                    if faltando:
                        linhas.append(f"    {doc['id']} -> {a['doc']}: artigos no texto e NÃO declarados: {faltando}")
                continue
            if not alvos:
                continue
            # A relação só é declarável se a lei alterada estiver na biblioteca.
            citados = {m.group(1).lstrip("0") for m in LEI_ALVO.finditer(texto)}
            na_casa = {
                outro["id"]
                for outro in dados["documents"]
                if outro["id"] != doc["id"]
                and {m.group(1).lstrip("0") for m in LEI_ALVO.finditer(outro.get("citation", ""))} & citados
            }
            if na_casa:
                linhas.append(
                    f"    {doc['id']}: altera artigos {alvos} de {sorted(na_casa)} — declarar em fontes.json?"
                )
            else:
                linhas.append(
                    f"    {doc['id']}: altera artigos {alvos} de lei FORA da biblioteca "
                    f"(citadas: {sorted(citados)}) — não há o que declarar; o alvo não está indexado"
                )
        if linhas:
            achou += len(linhas)
            print(f"  {pasta.name}")
            print("\n".join(linhas))
    if not achou:
        print("nada a propor: toda fórmula de alteração encontrada já está declarada")
    return achou


def auditar() -> None:
    for pasta in municipios():
        dados = corpus(pasta)
        if not dados:
            continue
        regras = [
            (doc, a) for doc in dados["documents"] for a in doc.get("altera", [])
        ]
        cobs = cobrancas(pasta)
        if not regras and not cobs:
            continue
        acesos = []
        for c in cobs:
            for f in c.get("fundamento", []):
                numeros = artigos_de(f.get("artigo"))
                for doc, a in regras:
                    if a["doc"] != f["doc"]:
                        continue
                    atingidos = [n for n in numeros if any(cobre(d, n) for d in a["artigos"])]
                    if atingidos:
                        acesos.append((c["id"], doc["id"], atingidos))
        marca = f"{len(regras)} regra(s)"
        if acesos:
            print(f"  {pasta.name:<20} {marca} · {len(acesos)} alerta(s):")
            for cid, por, arts in acesos:
                print(f"      {cid} — alterado por {por}, art(s). {', '.join(map(str, arts))}")
        elif regras:
            print(f"  {pasta.name:<20} {marca} · nenhum alerta: nenhuma cobrança se apoia nos artigos alterados")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--propor", action="store_true", help="procura alterações ainda não declaradas")
    ap.add_argument("--auditar", action="store_true", help="mostra os alertas que o app vai acender")
    args = ap.parse_args()
    if args.propor:
        print("=== alterações encontradas no texto e ainda não declaradas ===")
        propor()
    if args.auditar or not args.propor:
        print("=== alertas de vigência, por município ===")
        auditar()


if __name__ == "__main__":
    main()
