// O alerta de vigência não acende em nenhum município hoje — e isso está certo:
// toda cobrança cujo artigo foi alterado já aponta para a lei nova. Mas lógica
// que nunca dispara é lógica não testada, e ela existe justamente para o dia em
// que entrar lei nova sem que alguém atualize o cadastro.
//
// Este teste carrega a `vigenciaHtml` real do app, num sandbox, e monta a
// situação à mão: uma lei que altera o artigo em que a cobrança se apoia.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const raiz = new URL('../', import.meta.url);
// Mesmo arranjo do rank.test.mjs: o init() do rodapé sai, porque ele toca o DOM.
const src = (await readFile(new URL('app/app.js', raiz), 'utf8'))  .replace(/\ninit\(\);\s*$/, '\n');

// O app é um script de navegador; damos o mínimo para ele avaliar sem tocar em
// DOM. Só as funções puras de vigência são exercitadas.
// O app declara `corpus` com let, no escopo do script — atribuir
// sandbox.corpus de fora cria outra variável, que as funções não enxergam.
// Por isso injetamos um setter junto com o código, como faz o rank.test.mjs.
const sandbox = { window: {}, console };
createContext(sandbox);
runInContext(
  `${src}
;globalThis.__setCorpus=c=>{corpus=c};`
  + 'globalThis.__vigenciaHtml=vigenciaHtml;'
  + 'globalThis.__artigosDe=artigosDe;globalThis.__cobreArtigo=cobreArtigo;',
  sandbox, { filename: 'app.js' });

const vigenciaHtml = sandbox.__vigenciaHtml;
const artigosDe = sandbox.__artigosDe;
const cobreArtigo = sandbox.__cobreArtigo;
assert.ok(typeof vigenciaHtml === 'function', 'vigenciaHtml não foi exposta pelo app');

// --- o parser de artigo não pode confundir parágrafo com artigo -----------
assert.deepEqual([...artigosDe('art. 92, § 9º')], [92], '"§ 9º" não é artigo');
assert.deepEqual([...artigosDe('art. 398 e art. 399')], [398, 399], 'dois artigos na mesma citação');
assert.deepEqual([...artigosDe('art. 162, incisos I a IV')], [162], 'inciso em romano não é artigo');
assert.deepEqual([...artigosDe('Anexo IV, Tabela I')], [], 'anexo não é artigo');
assert.deepEqual([...artigosDe('art. 423, § 2º — revogação')], [423], 'revogação com parágrafo');

// --- faixas e artigos com letra ------------------------------------------
assert.ok(cobreArtigo('121-174', 135), 'faixa fechada cobre o meio');
assert.ok(cobreArtigo('121-174', 121) && cobreArtigo('121-174', 174), 'faixa inclui as pontas');
assert.ok(!cobreArtigo('121-174', 175), 'faixa não vaza');
assert.ok(cobreArtigo('315', 315) && !cobreArtigo('315', 31), 'artigo solto não casa por prefixo');
assert.ok(cobreArtigo('277-A', 277), '277-A é o artigo 277');

// --- o alerta acende quando o artigo citado foi alterado ------------------
sandbox.__setCorpus({
  documents: [
    { id: 'ctm', citation: 'Código Tributário', pages: [{ page: 1, text: 'x' }] },
    {
      id: 'lc-nova', citation: 'Lei Complementar nº 073/2026', pages: [{ page: 1, text: 'y' }],
      altera: [{ doc: 'ctm', artigos: ['315', '317'], escopo: 'a CIP', pagina: 1 }],
    },
  ],
});
const aceso = vigenciaHtml({ fundamento: [{ doc: 'ctm', pagina: 1, artigo: 'art. 315' }] });
assert.match(aceso, /charge-vigencia/, 'devia acender para artigo alterado');
assert.match(aceso, /Lei Complementar nº 073\/2026/, 'devia nomear a lei que alterou');
assert.match(aceso, /a CIP/, 'devia dizer o escopo da alteração');
assert.match(aceso, /data-fee-doc="lc-nova"/, 'devia levar à lei que alterou');

// --- e fica apagado quando não foi ---------------------------------------
assert.equal(vigenciaHtml({ fundamento: [{ doc: 'ctm', pagina: 1, artigo: 'art. 316' }] }), '',
  'artigo vizinho não pode acender');
assert.equal(vigenciaHtml({ fundamento: [{ doc: 'lc-nova', pagina: 1, artigo: 'art. 315' }] }), '',
  'a cobrança que já aponta para a lei nova não pode acender — é o caso real de hoje');
assert.equal(vigenciaHtml({ fundamento: [{ doc: 'ctm', pagina: 1, artigo: 'Anexo I' }] }), '',
  'fundamento sem número de artigo não acende');

// --- um alerta por lei, mesmo com o artigo citado duas vezes --------------
const repetido = vigenciaHtml({
  fundamento: [
    { doc: 'ctm', pagina: 1, artigo: 'art. 315' },
    { doc: 'ctm', pagina: 1, artigo: 'art. 315' },
  ],
});
assert.equal(repetido.match(/<li>/g).length, 1, 'não pode repetir o mesmo alerta');

console.log('OK: alerta de vigência — parser de artigo, faixas, aceso e apagado');
