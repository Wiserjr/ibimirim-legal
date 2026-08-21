# Estado atual e como retomar

Ponto de retomada do trabalho, escrito para quem chega sem ter acompanhado a conversa
anterior — inclusive uma sessão nova do assistente. Leia este arquivo, o
[README.md](README.md) e o [DOCUMENTOS-RECOMENDADOS.md](DOCUMENTOS-RECOMENDADOS.md), nessa
ordem, e depois `git log --oneline`.

Atualizado em 20/08/2026.

## O que já está publicado

Site: https://wiserjr.github.io/ibimirim-legal/ — capa que leva a cada município.
São **nove municípios**, 10.749 páginas indexadas, 28,6 MB em `docs/`.

| Município | Documentos | Páginas | Tabelas de taxa | Cartões |
|---|---|---|---|---|
| Ibimirim | 19 | 1.384 | 13 seções, 384 itens | 3 |
| Aliança | 11 | 1.220 | 13 tabelas, 365 itens | 1 |
| Manari | 5 | 1.177 | 29 tabelas, 453 itens | 0 |
| Ingazeira | 5 | 1.214 | Anexo I (944 itens) + 12 anexos no cadastro | 0 |
| Vertente do Lério | 3 | 1.113 | 8 anexos, no cadastro | 0 |
| Jatobá | 3 | 1.074 | 7 anexos, no cadastro | 0 |
| Cortês | 3 | 1.059 | 7 tabelas, no cadastro | 0 |
| Tacaratu | 3 | 1.247 | Anexo I (1.297 itens) + 12 anexos no cadastro | 0 |
| Jurema | 4 | 1.261 | 13 tabelas, no cadastro | 0 |

Cada um sai também como ZIP (PC/iPhone) e APK Android com `applicationId` próprio.

**Os nove têm cadastro de cobranças**, num total de **167**: Ibimirim 23, Ingazeira 22,
Tacaratu 22, Aliança 21, Jurema 21, Manari 21, Cortês 15, Jatobá 11 e Vertente do Lério 11.

## O que falta

Os seis municípios pedidos estão todos publicados. **Caraibeiras é distrito de Tacaratu**, não
município: não tem legislação tributária própria, e o Código de Tacaratu o alcança — o aplicativo de
Tacaratu traz esse aviso e atende os dois. Falta o usuário confirmar se quer alguma distinção
interna.

A extração das tabelas está feita nos seis, e a unidade de Jurema está resolvida (ver abaixo).
O que resta é trabalho de aprofundamento, não de cobertura:

- **O alerta automático de vigência**, descrito no fim deste arquivo. Agora que as 167 cobranças
  apontam artigo e página, é o próximo passo que muda o uso da ferramenta.
- **Resolver as divergências levantadas pelo cadastro**, que dependem dos Municípios e estão
  listadas mais abaixo. As de Manari são as mais graves.
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
| Ibimirim | reais no Código de 2025, **base 2024**, com reajuste pelo IPCA a partir de 2026 (art. 419); UFM nas leis específicas de torres e placas solares, que o art. 420 manda manter nessa unidade |
| Aliança | UFM em todos os anexos |
| **Manari** | **quatro ao mesmo tempo: % sobre o Valor de Referência (Tabelas I–IX), % sobre o preço do serviço (lista do ISS), % sobre o Valor de Referência Fiscal (ISS pessoal, art. 90) e UFM (segundo bloco de tabelas, p. 139–148). O Código não diz se VR e VRF são a mesma coisa.** |
| Ingazeira | reais por código CNAE-Fiscal — **exceto a CIP**, que desde a LC nº 007/2024 é percentual sobre a tarifa B4a da ANEEL |
| Vertente do Lério | **reais nos anexos de taxa; UFM só na Planta de Valores e no ISS do autônomo** |
| **Jatobá** | **percentual sobre o Valor de Referência (VR), definido no art. 113 como 100 UFIR** |
| **Cortês** | **reais de 2005, com atualização anual pelo IPCA-E (art. 69, § 2º)** |
| **Tacaratu** | **reais de 2017 em todos os anexos; sem unidade fiscal, exceto a BCLA da licença ambiental — R$ 1.000,00, art. 281** |
| **Jurema** | **duas camadas: as Tabelas I, II e III do corpo do Código estão em UFM (art. 398 fixa a UFM em R$ 1,00); as Tabelas IV a XIII, reeditadas pelo Decreto 003/2013, estão em REAIS, apesar do cabeçalho dizer "Em UFM"** |

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
  apóstrofo. Registre-os em vez de escolher por conta própria — ainda mais em documento
  digitalizado, onde o OCR é suspeito tão legítimo quanto o erro de impressão. A divergência
  de numeração do Anexo 4 de Jatobá, registrada em 19/08, era do OCR: a imagem da p. 82 diz
  "TABELA III", como o art. 188 cita. Registrar em vez de escolher deixou a resposta chegar
  depois, sem que ninguém cobrasse errado no intervalo.

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

É a técnica mais produtiva do projeto. O que ela já dirimiu:

- Tacaratu trazia **dois "ANEXO II"** — a imagem da página 240 diz **ANEXO III**. Era o OCR.
- Tacaratu: o Anexo I trazia **R$ 11.000,00** para fabricação de caminhões, o maior valor de todo o
  Anexo. A página 185 imprime **1.000,00**, como as três atividades vizinhas: o traço vertical da
  tabela foi lido como um algarismo. Sem a conferência, dez vezes o devido.
- Tacaratu: o Anexo XII parecia pular os itens **09 e 22**. A imagem mostra que o 09 existe e que
  o meu cadastro é que estava deslocado — porque os itens **07 e 08 são uma frase só**, partida em
  duas linhas numeradas, com um valor para as duas. Já o **22 não existe mesmo**.
- Jurema: o item 006 do Anexo IV, *Calçados*, vale **80,00** na redação de 2007 e **115,20** na do
  Decreto de 2013 — exatamente 80 × 1,44. Foi o que provou que o Decreto está em reais apesar do
  cabeçalho dizer "Em UFM".
- Jurema: a Tabela I imprime o cabeçalho **"UFM / R$ 1,00"**, e a alíquota do lixo comercial salta
  de 20 para 58 entre 100 e 200 m². Está assim na página — é defeito da lei, não da leitura.

Receita: `fitz.open(pdf)[n-1].get_pixmap(dpi=320, clip=...).save(...)` e leia a imagem.

## Pendências que dependem do Município

Estão detalhadas em [DOCUMENTOS-RECOMENDADOS.md](DOCUMENTOS-RECOMENDADOS.md). As de maior
consequência:

- **Ibimirim** — o ato que fixa a UFM de cada exercício, sem o qual a taxa das torres e placas
  solares não converte; **o ato de atualização dos Anexos pelo IPCA para 2026**, já que o art. 419
  fixa os valores em base 2024 e manda reajustar a partir daquele exercício; a situação dos
  **Decretos nº 030 e 031 de 2022**, que regulamentam o ISS com base na Lei nº 629/2008, revogada
  pelo art. 423, § 2º do Código de 2025 e não reeditados; e a seção de ocupação de vias do
  comparativo, que diverge do texto do Código publicado.
- **Aliança** — o decreto da UFM, que comanda tanto as treze tabelas quanto a correção do crédito
  (art. 64, § 1º); **se a LC nº 065/2025 foi prorrogada**, porque ela fixou o IPTU de R$ 30,00 para o
  CadÚnico apenas "para o exercício financeiro de 2025" e a equipe pode seguir aplicando por inércia;
  o dispositivo que institui a **taxa de licença de abate e transporte de animais**, cuja tabela existe
  no anexo sem seção correspondente no corpo; a consolidação do Código, que só vai até a LC nº
  049/2021 enquanto a LC nº 073/2026 já mudou os arts. 315 e 317; e o Plano Diretor, com quatro
  alterações e nenhuma consolidação.
- **Manari — o caso mais grave depois de Jatobá.** Três divergências que o cadastro levantou e que
  ninguém no balcão pode resolver: **qual bloco de tabelas está em vigor**, já que a mesma taxa
  aparece nas Tabelas I–IX em % do Valor de Referência e no bloco sem título da p. 139 em UFM, por
  critérios que não convergem; **a numeração dos anexos**, porque o Código cita anexos I a IV com
  conteúdos que não correspondem às Tabelas I a IV; e **o art. 60, que imprime "1% (meio por cento)"**
  na alíquota do ITBI do SFH — conferido na imagem, é da lei. Falta ainda saber a que taxa
  correspondem as 67 linhas das tabelas finais rotuladas "Divisão de controle — atividades
  descentralizadas", e os atos que fixam a UFM, o Valor de Referência e o Valor de Referência Fiscal
  — três unidades que o Código usa sem dizer se duas delas são a mesma. O portal não publica
  legislação, então não há como conferir por lá se a Lei nº 99/2007 foi alterada.
- **Ingazeira** — a consolidação do Código: a LC nº 004/2017 refez o Título II inteiro (o ISS) e a
  LC nº 007/2024 refez os arts. 311 a 314 (a CIP), e não há texto consolidado. Falta também a tarifa
  B4a vigente da ANEEL, sem a qual a CIP não converte em reais — e confirmar se houve outras
  alterações entre 2017 e 2024 fora desta remessa.
- **Jatobá** — o ato que substituiu a UFIR e fixa o VR do exercício. Sem ele o Código não
  produz valor nenhum. E a via em papel, para dirimir a numeração do Anexo 4.
- **Cortês** — a tabela de receitas já atualizada pelo IPCA-E; os valores impressos são de
  2005 e acumulam mais de duas décadas de correção.
- **Tacaratu** — confirmar se alguma lei posterior alterou os valores dos treze anexos, já que não
  se localizou no Código autorização para o Executivo atualizá-los por decreto.
- **Jurema** — a dúvida da unidade está resolvida (ver abaixo), mas sobraram três pedidos, e os
  dois primeiros impedem lançamento: o **art. 162 não tem alíquota** para a transmissão onerosa
  comum de imóvel urbano fora do SFH, que é o caso mais frequente do ITBI; o **art. 183** manda
  tributar o autônomo por "alíquota fixa" sem dizer qual, e nenhum anexo traz a tabela. O terceiro
  é a UFM do exercício corrente — o Decreto nº 003/2013 só vale para 2013 —, e junto com ela a
  definição de qual índice usar: o art. 399 manda IPCA, e a memória de cálculo do Decreto usou
  IGP-M.

## Defeitos conhecidos do próprio projeto

- **`tests/ui.test.mjs` nunca mais passou.** Não é tocado desde o primeiro commit, e os seus
  seletores — `#operatingArea`, `#constructionResult` — morreram quando os cartões passaram a
  gerar ids por município (`card-<id>-<campo>`). Ficou fora do `npm run test:ui`, que agora aponta
  para `tests/ui-cobrancas.test.mjs`. Reescrever ou apagar é decisão da equipe.
- **O OCR gruda palavras, e isso torna parte do conteúdo inalcançável.** Medido: 8 páginas de Jurema
  e 2 de Tacaratu deixam de casar porque o reconhecimento juntou palavras inteiras —
  *taxadefiscalizacaodeocupacaoepermanencia*, *segundaviadealvarasehabite*. São títulos de tabela e
  de item. Em Jurema isso alcança até a sigla já corrigida: na p. 64 ela ficou "doITBI", sem
  fronteira, e aquela página não responde à busca por ITBI — as outras sete respondem.

  Não há correção barata: separar palavras grudadas exige léxico, e a troca de caractere do
  `correcoes.json` não resolve.

## Defeitos já corrigidos

- **`rank()` ordenava por `titleMatched` primeiro, e rebaixava `historical` por último.**
  Isso deixava uma palavra do título ou da citação vencer um documento cujo corpo inteiro trata do
  assunto, e deixava norma revogada aparecer acima da norma em vigor. Causou dois defeitos reais:
  a citação do Código Civil histórico dizia "referência" e vencia o Código Tributário na busca por
  "Valor de Referência"; e em Jurema o Código de 1994, revogado, vinha acima do de 2007 em vigor.

  Corrigido em 19/08/2026: a vigência passou a ser a **primeira** chave e `titleMatched` o
  **último** desempate. `tests/rank.test.mjs` carrega o `rank()` real num sandbox `node:vm`, sem
  navegador, e confere nos nove municípios que a lista fica particionada — todo documento em vigor
  antes de qualquer revogado. O teste foi validado contra a ordenação antiga, e falha nela já em
  Aliança: o defeito não era só de Jurema, estava vivo em município já publicado.

- **A busca casava por substring, e isso quebrava as siglas.** `hay.includes(term)`, sem fronteira
  de palavra, fazia "iss" achar *comissão* e "ativa" achar *administrativa*. Corrigido em
  19/08/2026 exigindo início de palavra. Detalhe do efeito medido na seção abaixo.

- **`tools/serve.mjs` servia de `public/`, pasta que não existe mais.** `npm run serve` respondia
  404 em tudo, e isso também impedia a suíte de navegador de rodar. Corrigido em 20/08/2026: passou
  a servir `dist/<slug>`, com `node tools/serve.mjs alianca` ou `node tools/serve.mjs docs`.

- **A sigla ITBI de Jurema não existia no corpus.** O OCR leu o I final como l minúsculo nas 11
  ocorrências do documento, e nenhuma ficou correta — a consulta "ITBI" não devolvia nada, e "ITBI
  transmissão" caía no Código Civil. Conferido na imagem da p. 61, art. 162: "As alíquotas do ITBI
  são as seguintes". Corrigido em 19/08/2026 por `municipios/jurema/correcoes.json`, o primeiro uso
  do mecanismo de correção de OCR descrito no README. "ITBI" agora devolve 12 resultados, todos
  municipais. `npm test` falha se a correção deixar de estar aplicada.

- **Siglas corrompidas em Ibimirim e Vertente do Lério.** Uma varredura pelos nove acervos achou
  mais sete ocorrências: `lPTU`, `ClP` e `1SS` em Ibimirim, `ITBl` na Lei nº 932/2024 — que é
  inteiramente sobre ITBI —, e `lSS` e `lTBl` em Vertente do Lério. Todas conferidas na imagem e
  corrigidas em 19/08/2026. Detalhe em DOCUMENTOS-RECOMENDADOS.md.

  A mesma varredura achou um caso que **não** é nosso para consertar: a Lei nº 877/2022 de Ibimirim
  imprime `!TB!` no lugar de ITBI, na própria página. É erro da lei publicada, ficou registrado como
  divergência e pede errata do Município.

## Como a busca ordena, e por quê

Cada critério da ordenação de `rank()` nasceu de um defeito medido, nesta ordem:

1. **Norma revogada por último.** Em Jurema o Código de 1994 vencia o de 2007 por ter mais
   ocorrências do termo. A lista fica particionada: todo documento em vigor antes de qualquer
   revogado.
2. **Cobertura.** Quantos termos da consulta a página tem. Vem antes do tipo de propósito — assim a
   lei municipal não vence uma consulta que ela mal cobre.
3. **Tipo: municipal antes de federal.** O Código Civil está no acervo como apoio, não como
   resposta. São 372 páginas densas e, na contagem bruta de ocorrências, qualquer uma delas vencia a
   página municipal certa. Foi o que aconteceu com "Valor de Referência" em Jatobá e "ISS serviço"
   em cinco municípios.
4. **matched, depois hits.** Relevância bruta.
5. **titleMatched por último.** Uma palavra do título ou da citação não pode vencer um documento
   cujo corpo trata do assunto — a citação do Código Civil histórico dizia "referência" e ganhava do
   Código Tributário.

E o casamento de termo exige **início de palavra**, nunca meio. Sem isso a busca morria justamente
nas siglas: a p. 99 do Código Civil tem 24 ocorrências de "iss" — todas dentro de *comissão*,
*omissão*, *comissário* — contra uma de "serviço". A busca por prefixo continua valendo: "licenc"
acha "licença" e "licenciamento".

O efeito foi medido nos nove municípios: **15.256 páginas casavam por substring, 11.614 casam por
início de palavra**. A diferença é quase toda falso positivo — "ativa" achava *administrativa*,
*relativas*, *iniciativa*, *cooperativa* em centenas de páginas e enterrava a dívida ativa;
"unidade" achava *comunidade*, *imunidade*, *oportunidade*.

`tests/rank.test.mjs` guarda os dois lados: que a consulta municipal não caia no Código Civil, e que
"testamento herança" continue chegando nele. O teste carrega o `rank()` real num sandbox `node:vm`,
sem navegador, e foi validado contra cada versão anterior da ordenação — falha em todas.

**Não use `\b` sobre o texto cru.** Ele não é acentuado-aware: em " área", o "á" não é caractere de
palavra para o motor e a fronteira não existe. A marcação de destaque usa
`(^|[^\p{L}\p{N}])` e devolve o que capturou. Lookbehind resolveria em uma linha, mas só existe no
Safari 16.4 em diante, e o aplicativo precisa abrir em iPhone antigo.

## Cadastro de cobranças: por que ele existe

O projeto nasceu para facilitar a busca na lei, mas o problema real é outro. Quem mantém isto dá
suporte ao sistema de tributos **Contabilis** e é procurado o tempo todo com as mesmas quatro
perguntas: **quanto cobrar, de quem, quando e com que respaldo**. A resposta honesta é sempre
"X, com base no art. Y, p. N" — e é justamente esse par, valor mais fundamento, que não existia em
lugar nenhum.

Extrair tabela de PDF é caro, lento e exige conferência página a página. Seis dos nove municípios
seguem sem tabelas por isso. Mas **quem sabe o valor é a equipe do município**, não o extrator. O
cadastro inverte o gargalo: a equipe informa, e o aplicativo obriga a amarrar cada valor ao
dispositivo que o sustenta.

Decisões de projeto, e o motivo de cada uma:

- **Arquivo separado de `fees.js`.** O que a equipe informa não pode se confundir com o que o
  extrator leu da lei. São graus de confiança diferentes, e o selo de cada cobrança diz qual é.
- **Fundamento obrigatório, conferido contra o corpus.** Documento e página têm de existir. O
  aplicativo recusa na hora da digitação, e `npm test` repete a conferência sobre o publicado.
  Sem isso o cadastro seria uma planilha, e planilha não responde "por quê".
- **Sem servidor.** O que a equipe edita fica no navegador e sai por exportação, no formato exato do
  `cobrancas.json`. Volta ao repositório por revisão, e o diff no git é o que se confere. Nenhuma
  infraestrutura nova, e continua abrindo por duplo clique.
- **A seção aparece mesmo vazia.** Um município que ainda não cadastrou nada é exatamente quem
  precisa achar o botão.

São **102 cobranças em seis municípios**: Ingazeira 22, Tacaratu 22, Jurema 21, Cortês 15,
Jatobá 11 e Vertente do Lério 11. Em Ingazeira a CIP ficou de fora de propósito, a pedido: vem na
fatura da concessionária e não é lançada no sistema de tributos.

As duas tabelas grandes por atividade — o **Anexo I de Ingazeira** (944 itens) e o **Anexo I de
Tacaratu** (1.297 subclasses da CNAE 2.0) — não cabem no cadastro item a item e vivem no `fees.js`,
que tem busca própria. O cadastro traz uma cobrança que aponta para lá, com o fundamento e as
ressalvas de leitura.

**O cadastro é onde os defeitos da lei ficam registrados**, e eles são mais comuns do que se
esperaria. Os que impedem lançamento, até agora: o art. 162 de Jurema não tem alíquota para o ITBI
urbano comum; o art. 183 de Jurema manda cobrar do autônomo "alíquota fixa" sem dizer qual; a
renovação de alvará de Tacaratu tem célula em branco para o residencial vertical até 40 m². Os que
só atrapalham a citação: dois itens numerados 4 no Anexo VII de Tacaratu, item 5 inexistente nos
Serviços Diversos, item 22 inexistente no Anexo XII, e o art. 307 remetendo ao Anexo X quando a
tabela certa é a do IX. Registrar em vez de escolher é a regra — quem decide é o Município.

### O que falta

Nada, em cobertura: os nove estão cadastrados. O que falta é o **alerta automático de vigência**,
abaixo.

### O diferencial da ferramenta

**O alerta de vigência.** Como cada cobrança aponta artigo e página, o aplicativo consegue acender
sozinho toda cobrança ancorada em dispositivo que uma lei nova alterou. Foi exatamente o que
aconteceu em Ingazeira: a LC nº 004/2017 refez o Título II e a LC nº 007/2024 refez os arts. 311 a
314. Hoje isso é um aviso escrito à mão em `municipio.json`; com o cadastro amarrado ao artigo,
passa a ser automático.

Depois disso, na ordem: um **tipo de cartão de percentual** — a CIP de Ingazeira é a candidata, e
`renderGrupos` ainda só sabe exibir UFM ou reais; e a **calculadora a partir do cadastro**, para que
a cobrança em faixas responda "para 180 kWh/mês, é tanto".
