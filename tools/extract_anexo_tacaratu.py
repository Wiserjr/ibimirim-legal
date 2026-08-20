"""Extrai o Anexo I de Tacaratu — a tabela da CNAE 2.0, atividade por atividade.

O Anexo I ocupa 84 das 259 páginas do Código (155 a 238) e dá, para cada
subclasse da CNAE 2.0, o valor da Taxa de Licença para Localização e da Taxa de
Fiscalização de Licença para Funcionamento.

O que torna a extração possível é o código da subclasse — ``0111-3/01`` —, que é
inequívoco e aparece exatamente uma vez por atividade. O reconhecimento óptico
embaralha a ordem das colunas e cola palavras, mas não inventa nem perde um
código desses. A leitura é ancorada nele:

    tudo entre um valor e o seguinte é UMA atividade;
    dentro do bloco, uma linha é o código e o resto é a denominação.

A denominação às vezes quebra ao redor do código — parte antes, parte depois.
Juntar as linhas na ordem impressa reconstrói a frase.

**Dois números disputam a mesma forma.** ``15`` pode ser R$ 15,00 ou a divisão 15
da CNAE. O desempate não é de aparência, é de posição: valor só vem depois do
código da subclasse. Enquanto o bloco não tem código, todo número curto é
cabeçalho de nível; depois que tem, é valor. Foi assim que a divisão 15
(preparação de couros) e a 18 (impressão) pararam de virar preço.

**O separador decimal é o ponto fraco.** De cada dez valores, dois vêm com ponto
no lugar da vírgula e um vem sem separador nenhum: ``8000`` por ``80,00``. Este
extrator NÃO adivinha. Resolve o caso sem separador apenas quando o número, lido
como centavos, cai num valor que já existe na tabela escrito com vírgula — e
ainda assim marca a atividade como ``inferido``. Quando não resolve, para e diz
em que página olhar.

**A denominação sai como veio.** Cerca de uma linha em nove chega com as
palavras coladas. A única emenda feita aqui é separar minúscula de maiúscula,
que é sempre segura. Tentar reinserir preposições por expressão regular corrompe
mais do que conserta — "exceto" virou "exc e to" na primeira versão deste
extrator. Onde a linha ficou colada, a atividade sai marcada com ``colada``.

    python tools/extract_anexo_tacaratu.py --diagnostico
    python tools/extract_anexo_tacaratu.py --pagina 169
    python tools/extract_anexo_tacaratu.py
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = "ctm-1365-2017"
DE, ATE = 155, 238

# A subclasse da CNAE 2.0 — a âncora de tudo. Aceita a barra lida como "1"
# (`4771-7104` por `4771-7/04`), porque nenhum código tem quatro dígitos depois
# do traço, e aceita o código grudado no fim da denominação.
CODIGO_SOLTO = re.compile(r"(\d{4}-\d)[/1](\d{2})")
CODIGO = re.compile(r"^(\d{4}-\d)[/1](\d{2})$")
# valor escrito com separador decimal: 80,00 · 80.00 · 1.200,00 · :80,00
# o dois-pontos aparece quando a célula da tabela foi lida junto com a borda
VALOR_CLARO = re.compile(r"^[:\-]?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*[.,]\d{2})$")
# valor com o separador decimal perdido: 10.00000 e 6.000.00 por 10.000,00
# e 6.000,00 — o milhar veio com ponto e os centavos vieram sem nada
VALOR_TORTO = re.compile(r"^[:\-]?\s*(\d{1,3}\.\d{5}|\d{1,3}\.\d{3}\.\d{2})$")
# valor grudado no fim da linha de denominação: "…anteriomente250,00"
VALOR_NO_FIM = re.compile(r"^(.*?[a-zà-ÿ)])\s*(\d{1,3}(?:\.\d{3})*[.,]\d{2})$")
# faixa por número de empregados — algumas atividades são graduadas assim
FAIXA = re.compile(r"(at[ée]\s*\d+|de\s*\d+\s*a\s*\d+|acima\s*de\s*\d+)\s*empregados", re.I)
# número puro, sem separador: 8000, 80, 15
VALOR_NU = re.compile(r"^(\d{1,6})$")  # nunca casa código, que tem traço e barra
# cabeçalho de nível: divisão (01), grupo (01.1), classe (01.11 com ou sem nome)
DIVISAO = re.compile(r"^\d{2}$")
GRUPO = re.compile(r"^\d{2}\.\d$")
CLASSE = re.compile(r"^(\d{2}\.\d{2})\s*(.*)$")
RUIDO = re.compile(
    r"Rua ?Pedro|CNPJ|Tel\.|administracao|Prefeitura ?Municipal|Constr[un]*indo|"
    r"EFEIT|EIT[UL]RA|^T[UL]RA ?D|^Tacaratu$|c[o6]digoCNAE|^Denominacao$|^Secao$|^Divisao$|"
    r"^Grupo$|^Classe|^ANEXO ?I$|Estruturadetalhada|^Subclasse$|^\s*$|"
    r"TABELAPARALANCAMENTO"
)
# Linha de título em caixa alta — nome de seção ou de divisão. Exige cinco
# letras: sem isso `2.000,00` passa por título, porque só tem dígito e pontuação.
CAIXA_ALTA = re.compile(r"^(?=(?:[^A-ZÀ-Ý]*[A-ZÀ-Ý]){5})[A-ZÀ-Ý0-9 ,.\-/()]{8,}$")
COLADA = re.compile(r"[a-zà-ÿ]{16,}")

# A célula do valor é impressa encostando na linha de baixo. Em uma página o
# reconhecimento a entregou fora de ordem, e a atividade ficou sem valor. Este
# aqui foi lido na imagem — conferir em municipios/tacaratu/anexo-i.json que a
# origem está registrada como "imagem".
LIDAS_NA_IMAGEM = {
    # a célula veio fora de ordem e a atividade ficou sem valor
    "1710-9/00": (750.00, 171, "célula do valor entregue fora de ordem"),
    # o reconhecimento leu 11.000,00, que seria o maior valor de todo o Anexo;
    # a página imprime 1.000,00, como as três atividades vizinhas — o traço
    # vertical da tabela foi lido como um algarismo 1
    "2920-4/01": (1000.00, 185, "reconhecimento leu 11.000,00; a página imprime 1.000,00"),
}


def paginas() -> dict[int, str]:
    bruto = (ROOT / "municipios" / "tacaratu" / "data" / "laws.js").read_text(encoding="utf-8").strip()
    dados = json.loads(json.loads(bruto[bruto.index("(") + 1 : bruto.rindex(")")]))
    doc = next(d for d in dados["documents"] if d["id"] == DOC)
    return {p["page"]: p["text"] for p in doc["pages"]}


def so_codigo(linha: str) -> str | None:
    achado = CODIGO.match(linha.strip())
    return f"{achado.group(1)}/{achado.group(2)}" if achado else None


def limpar(texto: str) -> str:
    """Separa minúscula de maiúscula e normaliza espaço. Nada além disso."""
    return re.sub(r"\s+", " ", re.sub(r"([a-zà-ÿ,.])([A-ZÀ-Ý])", r"\1 \2", texto)).strip()


def como_numero(bruto: str) -> tuple[float, str]:
    t = bruto.replace("R$", "").replace(":", "").strip()
    # 10.00000 — o milhar veio com ponto e os centavos vieram sem vírgula
    if re.fullmatch(r"\d{1,3}\.\d{5}|\d{1,3}\.\d{3}\.\d{2}", t):
        digitos = t.replace(".", "")
        return float(f"{digitos[:-2]}.{digitos[-2:]}"), "ponto"
    if "," in t:
        return float(t.replace(".", "").replace(",", ".")), "virgula"
    inteiro, _, resto = t.rpartition(".")
    if inteiro and len(resto) == 2:                 # 80.00 -> 80,00
        return float(f"{inteiro.replace('.', '')}.{resto}"), "ponto"
    return float(t.replace(".", "")), "sem separador"


def ler(pg: dict[int, str]) -> tuple[list[dict], list[dict], list[dict]]:
    """Devolve (atividades, blocos problemáticos, valores de cabeçalho ignorados).

    Uma atividade pode ter mais de um valor: parte da tabela gradua a taxa pelo
    número de empregados — laticínios paga 150,00 até dez empregados, 300,00 de
    onze a trinta e 600,00 acima de trinta e um. Essas linhas vêm sem repetir o
    código da subclasse, então são anexadas à atividade imediatamente anterior.
    """
    itens: list[dict] = []
    sobras: list[dict] = []
    orfaos: list[dict] = []
    buffer: list[str] = []
    secao = classe = ""
    caixa_seguida = False

    def emitir(linha_valor: str, n: int) -> None:
        nonlocal buffer
        achado = VALOR_CLARO.match(linha_valor) or VALOR_TORTO.match(linha_valor) or VALOR_NU.match(linha_valor)
        bruto = achado.group(1)
        valor, separador = como_numero(bruto)
        codigos = [l for l in buffer if so_codigo(l)]
        texto = limpar(" ".join(l for l in buffer if not so_codigo(l)))
        faixa = FAIXA.search(texto)
        rotulo_faixa = limpar(faixa.group(0)) if faixa else None
        if faixa:
            texto = limpar(texto[: faixa.start()] + " " + texto[faixa.end() :])
        buffer = []

        if len(codigos) == 1:
            itens.append({
                "pagina": n,
                "codigo": codigos[0],
                "denominacao": texto,
                "secao": secao,
                "classe": classe,
                "valor": valor,
                "impresso": bruto,
                "separador": separador,
                "colada": bool(COLADA.search(texto)),
                **({"faixas": [{"rotulo": rotulo_faixa, "valor": valor, "impresso": bruto}]} if rotulo_faixa else {}),
            })
            return
        if not codigos and rotulo_faixa and itens:
            # continuação da graduação por empregados da atividade anterior
            itens[-1].setdefault("faixas", []).append(
                {"rotulo": rotulo_faixa, "valor": valor, "impresso": bruto}
            )
            return
        if not codigos:
            # Sem código não há atividade: ou é o valor da linha de divisão,
            # grupo ou classe — a tabela repete o número no cabeçalho em algumas
            # páginas —, ou é uma linha cujo código se perdeu. O segundo caso
            # aparece adiante como bloco com dois códigos, que é erro duro.
            nonlocal orfaos
            orfaos.append({"pagina": n, "texto": texto, "impresso": bruto})
            return
        if len(codigos) == 2 and codigos[0] in LIDAS_NA_IMAGEM:
            # o primeiro código ficou sem valor porque a célula veio fora de
            # ordem; o valor dele foi lido na imagem, o do segundo é este
            lido, pagina_lida, _ = LIDAS_NA_IMAGEM[codigos[0]]
            itens.append({
                "pagina": pagina_lida, "codigo": codigos[0], "denominacao": texto,
                "secao": secao, "classe": classe, "valor": lido,
                "impresso": f"{lido:.2f}".replace(".", ","), "separador": "imagem",
                "colada": bool(COLADA.search(texto)),
            })
            itens.append({
                "pagina": n, "codigo": codigos[1], "denominacao": classe,
                "secao": secao, "classe": classe, "valor": valor,
                "impresso": bruto, "separador": separador, "colada": False,
            })
            return
        sobras.append({
            "pagina": n, "codigosNoBloco": len(codigos), "denominacao": texto,
            "valor": valor, "impresso": bruto,
        })

    for n in range(DE, ATE + 1):
        for linha in pg.get(n, "").split(chr(10)):
            linha = linha.strip()
            if not linha or RUIDO.search(linha):
                continue

            codigo = so_codigo(linha)
            if codigo:
                buffer.append(codigo)
                continue

            tem_codigo = any(so_codigo(l) for l in buffer)

            # Grupo (`17.2`) e classe com nome (`17.21Fabricacao de papel`) não
            # se confundem com valor em forma nenhuma: um tem uma casa decimal
            # só, o outro é seguido de LETRA — `11.000,00` também casaria com
            # dois dígitos, ponto, dois dígitos, e por isso a letra é exigida.
            # São cabeçalho sempre, mesmo no meio
            # de uma atividade — a célula do valor é impressa deslocada para
            # baixo e cai depois do cabeçalho da linha seguinte.
            if GRUPO.match(linha):
                continue
            com_nome = re.match(r"^\d{2}\.\d{2}\s*[A-Za-zÀ-ÿ]", linha)
            if com_nome:
                classe = limpar(CLASSE.match(linha).group(2))
                continue

            # Enquanto o bloco não tem código de subclasse, nenhum número é
            # valor: `10.94` é a classe 10.94, não dez reais e noventa e quatro
            # centavos. Por isso o cabeçalho de nível é testado ANTES do valor.
            if not tem_codigo:
                if DIVISAO.match(linha) or GRUPO.match(linha):
                    continue
                achado = CLASSE.match(linha)
                if achado:
                    classe = limpar(achado.group(2))
                    continue
                if CAIXA_ALTA.match(linha):
                    # títulos de seção quebram em duas ou três linhas; linhas de
                    # caixa alta seguidas são o mesmo título e se emendam
                    secao = limpar(f"{secao} {linha}") if caixa_seguida else limpar(linha)
                    caixa_seguida = True
                    continue
            caixa_seguida = False

            if VALOR_CLARO.match(linha) or VALOR_TORTO.match(linha) or (tem_codigo and VALOR_NU.match(linha)):
                emitir(linha, n)
                continue

            # código grudado na denominação: "…outros veiculos nao9529-1/04"
            dentro = CODIGO_SOLTO.search(linha)
            if dentro:
                buffer.append(linha[: dentro.start()])
                buffer.append(f"{dentro.group(1)}/{dentro.group(2)}")
                resto = linha[dentro.end() :].strip()
                if resto:
                    buffer.append(resto)
                continue

            # valor grudado no fim da denominação: "…anteriomente250,00"
            no_fim = VALOR_NO_FIM.match(linha)
            if no_fim and tem_codigo:
                buffer.append(no_fim.group(1))
                emitir(no_fim.group(2), n)
                continue

            buffer.append(linha)
    return itens, sobras, orfaos


def aplicar_leitura_de_imagem(itens: list[dict]) -> int:
    """Sobrepõe o valor lido na imagem onde o reconhecimento errou o número."""
    trocados = 0
    for i in itens:
        correcao = LIDAS_NA_IMAGEM.get(i["codigo"])
        if not correcao or i["separador"] == "imagem":
            continue
        valor, pagina, motivo = correcao
        if i["valor"] == valor:
            continue
        i["valor"], i["separador"], i["motivo"] = valor, "imagem", motivo
        i["pagina"] = pagina
        trocados += 1
    return trocados


def resolver_sem_separador(itens: list[dict]) -> tuple[int, list[dict]]:
    """Trata `8000` como `80,00` só quando 80,00 já existe na tabela."""
    conhecidos = {i["valor"] for i in itens if i["separador"] != "sem separador"}
    resolvidos, teimosos = 0, []
    for i in itens:
        if i["separador"] in ("virgula", "imagem"):
            i["conferencia"] = "conferido"
        elif i["separador"] == "ponto":
            i["conferencia"] = "revisar"
        elif i["valor"] / 100 in conhecidos:
            i["valor"], i["conferencia"] = i["valor"] / 100, "inferido"
            resolvidos += 1
        elif i["valor"] in conhecidos:
            i["conferencia"] = "inferido"
            resolvidos += 1
        else:
            i["conferencia"] = "indefinido"
            teimosos.append(i)
    return resolvidos, teimosos


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--diagnostico", action="store_true", help="mede e não grava")
    ap.add_argument("--pagina", type=int, help="imprime as atividades desta página")
    args = ap.parse_args()

    itens, sobras, orfaos = ler(paginas())
    trocados = aplicar_leitura_de_imagem(itens)
    resolvidos, teimosos = resolver_sem_separador(itens)

    if args.pagina:
        for i in [x for x in itens if x["pagina"] == args.pagina]:
            print(f"  {i['codigo']}  {i['valor']:>9,.2f} ({i['impresso']:>8}) {i['denominacao'][:66]}")
        return

    graus = Counter(i["conferencia"] for i in itens)
    valores = Counter(i["valor"] for i in itens)
    print(f"{len(itens)} atividades lidas em {len({i['pagina'] for i in itens})} páginas")
    print(f"  conferência: {dict(graus)}")
    print(f"  {len(valores)} valores distintos: {sorted(valores)}")
    print(f"  os mais usados: {[(f'{v:,.2f}', c) for v, c in valores.most_common(5)]}")
    print(f"  {sum(1 for i in itens if i['colada'])} denominações com palavras coladas")
    if trocados:
        print(f"  {trocados} valores substituídos pela leitura da imagem")
    if resolvidos:
        print(f"  {resolvidos} valores sem separador resolvidos por valor já existente na tabela")
    if teimosos:
        print(f"  ! {len(teimosos)} valores sem separador NÃO resolvidos:")
        for i in teimosos[:12]:
            print(f"      p.{i['pagina']} {i['codigo']} impresso {i['impresso']!r} — {i['denominacao'][:46]}")
    if sobras:
        print(f"  ! {len(sobras)} blocos sem código único:")
        for s in sobras[:12]:
            print(f"      p.{s['pagina']} códigos={s['codigosNoBloco']} valor={s['impresso']!r} — {s['denominacao'][:52]}")
    vazias = [i for i in itens if len(i["denominacao"]) < 4]
    if vazias:
        print(f"  ! {len(vazias)} atividades sem denominação legível:")
        for i in vazias[:8]:
            print(f"      p.{i['pagina']} {i['codigo']}")
    altos = sorted(itens, key=lambda i: -i["valor"])[:5]
    print("  maiores valores: " + " · ".join(f"{i['valor']:,.2f} ({i['impresso']}) p.{i['pagina']}" for i in altos))

    if args.diagnostico:
        return
    if teimosos or sobras or vazias:
        sys.exit("\nnão gravei: resolva as pendências acima conferindo a imagem da página")

    destino = ROOT / "municipios" / "tacaratu" / "anexo-i.json"
    destino.write_text(
        json.dumps(
            {
                "sobre": "Anexo I da Lei nº 1.365/2017 — Taxa de Licença para Localização e Taxa de "
                         "Fiscalização de Licença para Funcionamento, por subclasse da CNAE 2.0. "
                         "Valores em reais. Lido das páginas 155 a 238.",
                "documento": DOC,
                "paginas": [DE, ATE],
                "atividades": itens,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"\ngravado em {destino.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
