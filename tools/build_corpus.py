"""Build one municipality's legal corpus from the PDFs listed in fontes.json.

    python tools/build_corpus.py alianca

Replaces the hardcoded document list that used to live in extract_laws.py, so
the source paths are data rather than code and a second municipality does not
mean a second extractor. Pages already extracted are reused: re-running only
touches documents whose id is new, which matters because OCR of a scanned
Plano Diretor takes a quarter of an hour.
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from bundle import write_bundle
from extract_laws import extract_office, extract_pdf

ROOT = Path(__file__).resolve().parents[1]


def load_corrections(base: Path) -> list[dict]:
    """Trocas de caractere do OCR, declaradas em correcoes.json.

    Só entram trocas conferidas na imagem da página — o arquivo exige o campo
    "conferido" justamente para isso. Divergência real do texto publicado não se
    corrige aqui: fica registrada em DOCUMENTOS-RECOMENDADOS.md.

    A correção roda na montagem, e não na extração, para alcançar também as
    páginas vindas do cache: quem já tem o corpus extraído não precisa repetir
    horas de OCR para receber a correção.
    """
    arquivo = base / "correcoes.json"
    if not arquivo.exists():
        return []
    dados = json.loads(arquivo.read_text(encoding="utf-8"))["correcoes"]
    for c in dados:
        faltando = {"documento", "de", "para", "motivo", "conferido"} - set(c)
        if faltando:
            raise SystemExit(
                f"correcoes.json: correção sem {', '.join(sorted(faltando))} — "
                f"{c.get('de', '?')!r}"
            )
    return dados


def apply_corrections(doc_id: str, pages: list[dict], correcoes: list[dict]) -> int:
    trocas = 0
    for c in correcoes:
        if c["documento"] != doc_id:
            continue
        for page in pages:
            n = page["text"].count(c["de"])
            if n:
                page["text"] = page["text"].replace(c["de"], c["para"])
                trocas += n
    return trocas


def load_cached(output: Path) -> dict:
    if not output.exists():
        return {}
    raw = output.read_text(encoding="utf-8")
    payload = json.loads(json.loads(raw[raw.index("(") + 1 : raw.rindex(")")]))
    return {doc["id"]: doc for doc in payload["documents"]}


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("uso: python tools/build_corpus.py <municipio>")
    slug = sys.argv[1]
    base = ROOT / "municipios" / slug
    if not base.exists():
        raise SystemExit(f"município desconhecido: {slug}")

    fontes = json.loads((base / "fontes.json").read_text(encoding="utf-8"))["documentos"]
    ausentes = [d["arquivo"] for d in fontes if not Path(d["arquivo"]).exists()]
    if ausentes:
        raise SystemExit("arquivos de origem ausentes:\n  " + "\n  ".join(ausentes))

    output = base / "data" / "laws.js"
    cached = load_cached(output)
    correcoes = load_corrections(base)
    corrigidas = 0
    corpus = {"municipio": slug, "documents": []}
    ocr = None

    for doc in fontes:
        path = Path(doc["arquivo"])
        if doc["id"] in cached:
            pages = cached[doc["id"]]["pages"]
            print(f"  ~ {doc['id']}: {len(pages)} páginas reaproveitadas", file=sys.stderr)
        else:
            inicio = time.time()
            pages = (
                extract_office(path)
                if path.suffix.lower() in {".docx", ".doc"}
                else extract_pdf(path, ocr)
            )
            por_ocr = sum(1 for p in pages if p.get("ocr"))
            print(
                f"  + {doc['id']}: {len(pages)} páginas, {por_ocr} por OCR, "
                f"{time.time() - inicio:.0f}s",
                file=sys.stderr,
            )
        corrigidas += apply_corrections(doc["id"], pages, correcoes)
        corpus["documents"].append({
            "id": doc["id"],
            "title": doc["titulo"],
            "citation": doc["citacao"],
            "kind": doc["tipo"],
            "pageCount": len(pages),
            "pages": pages,
        })

    size = write_bundle(output, "MUNICIPIO_LAWS", corpus)
    total = sum(d["pageCount"] for d in corpus["documents"])
    conflitos = sum(
        1 for d in corpus["documents"] for p in d["pages"] if p.get("ocrConflict")
    )
    print(
        f"{output.relative_to(ROOT)} — {len(corpus['documents'])} documentos, "
        f"{total} páginas, {size:,} bytes"
    )
    if conflitos:
        print(f"  {conflitos} páginas com divergência numérica entre passagens de OCR")
    if correcoes:
        print(
            f"  {corrigidas} trocas de OCR aplicadas, de {len(correcoes)} "
            f"correção(ões) declarada(s) em correcoes.json"
        )


if __name__ == "__main__":
    main()
