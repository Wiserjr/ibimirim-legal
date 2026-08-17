# Ibimirim Legal

Aplicativo offline de consulta educativa à legislação tributária e urbanística de Ibimirim. A mesma base atende navegador no PC, instalação como aplicativo no iPhone e um pacote Android nativo.

A pesquisa destaca os termos encontrados. Perguntas completas recebem uma síntese extrativa apoiada nas páginas mais relacionadas e links separados para consulta online auxiliar. A síntese não é parecer jurídico nem usa conteúdo da internet sem identificação.

A versão 1.5 acrescenta a Lei nº 877/2022, que institui o PRODEM — isenções de IPTU, ISSQN, ITBI e taxas para quem instala ou amplia empreendimento no Município —, com trilha própria de consulta.

A versão 1.4 acrescenta duas leis próprias de taxa — a Lei nº 793/2018 e a Lei nº 988/2025, que fixam a taxa de licença de torres, antenas e placas de energia solar — e um campo para a **UFM vigente**. Essas leis cobram em Unidade Fiscal do Município, não em reais, e o Código de 2025 manda continuar cobrando nessa unidade conforme o valor atualizado. Como a UFM muda a cada exercício, o aplicativo nunca a embute: exibe os valores em UFM e só converte para reais depois que a equipe informa o valor em vigor.

A versão 1.3 acrescenta a busca de taxas: as 381 faixas e itens do Anexo IV e V do Código de 2025 e os 141 itens do comparativo anterior ficam pesquisáveis por atividade, obra ou serviço. Cada resultado mostra o valor, a fórmula quando existe adicional por metro, uma calculadora imediata e a página do Código onde a tabela está. Valores do Código anterior aparecem marcados como sem fonte documental, porque o PDF daquele Código não integra a biblioteca.

A versão 1.2 inclui uma consulta orientada que separa a taxa anual de localização e funcionamento da licença para construir, com enquadramento por área, comparação resumida com o CTM anterior e acesso direto às tabelas do Código de 2025. O leitor ocupa a tela do celular, permite ampliar ou reduzir o texto e oferece leitura facilitada para documentos obtidos por OCR, sempre preservando a opção de visualizar a extração original.

## Abrir no PC

Execute `npm run serve` e abra `http://localhost:8321`. A aplicação continua disponível offline depois do primeiro acesso.

## iPhone

Publique a pasta `public` em um endereço HTTPS. No Safari, abra o endereço, toque em **Compartilhar** e em **Adicionar à Tela de Início**. Não é necessário publicar na App Store para uso como aplicativo web instalado.

## Atualizar a legislação

Confirme os PDFs listados em `tools/extract_laws.py`, execute o extrator e depois os testes.

## Atualizar as tabelas de taxas

`tools/extract_fees.py` lê a planilha comparativa e gera `public/data/fees.json`. Os lados anterior e atual são extraídos como listas independentes: a planilha não alinha as duas colunas por linha, e parear por posição criaria equivalências falsas entre fatos geradores diferentes. As páginas citadas por cada seção ficam no dicionário `ANCHORS` do próprio extrator, junto com o grau de conferência contra o texto da lei — `confirmado`, `parcial` ou `divergente`. Nenhuma outra parte do código afirma uma página.

A taxa das Leis nº 793/2018 e nº 988/2025 não vem da planilha: está no dicionário `SOLAR` do extrator, com os valores em UFM lidos das próprias leis. Valores em UFM nunca são gravados em reais na base.

Depois de alterar a planilha, execute o extrator e `npm test`. Os testes conferem os valores da Tabela I contra o texto extraído da página 209 do Código, então uma divergência de valor quebra a suíte. Páginas digitalizadas passam por OCR e devem ser revisadas contra o documento oficial.

O OCR roda em duas resoluções. Nenhuma domina a outra: a menor descarta linhas inteiras, a maior corrompe algarismos — na Lei nº 793/2018 ela transformou "50" em "50o". O extrator fica com a leitura que tiver menos numerais grudados a letras e, havendo empate, com a mais completa; toda divergência numérica entre as duas passagens é gravada em `ocrConflict` na página, para conferência humana.

## Limites

Os resumos de trilhas são educativos. O texto extraído pode conter falhas de OCR e não comprova vigência. Antes de decidir, lançar, fiscalizar, licenciar ou autuar, confira a publicação oficial e as alterações posteriores.
