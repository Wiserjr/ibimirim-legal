// Verifica o que precisa valer para QUALQUER município antes de publicar:
// o corpus carrega, as páginas citadas existem, e nada de um município vaza
// para o outro. As conferências de valor específicas de Ibimirim continuam em
// fees.test.mjs, porque nascem de uma planilha que só ele tem.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const ler = caminho => readFile(new URL(caminho, raiz), 'utf8');
const bundle = async caminho => {
  const src = await ler(caminho);
  return JSON.parse(JSON.parse(src.slice(src.indexOf('(') + 1, src.lastIndexOf(')'))));
};

const slugs = (await readdir(new URL('municipios/', raiz), { withFileTypes: true }))
  .filter(d => d.isDirectory()).map(d => d.name);
assert.ok(slugs.length >= 2, 'o projeto precisa servir mais de um município');

const resumo = [];
for (const slug of slugs) {
  const cfg = JSON.parse(await ler(`municipios/${slug}/municipio.json`));
  const laws = await bundle(`municipios/${slug}/data/laws.js`);
  const fees = await bundle(`municipios/${slug}/data/fees.js`);
  const rotulo = `[${slug}]`;

  // --- identidade -----------------------------------------------------
  assert.equal(cfg.slug, slug, `${rotulo} slug do config difere da pasta`);
  for (const campo of ['nome', 'marca', 'hero', 'trilhas', 'glossario', 'ufm']) {
    assert.ok(cfg[campo], `${rotulo} falta "${campo}" no municipio.json`);
  }
  assert.ok(cfg.trilhas.length >= 6, `${rotulo} poucas trilhas`);
  assert.ok(cfg.marca.sigla.length <= 3, `${rotulo} sigla longa demais para o selo`);

  // --- corpus ----------------------------------------------------------
  const ids = new Set(laws.documents.map(d => d.id));
  assert.equal(ids.size, laws.documents.length, `${rotulo} id de documento repetido`);
  for (const doc of laws.documents) {
    assert.equal(doc.pages.length, doc.pageCount, `${rotulo} ${doc.id}: contagem de páginas`);
    assert.ok(doc.pages.some(p => p.text.length > 100), `${rotulo} ${doc.id} sem texto`);
    assert.ok(doc.citation, `${rotulo} ${doc.id} sem citação`);
  }

  // --- toda página citada tem de existir no documento citado -----------
  const pagina = (docId, n) =>
    laws.documents.find(d => d.id === docId)?.pages.find(p => p.page === n);
  const fontes = [
    ...(cfg.cartoes || []).flatMap(c => c.fontes || []),
    ...(cfg.ufm.fonte ? [cfg.ufm.fonte] : []),
  ];
  for (const f of fontes) {
    assert.ok(pagina(f.doc, f.pagina), `${rotulo} fonte inexistente: ${f.doc} p.${f.pagina}`);
  }
  for (const secao of fees.sections || []) {
    for (const p of secao.pages || []) {
      assert.ok(pagina(secao.doc, p), `${rotulo} seção "${secao.id}" cita ${secao.doc} p.${p}, que não existe`);
    }
  }

  // --- valores em UFM nunca trazem reais gravados ----------------------
  const entradas = (fees.sections || []).flatMap(s => [...s.current, ...(s.previous || [])]);
  assert.ok(
    entradas.every(e => e.kind !== 'ufm' || !('value' in e)),
    `${rotulo} valor em UFM com reais fixados na base`,
  );

  // --- cartões declarados são de um tipo que o app sabe montar ---------
  for (const card of cfg.cartoes || []) {
    assert.ok(['faixas', 'variantes', 'soma'].includes(card.tipo), `${rotulo} tipo de cartão desconhecido: ${card.tipo}`);
    if (card.tipo === 'faixas') assert.ok(card.faixas?.length, `${rotulo} cartão ${card.id} sem faixas`);
    if (card.tipo === 'variantes') assert.ok(card.variantes?.length, `${rotulo} cartão ${card.id} sem variantes`);
    if (card.tipo === 'soma') assert.ok(card.itens?.length, `${rotulo} cartão ${card.id} sem itens`);
  }

  resumo.push({
    slug,
    documentos: laws.documents.length,
    paginas: laws.documents.reduce((n, d) => n + d.pageCount, 0),
    tabelas: (fees.sections || []).length,
    cartoes: (cfg.cartoes || []).length,
  });
}

// --- a casca não pode conter nada de um município específico -----------
const app = await ler('public/app.js');
const html = await ler('public/index.html');
for (const termo of [/IBIMIRIM_/, /Ibimirim/, /Aliança/, /ctm-2025/, /lei-988/]) {
  assert.doesNotMatch(app, termo, `public/app.js não pode citar ${termo}`);
  assert.doesNotMatch(html, termo, `public/index.html não pode citar ${termo}`);
}
assert.match(html, /<script src="municipio\.js"><\/script>/, 'a casca precisa carregar municipio.js');
assert.doesNotMatch(app, /fetch\(/, 'fetch quebra a abertura por file://');
assert.match(await ler('public/sw.js'), /municipio\.js/, 'municipio.js fora do cache offline');

console.log('OK: ' + resumo.map(r =>
  `${r.slug} (${r.documentos} docs, ${r.paginas} pág., ${r.tabelas} tabelas, ${r.cartoes} cartões)`
).join(' · '));
