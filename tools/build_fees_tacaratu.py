"""Monta o fees.js de Tacaratu a partir do Anexo I já extraído.

O Anexo I tem 1.297 subclasses da CNAE 2.0 e vive melhor aqui do que no cadastro
de cobranças: o fees.js tem busca item a item, que é o que responde "quanto
cobro de uma padaria?". O cadastro de cobranças responde outra pergunta — o
quê, de quem, quando e com que fundamento —, e para o Anexo I ele aponta
para cá.

O rótulo de cada linha começa pelo código da subclasse. É de propósito: o
reconhecimento óptico colou palavras em cerca de um terço das denominações, e o
código é o único texto que saiu íntegro em todas as 1.297. Quem procura por
código acha sempre; quem procura por palavra acha quase sempre.

    python tools/extract_anexo_tacaratu.py && python tools/build_fees_tacaratu.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bundle import write_bundle  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "municipios" / "tacaratu"
OUTPUT = BASE / "data" / "fees.js"

RESSALVA = {
    "conferido": "",
    "revisar": " · separador lido como ponto",
    "inferido": " · separador ausente, valor inferido",
    "imagem": " · valor lido na imagem da página",
}


def rotulo(atividade: dict) -> str:
    partes = [atividade["codigo"], atividade["denominacao"] or atividade["classe"]]
    texto = " — ".join(p for p in partes if p)
    grau = "imagem" if atividade["separador"] == "imagem" else atividade["conferencia"]
    return texto + RESSALVA.get(grau, "")


def main() -> None:
    anexo = json.loads((BASE / "anexo-i.json").read_text(encoding="utf-8"))
    atividades = anexo["atividades"]
    paginas = sorted({a["pagina"] for a in atividades})
    graduadas = [a for a in atividades if a.get("faixas")]

    linhas: list[dict] = []
    secao_corrente = None
    for a in atividades:
        if a["secao"] and a["secao"] != secao_corrente:
            secao_corrente = a["secao"]
            linhas.append({"label": secao_corrente, "kind": "heading", "page": a["pagina"]})
        if a.get("faixas"):
            # a taxa é graduada pelo número de empregados: cada faixa é uma linha
            linhas.append({"label": rotulo(a), "kind": "heading", "page": a["pagina"]})
            for f in a["faixas"]:
                linhas.append({
                    "label": f"    {a['codigo']} — {f['rotulo']}",
                    "kind": "fixed",
                    "value": f["valor"],
                    "page": a["pagina"],
                })
            continue
        linhas.append({"label": rotulo(a), "kind": "fixed", "value": a["valor"], "page": a["pagina"]})

    secao = {
        "id": "anexo-i-licenca-por-atividade",
        "title": "ANEXO I — TAXA DE LICENÇA PARA LOCALIZAÇÃO E TAXA DE FISCALIZAÇÃO "
                 "DE LICENÇA PARA FUNCIONAMENTO",
        "short": "Licença por atividade (CNAE 2.0)",
        "table": "Anexo I",
        "doc": anexo["documento"],
        "pages": paginas,
        "status": "confirmado",
        "note": (
            "Uma subclasse da CNAE 2.0 por linha, 1.297 ao todo, com o código à frente "
            "da denominação. O art. 476 manda classificar a atividade do contribuinte "
            "nos termos deste Anexo, e o parágrafo único manda cobrar o valor da "
            "atividade que MAIS SE ASSEMELHA à dele — não há linha para o caso não "
            "previsto. Uma única atividade do Anexo é graduada por número de "
            "empregados: a fabricação de laticínios (1052-0/00)."
        ),
        "previous": [],
        "current": linhas,
    }

    payload = {
        "municipio": "tacaratu",
        "unidade": "R$",
        "source": {"doc": anexo["documento"], "pages": [paginas[0], paginas[-1]]},
        "ufmNote": (
            "Tacaratu não usa unidade fiscal nos anexos de taxa: os valores estão em "
            "reais, como publicados em 2017. A única base indexada do Código é a BCLA "
            "da licença ambiental, fixada em R$ 1.000,00 pelo art. 281. O art. 475 "
            "manda atualizar os débitos com a Fazenda Municipal pelo IPCA/IBGE."
        ),
        "disclaimer": (
            "Extraído do texto reconhecido opticamente das páginas 155 a 238 e ancorado "
            "no código da subclasse, que saiu íntegro nas 1.297 linhas. Os valores "
            "batem com o padrão da tabela — 35 valores distintos, todos em reais "
            "inteiros —, mas o reconhecimento erra o separador decimal com frequência: "
            "onde ele veio como ponto ou faltou, a linha diz isso ao lado do valor. "
            "Dois valores foram lidos na imagem e estão marcados. Confira o "
            "enquadramento na publicação oficial antes de lançar."
        ),
        "sections": [secao],
    }
    write_bundle(OUTPUT, "MUNICIPIO_FEES", payload)
    graus = {g: sum(1 for a in atividades if a["conferencia"] == g) for g in ("conferido", "revisar", "inferido")}
    print(
        f"{OUTPUT.relative_to(ROOT)} — {len(atividades)} atividades em {len(linhas)} linhas, "
        f"{len(graduadas)} graduada por empregados, páginas {paginas[0]} a {paginas[-1]}\n"
        f"  {graus}"
    )


if __name__ == "__main__":
    main()
