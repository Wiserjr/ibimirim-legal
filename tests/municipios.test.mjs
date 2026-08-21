// Verifica o que precisa valer para QUALQUER município antes de publicar:
// o corpus carrega, as páginas citadas existem, e nada de um município vaza
// para o outro. As conferências de valor específicas de Ibimirim continuam em
// fees.test.mjs, porque nascem de uma planilha que só ele tem.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const raiz = new URL('../', import.meta.url);
const ler = caminho => readFile(new URL(caminho, raiz), 'utf8');
const bundle = async caminho => {
  // um município pode ainda não ter tabelas estruturadas; o build gera o
  // stub e o app mostra a busca sem elas
  let src;
  try { src = await ler(caminho); } catch { return null; }
  if (!src.includes('JSON.parse(')) return null;
  return JSON.parse(JSON.parse(src.slice(src.indexOf('(') + 1, src.lastIndexOf(')'))));
};

const slugs = (await readdir(new URL('municipios/', raiz), { withFileTypes: true }))
  .filter(d => d.isDirectory()).map(d => d.name);
assert.ok(slugs.length >= 2, 'o projeto precisa servir mais de um município');

const resumo = [];
for (const slug of slugs) {
  const cfg = JSON.parse(await ler(`municipios/${slug}/municipio.json`));
  const laws = await bundle(`municipios/${slug}/data/laws.js`);
  const fees = (await bundle(`municipios/${slug}/data/fees.js`)) || { sections: [] };
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

  // --- quem declara alterar outro documento tem de apontar para algo real ---
  // É desta declaração que sai o alerta de vigência sobre a cobrança. Uma
  // remissão quebrada aqui apaga o alerta em silêncio, que é pior do que
  // não tê-lo: a equipe confiaria numa cobrança desatualizada.
  for (const doc of laws.documents) {
    for (const a of doc.altera || []) {
      const onde = `${rotulo} ${doc.id} altera`;
      assert.ok(ids.has(a.doc), `${onde} ${a.doc}, que não existe na biblioteca`);
      assert.notEqual(a.doc, doc.id, `${onde} a si mesmo`);
      assert.ok(a.artigos?.length, `${onde} ${a.doc} sem lista de artigos`);
      assert.ok(pagina(doc.id, a.pagina), `${onde}: página ${a.pagina} não existe no próprio documento`);
      for (const art of a.artigos) {
        const faixa = /^(\d{1,4})-(\d{1,4})$/.exec(art);
        if (faixa) {
          assert.ok(Number(faixa[1]) < Number(faixa[2]), `${onde}: faixa "${art}" fora de ordem`);
          continue;
        }
        assert.match(String(art), /^\d{1,4}(-[A-Za-z])?$/, `${onde}: artigo "${art}" mal formado`);
      }
    }
  }
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

  // --- correção de OCR declarada tem de estar aplicada no corpus -------
  // O corpus é regerado por build_corpus.py, então uma correção que deixe de
  // ser aplicada volta sem aviso. Em Jurema o OCR gravou "ITBl" com l nas 11
  // ocorrências da sigla, e isso bastava para o ITBI sumir da busca.
  let correcoes = [];
  try { correcoes = JSON.parse(await ler(`municipios/${slug}/correcoes.json`)).correcoes; } catch {}
  for (const c of correcoes) {
    assert.ok(c.conferido, `${rotulo} correção ${c.de} sem o campo "conferido"`);
    const doc = laws.documents.find(d => d.id === c.documento);
    assert.ok(doc, `${rotulo} correção aponta documento inexistente: ${c.documento}`);
    const sobrou = doc.pages.filter(p => p.text.includes(c.de));
    assert.equal(
      sobrou.length, 0,
      `${rotulo} ${c.documento}: "${c.de}" ainda aparece em ${sobrou.length} página(s) — ` +
      `rode "python tools/build_corpus.py ${slug}"`,
    );
    assert.ok(
      doc.pages.some(p => p.text.includes(c.para)),
      `${rotulo} ${c.documento}: "${c.para}" não aparece em página nenhuma`,
    );
  }

  // --- cadastro de cobranças: nada entra sem fundamento que resolva ----
  // É a regra que dá sentido ao cadastro. A equipe informa o valor, mas o
  // dispositivo que o sustenta tem de existir mesmo, na página citada — senão
  // o cadastro vira planilha e a pergunta "por que estou cobrando isto?" fica
  // sem resposta.
  let cobrancas = [];
  try { cobrancas = JSON.parse(await ler(`municipios/${slug}/cobrancas.json`)).cobrancas; } catch {}
  const idsCobranca = new Set();
  for (const c of cobrancas) {
    const onde = `${rotulo} cobrança "${c.id || c.rotulo}"`;
    for (const campo of ['id', 'tributo', 'rotulo', 'base', 'fundamento']) {
      assert.ok(c[campo], `${onde}: falta "${campo}"`);
    }
    assert.ok(!idsCobranca.has(c.id), `${onde}: id repetido`);
    idsCobranca.add(c.id);
    assert.ok(c.fundamento.length, `${onde}: sem fundamento`);
    for (const f of c.fundamento) {
      assert.ok(pagina(f.doc, f.pagina), `${onde}: fundamento aponta ${f.doc} p.${f.pagina}, que não existe`);
    }
    assert.ok(
      ['reais', 'ufm', 'percentual', 'faixas', 'itens', 'formula'].includes(c.base.tipo),
      `${onde}: base de tipo desconhecido "${c.base.tipo}"`,
    );
    // mesma regra do resto do projeto: unidade fiscal não carrega reais junto
    assert.ok(!(c.base.tipo === 'ufm' && 'value' in c.base), `${onde}: valor em UFM com reais fixados`);
    if (c.base.tipo === 'itens') {
      assert.ok(c.base.itens?.length, `${onde}: lista de itens vazia`);
      for (const i of c.base.itens) {
        assert.ok(i.rotulo, `${onde}: item sem discriminação`);
        // zero é isenção declarada; o que não pode é valor ausente ou negativo
        assert.ok(Number.isFinite(i.valor) && i.valor >= 0, `${onde}: item "${i.rotulo}" sem valor`);
      }
    }
    if (c.base.tipo === 'faixas') {
      const tetos = c.base.faixas.map(f => f[0]);
      assert.ok(tetos.slice(0, -1).every(t => typeof t === 'number'), `${onde}: faixa aberta no meio`);
      assert.deepEqual(tetos.slice(0, -1), [...tetos.slice(0, -1)].sort((a, b) => a - b), `${onde}: faixas fora de ordem`);
      assert.ok(c.base.faixas.every(f => Number.isFinite(f[1]) && f[1] >= 0), `${onde}: faixa sem valor`);
    }
    assert.ok(
      ['conferido', 'informado', 'revisar'].includes(c.conferencia || 'informado'),
      `${onde}: grau de conferência desconhecido "${c.conferencia}"`,
    );
  }

  // --- valores em UFM nunca trazem reais gravados ----------------------
  const entradas = (fees.sections || []).flatMap(s => [...s.current, ...(s.previous || [])]);
  assert.ok(
    entradas.every(e => e.kind !== 'ufm' || !('value' in e)),
    `${rotulo} valor em UFM com reais fixados na base`,
  );

  // --- cartões declarados são de um tipo que o app sabe montar ---------
  for (const card of cfg.cartoes || []) {
    assert.ok(['faixas', 'variantes', 'soma', 'grupos'].includes(card.tipo), `${rotulo} tipo de cartão desconhecido: ${card.tipo}`);
    if (card.tipo === 'faixas') assert.ok(card.faixas?.length, `${rotulo} cartão ${card.id} sem faixas`);
    if (card.tipo === 'variantes') assert.ok(card.variantes?.length, `${rotulo} cartão ${card.id} sem variantes`);
    if (card.tipo === 'soma') assert.ok(card.itens?.length, `${rotulo} cartão ${card.id} sem itens`);
    if (card.tipo === 'grupos') {
      assert.ok(card.grupos?.length, `${rotulo} cartão ${card.id} sem grupos`);
      // só a última faixa pode ser aberta, e as demais têm de subir
      for (const g of card.grupos) {
        const tetos = g.faixas.map(f => f[0]);
        assert.ok(tetos.slice(0, -1).every(t => typeof t === 'number'), `${rotulo} ${g.id}: faixa aberta no meio`);
        assert.deepEqual(tetos.slice(0, -1), [...tetos.slice(0, -1)].sort((a, b) => a - b), `${rotulo} ${g.id}: faixas fora de ordem`);
        assert.ok(g.faixas.every(f => f[1] > 0), `${rotulo} ${g.id}: faixa sem valor`);
      }
    }
  }

  resumo.push({
    slug,
    documentos: laws.documents.length,
    paginas: laws.documents.reduce((n, d) => n + d.pageCount, 0),
    tabelas: (fees.sections || []).length,
    cartoes: (cfg.cartoes || []).length,
    cobrancas: cobrancas.length,
  });
}

// --- a casca não pode conter nada de um município específico -----------
const app = await ler('app/app.js');
const html = await ler('app/index.html');
for (const termo of [/IBIMIRIM_/, /Ibimirim/, /Aliança/, /ctm-2025/, /lei-988/]) {
  assert.doesNotMatch(app, termo, `app/app.js não pode citar ${termo}`);
  assert.doesNotMatch(html, termo, `app/index.html não pode citar ${termo}`);
}
assert.match(html, /<script src="municipio\.js"><\/script>/, 'a casca precisa carregar municipio.js');
assert.doesNotMatch(app, /fetch\(/, 'fetch quebra a abertura por file://');
assert.match(await ler('app/sw.js'), /municipio\.js/, 'municipio.js fora do cache offline');

console.log('OK: ' + resumo.map(r =>
  `${r.slug} (${r.documentos} docs, ${r.paginas} pág., ${r.tabelas} tabelas, ${r.cartoes} cartões, ${r.cobrancas} cobranças)`
).join(' · '));
