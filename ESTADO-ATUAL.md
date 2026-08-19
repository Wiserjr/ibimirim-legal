# Estado atual e como retomar

Ponto de retomada do trabalho, escrito para quem chega sem ter acompanhado a conversa
anterior — inclusive uma sessão nova do assistente. Leia este arquivo, o
[README.md](README.md) e o [DOCUMENTOS-RECOMENDADOS.md](DOCUMENTOS-RECOMENDADOS.md), nessa
ordem, e depois `git log --oneline`.

Atualizado em 19/08/2026.

## O que já está publicado

Site: https://wiserjr.github.io/ibimirim-legal/ — capa que leva a cada município.
São **nove municípios**, 10.715 páginas indexadas, 28,58 MB em `docs/`.

| Município | Documentos | Páginas | Tabelas de taxa | Cartões |
|---|---|---|---|---|
| Ibimirim | 19 | 1.384 | 13 seções, 384 itens | 3 |
| Aliança | 11 | 1.220 | 13 tabelas, 365 itens | 1 |
| Manari | 5 | 1.177 | 29 tabelas, 453 itens | 0 |
| Ingazeira | 3 | 1.180 | não extraídas | 0 |
| Vertente do Lério | 3 | 1.113 | não extraídas | 0 |
| Jatobá | 3 | 1.074 | não extraídas | 0 |
| Cortês | 3 | 1.059 | não extraídas | 0 |
| Tacaratu | 3 | 1.247 | não extraídas | 0 |
| Jurema | 4 | 1.261 | não extraídas | 0 |

Cada um sai também como ZIP (PC/iPhone) e APK Android com `applicationId` próprio.

Os seis últimos entram com o **texto pesquisável e citável por página**, mas sem tabelas
estruturadas: o aplicativo mostra a busca, o leitor e a página citada, e declara na abertura
que os valores não estão tabulados.

## O que falta

Os seis municípios pedidos estão todos publicados. **Caraibeiras é distrito de Tacaratu**, não
município: não tem legislação tributária própria, e o Código de Tacaratu o alcança — o aplicativo de
Tacaratu traz esse aviso e atende os dois. Falta o usuário confirmar se quer alguma distinção
interna.

O que resta é trabalho de aprofundamento, não de cobertura:

- **Extrair as tabelas** dos seis municípios que entraram só com texto (Ingazeira, Vertente do
  Lério, Jatobá, Cortês, Tacaratu e Jurema). É trabalho à parte e por município — ver a seção sobre
  extração, mais abaixo.
- **Resolver a unidade das tabelas de Jurema**, que é pré-requisito para extrair as dela.
- O portal de Tacaratu tem mais material não indexado: 12 decretos, 4 relatórios de desonerações e
  renúncias fiscais, a normatização do setor de cadastro, arrecadação e fiscalização (2026), a
  normatização de qualificação de débitos para CDA (2026) e o termo de adesão ao padrão nacional da
  NFS-e.
- O SAPL da Câmara de Jurema (`sapl.jurema.pe.leg.br`) tem leis tributárias correlatas ainda fora da
  biblioteca: parcelamento de créditos (1/2017, 56/2017, 62/2018, 86/2020), REFIS JUREMA (126/2022)
  e recuperação de créditos (20/2014).

## Como acrescentar um município

1. `municipios/<slug>/fontes.json` — lista dos PDFs de origem, com id, título, citação e tipo.
   `tipo` aceita `municipal`, `federal`, `decreto`, `administrativa`, `historical` e
   `projeto` (para texto em tramitação, que ganha selo próprio na biblioteca).
2. `python tools/build_corpus.py <slug>` — extrai o corpus. Só documentos com id novo são
   processados; os demais são reaproveitados do `laws.js` existente. **A citação, porém, é
   sempre relida do `fontes.json`** — dá para corrigir texto de citação sem repetir o OCR.
3. `municipios/<slug>/municipio.json` — marca, textos, trilhas, glossário, painel de
   unidade, cartões e avisos. Copie o de um município parecido e ajuste.
4. `npm test` — a suíte confere, entre outras coisas, que toda página citada existe no
   documento citado. Ela percorre **todas** as pastas de `municipios/`, então um município
   pela metade quebra a suíte inteira — é de propósito.
5. `npm run build && python tools/build_pages.py` e commit.

Só três tipos de aviso existem em `app/app.js`: `projeto`, `vigencia` e `nota`. Qualquer
outro valor cai num título genérico e numa classe CSS que não existe.

## Convenções de valor, por município

Não há um padrão comum, e confundi-las erra a conta por ordens de grandeza:

| Município | Base das tabelas |
|---|---|
| Ibimirim | reais no Código de 2025; UFM nas leis específicas de torres e placas solares |
| Aliança | UFM em todos os anexos |
| Manari | UFM, percentual sobre o Valor de Referência Fiscal e percentual sobre o preço do serviço |
| Ingazeira | reais, organizados por código CNAE-Fiscal |
| Vertente do Lério | UFM |
| **Jatobá** | **percentual sobre o Valor de Referência (VR), definido no art. 113 como 100 UFIR** |
| **Cortês** | **reais de 2005, com atualização anual pelo IPCA-E (art. 69, § 2º)** |
| **Tacaratu** | **reais de 2017, por CNAE 2.0 no Anexo I; sem unidade fiscal** |
| **Jurema** | **UFM, instituída pelo art. 398 em R$ 1,00 — mas as tabelas do acervo parecem já convertidas a R$ 1,44. Ver aviso.** |

Nenhum acervo informa quanto vale a UFM ou o Valor de Referência. O aplicativo nunca os
embute: exibe na unidade da lei e converte só depois que a equipe informa o valor do
exercício. Há teste que falha se algum fator de conversão voltar à base publicada.

**Jatobá é o caso mais grave**: o VR está atrelado à UFIR, índice federal **extinto em
outubro de 2000**. Os R$ 91,80 do art. 113 são valor de 1997 e não servem. Sem o ato
municipal que substituiu o índice, nenhuma taxa de Jatobá converte em reais.

## Extração de tabelas: o que exige e o que não

A extração estruturada é um trabalho à parte, por município, e não deve ser feita sem
conferência. O que a experiência até aqui mostrou:

- **PDF com borda real e um valor por linha** — dá para ler por coordenada, separando
  rótulo de valor pela posição horizontal da palavra. Foi o caso de metade de Manari.
  Cuidado com o número da página, que fica na coluna da direita no rodapé: corte tudo
  abaixo de 92% da altura.
- **PDF com a coluna de valores deslocada do rótulo** — só leitura visual, página a
  página, com grau de confiança por entrada. Foi a outra metade de Manari, e é o caso da
  Tabela de Receita I de **Cortês**, onde o valor de um item cai na linha do item seguinte.
- **Sempre** reconfronte cada número com o texto da sua própria página, e verifique que
  nenhum valor coincide com o número da página. A primeira checagem sozinha não pega o
  erro: "141" existe na página 141.
- Espere encontrar defeitos no texto da lei. Em Manari foram quatro: item repetido com
  valores diferentes, item sem descrição, salto de numeração e vírgula impressa como
  apóstrofo. Em Jatobá, o art. 188 cita "Tabela III (Anexo 4)" e o Anexo 4 se intitula
  "Tabela II". Registre-os em vez de escolher por conta própria — ainda mais em documento
  digitalizado, onde o OCR é suspeito tão legítimo quanto o erro de impressão.

## Documentos digitalizados: quatro acervos, 532 páginas de OCR

Jatobá, Cortês, Tacaratu e Jurema entram **inteiramente por OCR** — 86, 71, 259 e 145+128 páginas.
O texto perde acentos e junta palavras ("Fago saber", "Codigo Tributario"). Isso **não** atrapalha a
busca, porque `app/app.js` normaliza removendo diacríticos dos dois lados, mas **atrapalha a citação
literal**. Os quatro aplicativos avisam disso na abertura e pedem conferência na imagem da página.

### A taxa de "conflito de OCR" alta é normal, não é defeito

O `build_corpus.py` termina informando quantas páginas tiveram divergência numérica entre as duas
passagens de OCR. Os números assustam e **não devem ser lidos como erro**:

| município | páginas | com conflito | % |
|---|---|---|---|
| Jatobá | 86 | 82 | 95% |
| Cortês | 71 | 53 | 74% |
| Tacaratu | 259 | 243 | 93% |
| Jurema | 273 | 204 | 75% |

A causa está no regex de `numeric_conflict`, em `tools/extract_laws.py`: ele captura
`\d[\d.,]*[A-Za-z]*`, isto é, dígito **mais letras coladas**. Cerca de metade dos "conflitos" é
palavra grudada no número ("53.Suspendem"), não número lido errado. A função é declaradamente um
apoio à revisão humana, e o `best_variant` já guarda a melhor das duas passagens. A lista fica
gravada por página no corpus, em `ocrConflict`, e serve de mapa de onde olhar primeiro quando as
tabelas forem extraídas.

### Conferir na imagem é barato, e resolve

Duas divergências foram dirimidas nesta rodada renderizando a página do PDF e olhando:

- Tacaratu trazia **dois "ANEXO II"** — a imagem da página 240 diz **ANEXO III**. Era o OCR.
- Jurema trazia **21,00** e **18,30** fora do padrão de múltiplos de 1,44 — a imagem ampliada
  confirma que estão impressos assim. Não era o OCR.

Receita: `fitz.open(pdf)[n-1].get_pixmap(dpi=320, clip=...).save(...)` e leia a imagem.

## Pendências que dependem do Município

Estão detalhadas em [DOCUMENTOS-RECOMENDADOS.md](DOCUMENTOS-RECOMENDADOS.md). As de maior
consequência:

- **Ibimirim** — o ato que fixa a UFM de cada exercício; e a seção de ocupação de vias do
  comparativo diverge do texto do Código publicado.
- **Aliança** — o decreto da UFM; a consolidação do Código só vai até a LC nº 049/2021,
  mas a LC nº 073/2026 já mudou os arts. 315 e 317; o Plano Diretor tem quatro alterações
  e nenhuma consolidação.
- **Manari** — os atos que fixam a UFM e o Valor de Referência; o portal não publica
  legislação nenhuma, então não há como conferir por lá se a Lei nº 99/2007 foi alterada.
- **Jatobá** — o ato que substituiu a UFIR e fixa o VR do exercício. Sem ele o Código não
  produz valor nenhum. E a via em papel, para dirimir a numeração do Anexo 4.
- **Cortês** — a tabela de receitas já atualizada pelo IPCA-E; os valores impressos são de
  2005 e acumulam mais de duas décadas de correção.
- **Tacaratu** — confirmar se alguma lei posterior alterou os valores dos treze anexos, já que não
  se localizou no Código autorização para o Executivo atualizá-los por decreto.
- **Jurema — a mais urgente das novas.** Confirmar se os números das Tabelas são *quantidade de UFM*
  ou *reais já convertidos*: a coluna diz "Em UFM", mas 9 de 11 valores conferidos são múltiplos
  exatos de R$ 1,44, a UFM de 2013. A diferença entre as duas leituras é de 44% no valor cobrado.
  Pedir também a UFM do exercício corrente — o Decreto nº 003/2013 só vale para 2013.

## Defeitos conhecidos do próprio projeto

- **`tools/serve.mjs` serve de `public/`, pasta que não existe mais.** `npm run serve`
  responde 404 em tudo. Ficou para trás na reestruturação multi-município. Para conferir
  no navegador, sirva `docs/` direto (`python -m http.server` dentro de `docs/`).
- **`rank()` põe `titleMatched` como primeira chave de ordenação.** Uma palavra no título
  ou na citação de um documento vence um documento cujo corpo inteiro trata do assunto. O
  desempate que rebaixa `historical` é o último critério e nunca chega a ser avaliado. Já
  causou dois defeitos reais. O primeiro, corrigido em 19/08/2026, era a citação do Código Civil
  histórico vencendo o Código Tributário na busca por "referência". O segundo, **ainda em pé**, é
  mais sério: em Jurema, "UFM unidade fiscal" e "ITBI transmissão" trazem o **Código de 1994,
  revogado**, acima do de 2007 em vigor — porque o revogado tem mais ocorrências do termo e o
  desempate de `historical` é o último critério. Mitigado por rótulo ("Código Tributário Municipal
  de 1994 (anterior)" aparece no cabeçalho de cada resultado), não por ordenação. A correção natural
  é subir o desempate de `historical` para antes de `hits`, ou dar peso por tipo de norma — muda o
  resultado dos nove municípios, então é decisão da equipe.
