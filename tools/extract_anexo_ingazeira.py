"""Anexo I de Ingazeira: taxa de licença por atividade, páginas 139 a 182.

O acervo de Ingazeira é PDF gerado do Word, com camada de texto limpa, e o anexo
põe uma atividade por linha no formato `<CNAE> <descrição> <valor>`. Isso permite
ler por expressão regular, o que NÃO vale para os municípios cujo acervo é
digitalizado — lá a coluna de valores se desloca do rótulo e a leitura tem de ser
visual, página a página.

O extrator recusa o resultado se qualquer conferência falhar, em vez de gravar
uma tabela silenciosamente torta:

  * toda linha com código CNAE tem de ter valor;
  * nenhum valor pode coincidir com o número da página em que está — foi assim
    que "141" entrou como valor numa tabela de Manari;
  * os códigos não se repetem.

    python tools/extract_anexo_ingazeira.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = "ingazeira"
DOC = "ctm-002-2016"
PRIMEIRA, ULTIMA = 139, 182

# A descrição quebra em até três linhas, e o valor cai sozinho na última. Exige-se
# a vírgula decimal no valor: sem ela, o número da página no rodapé — "141" — seria
# lido como preço da atividade logo acima.
ABRE = re.compile(r"^\s*(\d{4}-\d/\d{2})\s+(.*?)\s*$")
FECHA = re.compile(r"^\s*([\d.]{1,9},\d{2})\s*$")
COMPLETA = re.compile(r"^\s*(\d{4}-\d/\d{2})\s+(.+?)\s+([\d.]{1,9},\d{2})\s*$")
RUIDO = re.compile(r"PREFEITURA MUNICIPAL|Rua Albino|CNPJ|^\s*\d{1,3}\s*$|^\s*$|CÓDIGO CMC")


def carregar_paginas() -> dict[int, str]:
    caminho = ROOT / "municipios" / SLUG / "data" / "laws.js"
    bruto = caminho.read_text(encoding="utf-8").strip()
    dados = json.loads(json.loads(bruto[bruto.index("(") + 1 : bruto.rindex(")")]))
    doc = next(d for d in dados["documents"] if d["id"] == DOC)
    return {p["page"]: p["text"] for p in doc["pages"]}


def valor(texto: str) -> float:
    return float(texto.replace(".", "").replace(",", "."))


def main() -> None:
    paginas = carregar_paginas()
    itens: list[dict] = []
    sem_valor: list[tuple[int, str]] = []
    coincide_pagina: list[tuple[int, str, float]] = []

    pendente: dict | None = None

    def emitir(cnae: str, descricao: str, v: float, pagina: int) -> None:
        if v == float(pagina):
            coincide_pagina.append((pagina, cnae, v))
        itens.append(
            {"rotulo": f"{cnae} — {' '.join(descricao.split())}", "valor": v, "pagina": pagina}
        )

    for n in range(PRIMEIRA, ULTIMA + 1):
        for linha in paginas.get(n, "").split("\n"):
            if RUIDO.search(linha):
                continue

            inteira = COMPLETA.match(linha)
            if inteira:
                if pendente:
                    sem_valor.append((pendente["pagina"], pendente["cru"]))
                    pendente = None
                cnae, descricao, cru = inteira.groups()
                emitir(cnae, descricao, valor(cru), n)
                continue

            abertura = ABRE.match(linha)
            if abertura:
                if pendente:
                    sem_valor.append((pendente["pagina"], pendente["cru"]))
                cnae, descricao = abertura.groups()
                pendente = {"cnae": cnae, "desc": descricao, "pagina": n, "cru": linha.strip()}
                continue

            if pendente:
                fecho = FECHA.match(linha)
                if fecho:
                    emitir(pendente["cnae"], pendente["desc"], valor(fecho.group(1)), pendente["pagina"])
                    pendente = None
                else:
                    pendente["desc"] += " " + linha.strip()

    if pendente:
        sem_valor.append((pendente["pagina"], pendente["cru"]))

    codigos = [i["rotulo"].split(" — ")[0] for i in itens]
    repetidos = {c for c in codigos if codigos.count(c) > 1}

    print(f"{len(itens)} atividades lidas nas páginas {PRIMEIRA} a {ULTIMA}")
    print(f"faixa de valores: R$ {min(i['valor'] for i in itens):,.2f} "
          f"a R$ {max(i['valor'] for i in itens):,.2f}")
    # Duas naturezas distintas, e só uma delas é culpa nossa. Atividade sem valor
    # e código repetido são defeitos do texto da lei: registram-se e seguem. Valor
    # igual ao número da página é sintoma de leitura torta, e aí nada se grava.
    if repetidos:
        print(f"  ~ {len(repetidos)} códigos repetidos no anexo: {sorted(repetidos)[:6]}")
    if sem_valor:
        print(f"  ~ {len(sem_valor)} atividades sem valor no anexo — defeito da lei, registrado:")
        for n, linha in sem_valor:
            print(f"      p.{n}: {linha[:74]}")
    if coincide_pagina:
        print(f"  ! {len(coincide_pagina)} valores coincidem com o número da página:")
        for n, cnae, v in coincide_pagina[:8]:
            print(f"      p.{n}: {cnae} = {v}")
        raise SystemExit("leitura suspeita — nada foi gravado")

    destino = ROOT / "municipios" / SLUG / "anexo-i.json"
    destino.write_text(
        json.dumps(
            {
                "sobre": "Anexo I da LC nº 002/2016 — taxa de licença para localização e de "
                         "fiscalização de funcionamento, por atividade CNAE-Fiscal. Extraído do "
                         "texto do PDF, que é gerado do Word e não passou por OCR. "
                         "'semValor' lista as atividades que o anexo traz com código e sem preço "
                         "— defeito do texto publicado, não da leitura.",
                "documento": DOC,
                "paginas": [PRIMEIRA, ULTIMA],
                "itens": itens,
                "semValor": [
                    {"pagina": n, "linha": linha} for n, linha in sem_valor
                ],
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"gravado em {destino.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
