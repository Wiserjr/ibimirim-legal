"""Confere cada valor transcrito contra o texto da página que ele cita.

Em Jurema deu para conferir célula a célula porque a mesma tabela existia duas
vezes no acervo — em UFM na redação de 2007 e em reais no Decreto de 2013 —, e
uma serviu de prova da outra. Essa sorte não se repete nos outros municípios.

O que dá para fazer em todos é a metade verificável: **todo valor que o cadastro
afirma tem de aparecer no texto da página que ele cita**. Isso não prova o
emparelhamento entre rótulo e valor, mas pega o que mais acontece na prática —
valor inventado, dígito trocado, casa decimal errada, tabela citada na página
errada.

O reconhecimento óptico escreve o mesmo número de várias formas: ``57,60``,
``57.60``, ``5760`` e às vezes ``57 60``. A comparação normaliza tudo para
centavos antes de decidir.

    python tools/conferir_tabelas.py                # todos
    python tools/conferir_tabelas.py jatoba         # um só
    python tools/conferir_tabelas.py --detalhe      # lista item a item o que falhou
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# 57,60 · 57.60 · 1.200,00 · 5760 (vírgula comida) · 0,57
NUMERO = re.compile(r"\d{1,3}(?:\.\d{3})*(?:[.,]\d{1,2})?|\d{4,7}")
# O reconhecimento enfia lixo DENTRO do número: `1,15` vira `'t,15`, `1 ,'15`,
# `'1,?5`; `5,75` vira `5,7 5`. Antes de procurar, o texto é limpo desse ruído.
RUIDO_NO_NUMERO = re.compile(r"['`´\"?´�]")
# Só se juntam espaços DENTRO do número — `5,7 5` e `1 ,15`. A regra ampla
# colava um valor no seguinte: `86,40 100,80` virava um número só, e o
# conferidor passou a acusar 55 falhas em Jurema onde não havia nenhuma.
COLA_NO_NUMERO = [
    (re.compile(r"(\d)\s+,"), "\\1,"),
    (re.compile(r",\s+(\d)(?=\d)"), ",\\1"),
    (re.compile(r"(,\d)\s+(\d)(?!\d)"), "\\1\\2"),
]
# Página cujo texto está corrompido demais para servir de prova: conta-se a
# sujeira por caractere. Acima do limite, o conferidor se cala em vez de acusar.
SUJEIRA = re.compile(r"[�¿?]|[a-zA-Z][,.]\d|\d[a-zA-Z]")


def centavos(texto: str) -> int | None:
    """Normaliza qualquer grafia para centavos, ou devolve None se não der."""
    t = texto.strip()
    if "," in t:
        inteiro, _, frac = t.rpartition(",")
        return int((inteiro.replace(".", "") or "0")) * 100 + int(frac.ljust(2, "0")[:2])
    if "." in t:
        inteiro, _, frac = t.rpartition(".")
        if len(frac) == 3:                       # 1.200 -> milhar
            return int((inteiro + frac).replace(".", "")) * 100
        return int((inteiro.replace(".", "") or "0")) * 100 + int(frac.ljust(2, "0")[:2])
    return int(t) * 100


def limpar(texto: str) -> str:
    t = RUIDO_NO_NUMERO.sub("", texto)
    for padrao, troca in COLA_NO_NUMERO:
        t = padrao.sub(troca, t)
    return t


def ilegivel(texto: str) -> bool:
    """Diz se a página está corrompida a ponto de não poder confirmar nada."""
    if len(texto) < 200:
        return True
    return len(SUJEIRA.findall(texto)) / len(texto) > 0.012


def valores_da_pagina(texto: str) -> set[int]:
    """Todos os números da página, em centavos, com as leituras plausíveis.

    Um `8000` solto pode ser oitenta reais com a vírgula comida ou oito mil.
    As duas entram, senão o conferidor acusa erro onde só houve reconhecimento
    ruim — e acusar errado gasta a confiança de quem usa.
    """
    achados: set[int] = set()
    for m in NUMERO.finditer(limpar(texto)):
        bruto = m.group(0)
        c = centavos(bruto)
        if c is None:
            continue
        achados.add(c)
        if "," not in bruto and "." not in bruto and len(bruto) >= 3:
            achados.add(c // 100)                # 8000 lido como 80,00
    return achados


def valores_da_cobranca(cobranca: dict) -> list[tuple]:
    """Todo valor que a cobrança afirma, venha de tabela ou de faixa.

    Por muito tempo só os `itens` eram conferidos, e as `faixas` passavam
    inteiras — 80 valores em 11 cobranças, entre eles as onze faixas do
    habite-se de Tacaratu e as duas escalas de limpeza de Cortês. Uma tabela
    que a lei escreve por faixa não é menos tabela.
    """
    base = cobranca.get("base") or {}
    achados = [(i.get("valor"), str(i.get("rotulo") or "")) for i in (base.get("itens") or [])]
    for faixa in base.get("faixas") or []:
        if isinstance(faixa, (list, tuple)) and len(faixa) >= 2:
            teto = faixa[0]
            rotulo = f"até {teto}" if teto is not None else "acima da última faixa"
            achados.append((faixa[1], rotulo))
    return achados


def paginas_citadas(cobranca: dict) -> dict[str, list[int]]:
    porta: dict[str, list[int]] = {}
    for f in cobranca.get("fundamento", []):
        porta.setdefault(f["doc"], []).append(int(f["pagina"]))
    return porta


def corpus(slug: str) -> dict:
    bruto = (ROOT / "municipios" / slug / "data" / "laws.js").read_text(encoding="utf-8").strip()
    return json.loads(json.loads(bruto[bruto.index("(") + 1 : bruto.rindex(")")]))


def conferir(slug: str, detalhe: bool) -> tuple[int, int, list[str]]:
    arq = ROOT / "municipios" / slug / "cobrancas.json"
    if not arq.exists():
        return 0, 0, []
    cobrancas = json.loads(arq.read_text(encoding="utf-8"))["cobrancas"]
    docs = {d["id"]: {p["page"]: p["text"] for p in d["pages"]} for d in corpus(slug)["documents"]}

    total = achados = 0
    falhas: list[str] = []
    ilegiveis: list[str] = []
    for c in cobrancas:
        if not valores_da_cobranca(c):
            continue
        # a página citada nem sempre é a da tabela; junta-se o texto de todas,
        # mais a vizinha, porque tabela longa atravessa a virada de página
        universo: set[int] = set()
        sujas = 0
        limpas = 0
        for doc_id, pgs in paginas_citadas(c).items():
            pag = docs.get(doc_id, {})
            for n in pgs:
                for k in (n - 1, n, n + 1):
                    if k in pag:
                        universo |= valores_da_pagina(pag[k])
                        if k in pgs:
                            sujas += ilegivel(pag[k])
                            limpas += 1
        if not universo:
            continue
        if limpas and sujas == limpas:
            # Não se afirma que foi conferida: pergunta-se à nota. A frase valia
            # para as cinco de então; ao alargar o conferidor às faixas
            # entraram outras, e a mensagem passou a garantir por elas uma
            # conferência que ninguém tinha feito.
            feita = "CONFERIDO NA IMAGEM" in (c.get("nota") or "").upper()
            ilegiveis.append(
                f"{slug} · {c['id']} · texto da página ilegível — "
                + ("conferido na imagem, ver a nota da cobrança" if feita
                   else "AINDA NÃO CONFERIDO na imagem"))
            continue
        for v, rotulo in valores_da_cobranca(c):
            if not isinstance(v, (int, float)) or v == 0:
                continue          # zero é isenção; a página escreve "Isento"
            total += 1
            alvo = round(v * 100)
            # tolera o centavo de arredondamento da conversão por UFM
            if any(abs(alvo - u) <= 1 for u in universo):
                achados += 1
            else:
                falhas.append(f"{slug} · {c['id']} · {v:,.2f} — {rotulo[:56]}")
    if detalhe:
        for f in falhas:
            print("      " + f)
    if detalhe:
        for f in ilegiveis:
            print("      " + f)
    return total, achados, falhas, ilegiveis



# --- o artigo citado aparece mesmo na pagina citada? ----------------------
# Nao basta o valor estar certo: quem clica em "Ver fundamento" precisa cair
# no dispositivo. Continuacao de artigo entre paginas e normal, entao so se
# acusa quando o artigo existe em OUTRO lugar do documento, longe dali --
# foi assim que apareceu o art. 80 de Vertente do Lerio, citado na pagina 63
# quando esta na 38.
ARTIGO_CITADO = re.compile(r"\barts?\.?\s*(\d{1,4})|\bartigos?\s+(\d{1,4})", re.I)


def conferir_citacoes(slug: str) -> list[str]:
    arq = ROOT / "municipios" / slug / "cobrancas.json"
    if not arq.exists():
        return []
    docs = {d["id"]: {p["page"]: p["text"] for p in d["pages"]} for d in corpus(slug)["documents"]}
    graves: list[str] = []
    for c in json.loads(arq.read_text(encoding="utf-8"))["cobrancas"]:
        for f in c.get("fundamento", []):
            nums = {int(m.group(1) or m.group(2)) for m in ARTIGO_CITADO.finditer(str(f.get("artigo", "")))}
            pag = docs.get(f["doc"], {})
            n = int(f["pagina"])
            if not nums or n not in pag:
                continue
            if any(re.search(rf"Art\.?\s*{x}\b", pag.get(k, "")) for x in nums for k in (n - 1, n, n + 1)):
                continue
            for x in sorted(nums):
                onde = [k for k in sorted(pag)
                        if re.search(rf"Art\.?\s*{x}\s*[-.]", pag[k]) and abs(k - n) > 2]
                if onde:
                    graves.append(f"{slug} · {c['id']} · cita {f['doc']} p.{n} para o art. {x}, "
                                  f"que está na página {onde[0]}")
    return graves


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="?", help="um município; sem isso, todos")
    ap.add_argument("--detalhe", action="store_true", help="lista cada valor não encontrado")
    args = ap.parse_args()

    slugs = [args.slug] if args.slug else sorted(
        p.name for p in (ROOT / "municipios").iterdir() if p.is_dir())
    geral_total = geral_ok = 0
    pendentes: list[str] = []
    mudos: list[str] = []
    for slug in slugs:
        total, ok, falhas, ileg = conferir(slug, args.detalhe)
        mudos.extend(ileg)
        if not total:
            continue
        geral_total += total
        geral_ok += ok
        pendentes += falhas
        marca = "" if ok == total else f"  ← {total - ok} não encontrado(s)"
        print(f"  {slug:<20} {ok:>4}/{total:<4} valores conferem na página citada{marca}")
    print(f"\n  TOTAL {geral_ok}/{geral_total} — {geral_total - geral_ok} a investigar")
    citacoes = [g for s in slugs for g in conferir_citacoes(s)]
    print(f"  citações de artigo apontando para a página errada: {len(citacoes)}")
    for g in citacoes:
        print("      " + g)
    if pendentes and not args.detalhe:
        print("  rode com --detalhe para ver quais")


if __name__ == "__main__":
    main()
