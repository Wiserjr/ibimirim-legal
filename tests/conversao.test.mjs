// Toda tabela de cobrança promete um valor. A pergunta que este teste faz é:
// **esse valor chega em reais, e por qual caminho?**
//
// São quatro caminhos legítimos, e o quarto é o que mais escapa:
//   reais      — já está lá
//   ufm        — multiplica pela unidade fiscal que o Município informa
//   percentual sobre uma base declarada (VR, VRF, BCLA) — idem
//   percentual sobre o caso concreto (valor venal, preço do serviço) — e aqui
//                a tabela PRECISA dizer sobre o quê, senão a tela pede um
//                número sem dizer qual, e quem atende inventa.
//
// Foi assim que apareceram cinco tabelas — o ISS de Cortês, o ITBI do SFH de
// Ingazeira e de Jatobá, o IPTU e o ISS de Jatobá — pedindo "Valor sobre o
// qual incide" sem dizer que valor era.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const raiz = new URL('../municipios/', import.meta.url);
const slugs = (await readdir(raiz, { withFileTypes: true }))
  .filter(d => d.isDirectory()).map(d => d.name).sort();

const ler = async (slug, arquivo) => {
  try { return JSON.parse(await readFile(new URL(`${slug}/${arquivo}`, raiz), 'utf8')); }
  catch { return null; }
};

let tabelas = 0, problemas = [];
const porCaminho = { reais: 0, ufm: 0, base: 0, caso: 0 };

for (const slug of slugs) {
  const cfg = await ler(slug, 'municipio.json');
  const dados = await ler(slug, 'cobrancas.json');
  if (!cfg || !dados) continue;
  const declaradas = new Set((cfg.bases || []).map(b => b.id));
  const temRegraUfm = !!cfg.ufm;

  for (const c of dados.cobrancas) {
    const base = c.base || {};
    if (!base.itens?.length) continue;
    tabelas++;
    const onde = `${slug}/${c.id}`;

    if (base.unidade === 'reais') { porCaminho.reais++; continue; }

    if (base.unidade === 'ufm') {
      porCaminho.ufm++;
      if (!temRegraUfm) problemas.push(`${onde}: tabela em UFM, mas municipio.json não declara a regra da UFM`);
      continue;
    }

    if (base.unidade === 'percentual') {
      if (base.sobreBase) {
        porCaminho.base++;
        if (!declaradas.has(base.sobreBase))
          problemas.push(`${onde}: aponta a base "${base.sobreBase}", que municipio.json não declara`);
      } else {
        porCaminho.caso++;
        if (!base.sobre)
          problemas.push(`${onde}: percentual sem "sobre" — a tela pede um valor sem dizer qual`);
      }
      continue;
    }
    problemas.push(`${onde}: unidade "${base.unidade}" não tem caminho de conversão`);
  }
}

assert.equal(problemas.length, 0, `\n  ${problemas.join('\n  ')}\n`);
assert.ok(tabelas > 60, `esperava dezenas de tabelas, achei ${tabelas}`);

// Nenhuma linha pode prometer quantidade sem unidade nem unidade sem valor.
for (const slug of slugs) {
  const dados = await ler(slug, 'cobrancas.json');
  for (const c of dados?.cobrancas || []) {
    for (const i of c.base?.itens || []) {
      if (i.por) assert.equal(typeof i.por, 'string', `${slug}/${c.id}: campo "por" não é texto`);
      if (i.por) assert.ok(i.por.trim().length, `${slug}/${c.id}: campo "por" vazio`);
    }
  }
}

console.log(`OK: conversão — ${tabelas} tabelas, todas com caminho até os reais `
  + `(${porCaminho.reais} já em reais, ${porCaminho.ufm} por UFM, `
  + `${porCaminho.base} por base declarada, ${porCaminho.caso} pelo valor do caso)`);
