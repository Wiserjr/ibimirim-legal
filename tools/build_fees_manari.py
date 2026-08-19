"""Monta municipios/manari/data/fees.js a partir das duas fontes.

As tabelas de Manari saem de dois caminhos, conforme o que a página permite:

  páginas 118-132 e 139  transcrição manual (`tabelas_manari.py`), porque a
                         coluna de valores vem deslocada do rótulo ou a tabela
                         tem mais de uma coluna de valor
  páginas 133-148        leitura por coordenada (`extract_fees_manari.py`), em
                         tabelas com borda e um valor por linha

Depois de montar, cada número é reconfrontado com o texto da sua própria
página: um erro de digitação na transcrição não passa silencioso.
"""
from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

import fitz

import extract_fees_manari as coordenada
import tabelas_manari as manual
from bundle import write_bundle

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "municipios" / "manari" / "data" / "fees.js"
DOC = "ctm-099-2007"

BASE = {
    "pct_vr": "sobre o Valor de Referência Fiscal",
    "pct": "sobre o preço do serviço",
    "ufm": "em UFM",
    "indice": "índice de correção",
}
KIND = {"pct_vr": "pct", "pct": "pct", "ufm": "ufm", "indice": "indice"}


def slug(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", texto.lower())).strip("-")[:58]


def entrada(label, valor, unidade, pagina, code="", confianca="alta", segundo=None, extras=None):
    kind = KIND[unidade]
    item = {"label": label, "kind": kind, "page": pagina, "confianca": confianca}
    item["ufm" if kind == "ufm" else "valor"] = valor
    if code:
        item["code"] = code
    if segundo is not None:
        item["anual"] = segundo
    if extras:
        item["extras"] = extras
    return item


def secoes() -> list[dict]:
    saida = []
    for tabela in manual.TABELAS:
        unidade = tabela["unidade"]
        itens = [
            entrada(rotulo, valor, unidade, pagina, code, confianca, segundo)
            for code, rotulo, valor, segundo, pagina, confianca in tabela["entradas"]
            if valor is not None
        ]
        saida.append({
            "id": tabela["id"], "title": tabela["titulo"], "unit": unidade,
            "base": BASE[unidade], "doc": DOC, "pages": tabela["paginas"],
            "origem": "transcrição manual", "current": itens, "previous": [],
            **({"note": tabela["nota"]} if tabela.get("nota") else {}),
        })

    documento = fitz.open(coordenada.SOURCE)
    for tabela in coordenada.tabelas(documento):
        if "construção civil" in tabela["titulo"].lower():
            continue  # essa foi transcrita à mão: tem três colunas de valor
        unidade = "pct_vr" if tabela["unidade"] == "pct_vr" else tabela["unidade"]
        itens = [
            entrada(e["label"], e["valor"], unidade, e["page"], e["code"], "alta",
                    extras=e["extras"])
            for e in tabela["entradas"]
        ]
        saida.append({
            "id": slug(tabela["titulo"]), "title": tabela["titulo"],
            "unit": unidade, "base": BASE[unidade], "doc": DOC,
            "pages": tabela["paginas"], "origem": "leitura por coordenada",
            "current": itens, "previous": [],
        })
    return saida


def conferir(secoes_montadas: list[dict]) -> list[str]:
    """Todo número tem de aparecer no texto da página que a entrada declara."""
    documento = fitz.open(coordenada.SOURCE)
    cache: dict[int, str] = {}
    falhas = []
    for secao in secoes_montadas:
        for item in secao["current"]:
            pagina = item["page"]
            if pagina not in cache:
                cache[pagina] = re.sub(r"\s+", " ", documento[pagina - 1].get_text())
            valor = item.get("ufm", item.get("valor"))
            if valor is None or valor == 0:
                continue
            inteiro = f"{valor:.0f}" if float(valor).is_integer() else ""
            decimal = f"{valor:.2f}".replace(".", ",")
            curto = f"{valor:g}".replace(".", ",")
            if not any(f in cache[pagina] for f in (inteiro, decimal, curto) if f):
                falhas.append(f"{secao['title'][:40]} | p.{pagina} | {item['label'][:44]} = {valor}")
    return falhas


def main() -> None:
    montadas = secoes()
    falhas = conferir(montadas)
    total = sum(len(s["current"]) for s in montadas)

    if "--conferir" in sys.argv:
        print(f"{total} valores conferidos contra o texto da própria página")
        for f in falhas:
            print(f"  DIVERGE  {f}")
        print(f"  {len(falhas)} divergências")
        return

    payload = {
        "municipio": "manari",
        "unidade": "UFM",
        "source": {"doc": DOC, "pages": [118, 148]},
        "ufmNote": (
            "As tabelas do Código de Manari usam duas referências que a própria lei "
            "não quantifica: a UFM e o Valor de Referência Fiscal. Informe a UFM do "
            "exercício para converter o que estiver nessa unidade; o que estiver em "
            "percentual do Valor de Referência depende de outro ato."
        ),
        "disclaimer": (
            "Tabelas dos anexos da Lei nº 99/2007, páginas 118 a 148, conferidas "
            "página a página contra o documento. Confira o enquadramento e o valor "
            "na publicação oficial antes de lançar."
        ),
        "conflitos": manual.CONFLITOS,
        "sections": montadas,
    }
    write_bundle(OUTPUT, "MUNICIPIO_FEES", payload)
    print(f"{OUTPUT.relative_to(ROOT)} — {len(montadas)} tabelas, {total} entradas")
    print(f"  {len(falhas)} números sem correspondência no texto da página")
    print(f"  {len(manual.CONFLITOS)} conflitos internos da lei registrados")


if __name__ == "__main__":
    main()
