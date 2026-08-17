"""Build the offline legal corpus from the source PDFs.

Text PDFs use pypdf. Image-only municipal laws are rendered and OCR'd.
Output is page-addressable so the UI can cite the source precisely.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
import pypdf
import pypdfium2 as pdfium
from rapidocr_onnxruntime import RapidOCR

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data" / "laws.json"

DOCS = [
    ("ctm-2025", "Código Tributário Municipal", "Lei Complementar nº 004/2025", "municipal", Path(r"C:\Users\WiseJr\Desktop\Codigo Tributario 2025.pdf")),
    ("lei-963-2025", "Incentivos fiscais à habitação social", "Lei Municipal nº 963/2025", "municipal", Path(r"C:\Users\WiseJr\Downloads\Documents\1749570765_lei-municipal-n-9632025.pdf")),
    ("lei-945-2025", "Cessão de servidores", "Lei Municipal nº 945/2025", "administrativa", Path(r"C:\Users\WiseJr\Downloads\Documents\1739192971_lei-municipal-n-9452025.pdf")),
    ("lei-932-2024", "Incentivo de ITBI — Minha Casa Minha Vida", "Lei Municipal nº 932/2024", "municipal", Path(r"C:\Users\WiseJr\Downloads\Documents\1720010841_lei-municipal-n-9322024.pdf")),
    ("lei-925-2024", "Doações voluntárias com IPTU e ISS", "Lei Municipal nº 925/2024", "municipal", Path(r"C:\Users\WiseJr\Downloads\Documents\1717501872_lei-municipal-n-9252024.pdf")),
    ("lei-988-2025", "Taxa de licença das placas de energia solar", "Lei Municipal nº 988/2025; altera a Lei nº 793/2018", "municipal", Path(r"C:/Users/WiseJr/Downloads/Tributos-Ibimirim/Legislacao/Lei nº 988 - Taxa de Fiscalização de Licença para Funcionamento das Placas de Energia Solar.docx")),
    ("lei-793-2018", "Taxa de torres, antenas e placas de energia solar", "Lei Municipal nº 793/2018", "municipal", Path(r"C:/Users/WiseJr/Downloads/Tributos-Ibimirim/Legislacao/Lei 793-2018 - Lei Taxa Torres e Placas Energia Solar.pdf")),
    # Three copies of this law exist in the source folder. This one carries a
    # text layer with correct Portuguese accents; the 10 MB scan has no text at
    # all, and our OCR strips diacritics. Its percentages were checked visually
    # against pages 6 and 7 of the scan before choosing it.
    ("lei-877-2022", "PRODEM — incentivos ao desenvolvimento econômico e social", "Lei Municipal nº 877/2022", "municipal", Path(r"C:/Users/WiseJr/Downloads/Tributos-Ibimirim/Legislacao/prodem_lei-municipal.pdf")),
    ("lei-863-2022", "Dação em pagamento de bens imóveis", "Lei Municipal nº 863/2022", "municipal", Path(r"C:\Users\WiseJr\Downloads\Documents\1657890474_lei-8632022_2.pdf")),
    ("lei-858-2022", "Programa de Recuperação Fiscal — REFIS", "Lei Municipal nº 858/2022", "municipal", Path(r"C:\Users\WiseJr\Downloads\Documents\1654790722_lei-n-8582022.pdf")),
    ("dec-23-2026", "Qualificação de débitos em dívida ativa", "Decreto Municipal nº 23/2026", "decreto", Path(r"C:\Users\WiseJr\Downloads\Tributos-Ibimirim\Legislacao\Decreto Municipal nº 23-2026.pdf")),
    ("dec-31-2022", "ISS da construção civil e obras de engenharia", "Decreto Municipal nº 31/2022", "decreto", Path(r"C:\Users\WiseJr\Downloads\_Revisar-Manualmente\PDF\1654188240_decreto-n-31.pdf")),
    ("dec-30-2022", "Prazos para recolhimento do ISS", "Decreto Municipal nº 30/2022", "decreto", Path(r"C:\Users\WiseJr\Downloads\1654187906_decreto-n-30.pdf")),
    ("lc-01-2019", "Plano Diretor", "Lei Complementar nº 01/2019", "municipal", Path(r"C:\Users\WiseJr\Downloads\Tributos-Ibimirim\Legislacao\LC 01-2019 - Institui o Plano Diretor.pdf")),
    ("lc-02-2019", "Perímetro Urbano", "Lei Complementar nº 02/2019", "municipal", Path(r"C:\Users\WiseJr\Downloads\Tributos-Ibimirim\Legislacao\LC 02-2019 - Dispõe sobre o Perímetro Urbano.pdf")),
    ("lc-03-2019", "Parcelamento do Solo Urbano", "Lei Complementar nº 03/2019", "municipal", Path(r"C:\Users\WiseJr\Documents\Nova pasta\LC 03-2019 - Dispõe sobre o Parcelamento do Solo Urbano.pdf")),
    ("lc-04-2019", "Uso e Ocupação do Solo", "Lei Complementar nº 04/2019", "municipal", Path(r"C:\Users\WiseJr\Downloads\Documents\LC_04-2019_-_Dispõe_Sobre_o_Ordenamento_e_Ocupação_do_Solo[1].pdf")),
    ("cc-14", "Código Civil — 14ª edição", "Lei Federal nº 10.406/2002 e normas correlatas; atualizada até agosto de 2023", "federal", Path(r"C:\Users\WiseJr\Downloads\Tributos-Ibimirim\Legislacao\Código Civil 14 ed.pdf")),
    ("cc-2", "Código Civil — 2ª edição (histórica)", "Lei Federal nº 10.406/2002; edição de referência histórica", "historical", Path(r"C:\Users\WiseJr\Downloads\Tributos-Ibimirim\Legislacao\Código Civil 2 ed.pdf")),
]


def clean(text: str) -> str:
    text = text.replace("\x00", " ").replace("�", "")
    text = re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


OCR_SCALES = (2.3, 3.5)

# A digit run glued to letters is the signature of a misread numeral: on
# Lei 793/2018 the higher scale turned "50 (cinquenta)" into "50o (cinquenta)".
GLUED_NUMBER = re.compile(r"\d[\d.,]*[A-Za-z]+")


def best_variant(variants: list[str]) -> str:
    """Pick the OCR pass with the fewest mangled numerals, then the fullest.

    Neither render scale dominates: the lower one drops whole lines, the higher
    one corrupts digits. Since these pages carry tax values, a clean numeral is
    worth more than a few extra characters.
    """
    return min(variants, key=lambda text: (len(GLUED_NUMBER.findall(text)), -len(text)))


def numeric_conflict(variants: list[str]) -> list[str]:
    """Numerals one OCR pass read differently from another, for human review."""
    seen = [set(re.findall(r"\d[\d.,]*[A-Za-z]*", text)) for text in variants]
    return sorted(set().union(*seen) - set.intersection(*seen))


def extract_office(path: Path) -> list[dict]:
    """Word sources carry a real text layer, so no OCR is involved."""
    import pymupdf

    document = pymupdf.open(path)
    pages = []
    for index, page in enumerate(document):
        text = clean(page.get_text())
        if text:
            pages.append({"page": index + 1, "text": text, "ocr": False})
    return pages


def extract_pdf(path: Path, ocr: RapidOCR | None) -> list[dict]:
    reader = pypdf.PdfReader(str(path))
    rendered = None
    pages = []
    for index, page in enumerate(reader.pages):
        text = clean(page.extract_text() or "")
        used_ocr = False
        conflict = []
        if len(text) < 80:
            if ocr is None:
                ocr = RapidOCR()
            if rendered is None:
                rendered = pdfium.PdfDocument(str(path))
            variants = []
            for scale in OCR_SCALES:
                image = rendered[index].render(scale=scale).to_pil()
                result, _ = ocr(np.asarray(image))
                variants.append(clean("\n".join(line[1] for line in (result or []))))
            text = best_variant(variants)
            conflict = numeric_conflict(variants)
            used_ocr = True
        entry = {"page": index + 1, "text": text, "ocr": used_ocr}
        if conflict:
            entry["ocrConflict"] = conflict
            print(f"  ! {path.name} p.{index + 1}: números divergem entre "
                  f"escalas: {', '.join(conflict)}", file=sys.stderr)
        pages.append(entry)
        print(f"{path.name}: {index + 1}/{len(reader.pages)}", file=sys.stderr)
    return pages


def main() -> None:
    missing = [str(path) for *_, path in DOCS if not path.exists()]
    if missing:
        raise SystemExit("Missing source PDFs:\n" + "\n".join(missing))
    cached = {}
    if OUTPUT.exists():
        cached = {doc["id"]: doc for doc in json.loads(OUTPUT.read_text(encoding="utf-8"))["documents"]}
    corpus = {"generated": "2026-08-17", "documents": []}
    ocr = None
    for doc_id, title, citation, kind, path in DOCS:
        if doc_id in cached:
            pages = cached[doc_id]["pages"]
            print(f"{path.name}: reused {len(pages)} pages", file=sys.stderr)
        elif path.suffix.lower() in {".docx", ".doc"}:
            pages = extract_office(path)
            print(f"{path.name}: {len(pages)} pages (office)", file=sys.stderr)
        else:
            pages = extract_pdf(path, ocr)
        corpus["documents"].append({
            "id": doc_id,
            "title": title,
            "citation": citation,
            "kind": kind,
            "pageCount": len(pages),
            "pages": pages,
        })
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(corpus, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
