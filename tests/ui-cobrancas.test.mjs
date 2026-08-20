// Guarda a regra que sustenta o cadastro de cobranças: nada grava sem um
// fundamento que resolva no corpus. É a diferença entre um cadastro que
// responde "por que estou cobrando isto?" e uma planilha de valores soltos.
//
// A mesma conferência roda em municipios.test.mjs, sobre o cadastro publicado.
// Aqui se guarda o lado do navegador — o momento em que a equipe digita.
//
//   node tools/serve.mjs ibimirim   (em outro terminal)
//   node tests/ui-cobrancas.test.mjs
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.BASE || 'http://127.0.0.1:8321';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 851 } });

try {
  await page.goto(base, { waitUntil: 'networkidle' });

  // A seção aparece mesmo sem nada cadastrado: quem ainda não começou é quem
  // mais precisa achar o botão.
  await page.locator('#chargesSection').waitFor({ state: 'visible' });
  await page.locator('#chargeNew').click();
  await page.locator('#chargeForm').waitFor({ state: 'visible' });

  await page.locator('#cfSave').click();
  assert.match(await page.locator('#cfErro').innerText(), /Diga o que se cobra/,
    'gravou sem rótulo');

  await page.locator('#cfRotulo').fill('Taxa de teste automatizado');
  await page.locator('#cfTributo').fill('Taxa');
  await page.locator('#cfValor').fill('150');
  await page.locator('#cfSave').click();
  assert.match(await page.locator('#cfErro').innerText(), /Sem fundamento a cobrança não grava/,
    'gravou sem fundamento');

  await page.locator('[data-fund-pagina]').first().fill('99999');
  await page.locator('#cfSave').click();
  assert.match(await page.locator('#cfErro').innerText(), /não existe em/,
    'aceitou página que não existe no documento');

  await page.locator('[data-fund-pagina]').first().fill('1');
  await page.locator('[data-fund-artigo]').first().fill('art. 1º');
  await page.locator('#cfSave').click();
  await page.locator('#chargeForm').waitFor({ state: 'hidden' });

  const lista = page.locator('#chargeList');
  assert.match(await lista.innerText(), /Taxa de teste automatizado/, 'a cobrança válida não entrou');
  // o selo é exibido em maiúsculas por CSS, e innerText devolve já transformado
  assert.match(await lista.innerText(), /informado pela equipe/i,
    'o que a equipe informa tem de aparecer distinto do que foi conferido na lei');
  assert.match(await page.locator('#chargeLocalNote').innerText(), /ainda não enviadas/,
    'faltou avisar que há alterações locais por exportar');

  // O fundamento gravado abre a lei na página citada.
  await lista.locator('.charge-sources button').first().click();
  await page.locator('#reader').waitFor({ state: 'visible' });
  assert.match(await page.locator('#readerContent').innerText(), /página 1/);
  await page.locator('.reader-close').click();

  // Exportar devolve exatamente a forma que o repositório consome.
  await page.locator('#chargeExport').click();
  const exportado = JSON.parse(await page.locator('#chargeExportText').inputValue());
  assert.ok(Array.isArray(exportado.cobrancas), 'exportação sem lista de cobranças');
  const nova = exportado.cobrancas.find(c => c.rotulo === 'Taxa de teste automatizado');
  assert.ok(nova, 'a cobrança não saiu na exportação');
  assert.ok(nova.fundamento?.length, 'exportou cobrança sem fundamento');
  assert.equal(nova.base.tipo, 'reais');
  assert.equal(nova.base.valor, 150);
  await page.locator('#chargeExportClose').click();

  await page.locator('#chargeReset').click();
  assert.doesNotMatch(await lista.innerText(), /Taxa de teste automatizado/,
    'descartar alterações não voltou ao cadastro publicado');

  console.log('OK: cadastro de cobranças — fundamento obrigatório, página conferida, exportação e descarte');
} finally {
  await browser.close();
}
