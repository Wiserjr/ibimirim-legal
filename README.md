# Consulta à legislação municipal

Aplicativo offline de consulta educativa à legislação tributária e urbanística de municípios de
Pernambuco. A mesma base atende navegador no PC, instalação como aplicativo no iPhone e um pacote
Android nativo.

Municípios publicados: **Ibimirim** e **Aliança**.
Site: https://wiserjr.github.io/ibimirim-legal/

## Como está organizado

`public/` é a casca do aplicativo e não contém dado de município nenhum: nem nome, nem lei, nem
tabela. Tudo o que distingue uma versão da outra vive em `municipios/<slug>/`.

```
public/                     casca: index.html (com {{marcadores}}), app.js, estilos, sw.js
municipios/
  ibimirim/
    municipio.json          marca, textos, trilhas, glossário, cartões de cálculo
    fontes.json             os PDFs de origem, por documento
    data/laws.js            corpus indexado, página a página
    data/fees.js            tabelas de taxas
  alianca/  (mesma estrutura)
tools/                      extratores e build
dist/<slug>/                aplicativo montado, abre por duplo clique
docs/                       o que o GitHub Pages publica
```

Um município novo é uma pasta nova em `municipios/`. Não há código a duplicar.

## Comandos

```
npm run build                    monta dist/ para todos os municípios
python tools/build.py alianca    monta só um
npm test                         build + as quatro suítes
python tools/build_pages.py      gera docs/ para o GitHub Pages
python tools/package.py alianca  gera o ZIP e copia o APK para dist/
```

Android, por município:

```
cd android && ./gradlew assembleDebug -Pmunicipio=alianca
```

Cada município vira um aplicativo distinto — `br.gov.pe.<slug>.legal`, com rótulo próprio — de modo
que os dois coexistem no mesmo aparelho.

## Abrir no PC

Abra `dist/<município>/index.html` com dois cliques. Não é preciso servidor.

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

## UFM

Os dois municípios fixam taxas em Unidade Fiscal do Município, e nenhum dos dois acervos informa
quanto ela vale — em Aliança, o art. 397 manda atualizá-la pelo IPCA, cabendo ao Executivo fixar o
valor por decreto. O aplicativo nunca embute a UFM: exibe os montantes nessa unidade e só converte
depois que a equipe informa o valor do exercício no painel "UFM vigente". Há teste que falha se
algum fator de conversão voltar à base publicada.

## Cartões de cálculo

`municipio.json` declara os cartões em `cartoes`. Três formatos cobrem o que os códigos usam:

| tipo | quando | exemplo |
|---|---|---|
| `faixas` | valor por faixa de área, com fórmula opcional acima do teto | localização e funcionamento em Ibimirim |
| `variantes` | escolha de categoria, base mais adicional por metro | licença para construir |
| `soma` | quantidades × valor unitário, com teto opcional | torres, antenas e placas solares |

Aliança não declara cartões nesta versão: suas 365 entradas em UFM são consultadas pela busca.

## Limites

Guia educativo, não parecer jurídico. O texto da lei prevalece. As pendências de vigência e as
divergências encontradas entre as fontes estão em [DOCUMENTOS-RECOMENDADOS.md](DOCUMENTOS-RECOMENDADOS.md).
