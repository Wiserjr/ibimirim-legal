# Estado atual e como retomar

Ponto de retomada do trabalho, escrito para quem chega sem ter acompanhado a conversa
anterior — inclusive uma sessão nova do assistente. Leia este arquivo, o
[README.md](README.md) e o [DOCUMENTOS-RECOMENDADOS.md](DOCUMENTOS-RECOMENDADOS.md), nessa
ordem, e depois `git log --oneline`.

Atualizado em 19/08/2026.

## O que já está publicado

Site: https://wiserjr.github.io/ibimirim-legal/ — capa que leva a cada município.

| Município | Documentos | Páginas | Tabelas de taxa | Cartões |
|---|---|---|---|---|
| Ibimirim | 19 | 1.384 | 13 seções, 384 itens | 3 |
| Aliança | 11 | 1.220 | 13 tabelas, 365 itens | 1 |
| Manari | 5 | 1.177 | 29 tabelas, 453 itens | 0 |

Cada um sai também como ZIP (PC/iPhone) e APK Android com `applicationId` próprio.

## O que está em andamento

Seis municípios novos foram pedidos: Jatobá, Ingazeira, Cortês, Jurema,
Tacaratu/Caraibeiras e Vertente do Lério.

| Município | Código Tributário | Estado |
|---|---|---|
| **Ingazeira** | LC nº 002/2016, 192 p, texto limpo | corpus montado (1.180 páginas), `municipio.json` escrito |
| **Vertente do Lério** | LC nº 001/2009, 125 p, texto | corpus montado (1.113 páginas), `municipio.json` escrito |
| **Jatobá** | Lei nº 34/1997, 86 p, digitalizado | `fontes.json` pronto; **falta rodar** `python tools/build_corpus.py jatoba` (OCR, ~20 min) e escrever `municipio.json` |
| **Cortês** | Lei nº 874/2005, 71 p, digitalizado | `fontes.json` pronto; **falta rodar** `python tools/build_corpus.py cortes` (OCR, ~17 min) e escrever `municipio.json` |
| **Jurema** | Lei nº 255/2007 | não está em disco; localizada no portal, **falta baixar** |
| **Tacaratu** | Lei nº 1.365/2017 | não está em disco; localizada no portal, **falta baixar** |

Nenhum dos quatro novos entrou em `docs/` nem no site ainda: falta escrever os dois
`municipio.json` que faltam e rodar `npm run build && python tools/build_pages.py`.

### Onde estão os arquivos de Jurema e Tacaratu

Os dois portais usam a mesma plataforma de Aliança, e a consulta que funciona é
`…/app/pe/<slug>/1/atos-oficiais-item-suspenso?do_search=1&tipo_ato_oficial=<id>`.
Na página de detalhe, o anexo é o link com texto **"Visualizar anexo"** — não o primeiro
`.pdf` da página, que é a Carta de Serviços do rodapé e aparece em todas.

- Jurema — Código Tributário, tipo `140`:
  `https://transparencia.jurema.pe.gov.br/uploads/5243/1/atos-oficiais/2007/cdigo-tributrio-municipal/1689391228_cdigo-tributrio.pdf`
- Tacaratu — Código Tributário, tipo `14`:
  `https://transparencia.tacaratu.pe.gov.br/uploads/5392/1/atos-oficiais/2017/codigo-tributario/1723812060_lei-no1.3652017--novo-codigo-tributario.pdf`

O portal de Tacaratu é o mais completo dos seis: além do Código, traz 12 decretos,
4 relatórios de desonerações e renúncias fiscais, a normatização do setor de cadastro,
arrecadação e fiscalização (2026), a normatização de qualificação de débitos para CDA
(2026) e o termo de adesão ao padrão nacional da NFS-e.

**Caraibeiras é distrito de Tacaratu**, não município: não tem legislação tributária
própria, e o Código de Tacaratu o alcança. Um aplicativo de Tacaratu atende os dois —
falta o usuário confirmar se quer alguma distinção interna.

## Como acrescentar um município

1. `municipios/<slug>/fontes.json` — lista dos PDFs de origem, com id, título, citação e tipo.
   `tipo` aceita `municipal`, `federal`, `decreto`, `administrativa`, `historical` e
   `projeto` (para texto em tramitação, que ganha selo próprio na biblioteca).
2. `python tools/build_corpus.py <slug>` — extrai o corpus. Só documentos com id novo são
   processados; os demais são reaproveitados.
3. `municipios/<slug>/municipio.json` — marca, textos, trilhas, glossário, painel de
   unidade, cartões e avisos. Copie o de um município parecido e ajuste.
4. `npm test` — a suíte confere, entre outras coisas, que toda página citada existe no
   documento citado.
5. `npm run build && python tools/build_pages.py` e commit.

## Convenções de valor, por município

Não há um padrão comum, e confundi-las erra a conta por ordens de grandeza:

| Município | Base das tabelas |
|---|---|
| Ibimirim | reais no Código de 2025; UFM nas leis específicas de torres e placas solares |
| Aliança | UFM em todos os anexos |
| Manari | UFM, percentual sobre o Valor de Referência Fiscal e percentual sobre o preço do serviço |
| Ingazeira | reais, organizados por código CNAE-Fiscal |
| Vertente do Lério | UFM |
| Jatobá, Cortês, Jurema, Tacaratu | a apurar |

Nenhum acervo informa quanto vale a UFM ou o Valor de Referência. O aplicativo nunca os
embute: exibe na unidade da lei e converte só depois que a equipe informa o valor do
exercício. Há teste que falha se algum fator de conversão voltar à base publicada.

## Extração de tabelas: o que exige e o que não

A extração estruturada é um trabalho à parte, por município, e não deve ser feita sem
conferência. O que a experiência até aqui mostrou:

- **PDF com borda real e um valor por linha** — dá para ler por coordenada, separando
  rótulo de valor pela posição horizontal da palavra. Foi o caso de metade de Manari.
  Cuidado com o número da página, que fica na coluna da direita no rodapé: corte tudo
  abaixo de 92% da altura.
- **PDF com a coluna de valores deslocada do rótulo** — só leitura visual, página a
  página, com grau de confiança por entrada. Foi a outra metade de Manari.
- **Sempre** reconfronte cada número com o texto da sua própria página, e verifique que
  nenhum valor coincide com o número da página. A primeira checagem sozinha não pega o
  erro: "141" existe na página 141.
- Espere encontrar defeitos no texto da lei. Em Manari foram quatro: item repetido com
  valores diferentes, item sem descrição, salto de numeração e vírgula impressa como
  apóstrofo. Registre-os em vez de escolher por conta própria.

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
