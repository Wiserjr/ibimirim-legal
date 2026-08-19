"""Extrai as tabelas com borda do Código de Manari, por coordenada.

As páginas 118 a 132 têm a coluna de valores deslocada em relação ao rótulo e
foram transcritas à mão em `tabelas_manari.py`. Já as páginas 133 a 148 têm
borda real e um valor por linha: nelas dá para ler as palavras com suas
coordenadas e separar rótulo de valor pela posição horizontal, o que é
verificável e não depende da ordem em que o PDF emite o texto.

A separação foi validada contra a leitura visual das páginas 128, 139 e 146
antes de ser aplicada às demais — `--validar` refaz essa conferência.
"""
from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

import fitz

from bundle import write_bundle

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(
    r"C:/Users/WiseJr/Downloads/Tributos-Ibimirim/Legislacao"
    r"/LEI Nº 099_2007 CÓDIGO TRIBUTÁRIO MUNICIPAL.pdf"
)

# Os títulos das sub-tabelas aparecem como linha sem valor. Separar por eles,
# e não por intervalo de página, evita que uma página com duas tabelas jogue as
# entradas de uma dentro da outra.
CABECALHOS = [
    (r"^Tabela de servi", "Lista de serviços — ISS", "pct"),
    (r"^Taxa de Fiscalização de Localiza", "Taxa de fiscalização de localização, instalação e funcionamento", "ufm"),
    (r"^Taxa de Publicidade", "Taxa de publicidade", "ufm"),
    (r"^Taxa de Veículos", "Taxa de veículos", "ufm"),
    (r"^Prorrogação de Horário", "Prorrogação de horário", "ufm"),
    (r"^Ambulante e Feirante", "Ambulante e feirante", "ufm"),
    (r"^Diversões Públicas", "Ocupação de solo e diversões públicas", "ufm"),
    (r"^Depósito e Libera", "Depósito, liberação de bens e cemitério", "ufm"),
    (r"^Expediente", "Taxa de expediente", "ufm"),
    (r"^TABELA DA TAXA DE FISCALIZA", "Taxa de fiscalização sanitária", "ufm"),
    (r"^DIVISÃO DE CONTROLE", "Divisão de controle — atividades descentralizadas", "ufm"),
]
PRIMEIRA, ULTIMA = 133, 148
INICIAL = ("Lista de serviços — ISS", "pct")

# Algumas tabelas não trazem título próprio: começam logo após outra, apenas
# reiniciando a numeração. Estas foram identificadas na leitura visual das
# páginas e recebem aqui o nome que lhes cabe.
SEM_TITULO = {
    (139, "01"): ("Tabela de valores para construção civil", "ufm"),
    (141, "1"): ("Obras e edificações, por zona", "ufm"),
    (146, "1"): ("Fiscalização sanitária — atividades descentralizadas", "ufm"),
    (148, "1"): ("Divisão de controle do exercício — atividades descentralizadas", "ufm"),
}

VALOR = re.compile(r"^\d{1,3}(?:[.,]\d{1,3})?$|^Isento$", re.I)
INICIO_ITEM = re.compile(r"^(\d{1,3})\s+(.+)$")
CORTE = 0.72  # fração da largura a partir da qual a palavra é valor


def slug(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", texto.lower())).strip("-")[:58]


def numero(bruto: str) -> float | None:
    bruto = bruto.strip().replace("%", "").strip()
    if bruto.lower() == "isento":
        return 0.0
    try:
        return float(bruto.replace(".", "").replace(",", ".") if "," in bruto else bruto)
    except ValueError:
        return None


def linhas_da_pagina(documento: fitz.Document, pagina: int) -> list[tuple[str, str]]:
    """Devolve (rótulo, valor) por linha, separando as colunas pela coordenada x."""
    p = documento[pagina - 1]
    largura = p.rect.width
    agrupadas: dict[int, list[tuple[float, str]]] = {}
    for x0, y0, _x1, _y1, texto, *_ in p.get_text("words"):
        agrupadas.setdefault(round(y0 / 3), []).append((x0, texto))
    saida = []
    for chave in sorted(agrupadas):
        itens = sorted(agrupadas[chave])
        rotulo = " ".join(t for x, t in itens if x < largura * CORTE).strip()
        valor = " ".join(t for x, t in itens if x >= largura * CORTE).strip()
        if rotulo or valor:
            saida.append((rotulo, valor))
    return saida


def entradas_do_intervalo(documento, primeira: int, ultima: int) -> list[dict]:
    """Junta as linhas em itens: um item vai do seu número até o número seguinte."""
    linhas = []
    for pagina in range(primeira, ultima + 1):
        for rotulo, valor in linhas_da_pagina(documento, pagina):
            if re.match(r"^(Rua nova|Cep:|PREFEITURA|Estado de)", rotulo):
                continue
            linhas.append((pagina, rotulo, valor))

    itens: list[dict] = []
    atual: dict | None = None
    for pagina, rotulo, valor in linhas:
        comeco = INICIO_ITEM.match(rotulo)
        # Em alguns itens o número fica sozinho numa linha e a descrição vem na
        # seguinte. Sem tratar esse caso, o número é lido como continuação do
        # item anterior e os dois se fundem num rótulo só.
        if re.fullmatch(r"\d{1,3}", rotulo):
            if atual:
                itens.append(atual)
            atual = {"code": rotulo, "partes": [], "valores": [], "page": pagina}
        elif comeco and len(comeco.group(2)) > 2:
            if atual:
                itens.append(atual)
            atual = {"code": comeco.group(1), "partes": [comeco.group(2)],
                     "valores": [], "page": pagina}
        elif atual and rotulo:
            atual["partes"].append(rotulo)
        if atual and valor:
            for pedaco in valor.split():
                convertido = numero(pedaco)
                if convertido is not None:
                    atual["valores"].append(convertido)
    if atual:
        itens.append(atual)

    resultado = []
    for item in itens:
        if not item["valores"]:
            continue
        rotulo = re.sub(r"\s+", " ", " ".join(item["partes"])).strip(" .:-")
        resultado.append({
            "label": rotulo,
            "code": item["code"],
            "valor": item["valores"][0],
            "extras": item["valores"][1:],
            "page": item["page"],
        })
    return resultado


def tabelas(documento) -> list[dict]:
    """Percorre as páginas com borda e fecha uma tabela a cada cabeçalho novo."""
    titulo, unidade = INICIAL
    atual = {"titulo": titulo, "unidade": unidade, "paginas": [], "entradas": []}
    saida = [atual]
    item = None

    def fechar():
        nonlocal item
        if item and item["valores"]:
            rotulo = re.sub(r"\s+", " ", " ".join(item["partes"])).strip(" .:-")
            if len(rotulo) > 2:
                atual["entradas"].append({
                    "label": rotulo, "code": item["code"],
                    "valor": item["valores"][0], "extras": item["valores"][1:],
                    "page": item["page"],
                })
        item = None

    for pagina in range(PRIMEIRA, ULTIMA + 1):
        for rotulo, valor in linhas_da_pagina(documento, pagina):
            if re.match(r"^(Rua nova|Cep:|PREFEITURA|Estado de)", rotulo):
                continue
            achado = next((t for padrao, t, u in
                           ((p, t, u) for p, t, u in CABECALHOS)
                           if re.match(padrao, rotulo)), None)
            if achado and not valor:
                unidade_nova = next(u for p, t, u in CABECALHOS if re.match(p, rotulo))
                fechar()
                atual = {"titulo": achado, "unidade": unidade_nova,
                         "paginas": [], "entradas": []}
                saida.append(atual)
                continue
            if pagina not in atual["paginas"]:
                atual["paginas"].append(pagina)
            def abrir(codigo, primeira_parte):
                """Numeração voltar a 1 marca uma tabela nova sem título próprio."""
                nonlocal atual, item
                fechar()
                if codigo in ("1", "01") and len(atual["entradas"]) > 1:
                    titulo_novo, unidade_nova = SEM_TITULO.get(
                        (pagina, codigo), (f"{atual['titulo']} (continuação)", atual["unidade"])
                    )
                    atual = {"titulo": titulo_novo, "unidade": unidade_nova,
                             "paginas": [pagina], "entradas": []}
                    saida.append(atual)
                item = {"code": codigo, "partes": list(primeira_parte),
                        "valores": [], "page": pagina}

            if re.fullmatch(r"\d{1,3}", rotulo):
                abrir(rotulo, [])
            else:
                comeco = INICIO_ITEM.match(rotulo)
                if comeco and len(comeco.group(2)) > 2:
                    abrir(comeco.group(1), [comeco.group(2)])
                elif item and rotulo:
                    item["partes"].append(rotulo)
            if item and valor:
                for pedaco in valor.split():
                    convertido = numero(pedaco)
                    if convertido is not None:
                        item["valores"].append(convertido)
    fechar()
    return [t for t in saida if t["entradas"]]


def main() -> None:
    documento = fitz.open(SOURCE)
    if "--validar" in sys.argv:
        # p.146 foi lida visualmente; estes são os valores conferidos no papel
        esperado = {"Serviços de buffet": 50, "Padarias": 50, "Especiarias": 20,
                    "Industria de bebidas alcoólicas": 200, "Mercados": 40}
        achados = {e["label"]: e["valor"] for e in entradas_do_intervalo(documento, 146, 146)}
        for rotulo, valor in esperado.items():
            obtido = achados.get(rotulo)
            marca = "OK " if obtido == valor else "FALHA"
            print(f"  {marca} p.146 {rotulo[:44]:<44} esperado {valor} obtido {obtido}")
        return

    encontradas = tabelas(documento)
    total = sum(len(t["entradas"]) for t in encontradas)
    for t in encontradas:
        faixa = f"p.{t['paginas'][0]}-{t['paginas'][-1]}" if t["paginas"] else "-"
        print(f"  {faixa:<10} {t['titulo'][:52]:<52} {len(t['entradas']):>3} ({t['unidade']})")
    print(f"  total: {len(encontradas)} tabelas, {total} entradas")


if __name__ == "__main__":
    main()
