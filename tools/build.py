"""Assemble one municipality's app from the shared shell.

    python tools/build.py alianca
    python tools/build.py --todos --destino docs

public/ holds the shell and carries no municipality data: the strings come from
municipios/<slug>/municipio.json and the corpus from the same folder's data/.
The build writes a self-contained directory whose index.html opens by double
click, which is also what gets served over HTTP and packed into the APK.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHELL = ROOT / "public"
MUNICIPIOS = ROOT / "municipios"
PLACEHOLDER = re.compile(r"\{\{([A-Z_]+)\}\}")
TEXTUAL = {".html", ".webmanifest", ".txt", ".css", ".js"}


def valores(cfg: dict) -> dict[str, str]:
    marca, hero, taxas = cfg["marca"], cfg["hero"], cfg.get("taxas", {})
    return {
        "NOME": cfg["nome"],
        "TITULO": marca["titulo"],
        "TITULO_MAIUSCULO": marca["titulo"].upper(),
        "SIGLA": marca["sigla"],
        "SUBTITULO": marca["subtitulo"],
        "CHAMADA": hero["chamada"],
        "HERO_TEXTO": hero["texto"],
        "EXEMPLO": hero["exemplo"],
        "TAXAS_TITULO": taxas.get("titulo", "Taxas"),
        "TAXAS_RESUMO": taxas.get("resumo", ""),
        "BUSCA_TITULO": taxas.get("buscaTitulo", "Buscar valor"),
        "TAXAS_AVISO": taxas.get("aviso", ""),
    }


def build(slug: str, destino: Path) -> Path:
    base = MUNICIPIOS / slug
    cfg = json.loads((base / "municipio.json").read_text(encoding="utf-8"))
    substituicoes = valores(cfg)

    saida = destino / slug
    if saida.exists():
        shutil.rmtree(saida)
    saida.mkdir(parents=True)

    for origem in sorted(p for p in SHELL.rglob("*") if p.is_file()):
        alvo = saida / origem.relative_to(SHELL)
        alvo.parent.mkdir(parents=True, exist_ok=True)
        if origem.suffix.lower() in TEXTUAL:
            texto = origem.read_text(encoding="utf-8")
            faltando = {
                chave
                for chave in PLACEHOLDER.findall(texto)
                if chave not in substituicoes
            }
            if faltando:
                raise SystemExit(
                    f"{origem.name}: sem valor para {', '.join(sorted(faltando))}"
                )
            alvo.write_text(
                PLACEHOLDER.sub(lambda m: substituicoes[m.group(1)], texto),
                encoding="utf-8",
            )
        else:
            shutil.copy2(origem, alvo)

    (saida / "municipio.js").write_text(
        "window.MUNICIPIO=JSON.parse("
        + json.dumps(json.dumps(cfg, ensure_ascii=False), ensure_ascii=False).replace(
            "</", "<\\/"
        )
        + ");\n",
        encoding="utf-8",
    )

    dados = saida / "data"
    dados.mkdir(exist_ok=True)
    for nome in ("laws.js", "fees.js"):
        origem = base / "data" / nome
        if origem.exists():
            shutil.copy2(origem, dados / nome)
        else:
            (dados / nome).write_text(
                f"window.MUNICIPIO_{nome[:-3].upper()}=null;\n", encoding="utf-8"
            )

    tamanho = sum(p.stat().st_size for p in saida.rglob("*") if p.is_file())
    arquivos = sum(1 for p in saida.rglob("*") if p.is_file())
    print(
        f"{saida.relative_to(ROOT)} — {arquivos} arquivos, {tamanho / 1048576:.2f} MB"
    )
    return saida


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("municipio", nargs="?")
    parser.add_argument("--todos", action="store_true")
    parser.add_argument("--destino", default="dist")
    args = parser.parse_args()

    destino = ROOT / args.destino
    disponiveis = sorted(p.name for p in MUNICIPIOS.iterdir() if p.is_dir())
    if args.todos:
        alvos = disponiveis
    elif args.municipio in disponiveis:
        alvos = [args.municipio]
    else:
        raise SystemExit(f"informe um município: {', '.join(disponiveis)}")

    for slug in alvos:
        build(slug, destino)


if __name__ == "__main__":
    main()
