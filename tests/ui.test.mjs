import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 1 });

try {
  await page.goto('http://127.0.0.1:8321', { waitUntil: 'networkidle' });

  await page.locator('#operatingArea').fill('85');
  assert.match(await page.locator('#operatingResult').innerText(), /R\$\s*150,00 por ano/);

  await page.locator('#constructionArea').fill('120');
  assert.match(await page.locator('#constructionResult').innerText(), /R\$\s*71,00/);
  await page.locator('#constructionType').selectOption('business');
  assert.match(await page.locator('#constructionResult').innerText(), /R\$\s*171,00/);

  await page.locator('[data-fee-source="211"]').click();
  await page.locator('#reader').waitFor({ state: 'visible' });
  const dimensions = await page.locator('#readerContent').evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth, 'o texto legal criou rolagem horizontal');
  await page.locator('#readerIncrease').click();
  assert.equal(await page.locator('#readerReset').innerText(), '113%');
  await page.locator('.reader-close').click();

  await page.locator('#query').fill('DASOBRASESERVICOSDEENGENHARIA');
  await page.locator('#query').press('Enter');
  await page.locator('#results .result').filter({ hasText: 'página 2' }).click();
  await page.locator('#readerMode').waitFor({ state: 'visible' });
  assert.match(await page.locator('#readerContent pre').innerText(), /DAS OBRAS E SERVICOS DE ENGENHARIA/i);
  await page.locator('#readerMode').click();
  assert.match(await page.locator('#readerContent pre').innerText(), /DASOBRASESERVICOSDEENGENHARIA/i);

  console.log('OK: consulta de taxas, leitor responsivo, zoom e leitura OCR facilitada');
} finally {
  await browser.close();
}
