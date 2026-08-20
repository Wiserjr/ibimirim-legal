// Servidor de conferência. Serve um município já montado em dist/, para abrir
// no navegador e para a suíte de UI. Servia de public/ até a reestruturação
// multi-município, e ficou respondendo 404 em tudo — inclusive para o
// tests/ui.test.mjs, que por isso não rodava.
//
//   node tools/serve.mjs            → dist/ibimirim
//   node tools/serve.mjs alianca    → dist/alianca
//   node tools/serve.mjs docs       → docs/, a capa com os nove
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const alvo = process.argv[2] || 'ibimirim';
const root = alvo === 'docs' ? resolve('docs') : resolve('dist', alvo);
const porta = Number(process.env.PORT || 8321);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

try {
  await stat(root);
} catch {
  console.error(`${root} não existe. Rode "npm run build" antes.`);
  process.exit(1);
}

createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.(\/|\\|$))+/, '');
    if (p === '/' || p === '\\') p = '/index.html';
    const f = join(root, p);
    if (!f.startsWith(root)) throw new Error('fora da raiz');
    const s = await stat(f);
    const data = await readFile(s.isDirectory() ? join(f, 'index.html') : f);
    res.writeHead(200, { 'Content-Type': mime[extname(f)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Não encontrado');
  }
}).listen(porta, '127.0.0.1', () =>
  console.log(`${alvo}: http://127.0.0.1:${porta}`));
