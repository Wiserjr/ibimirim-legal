"""Extract Aliança's fee tables from the annexes of the Código Tributário.

Unlike Ibimirim, whose tables came from a comparison spreadsheet, Aliança's sit
inside the law itself (pages 133-145 of LC 041/2017). Every value is in UFM,
never in reais: art. 396 institutes the unit and art. 397 updates it by IPCA,
so converting depends on the exercise's decree and belongs to the reader.

The PDF lays one cell per line — code, then label, then value — so the parser
walks the line stream as a small state machine rather than matching whole rows.
Each entry keeps the page it was read from, so the app can cite it.
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import fitz

from bundle import write_bundle

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "municipios" / "alianca" / "data" / "fees.js"
SOURCE = Path(r"C:/Users/WiseJr/Downloads/Documents/CTM_ALIANCA.pdf")
FIRST, LAST = 133, 145

TABLE = re.compile(r"^(TABELA|ANEXO)\b.*", re.I)
CODE = re.compile(r"^(\d{1,3}|[a-z]\)|[IVX]{1,4}|[A-E])$")
VALUE = re.compile(r"^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+$")
NOISE = re.compile(
    r"(?i)^(c[óo]digo|descri[çc][ãa]o|atividade|ufm|item|servi[çc]o|"
    r"c[óo]digo descri[çc][ãa]o|c[óo]digo atividade|valor)[\s|]*$"
)


CABECALHO = re.compile(
    r"\s*C[ÓO]DIGO.*$|\s*ITEM.*$|\s*DESCRI[ÇC][ÃA]O.*$", re.I
)


def limpar_titulo(texto: str) -> str:
    """O título e o cabeçalho de coluna saem na mesma sequência de linhas."""
    return CABECALHO.sub("", re.sub(r"\s+", " ", texto)).strip(" .:-")


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:58]


def to_number(raw: str) -> float | None:
    raw = raw.strip()
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if 0 < value < 1_000_000 else None


def main() -> None:
    document = fitz.open(SOURCE)
    secoes: list[dict] = []
    atual: dict | None = None
    # o rótulo de um grupo pode ficar no rodapé de uma página e valer para as
    # linhas da página seguinte ("05 Outras Atividades:" na p.136 rege a p.137),
    # por isso o estado atravessa a virada de página
    rotulo: list[str] = []
    codigo = ""

    for numero in range(FIRST, LAST + 1):
        linhas = [
            re.sub(r"[ \t]+", " ", linha).strip()
            for linha in document[numero - 1].get_text().split("\n")
        ]
        indice = 0
        while indice < len(linhas):
            linha = linhas[indice]
            indice += 1
            if not linha or NOISE.match(linha):
                continue

            if TABLE.match(linha) and len(linha) > 12:
                titulo = linha.strip(" .:")
                # o título costuma continuar na linha seguinte, em maiúsculas
                while (
                    indice < len(linhas)
                    and linhas[indice]
                    and linhas[indice] == linhas[indice].upper()
                    and not CODE.match(linhas[indice])
                    and not VALUE.match(linhas[indice])
                ):
                    titulo += " " + linhas[indice].strip(" .:")
                    indice += 1
                atual = {
                    "id": slug(limpar_titulo(titulo)),
                    "title": limpar_titulo(titulo),
                    "unit": "UFM",
                    "doc": "ctm-041-2017",
                    "pages": [numero],
                    "current": [],
                    "previous": [],
                }
                secoes.append(atual)
                rotulo, codigo = [], ""
                continue

            if atual is None:
                continue
            if numero not in atual["pages"]:
                atual["pages"].append(numero)

            # "100" matches both CODE and VALUE. What tells them apart is the
            # position in the code → label → value cycle, not the shape: a bare
            # number before any label is the row's code, after it is the price.
            # Deciding by regex alone silently dropped the whole ISS table,
            # whose values are integers without decimals.
            if CODE.match(linha) and not rotulo:
                codigo, rotulo = linha, []
                continue

            if VALUE.match(linha) and rotulo:
                valores = [to_number(linha)]
                while indice < len(linhas) and VALUE.match(linhas[indice]):
                    valores.append(to_number(linhas[indice]))
                    indice += 1
                valores = [v for v in valores if v is not None]
                texto = " ".join(rotulo).strip(" .-–—:")
                if valores and len(texto) >= 3:
                    entrada = {
                        "label": texto,
                        "kind": "ufm",
                        "ufm": valores[0],
                        "code": codigo,
                        "page": numero,
                    }
                    if len(valores) > 1:
                        entrada["ufmExtra"] = valores[1:]
                    atual["current"].append(entrada)
                rotulo, codigo = [], ""
                continue

            rotulo.append(linha)

    # "B até 100m²" só tem sentido junto do grupo que o encabeça
    faixa = re.compile(r"^([A-E])\s+(at[ée]|acima)", re.I)
    grupo_de = re.compile(r"^(.*?[^\s])\s+([A-E]\s+(?:at[ée]|acima).*)$", re.I)
    for secao in secoes:
        grupo = ""
        for entrada in secao["current"]:
            achado = grupo_de.match(entrada["label"])
            if achado and not faixa.match(entrada["label"]):
                grupo = achado.group(1).strip(" :")
                entrada["label"] = f"{grupo} — {achado.group(2)}"
                entrada["group"] = grupo
            elif faixa.match(entrada["label"]) and grupo:
                entrada["label"] = f"{grupo} — {entrada['label']}"
                entrada["group"] = grupo

    secoes = [s for s in secoes if any(e["kind"] == "ufm" for e in s["current"])]
    payload = {
        "municipio": "alianca",
        "unidade": "UFM",
        "source": {"doc": "ctm-041-2017", "pages": [FIRST, LAST]},
        "ufmNote": (
            "Todos os valores dos anexos do Código Tributário da Aliança são "
            "fixados em UFM. O art. 396 institui a unidade e o art. 397 manda "
            "atualizá-la anualmente pelo IPCA, cabendo ao Poder Executivo fixar "
            "o valor. Informe a UFM do exercício para ver os montantes em reais."
        ),
        "disclaimer": (
            "Extraído do texto dos anexos da LC nº 041/2017. Confira o valor e o "
            "enquadramento na publicação oficial antes de lançar."
        ),
        "sections": secoes,
    }
    write_bundle(OUTPUT, "MUNICIPIO_FEES", payload)

    total = sum(1 for s in secoes for e in s["current"] if e["kind"] == "ufm")
    print(f"{OUTPUT.relative_to(ROOT)} — {len(secoes)} tabelas, {total} valores em UFM")
    for s in secoes:
        valores = [e for e in s["current"] if e["kind"] == "ufm"]
        print(f"  p.{str(s['pages'][0]):>3} {s['title'][:60]:<60} {len(valores):>3}")


if __name__ == "__main__":
    main()
