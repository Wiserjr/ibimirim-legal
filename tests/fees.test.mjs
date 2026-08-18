import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL(`../public/${name}`, import.meta.url), 'utf8');
const bundle = async name => {
  // os dados são script, não JSON: window.X=JSON.parse("…")
  const src = await readFile(new URL(`../public/data/${name}.js`, import.meta.url), 'utf8');
  return JSON.parse(JSON.parse(src.slice(src.indexOf('(') + 1, src.lastIndexOf(')'))));
};
const fees = await bundle('fees');
const corpus = await bundle('laws');
const ctm = corpus.documents.find(d => d.id === 'ctm-2025');
const pageText = (n, id = 'ctm-2025') =>
  corpus.documents.find(d => d.id === id)?.pages.find(p => p.page === n)?.text ?? '';
const flat = fees.sections.flatMap(s => s.current);

// --- structure -------------------------------------------------------------
assert.equal(fees.sections.length, 13, 'seções: 12 do comparativo + a taxa das leis específicas');
assert.equal(flat.length, 384, 'entradas vigentes');
// a base não pode publicar conversão de UFM: não há valor de UFM no corpus
assert.ok(!fees.ufm, 'fees.json não pode trazer fator nem faixas de UFM convertidas');
assert.ok(fees.ufmNote, 'a base deve explicar por que não converte UFM');
assert.doesNotMatch(JSON.stringify(fees), /3\.75|3,75/, 'nenhum fator de UFM na base publicada');

// --- every cited page must exist in the indexed CTM ------------------------
for (const section of fees.sections) {
  for (const page of section.pages ?? []) {
    const min = section.doc === 'ctm-2025' ? 200 : 40;
    assert.ok(
      pageText(page, section.doc).length > min,
      `p.${page} citada por "${section.title}" não existe em ${section.doc}`,
    );
  }
  if (section.status === 'divergente') {
    assert.ok(section.note, `seção divergente ${section.id} precisa de nota explicativa`);
  }
}

// --- the funcionamento table is cross-checked against the law itself -------
// Anexo IV, Tabela I (p.209) lists 15 bands; OCR mangles "m2" but not the money.
const anexo = pageText(209).replace(/\s+/g, ' ');
const funcionamento = fees.sections.find(s => s.row === 6).current;
assert.equal(funcionamento.length, 15, 'faixas da Tabela I');
for (const band of funcionamento.filter(e => e.kind === 'fixed')) {
  const brl = band.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  assert.ok(anexo.includes(brl), `valor ${brl} não confere com a p.209 do CTM`);
}
const last = funcionamento.at(-1);
assert.equal(last.kind, 'formula');
assert.equal(last.base, 1160);
assert.equal(last.rate, 0.35);

// --- formula parsing: base, rate and threshold -----------------------------
const muro = flat.find(e => e.row === 122);
assert.deepEqual(
  { kind: muro.kind, base: muro.base, rate: muro.rate, threshold: muro.threshold },
  { kind: 'formula', base: 150, rate: 0.15, threshold: 50 },
  'muro: R$ 150,00 + R$ 0,15 por m² acima de 50 m²',
);
assert.equal(flat.filter(e => e.kind === 'formula').length, 27, 'fórmulas detectadas');
assert.ok(flat.every(e => e.kind !== 'formula' || (e.base > 0 && e.rate > 0)));

// --- the previous CTM keeps its Centro/Periferia tiers ---------------------
const anteriores = fees.sections.flatMap(s => s.previous);
const tiered = anteriores.filter(e => e.kind === 'tiered');
assert.ok(tiered.length >= 23, 'faixas P/M/G do CTM anterior');
assert.ok(tiered.every(e => e.tiers.length === 3 && e.tiers.every(t => t.value > 0)));
assert.ok(tiered.filter(e => e.outskirts).length >= 23, 'valores de periferia preservados');

// --- no old value is silently presented as current -------------------------
assert.ok(anteriores.every(e => !('pages' in e)), 'entrada anterior não pode citar página');

// --- wiring ----------------------------------------------------------------
const html = await read('index.html');
for (const id of ['feeQuery', 'feeFilters', 'feeResults', 'feeCount']) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} ausente no HTML`);
}
const app = await read('app.js');
for (const fn of ['buildFeeIndex', 'renderFeeResults', 'setupFeeFinder', 'openCtmPage']) {
  assert.match(app, new RegExp(`function ${fn}`), `${fn} ausente no app.js`);
}
assert.match(app, /UNSOURCED/, 'aviso de origem sem fonte documental');
assert.match(await read('sw.js'), /fees\.js/, 'fees.js fora do cache offline');
// a página precisa carregar os dados por <script>, senão não abre em file://
assert.match(html, /<script src="data\/laws\.js"><\/script>/, 'laws.js não é carregado como script');
assert.match(html, /<script src="data\/fees\.js"><\/script>/, 'fees.js não é carregado como script');
assert.doesNotMatch(app, /fetch\(/, 'fetch quebra a abertura por file://');

// --- taxa em UFM: valores conferidos contra o texto das duas leis -----------
const solar = fees.sections.find(s => s.id === 'torres-antenas-placas-solares');
assert.ok(solar, 'seção da taxa de torres, antenas e placas solares');
assert.equal(solar.unit, 'UFM');
assert.equal(solar.cap, 100000, 'teto de R$ 100.000,00 por alvará');
assert.deepEqual(
  solar.current.map(e => e.ufm),
  [5000, 1000, 0.35],
  'torre 5.000 UFM, antena 1.000 UFM, placa 0,35 UFM/m²',
);
assert.equal(solar.previous[0].ufm, 50, 'redação original: 50 UFM/m²');
// nenhum valor em UFM pode carregar valor em reais gravado na base
assert.ok(
  fees.sections.flatMap(s => [...s.current, ...s.previous])
    .every(e => e.kind !== 'ufm' || !('value' in e)),
  'valor em UFM não pode ter reais fixados na base',
);
// o texto das leis precisa sustentar os números
const l988 = pageText(1, 'lei-988-2025');
assert.match(l988, /5\.000 \(cinco mil\) UFM/, 'torre na Lei 988/2025');
assert.match(l988, /0,35/, 'placa solar a 0,35 UFM na Lei 988/2025');
assert.match(l988, /100\.000,00/, 'teto por alvará na Lei 988/2025');
const l793 = pageText(1, 'lei-793-2018').replace(/\s+/g, ' ');
assert.match(l793, /sera de 50 \(cinquenta\)\s*UFM/i, 'redação original de 50 UFM/m²');
assert.match(l793, /isenta/i, 'isenção das placas de uso domiciliar');
// a regra de manutenção da UFM pelo Código de 2025
assert.match(pageText(192), /UFM/, 'p.192 do Código trata da UFM');

// --- PRODEM: percentuais conferidos visualmente contra o original ---------
const prodem = corpus.documents.find(d => d.id === 'lei-877-2022');
assert.ok(prodem, 'Lei 877/2022 indexada');
assert.equal(prodem.pageCount, 9);
const texto877 = prodem.pages.map(p => p.text).join(' ').replace(/\s+/g, ' ');
assert.match(texto877, /80% ?[({]oitenta por cento\)/, 'redução de 80% na base do ITBI');
assert.match(texto877, /50% ?[({]cinquenta por cento\)/, 'multa de 50%');
assert.match(texto877, /30% ?[({]trinta por cento\)/, 'ocupação mínima de 30%');
assert.ok(prodem.pages.every(p => !p.ocr), 'PRODEM veio de camada de texto, não de OCR');

// --- a UFM é informada pelo usuário, nunca embutida ------------------------
assert.ok(!('factor' in fees && fees.factor), 'nenhum fator de UFM fixo no topo da base');
for (const id of ['ufmValue', 'ufmYear', 'ufmSave', 'ufmClear', 'ufmStatus', 'solarTowers', 'solarAntennas', 'solarArea', 'solarResult']) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} ausente no HTML`);
}
for (const fn of ['setupUfm', 'renderSolarFee', 'ufmToMoney', 'loadUfm']) {
  assert.match(app, new RegExp(`function ${fn}`), `${fn} ausente no app.js`);
}
assert.match(app, /SOLAR_CAP=100000/, 'teto aplicado no cálculo');
assert.doesNotMatch(app, /ufm\s*=\s*\{\s*value\s*:\s*3\.75/, 'UFM não pode vir embutida no código');

const kinds = flat.reduce((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] ?? 0) + 1 }), {});
console.log(
  `OK: ${fees.sections.length} seções, ${flat.length} taxas do CTM 2025 ` +
  `(${JSON.stringify(kinds)}), ${anteriores.length} do comparativo anterior`,
);
