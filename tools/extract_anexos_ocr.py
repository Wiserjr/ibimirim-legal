"""Lê anexos de acervo digitalizado, onde o valor cai em linha própria.

Nos municípios cujo PDF é escaneado, o reconhecimento óptico quebra a tabela em
duas colunas de texto: primeiro o rótulo, depois o valor, cada um na sua linha.
Não dá para casar por expressão regular de linha como em Ingazeira.

O que este extrator faz é percorrer as linhas em ordem, acumulando o rótulo até
encontrar um valor — e então emitir o par. É o que a leitura humana faria, e
funciona quando a ordem do texto reproduz a ordem da página.

**A ordem nem sempre se reproduz.** Por isso o resultado NÃO é publicável direto:
sai marcado como `revisar` e tem de ser conferido na imagem da página. O
`--amostra` imprime os pares de uma página para esse cotejo.

    python tools/extract_anexos_ocr.py cortes --amostra 62
    python tools/extract_anexos_ocr.py cortes
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# faixa dos anexos e documento, por município
ACERVOS = {
    "cortes": {"doc": "ctm-874-2005", "de": 61, "ate": 71},
    "tacaratu": {"doc": "ctm-1365-2017", "de": 155, "ate": 259},
    "jurema": {"doc": "ctm-255-2007", "de": 2, "ate": 13},
    "vertente-do-lerio": {"doc": "ctm-001-2009", "de": 113, "ate": 125},
    "jatoba": {"doc": "ctm-034-1997", "de": 80, "ate": 86},
}

# O reconhecimento troca a vírgula decimal por ponto em parte das linhas — o
# mesmo defeito que Manari tinha. Aceitam-se as duas, senão esses valores somem
# da tabela E ainda contaminam o rótulo da linha vizinha.
VALOR = re.compile(r"^\s*(?:R?\$?\s*)?(\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})\s*%?\s*$")
EMBUTIDO = re.compile(r"\d{1,3}(?:\.\d{3})*[.,]\d{2}")
PERCENTUAL = re.compile(r"^\s*(\d{1,3}(?:,\d{1,2})?)\s*%\s*$")
RUIDO = re.compile(
    r"^\s*$|PREFEITURA|Prefeitura|CNPJ|^\s*Rua |^\s*\d{1,3}\s*$|Estado de Pernambuco|"
    r"Gabinete|CEP|Fone|E-?mail|^\s*[-–—_.]{2,}\s*$"
)
TITULO = re.compile(r"ANEXO\s*[IVXL]+|TABELA\s*(DE\s*RECEITA)?\s*N?º?\s*[IVXL]+", re.I)


def carregar(slug: str, doc_id: str) -> dict[int, str]:
    bruto = (ROOT / "municipios" / slug / "data" / "laws.js").read_text(encoding="utf-8").strip()
    dados = json.loads(json.loads(bruto[bruto.index("(") + 1 : bruto.rindex(")")]))
    doc = next(d for d in dados["documents"] if d["id"] == doc_id)
    return {p["page"]: p["text"] for p in doc["pages"]}


def numero(texto: str) -> float:
    texto = texto.strip().replace(" ", "")
    if "," in texto:                      # 1.234,56
        return float(texto.replace(".", "").replace(",", "."))
    inteiro, _, cents = texto.rpartition(".")   # 1.234.56 ou 40.00
    return float(f"{inteiro.replace('.', '')}.{cents}") if inteiro else float(texto)


def ler(paginas: dict[int, str], de: int, ate: int) -> list[dict]:
    itens: list[dict] = []
    for n in range(de, ate + 1):
        rotulo: list[str] = []
        tabela = ""
        for linha in paginas.get(n, "").split("\n"):
            if RUIDO.match(linha):
                continue
            if TITULO.search(linha):
                tabela = " ".join(linha.split())
                rotulo = []
                continue
            achado = VALOR.match(linha) or PERCENTUAL.match(linha)
            if achado:
                texto = " ".join(" ".join(rotulo).split())
                itens.append(
                    {
                        "pagina": n,
                        "tabela": tabela,
                        "rotulo": texto or "(sem rótulo antes do valor)",
                        "valor": numero(achado.group(1)),
                        "percentual": bool(PERCENTUAL.match(linha)),
                        "linhasDeRotulo": len(rotulo),
                        "rotuloComValor": bool(EMBUTIDO.search(texto)),
                    }
                )
                rotulo = []
            else:
                rotulo.append(linha.strip())
    return itens


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", choices=sorted(ACERVOS))
    ap.add_argument("--amostra", type=int, help="imprime os pares desta página e sai")
    args = ap.parse_args()

    cfg = ACERVOS[args.slug]
    paginas = carregar(args.slug, cfg["doc"])
    itens = ler(paginas, cfg["de"], cfg["ate"])

    if args.amostra:
        da_pagina = [i for i in itens if i["pagina"] == args.amostra]
        print(f"{args.slug} p.{args.amostra} — {len(da_pagina)} pares lidos")
        for i in da_pagina:
            marca = "%" if i["percentual"] else " "
            print(f"  {i['valor']:>10,.2f}{marca} <- {i['rotulo'][:78]}")
        return

    sem_rotulo = [i for i in itens if i["rotulo"].startswith("(sem")]
    fundidos = [i for i in itens if i.get("rotuloComValor")]
    destino = ROOT / "municipios" / args.slug / "anexos-lidos.json"
    destino.write_text(
        json.dumps(
            {
                "sobre": "Leitura sequencial dos anexos, de acervo digitalizado. NÃO conferida "
                         "item a item na imagem — serve de rascunho para a conferência humana.",
                "documento": cfg["doc"],
                "paginas": [cfg["de"], cfg["ate"]],
                "itens": itens,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{len(itens)} pares lidos em {len({i['pagina'] for i in itens})} páginas")
    if sem_rotulo:
        print(f"  ! {len(sem_rotulo)} valores sem rótulo antes deles")
    coincide = [i for i in itens if i["valor"] == float(i["pagina"])]
    if fundidos:
        print(f"  ! {len(fundidos)} rótulos com valor embutido — célula fundida pelo OCR")
    if coincide:
        print(f"  ! {len(coincide)} valores iguais ao número da página")
    print(f"gravado em {destino.relative_to(ROOT)} — conferir na imagem antes de publicar")


if __name__ == "__main__":
    main()
