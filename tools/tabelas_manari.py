"""Tabelas do Código Tributário de Manari, transcritas página a página.

Os anexos da Lei nº 99/2007 ocupam as páginas 118 a 148 e não podem ser lidos
por parser: o PDF quebra rótulos em várias linhas, espaça letras nos
cabeçalhos ("E S P E C I F I C A Ç Ã O") e, em vários blocos, desloca a coluna
de valores uma linha acima do subitem a que pertence. Uma extração automática
produziria valores plausíveis e errados — o pior resultado possível numa
tabela de tributos.

Por isso cada página foi aberta como imagem e transcrita à mão. Cada entrada
carrega a página de origem e um grau de confiança:

    alta   — rótulo e valor inequivocamente na mesma linha
    media  — pareados pela contagem (N subitens ↔ N valores), com o
             deslocamento de uma linha que o PDF introduz
    baixa  — a leitura exigiu escolha entre alternativas; conferir no papel

`tools/verificar_tabelas_manari.py` confronta cada número aqui com o texto da
página correspondente, de modo que um erro de digitação não passa silencioso.

Unidades:
    pct_vr  — percentual sobre o Valor de Referência Fiscal
    ufm     — múltiplo da Unidade Fiscal do Município
    pct     — percentual sobre o preço do serviço (lista do ISS)
"""

# ---------------------------------------------------------------------------
# TABELA I — Taxa de licença para localização e funcionamento (alvará)
# Páginas 118 a 121. Duas colunas de valor: ao mês e ao ano.
# ---------------------------------------------------------------------------

TABELA_I = {
    "id": "tabela-i-localizacao-funcionamento",
    "titulo": "Tabela I — Taxa de licença para localização e funcionamento (alvará)",
    "unidade": "pct_vr",
    "colunas": ["Ao mês", "Ao ano"],
    "paginas": [118, 119, 120, 121],
    "entradas": [
        # p.118 — os três setores, cada um com três classes de atividade
        ("1", "Setor 3 — 01. Indústrias, serralharias, casas de ferragens, supermercados, mercearias, armazéns, depósitos, magazines, lojas, joalherias, armarinhos, agências de automóveis e peças, farmácias, serrarias e locadoras", 25.0, 200, 118, "alta"),
        ("1", "Setor 3 — 02. Boates, loterias, bebidas alcoólicas, decorações, tapeçarias, restaurantes, agências de turismo e viagens, cigarros, artigos para fumantes e frigoríficos", 20.9, 250, 118, "alta"),
        ("1", "Setor 3 — 03. Jogos permitidos, clubes recreativos e bares", 16.7, 200, 118, "media"),
        ("2", "Setor 2 — 01. Indústrias, serralharias, supermercados, mercearias, armazéns, depósitos, magazines, lojas, joalherias, armarinhos, agências de automóveis, agências de peças, farmácias, drogarias, funerárias e locadoras", 20.9, 250, 118, "alta"),
        ("2", "Setor 2 — 02. Boates, loterias, bebidas alcoólicas, decorações, tapeçarias, restaurantes, agências de turismo e viagens, cigarros e artigos para fumantes e frigoríficos", 16.7, 200, 118, "alta"),
        ("2", "Setor 2 — 03. Jogos permitidos, clubes recreativos e bares", 12.5, 150, 118, "media"),
        ("3", "Setor 1 — 01. Indústrias, serralharias, supermercados, mercearias, armazéns, depósitos, magazines, lojas, joalherias, armarinhos, agências de automóveis, agências de peças, farmácias, drogarias, funerárias e locadoras", 16.7, 200, 118, "alta"),
        # p.119 — continuação do Setor 1 e itens 4 a 10
        ("3", "Setor 1 — 02. Boates, loterias, bebidas alcoólicas, decorações, tapeçarias, restaurantes, agências de turismo e viagens, cigarros, artigos para fumantes e frigoríficos", 12.5, 150, 119, "alta"),
        ("3", "Setor 1 — 03. Jogos permitidos, clubes recreativos e bares", 8.4, 100, 119, "media"),
        ("4", "Estabelecimentos bancários, de crédito, financiamentos, investimentos e seguros", 58.4, 700, 119, "alta"),
        ("5", "Hotéis, motéis, pensões e similares — até 10 quartos", 8.4, 100, 119, "media"),
        ("5", "Hotéis, motéis, pensões e similares — de 11 a 20 quartos", 16.7, 200, 119, "media"),
        ("5", "Hotéis, motéis, pensões e similares — de mais de 20 quartos", 25.0, 300, 119, "media"),
        ("5", "Hotéis, motéis, pensões e similares — por apartamento", 1.4, 17, 119, "media"),
        ("5", "Hotéis, motéis, pensões e similares — por suíte", 2.1, 25, 119, "media"),
        ("6", "Representantes comerciais autônomos, corretores, despachantes, agentes e prepostos em geral", 8.4, 100, 119, "alta"),
        ("7", "Profissionais autônomos que exercem atividades sem aplicação de capital", 8.4, 100, 119, "alta"),
        ("8", "Profissionais autônomos que exercem atividades com aplicação de capital", 8.4, 100, 119, "alta"),
        ("9", "Casas lotéricas e jogos permitidos sem aplicação de capital", 5.0, 60, 119, "alta"),
        ("10", "Oficinas de consertos em geral — até 20 m²", 3.4, 40, 119, "media"),
        ("10", "Oficinas de consertos em geral — de 21 m² a 75 m²", 6.8, 80, 119, "media"),
        ("10", "Oficinas de consertos em geral — de 76 m² a 150 m²", 10.0, 120, 119, "media"),
        ("10", "Oficinas de consertos em geral — de 151 m² em diante", 13.4, 160, 119, "media"),
        ("11", "Item 11 — rótulo não legível na quebra de página", 16.7, 200, 119, "baixa"),
        # p.120 — item 12
        ("12", "Postos de abastecimento e serviços para veículos; postos de inflamáveis, explosivos e similares — no perímetro urbano", 33.4, 400, 120, "media"),
        ("12", "Postos de abastecimento e serviços para veículos; postos de inflamáveis, explosivos e similares — fora do perímetro urbano", 25.0, 300, 120, "media"),
        # p.121 — itens 13 a 25, alinhamento limpo
        ("13", "Tinturarias e lavanderias", 12.5, 150, 121, "alta"),
        ("14", "Estabelecimentos de banhos, duchas, massagens, ginásticas e congêneres", 16.7, 200, 121, "alta"),
        ("15", "Barbearias e salões de beleza — até 2 cadeiras", 4.2, 50, 121, "alta"),
        ("15", "Barbearias e salões de beleza — de 3 a 5 cadeiras", 6.3, 75, 121, "alta"),
        ("15", "Barbearias e salões de beleza — de 6 cadeiras em diante", 8.4, 100, 121, "alta"),
        ("16", "Empresas de rádios e jornais", 25.0, 300, 121, "alta"),
        ("17", "Jogos permitidos em salões — bilhares e quaisquer outros jogos de mesa com até 3 mesas", 8.4, 100, 121, "alta"),
        ("17", "Jogos permitidos em salões — bilhares e quaisquer outros jogos de mesa com mais de 3 mesas", 12.5, 150, 121, "alta"),
        ("17", "Jogos permitidos em salões — boliches, por número de pistas", 4.2, 50, 121, "alta"),
        ("18", "Exposições de feiras e amostras e quermesses, por dia", None, 3, 121, "alta"),
        ("19", "Empreiteiros e incorporadores", 41.7, 500, 121, "alta"),
        ("20", "Agropecuárias e granjas — até 100 empregados", 8.4, 100, 121, "alta"),
        ("20", "Agropecuárias e granjas — de mais de 100 empregados", 16.7, 200, 121, "alta"),
        ("21", "Escritórios de advocacia, contadoria, contabilidade, administração e assessoria em geral", 8.4, 100, 121, "alta"),
        ("22", "Consultorias", 12.5, 150, 121, "alta"),
        ("23", "Consultórios médicos e dentários", 12.5, 150, 121, "alta"),
        ("24", "Escritórios de engenharia, agronomia e arquitetura", 12.5, 150, 121, "alta"),
        ("25", "Demais atividades sujeitas à taxa, não constantes dos itens anteriores — estabelecidas no setor 1", 4.2, 50, 121, "alta"),
        ("25", "Demais atividades sujeitas à taxa, não constantes dos itens anteriores — estabelecidas no setor 2", 8.4, 100, 121, "alta"),
        ("25", "Demais atividades sujeitas à taxa, não constantes dos itens anteriores — estabelecidas no setor 3", 12.5, 150, 121, "alta"),
    ],
}

TABELAS = [TABELA_I]


# ---------------------------------------------------------------------------
# TABELA II — Licença para funcionamento em horário especial (p.122)
# ---------------------------------------------------------------------------

TABELA_II = {
    "id": "tabela-ii-horario-especial",
    "titulo": "Tabela II — Taxa de licença para funcionamento em horário especial",
    "unidade": "pct_vr",
    "paginas": [122],
    "entradas": [
        ("", "Prorrogação e antecipação — por dia", 20, None, 122, "alta"),
        ("", "Prorrogação e antecipação — por mês", 300, None, 122, "alta"),
        ("", "Prorrogação e antecipação — por semestre", 500, None, 122, "alta"),
        ("", "Prorrogação e antecipação — por ano", 1000, None, 122, "alta"),
    ],
}

# ---------------------------------------------------------------------------
# TABELA III — Execução de obras, arruamento, loteamento e habite-se
# Páginas 122 e 123. Os quatro padrões de acabamento vêm deslocados uma linha;
# a leitura adotada casa a contagem e preserva a ordem decrescente.
# ---------------------------------------------------------------------------

TABELA_III = {
    "id": "tabela-iii-obras-arruamento-habite-se",
    "titulo": "Tabela III — Taxa de execução de obras, arruamento, loteamento e habite-se",
    "unidade": "pct_vr",
    "paginas": [122, 123],
    "nota": (
        "O padrão baixo aparece isento na faixa de até 50,00 m². A coluna de valores "
        "vem deslocada uma linha acima do subitem a que pertence; a leitura adotada "
        "casa a contagem de padrões com a de valores e preserva a ordem decrescente."
    ),
    "entradas": [
        ("1.1", "Construção, reconstrução, reforma, demolição e reparos de prédios, por m², com até 50,00 m² — padrão ótimo", 2.0, None, 122, "media"),
        ("1.1", "Construção, reconstrução, reforma, demolição e reparos de prédios, por m², com até 50,00 m² — padrão bom", 1.5, None, 123, "media"),
        ("1.1", "Construção, reconstrução, reforma, demolição e reparos de prédios, por m², com até 50,00 m² — padrão regular", 1.0, None, 123, "media"),
        ("1.1", "Construção, reconstrução, reforma, demolição e reparos de prédios, por m², com até 50,00 m² — padrão baixo (isento)", 0, None, 123, "media"),
        ("1.1", "Construção, reconstrução, reforma, demolição e reparos de prédios, por m², com mais de 50,00 m² — padrão ótimo", 5.0, None, 123, "media"),
        ("1.1", "Construção, reconstrução, reforma, demolição e reparos de prédios, por m², com mais de 50,00 m² — padrão bom", 3.0, None, 123, "media"),
        ("1.1", "Construção, reconstrução, reforma, demolição e reparos de prédios, por m², com mais de 50,00 m² — padrão regular", 2.0, None, 123, "media"),
        ("1.1", "Construção, reconstrução, reforma, demolição e reparos de prédios, por m², com mais de 50,00 m² — padrão baixo", 1.0, None, 123, "media"),
        ("1.2", "Drenos, sargetas, canalização e quaisquer escavações nas vias públicas, por metro linear", 0.5, None, 123, "alta"),
        ("1.3", "Colocação ou substituição de bombas de combustíveis, inclusive tanques, por unidade", 100.0, None, 123, "alta"),
        ("2.1", "Aprovação de arruamento e alinhamento, por metro linear", 0.3, None, 123, "media"),
        ("2.2", "Aprovação de loteamento, por lote", 2.0, None, 123, "media"),
        ("2.3", "Modificação de arruamento e alinhamento, por metro linear", 0.6, None, 123, "media"),
        ("2.4", "Modificação de loteamento, por lote", 1.2, None, 123, "media"),
        ("3", "Habite-se de prédios, por m² de construção — padrão ótimo", 1.0, None, 123, "media"),
        ("3", "Habite-se de prédios, por m² de construção — padrão bom", 0.8, None, 123, "media"),
        ("3", "Habite-se de prédios, por m² de construção — padrão regular", 0.5, None, 123, "media"),
    ],
}

# ---------------------------------------------------------------------------
# TABELAS IV a IX — páginas 124 a 129
# ---------------------------------------------------------------------------

TABELA_IV = {
    "id": "tabela-iv-publicidade",
    "titulo": "Tabela IV — Taxa de licença para utilização de meios de publicidade",
    "unidade": "pct_vr",
    "paginas": [124],
    "entradas": [
        ("", "Anúncios e letreiros na parte externa dos estabelecimentos industriais, comerciais, agropecuários, de prestação de serviços e outros, por publicidade", 50, None, 124, "alta"),
        ("", "Anúncios e letreiros em veículos, por unidade e por ano", 30, None, 124, "alta"),
        ("", "Anúncios e letreiros em painéis, por unidade e por ano", 100, None, 124, "alta"),
    ],
}

TABELA_V = {
    "id": "tabela-v-ocupacao-areas",
    "titulo": "Tabela V — Taxa de licença para ocupação de áreas em vias, terrenos e logradouros",
    "unidade": "pct_vr",
    "paginas": [125],
    "entradas": [
        ("", "Espaços ocupados por balcões, barracas, tabuleiros e similares nas vias e logradouros públicos, inclusive nas feiras, por m² e por dia", 1.5, None, 125, "alta"),
        ("", "Conjunto de mesas com quatro cadeiras, por unidade — por dia", 0.5, None, 125, "media"),
        ("", "Conjunto de mesas com quatro cadeiras, por unidade — por mês", 15, None, 125, "media"),
        ("", "Conjunto de mesas com quatro cadeiras, por unidade — por semestre", 90, None, 125, "media"),
        ("", "Conjunto de mesas com quatro cadeiras, por unidade — por ano", 180, None, 125, "media"),
    ],
}

TABELA_VI = {
    "id": "tabela-vi-expediente",
    "titulo": "Tabela VI — Taxa de expediente",
    "unidade": "pct_vr",
    "paginas": [126],
    "entradas": [
        ("", "Anotações para transferências de firmas, alteração de razão social, ampliação de estabelecimentos e alteração em fichas de cadastro", 15, None, 126, "alta"),
        ("", "Requerimentos e papéis entrados na Prefeitura", 20, None, 126, "alta"),
        ("", "Termos, contratos e registros de qualquer natureza, lavrados por laudo ou fração", 5, None, 126, "alta"),
        ("", "Expedição de certificados de averbação de imóveis ou de anotações por promessas de compra e venda", 20, None, 126, "alta"),
        ("", "Pela emissão de guias, duas vias", 10, None, 126, "alta"),
    ],
}

TABELA_VII = {
    "id": "tabela-vii-servicos-urbanos",
    "titulo": "Tabela VII — Taxa de serviços urbanos",
    "unidade": "pct_vr",
    "paginas": [127],
    "entradas": [
        ("", "Taxa de limpeza — varrição, capinação, limpeza de córregos, galerias e afins, por metro linear de testada", 0.6, None, 127, "alta"),
        ("", "Coleta de lixo domiciliar, por m² de área construída", 0.1, None, 127, "alta"),
        ("", "Conservação de calçamento, por metro linear de testada", 0.6, None, 127, "alta"),
        ("", "Demais atividades não incluídas nos itens anteriores, por unidade", 0.5, None, 127, "alta"),
    ],
}

TABELA_VIII = {
    "id": "tabela-viii-abate-animais",
    "titulo": "Tabela VIII — Taxa de licença de abate de animais",
    "unidade": "pct_vr",
    "paginas": [128],
    "entradas": [
        ("", "Bovino ou vacum, por quilo", 1.0, None, 128, "alta"),
        ("", "Ovino, por cabeça", 3.0, None, 128, "alta"),
        ("", "Caprino, por cabeça", 3.0, None, 128, "alta"),
        ("", "Suíno, por quilo", 0.5, None, 128, "alta"),
        ("", "Aves, por quilo", 0.1, None, 128, "alta"),
        ("", "Outros, por quilo", 0.1, None, 128, "alta"),
    ],
}

# Os itens 1 a 3 incidem sobre o Valor de Referência. Os itens 4.x incidem
# sobre o PREÇO DO SERVIÇO — o próprio subtítulo da tabela diz isso, e
# confundir as duas bases erraria a conta por ordens de grandeza.
TABELA_IX = {
    "id": "tabela-ix-iss",
    "titulo": "Tabela IX — Imposto sobre serviços de qualquer natureza (ISS)",
    "unidade": "pct_vr",
    "paginas": [129],
    "entradas": [
        ("1", "Trabalho pessoal de profissional autônomo de nível universitário", 500, None, 129, "alta"),
        ("2", "Trabalho pessoal do profissional autônomo de nível médio", 150, None, 129, "alta"),
        ("3", "Trabalho pessoal de demais profissionais autônomos", 100, None, 129, "media"),
    ],
}

TABELA_IX_PRECO = {
    "id": "tabela-ix-iss-preco-do-servico",
    "titulo": "Tabela IX — Atividades sujeitas ao ISS sobre o preço do serviço",
    "unidade": "pct",
    "paginas": [129],
    "entradas": [
        ("4.1", "Ensino de qualquer natureza", 2, None, 129, "alta"),
        ("4.2", "Diversões públicas", 10, None, 129, "alta"),
        ("4.3", "Demais atividades", 5, None, 129, "alta"),
    ],
}

TABELAS += [TABELA_II, TABELA_III, TABELA_IV, TABELA_V, TABELA_VI,
            TABELA_VII, TABELA_VIII, TABELA_IX, TABELA_IX_PRECO]


# ---------------------------------------------------------------------------
# ANEXO III — apuração do valor venal (páginas 130 a 132)
# Estas páginas têm borda real e alinhamento inequívoco.
# ---------------------------------------------------------------------------

VALOR_M2 = {
    "id": "valor-m2-edificacao",
    "titulo": "Valor do m² da edificação, por setor",
    "unidade": "ufm",
    "paginas": [130],
    "entradas": [
        ("", "Setores 1, 2, 6 e 7 — apartamento, sala, loja e especial", 310.00, None, 130, "alta"),
        ("", "Setores 1, 2, 6 e 7 — demais tipos", 220.00, None, 130, "alta"),
        ("", "Setores 3, 4, 5, 9 a 17, 24 e 25 — apartamento, sala, loja e especial", 200.00, None, 130, "alta"),
        ("", "Setores 3, 4, 5, 9 a 17, 24 e 25 — demais tipos", 160.00, None, 130, "alta"),
        ("", "Setores 8, 18 a 23 e 26 a 34 — apartamento, sala, loja e especial", 120.00, None, 130, "alta"),
        ("", "Setores 8, 18 a 23 e 26 a 34 — demais tipos", 80.00, None, 130, "alta"),
    ],
}

ALIQUOTAS_NAO_EDIFICADO = {
    "id": "aliquotas-imovel-nao-edificado",
    "titulo": "Alíquotas de imóvel não edificado",
    "unidade": "pct",
    "paginas": [130],
    "entradas": [
        ("", "Com área até 200 m² — demais setores", 1.0, None, 130, "alta"),
        ("", "Com área até 200 m² — setores 1, 2, 6 e 7", 2.4, None, 130, "alta"),
        ("", "Com área acima de 200 m² até 1.000 m² — qualquer setor", 2.4, None, 130, "alta"),
        ("", "Com área acima de 1.000 m² até 10.000 m² — qualquer setor", 3.0, None, 130, "alta"),
        ("", "Com área acima de 10.000 m² — qualquer setor", 4.0, None, 130, "alta"),
    ],
}

FATORES = {
    "id": "fatores-correcao-valor-venal",
    "titulo": "Fatores de correção do valor venal",
    "unidade": "indice",
    "paginas": [130, 131],
    "entradas": [
        ("situação", "Situação na quadra — uma frente", 1.0, None, 130, "alta"),
        ("situação", "Situação na quadra — mais de uma frente", 1.1, None, 130, "alta"),
        ("situação", "Situação na quadra — condomínio horizontal", 1.2, None, 130, "alta"),
        ("situação", "Situação na quadra — encravado", 0.6, None, 130, "alta"),
        ("situação", "Situação na quadra — gleba", 0.7, None, 130, "alta"),
        ("situação", "Situação na quadra — conjunto popular", 0.8, None, 130, "alta"),
        ("topografia", "Topografia — plano", 1.0, None, 131, "alta"),
        ("topografia", "Topografia — aclive", 0.9, None, 131, "alta"),
        ("topografia", "Topografia — declive", 0.7, None, 131, "alta"),
        ("topografia", "Topografia — irregular", 0.8, None, 131, "alta"),
        ("pedologia", "Pedologia — inundável ou terreno baixo", 0.8, None, 131, "alta"),
        ("pedologia", "Pedologia — firme", 1.0, None, 131, "alta"),
        ("pedologia", "Pedologia — arenoso", 0.9, None, 131, "alta"),
        ("pedologia", "Pedologia — rochoso", 0.8, None, 131, "alta"),
        ("estrutura", "Estrutura — alvenaria ou concreto", 1.0, None, 131, "alta"),
        ("estrutura", "Estrutura — madeira", 0.7, None, 131, "alta"),
        ("estrutura", "Estrutura — metálica", 0.9, None, 131, "alta"),
        ("estrutura", "Estrutura — taipa", 0.5, None, 131, "alta"),
        ("estrutura", "Estrutura — outra", 0.8, None, 131, "alta"),
        ("conservação", "Estado de conservação — ótima", 1.1, None, 131, "alta"),
        ("conservação", "Estado de conservação — boa ou normal", 1.0, None, 131, "alta"),
        ("conservação", "Estado de conservação — regular", 0.9, None, 131, "alta"),
        ("padrão", "Padrão da edificação — alto", 1.2, None, 131, "alta"),
        ("padrão", "Padrão da edificação — médio", 1.0, None, 131, "alta"),
        ("padrão", "Padrão da edificação — baixo", 0.8, None, 131, "alta"),
    ],
}

# Página 139. Quatro colunas (Tipo A, Tipo B, Tipo C) que o corte por
# coordenada não separa; lida visualmente.
CONSTRUCAO_CIVIL = {
    "id": "valores-construcao-civil",
    "titulo": "Tabela de valores para construção civil",
    "unidade": "ufm",
    "paginas": [139],
    "entradas": [
        ("01", "Construção em alvenaria, por m² — tipo A", 1.20, None, 139, "alta"),
        ("01", "Construção em alvenaria, por m² — tipo B", 2.00, None, 139, "alta"),
        ("01", "Construção em alvenaria, por m² — tipo C", 3.00, None, 139, "alta"),
        ("02", "Construção em madeira, por m² — tipo A", 0.60, None, 139, "alta"),
        ("03", "Galpão de alvenaria, por m² — tipo A", 1.50, None, 139, "alta"),
    ],
}

TABELAS += [VALOR_M2, ALIQUOTAS_NAO_EDIFICADO, FATORES, CONSTRUCAO_CIVIL]

# ---------------------------------------------------------------------------
# Conflito interno da lei, encontrado na conferência página a página.
# ---------------------------------------------------------------------------

CONFLITOS = [
    {
        "tabela": "Obras e edificações, por zona",
        "paginas": [141, 142],
        "texto": (
            "\"Edificações com mais de três pavimentos\" aparece duas vezes na mesma "
            "tabela, com valores diferentes: item 4 (p.141) traz 0,4 / 0,3 / 0,2 para "
            "as zonas C, B e A, e item 10 (p.142) traz 0,8 / 0,7 / 0,6. O mesmo vale, "
            "sem divergência, para \"edificações até três pavimentos\" nos itens 3 e 9. "
            "Antes de lançar, definir qual item prevalece."
        ),
    },
    {
        "tabela": "Ocupação de solo e diversões públicas",
        "paginas": [143],
        "texto": (
            "A numeração salta do item 10 para o 12: não há item 11 na tabela."
        ),
    },
    {
        "tabela": "Tabela I — Taxa de licença para localização e funcionamento (alvará)",
        "paginas": [119],
        "texto": (
            "O item 11 tem valor (16,7 ao mês e 200 ao ano) mas nenhuma descrição no "
            "documento: a página traz 17 valores e apenas 16 rótulos."
        ),
    },
    {
        "tabela": "Taxa de expediente",
        "paginas": [142],
        "texto": (
            "O item 14, \"concessão de habite-se por metro quadrado\", está impresso "
            "como 0'2, com apóstrofo no lugar da vírgula. Lido como 0,2."
        ),
    },
]
