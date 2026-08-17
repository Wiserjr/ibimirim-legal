"""Build the structured fee tables from the comparison spreadsheet.

The sheet holds two INDEPENDENT lists side by side: columns A-D describe the
previous CTM, columns E-F describe the 2025 CTM. Rows are not aligned between
the two sides, so each side is parsed on its own and keeps its source row.
Linking an old entry to a new one is a human decision recorded elsewhere.
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(
    r"C:\Users\WiseJr\Downloads\Tributos-Ibimirim\Legislacao"
    r"\Comparativo - CTM Ibimirim - Taxas.xlsx"
)
OUTPUT = ROOT / "public" / "data" / "fees.json"

# Page anchors in the CTM 2025 PDF, established by matching each entry label
# against the indexed page text (tools/extract_fees.py is the only place that
# claims a page). "status" records how well the sheet agrees with the law:
#   confirmado  - labels and values found on the cited pages
#   parcial     - table located, but not every label matched
#   divergente  - the sheet's "Novo CTM" column does NOT match the enacted text
ANCHORS = {
    6: ("Anexo IV, Tabela I", [209], "confirmado"),
    62: ("Anexo IV, Tabela II", [209], "parcial"),
    78: ("Anexo IV, Tabela III", [210, 211], "confirmado"),
    107: ("Anexo IV, Tabela IV", [211, 212, 213], "confirmado"),
    257: ("Anexo IV, Tabela V", [214], "parcial"),
    274: ("Anexo IV, itens 10 a 14", [214], "divergente"),
    288: ("Anexo IV, vigilância sanitária", [215, 216], "confirmado"),
    408: ("Corpo da lei", [150], "parcial"),
    432: ("Anexo V, Tabela I", [217], "confirmado"),
    437: ("Anexo V, guarda e abate", [217], "confirmado"),
}

SHORT = {
    6: "Localização e funcionamento",
    62: "Máquinas e motores",
    78: "Publicidade",
    107: "Obras e engenharia",
    257: "Comércio eventual e ambulante",
    274: "Ocupação de vias",
    288: "Vigilância sanitária",
    408: "Atividades eventuais",
    432: "Resíduos sólidos (TRSD)",
    437: "Guarda e abate de animais",
}

NOTES = {
    274: (
        "Os itens e valores desta seção no comparativo não foram localizados no "
        "texto do CTM 2025 indexado. A página 214 traz outra lista (arquibancada, "
        "camarote, stand, circo, parque de diversão) com valores diferentes. "
        "Confirme na publicação oficial antes de cobrar."
    ),
}

SECTION_RE = re.compile(r"^(TAXAS?|CONTRIBUI|EMOLUMENT)", re.I)
MONEY_RE = re.compile(r"(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:[.,]\d+)?)")
UNIT_RE = re.compile(
    r"por\s+(m²|m2|metro linear|metros lineares|cada dia[^,.]*|unidade|dia)", re.I
)


# Not in the spreadsheet: a taxa instituted by its own law and denominated in
# UFM, which the CTM 2025 (p.192) keeps in force in that unit. Values stay in
# UFM here — converting to reais needs the UFM of the exercise, which only the
# Município can state.
SOLAR = {
    "id": "torres-antenas-placas-solares",
    "title": "TAXA DE FISCALIZAÇÃO DE LICENÇA PARA FUNCIONAMENTO DE TORRES, ANTENAS E PLACAS DE ENERGIA SOLAR",
    "short": "Torres, antenas e placas solares",
    "row": None,
    "table": "Lei nº 793/2018, art. 2º, na redação da Lei nº 988/2025",
    "doc": "lei-988-2025",
    "tag": "Lei 988/2025",
    "pages": [1],
    "status": "confirmado",
    "unit": "UFM",
    "cap": 100000.0,
    "note": (
        "Cobrança anual, com pagamento até 31 de janeiro de cada ano (art. 4º da Lei 793/2018). "
        "Placas de energia solar instaladas para uso domiciliar são isentas (art. 1º, parágrafo "
        "único). A taxa é limitada a R$ 100.000,00 por alvará. Os novos valores produzem efeitos "
        "a partir de 1º de janeiro de 2026."
    ),
    "warning": (
        "Antes de lançar, verifique sobreposição com o Código de 2025. A Taxa de Localização e "
        "Funcionamento (art. 267) é anual e alcança estabelecimento \"edificado ou não\" "
        "(art. 265, §1º); a Taxa de Máquinas e Motores (art. 271) incide sobre o funcionamento "
        "de máquinas por unidade, e o art. 272 afirma a cumulação com outras taxas. O Código não "
        "traz regra de dedução ou compensação entre suas taxas e as de leis específicas. O CTM "
        "também não revoga a Lei 793/2018 pelo número — a cláusula do art. 423, §2º é genérica. "
        "Questão para a Procuradoria, não para o balcão."
    ),
    "current": [
        {"label": "Torre eólica, de telefonia fixa ou móvel, por unidade ao ano",
         "kind": "ufm", "ufm": 5000.0, "per": "unidade"},
        {"label": "Antena de telefonia fixa ou móvel e de televisão, por unidade ao ano",
         "kind": "ufm", "ufm": 1000.0, "per": "unidade"},
        {"label": "Placa de energia solar, por metro quadrado ao ano",
         "kind": "ufm", "ufm": 0.35, "per": "m²"},
    ],
    "prevDoc": "lei-793-2018",
    "prevTag": "Lei 793/2018",
    "prevLabel": "Redação original",
    "previous": [
        {"label": "Placa de energia solar, por metro quadrado ao ano — redação original de 2018",
         "kind": "ufm", "ufm": 50.0, "per": "m²", "page": 1},
    ],
}


def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:60]


def to_number(raw) -> float | None:
    """Accept 447.34 (already numeric) and '1.160,00' (pt-BR text)."""
    if isinstance(raw, (int, float)):
        return float(raw)
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text or not re.fullmatch(r"[R$\s\d.,]+", text):
        return None
    text = text.replace("R$", "").strip()
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def parse_formula(label: str, raw: str) -> dict | None:
    """'R$ 150,00, mais R$ 0,30 por m² acrescido.' -> base 150, rate 0.30/m²."""
    if not isinstance(raw, str):
        return None
    if not re.search(r"mais|\+", raw, re.I):
        return None
    amounts = [to_number(m) for m in MONEY_RE.findall(raw)]
    amounts = [a for a in amounts if a is not None]
    if len(amounts) < 2:
        return None
    unit = UNIT_RE.search(raw)
    threshold = None
    limit = re.search(
        r"(?:superior(?:es)? a|acima de|at[eé])\s*(\d[\d.,]*)", label, re.I
    )
    if limit:
        threshold = to_number(limit.group(1))
    return {
        "kind": "formula",
        "base": amounts[0],
        "rate": amounts[1],
        "unit": unit.group(1).lower().replace("m2", "m²") if unit else None,
        "threshold": threshold,
        "raw": raw.strip(),
    }


TIER_RE = re.compile(r"R\$\s*([\d.,]+)\s*\(\s*([PMG])\s*\)")
TIER_NAMES = {"P": "até 20 m²", "M": "20,01 a 40 m²", "G": "acima de 40,01 m²"}


def parse_tiers(raw) -> list | None:
    """'R$ 89,47 (P); R$ 178,94 (M)' -> the old size tiers, kept as data."""
    if not isinstance(raw, str):
        return None
    found = TIER_RE.findall(raw)
    if not found:
        return None
    return [
        {"tier": t, "label": TIER_NAMES[t], "value": to_number(v)} for v, t in found
    ]


def make_entry(label: str, value_cell, row: int) -> dict:
    entry = {"label": re.sub(r"\s+", " ", label).strip(), "row": row}
    number = to_number(value_cell)
    if number is not None:
        entry["kind"] = "fixed"
        entry["value"] = number
        return entry
    formula = parse_formula(entry["label"], value_cell)
    if formula:
        entry.update(formula)
        return entry
    tiers = parse_tiers(value_cell)
    if tiers:
        entry["kind"] = "tiered"
        entry["tiers"] = tiers
        entry["raw"] = re.sub(r"\s+", " ", value_cell).strip()
        return entry
    if isinstance(value_cell, str) and value_cell.strip():
        entry["kind"] = "text"
        entry["raw"] = re.sub(r"\s+", " ", value_cell).strip()
        return entry
    entry["kind"] = "heading"
    return entry


def main() -> None:
    book = openpyxl.load_workbook(SOURCE, data_only=True)
    sheet = book["Planilha1"]
    rows = list(sheet.iter_rows(values_only=True))

    sections, current = [], None
    for index, row in enumerate(rows, start=1):
        cells = list(row) + [None] * (8 - len(row))
        left_label = cells[0] if isinstance(cells[0], str) else None
        left_value = next((c for c in cells[1:4] if c not in (None, "")), None)
        right_label = cells[4] if isinstance(cells[4], str) else None
        right_value = cells[5]

        is_section = (
            left_label
            and left_label.strip()
            and all(c in (None, "") for c in cells[1:])
            and SECTION_RE.match(left_label.strip())
            and left_label.strip().upper() == left_label.strip()
        )
        if is_section:
            title = re.sub(r"\s+", " ", left_label).strip()
            table, pages, status = ANCHORS.get(index, (None, [], "sem ancora"))
            current = {
                "id": slug(title),
                "title": title,
                "short": SHORT.get(index, title.capitalize()),
                "row": index,
                "table": table,
                "doc": "ctm-2025",
                "pages": pages,
                "status": status,
                "note": NOTES.get(index),
                "previous": [],
                "current": [],
            }
            sections.append(current)
            continue
        if current is None:
            continue
        caption = isinstance(cells[1], str) and (
            cells[1].strip().lower() == "valor único"
            or cells[1].strip().startswith("P (")
        )
        if left_label and left_label.strip() and not caption:
            entry = make_entry(left_label, left_value, index)
            outskirts = parse_tiers(cells[3])
            if entry["kind"] == "tiered" and outskirts:
                entry["zone"] = "centro"
                entry["outskirts"] = outskirts
            current["previous"].append(entry)
        if right_label and right_label.strip():
            current["current"].append(make_entry(right_label, right_value, index))

    sections.append(SOLAR)

    payload = {
        "generated": date.today().isoformat(),
        "source": {"file": SOURCE.name, "sheet": "Planilha1"},
        "ufmNote": (
            "Valores fixados em UFM não são convertidos aqui. O corpus não traz o valor "
            "da UFM em reais, e o art. 419 do Código de 2025 reajusta pelo IPCA apenas os "
            "valores expressos em moeda corrente nos seus Anexos. A conversão depende do "
            "valor do exercício, informado pelo usuário no aplicativo."
        ),
        "disclaimer": (
            "Extraído do comparativo fornecido pela equipe. Os lados anterior e "
            "atual são listas independentes: nenhuma equivalência entre eles foi "
            "inferida automaticamente."
        ),
        "sections": sections,
    }
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    print(f"{OUTPUT.relative_to(ROOT)} — {len(sections)} seções")
    for section in sections:
        kinds = {}
        for entry in section["current"]:
            kinds[entry["kind"]] = kinds.get(entry["kind"], 0) + 1
        print(
            f"  {str(section['row'] or 'lei'):>4} {section['title'][:52]:<52}"
            f" anterior={len(section['previous']):>3} atual={len(section['current']):>3}"
            f" p.{section['pages'] or '-'} {section['status']}"
        )


if __name__ == "__main__":
    main()
