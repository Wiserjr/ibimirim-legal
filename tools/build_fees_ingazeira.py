"""Monta o fees.js de Ingazeira a partir do Anexo I já extraído e conferido.

O Anexo I tem 944 atividades e vive melhor aqui do que no cadastro de cobranças:
o fees.js tem busca item a item, que é o que responde "quanto cobro para
padaria?". O cadastro de cobranças responde outra pergunta — o quê, de quem,
quando e com que fundamento —, e para o Anexo I ele aponta para cá.

    python tools/extract_anexo_ingazeira.py && python tools/build_fees_ingazeira.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bundle import write_bundle  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "municipios" / "ingazeira"
OUTPUT = BASE / "data" / "fees.js"


def main() -> None:
    anexo = json.loads((BASE / "anexo-i.json").read_text(encoding="utf-8"))
    itens = anexo["itens"]
    paginas = sorted({i["pagina"] for i in itens})

    secao = {
        "id": "anexo-i-licenca-por-atividade",
        "title": "ANEXO I — TAXA DE LICENÇA PARA LOCALIZAÇÃO E DE FISCALIZAÇÃO DE FUNCIONAMENTO",
        "short": "Licença por atividade (CNAE)",
        "table": "Anexo I",
        "doc": anexo["documento"],
        "pages": paginas,
        "status": "confirmado",
        "note": (
            "Uma atividade por linha, pelo código CNAE-Fiscal. Cada valor foi "
            "reconfrontado com o texto da sua própria página: 944 de 944 conferem."
        ),
        "previous": [],
        "current": [
            {"label": i["rotulo"], "kind": "fixed", "value": i["valor"], "page": i["pagina"]}
            for i in itens
        ],
    }

    # As atividades que o anexo traz sem preço entram como cabeçalho, para
    # aparecerem na busca com a ressalva em vez de sumirem.
    for falta in anexo.get("semValor", []):
        secao["current"].append(
            {
                "label": f"{falta['linha']} — SEM VALOR NO ANEXO",
                "kind": "heading",
                "page": falta["pagina"],
            }
        )

    payload = {
        "municipio": "ingazeira",
        "unidade": "R$",
        "source": {"doc": anexo["documento"], "pages": anexo["paginas"]},
        "ufmNote": (
            "Ingazeira não usa unidade fiscal nos anexos: os valores estão em reais, "
            "como publicados em 2016. Confirme com o Município se houve atualização "
            "monetária desde então."
        ),
        "disclaimer": (
            "Extraído do texto do Anexo I da LC nº 002/2016, que é PDF gerado do Word "
            "e não passou por OCR. Cada valor foi conferido contra o texto da própria "
            "página. Confira o enquadramento da atividade na publicação oficial antes "
            "de lançar."
        ),
        "sections": [secao],
    }
    write_bundle(OUTPUT, "MUNICIPIO_FEES", payload)
    print(
        f"{OUTPUT.relative_to(ROOT)} — {len(itens)} atividades, "
        f"{len(anexo.get('semValor', []))} sem valor, páginas {paginas[0]} a {paginas[-1]}"
    )


if __name__ == "__main__":
    main()
