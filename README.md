# Consulta à legislação municipal

Aplicativo offline de consulta educativa à legislação tributária e urbanística de municípios de
Pernambuco. A mesma base atende navegador no PC, instalação como aplicativo no iPhone e um pacote
Android nativo.

Municípios publicados: **Ibimirim**, **Aliança**, **Manari**, **Ingazeira**,
**Vertente do Lério**, **Jatobá**, **Cortês**, **Tacaratu** e **Jurema** —
10.749 páginas indexadas. Caraibeiras, distrito de Tacaratu, é atendida pelo aplicativo de Tacaratu.
Site: https://wiserjr.github.io/ibimirim-legal/

Os nove trazem valores, por dois caminhos distintos. Em **Ibimirim**, **Aliança** e **Manari** as
tabelas dos anexos foram extraídas para consulta estruturada. Nos outros seis os valores entram pelo
cadastro de cobranças, montado a partir da leitura das páginas — hoje 75 das 167 cobranças abrem com
a tabela pronta, e as demais são as que a lei descreve sem fixar valor.

Cada valor transcrito é conferido contra o texto da página que ele cita: **1.086 dos 1.088**. Dos
dois restantes, um foi confirmado contra a redação anterior do próprio Código e o outro segue
marcado para revisão. Outros **105 valores**, em cinco cobranças cujas páginas a digitalização
deixou ilegíveis, foram lidos na imagem um a um — o resultado de cada leitura está na nota da
cobrança.

## Baixar

Não é preciso compilar nada: cada município tem seu aplicativo pronto no
**[Release v1.7.3](https://github.com/Wiserjr/ibimirim-legal/releases/tag/v1.7.3)** — as tabelas
calculam: cada linha tem campo de quantidade e mostra o total em reais. São **108 tabelas e 3.280
linhas** nos nove municípios.

- **Android** — o `.apk` do município. Abrir o arquivo no aparelho instala; o Android pede
  autorização para instalar fora da loja, e é esperado. Quem já tem a versão anterior recebe
  atualização. Os nove são aplicativos distintos, então instalar um não substitui o outro.
- **PC ou iPhone** — o `.zip`. Descompacte e abra o `index.html`. Pelo Safari, no iPhone, dá para
  adicionar à tela de início.
- **Só consultar, sem instalar** — <https://wiserjr.github.io/ibimirim-legal/>

Os APKs são de depuração, assinados com a chave pública de desenvolvimento: instalam e funcionam,
mas o Android avisa na instalação. O `SHA256SUMS.txt` anexado ao Release permite conferir o arquivo
baixado antes de repassá-lo a alguém.

## Como está organizado

`app/` é a casca do aplicativo e não contém dado de município nenhum: nem nome, nem lei, nem
tabela. Tudo o que distingue uma versão da outra vive em `municipios/<slug>/`.

```
app/                     casca: index.html (com {{marcadores}}), app.js, estilos, sw.js
municipios/
  ibimirim/
    municipio.json          marca, textos, trilhas, glossário, cartões de cálculo
    fontes.json             os PDFs de origem, por documento
    data/laws.js            corpus indexado, página a página
    data/fees.js            tabelas de taxas
  alianca/  (mesma estrutura)
  manari/   (mesma estrutura)
tools/                      extratores e build
dist/<slug>/                aplicativo montado, abre por duplo clique
docs/                       o que o GitHub Pages publica
```

Um município novo é uma pasta nova em `municipios/`. Não há código a duplicar.

## Comandos

```
npm run build                    monta dist/ para todos os municípios
python tools/build.py alianca    monta só um
npm test                         build + as seis suítes
python tools/build_pages.py      gera docs/ para o GitHub Pages
python tools/package.py alianca  gera o ZIP e copia o APK para dist/
```

Android, por município:

```
cd android && ./gradlew assembleDebug -Pmunicipio=alianca
```

Cada município vira um aplicativo distinto — `br.gov.pe.<slug>.legal`, com rótulo próprio — de modo
que todos coexistem no mesmo aparelho. O slug perde o que não for letra ou dígito antes de virar
identificador, porque hífen o Android recusa: `vertente-do-lerio` vira `br.gov.pe.vertentedolerio.legal`.

## Abrir no PC

Baixe o repositório e abra o `index.html` da **raiz** com dois cliques: ele é uma capa que leva às
versões já montadas em `docs/`. Não é preciso servidor.

`app/index.html` não abre: é o template da casca, cheio de `{{marcadores}}` que só o build
substitui. Quem quiser gerar o próprio pacote roda `npm run build` e abre `dist/<município>/index.html`.

A base legal é carregada por `<script>`, não por `fetch()`. O Chrome trata `file://` como origem
opaca e bloqueia qualquer `fetch`, mesmo para um arquivo irmão na mesma pasta — era o que impedia a
página de abrir por duplo clique. Por isso `data/laws.js` e `data/fees.js` são scripts que definem
`window.MUNICIPIO_LAWS` e `window.MUNICIPIO_FEES`, e não arquivos `.json`.

## iPhone

Abra o endereço do município no Safari e toque em Compartilhar → Adicionar à Tela de Início. O
GitHub Pages fornece o HTTPS que o iOS exige para instalar uma PWA.

## Atualizar a legislação

`municipios/<slug>/fontes.json` lista os PDFs de origem. Depois de alterá-lo:

```
python tools/build_corpus.py <slug>
```

Só documentos com id novo são extraídos; os demais são reaproveitados, o que importa porque o OCR
de um Plano Diretor digitalizado leva um quarto de hora.

Páginas sem camada de texto passam por OCR em duas resoluções. Nenhuma domina a outra: a menor
descarta linhas inteiras, a maior corrompe algarismos — na Lei nº 793/2018 ela transformou "50" em
"50o". O extrator fica com a leitura que tiver menos numerais grudados a letras e grava toda
divergência numérica em `ocrConflict` na página, para conferência humana.

## Cadastro de cobranças

As tabelas de `fees.js` saem dos extratores, e por isso só existem onde a extração já foi feita e
conferida. O cadastro de cobranças resolve o outro lado: **quem sabe o valor é a equipe do
município**, e agora ela tem porta de entrada.

`municipios/<slug>/cobrancas.json` guarda, por cobrança: o que se cobra, o fato gerador, quem paga,
a base de cálculo, a periodicidade, quando vence — e o **fundamento**, que é obrigatório.

```
node tools/serve.mjs ingazeira      abre o município montado
```

A seção **Cobranças** do aplicativo lista o cadastro e permite editá-lo. Não há servidor: o que a
equipe altera fica no navegador, sobre o cadastro publicado, e sai pelo botão **Exportar cadastro**
como um arquivo no formato exato deste JSON. Esse arquivo volta ao repositório por revisão, e o
diff no git é o que se confere antes de publicar.

**A regra que sustenta tudo: sem fundamento não grava.** Cada cobrança aponta documento, página e
artigo, e o aplicativo recusa a gravação se a página não existir no documento citado — a mesma
conferência que `npm test` repete sobre o cadastro publicado. É o que permite responder "por que
estou cobrando isto?" sem depender de quem montou a tabela, e o que faz o botão **Ver fundamento**
abrir a lei na página certa.

O grau de conferência aparece em cada cobrança: **conferido na lei**, **informado pela equipe** ou
**precisa de revisão**. O que a equipe informou nunca se confunde com o que foi lido na lei.

Bases aceitas: `reais`, `ufm` (ou outra unidade fiscal), `percentual`, `faixas` — valor que muda
conforme uma medida, como kWh/mês ou m² — e `formula`, para o que só se descreve em texto. Valor em
unidade fiscal nunca guarda reais junto, pela mesma razão de sempre: a conversão de um exercício não
pode vazar para outro.

`npm run test:ui` roda a suíte de navegador do cadastro, com o servidor de pé.

## Correções de OCR

`municipios/<slug>/correcoes.json` declara trocas de caractere que o reconhecimento errou. São
aplicadas na **montagem**, não na extração, de modo que alcançam também as páginas vindas do cache —
receber a correção não custa repetir horas de OCR.

Cada entrada exige um campo `conferido`, com a citação da página onde a forma correta foi lida na
imagem. É a regra que separa correção de reescrita: **só entram trocas de caractere do OCR**.
Divergência real do texto publicado não se corrige — vai para
[DOCUMENTOS-RECOMENDADOS.md](DOCUMENTOS-RECOMENDADOS.md) e é decidida com o Município.

O primeiro caso foi o ITBI de Jurema: o OCR leu o I final como l minúsculo nas onze ocorrências da
sigla, e nenhuma ficou correta. A sigla sumia da busca, e "ITBI transmissão" caía no Código Civil,
que cobre os dois termos. `npm test` falha se uma correção declarada deixar de estar aplicada.

## Tabelas de taxas

Cada município tem sua origem, porque os códigos não se parecem:

- **Ibimirim** — `tools/extract_fees.py` lê a planilha comparativa da equipe. Os lados anterior e
  atual são extraídos como listas independentes: a planilha não alinha as duas colunas por linha, e
  parear por posição criaria equivalências falsas entre fatos geradores distintos. As páginas
  citadas ficam no dicionário `ANCHORS`, junto com o grau de conferência contra o texto da lei —
  `confirmado`, `parcial` ou `divergente`.
- **Aliança** — `tools/extract_fees_alianca.py` lê os anexos do próprio Código (páginas 133 a 145
  da LC nº 041/2017). O PDF põe uma célula por linha, então o parser percorre o fluxo como máquina
  de estados. Todos os valores são em UFM e nenhum é convertido em reais na base.
- **Manari** — duas fontes, conforme o que cada página permite. Nas páginas 118 a 132 e 139 a coluna
  de valores vem deslocada do rótulo, ou a tabela tem mais de uma coluna de valor: essas foram
  abertas como imagem e **transcritas à mão** em `tools/tabelas_manari.py`, com um grau de confiança
  por entrada. As páginas 133 a 148 têm borda real e um valor por linha, e são lidas por
  `tools/extract_fees_manari.py`, que separa rótulo de valor pela coordenada horizontal da palavra —
  método validado contra a leitura visual das páginas 139 e 146 antes de ser aplicado às demais.
  `tools/build_fees_manari.py` funde as duas e reconfronta cada número com o texto da sua página,
  aceitando as três pontuações decimais que a lei usa — vírgula, ponto e apóstrofo.

## UFM e demais unidades de referência

Cada município tem a sua convenção, e confundi-las erra a conta por ordens de grandeza. Aliança,
Vertente do Lério e Jurema fixam em Unidade Fiscal do Município; Ibimirim usa reais no Código de
2025 e UFM nas leis específicas; Ingazeira, Cortês e Tacaratu fixam em reais; Manari e Jatobá cobram
percentuais sobre um Valor de Referência.

**Quase nenhum acervo informa quanto vale a unidade.** Em Aliança, o art. 397 manda atualizá-la pelo
IPCA, cabendo ao Executivo fixar o valor por decreto. O aplicativo nunca embute a unidade: exibe os
montantes nela e só converte depois que a equipe informa o valor do exercício no painel "UFM
vigente". Há teste que falha se algum fator de conversão voltar à base publicada.

A exceção é **Jurema**, o único acervo que traz o ato de fixação: o Decreto nº 003/2013, encadernado
na primeira página, fixa a UFM em R$ 1,44 para 2013, com base no art. 399 do Código. Serve de
modelo do que pedir aos demais municípios — mas não vale para os exercícios seguintes.

Jatobá é o caso extremo: o seu Valor de Referência está atrelado à **UFIR**, índice federal extinto
em outubro de 2000. Enquanto o Município não indicar o índice que a substituiu, nenhuma taxa daquele
Código converte em reais.

## Cartões de cálculo

`municipio.json` declara os cartões em `cartoes`. Quatro formatos cobrem o que os códigos usam:

| tipo | quando | exemplo |
|---|---|---|
| `faixas` | valor por faixa de área, com fórmula opcional acima do teto | localização e funcionamento em Ibimirim |
| `variantes` | escolha de categoria, base mais adicional por metro | licença para construir |
| `soma` | quantidades × valor unitário, com teto opcional | torres, antenas e placas solares |
| `grupos` | escolha de categoria, cada uma com suas faixas de área | coleta de lixo em Aliança |

Numa faixa, `null` no lugar do teto significa "sem limite superior" e só vale na última.

## Limites

Guia educativo, não parecer jurídico. O texto da lei prevalece. As pendências de vigência e as
divergências encontradas entre as fontes estão em [DOCUMENTOS-RECOMENDADOS.md](DOCUMENTOS-RECOMENDADOS.md).
