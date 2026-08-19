// A ordenação da busca já falhou duas vezes de maneiras que só aparecem com o
// corpus real, então este teste carrega o rank() de verdade — sem navegador — e
// o roda contra os nove municípios.
//
// 1. Em Jurema, "UFM unidade fiscal" trazia o Código de 1994, revogado, acima
//    do de 2007 em vigor, porque o revogado tem mais ocorrências do termo.
// 2. A citação do Código Civil histórico continha a palavra "referência", e
//    isso bastava para ele vencer o Código Tributário na busca por "Valor de
//    Referência", porque titleMatched era a primeira chave de ordenação.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import vm from 'node:vm';

const raiz = new URL('../', import.meta.url);
const ler = caminho => readFile(new URL(caminho, raiz), 'utf8');
const desempacotar = texto =>
  JSON.parse(JSON.parse(texto.slice(texto.indexOf('(') + 1, texto.lastIndexOf(')'))));

// O topo do app só toca window; document aparece dentro de funções que este
// teste não chama. Só o init() do rodapé precisa sair.
async function rankerDe(slug) {
  const codigo = (await ler(`app/app.js`)).replace(/\ninit\(\);\s*$/, '\n');
  const caixa = { window: {}, console };
  vm.createContext(caixa);
  vm.runInContext(`${codigo}\n;globalThis.__rank=rank;globalThis.__corpus=c=>{corpus=c};`, caixa);
  caixa.__corpus(desempacotar(await ler(`municipios/${slug}/data/laws.js`)));
  return consulta => caixa.__rank(consulta).scored;
}

const CONSULTAS = [
  'IPTU imóvel base de cálculo',
  'ISS serviço',
  'taxa de licença',
  'contribuição de melhoria',
  'dívida ativa',
  'UFM unidade fiscal',
  'Valor de Referência',
  'transmissão inter vivos',
];

const slugs = (await readdir(new URL('municipios/', raiz), { withFileTypes: true }))
  .filter(d => d.isDirectory()).map(d => d.name);

let comRevogado = 0;
for (const slug of slugs) {
  const rank = await rankerDe(slug);
  for (const consulta of CONSULTAS) {
    const scored = rank(consulta);
    if (!scored.length) continue;

    // A norma revogada nunca vem antes da que está em vigor: a lista tem de
    // ficar particionada, todo o vigente antes de todo o revogado.
    const revogados = scored.map(r => r.doc.kind === 'historical');
    const primeiroRevogado = revogados.indexOf(true);
    if (primeiroRevogado >= 0) {
      comRevogado++;
      assert.ok(
        revogados.slice(primeiroRevogado).every(Boolean),
        `[${slug}] "${consulta}": documento em vigor aparece depois de um revogado`,
      );
    }
    // E o primeiro resultado nunca é revogado quando existe alternativa vigente.
    if (scored.some(r => r.doc.kind !== 'historical')) {
      assert.notEqual(
        scored[0].doc.kind, 'historical',
        `[${slug}] "${consulta}": o topo é norma revogada (${scored[0].doc.citation})`,
      );
    }
  }
}

// Os dois defeitos concretos que motivaram o teste.
const jurema = await rankerDe('jurema');
assert.equal(jurema('UFM unidade fiscal')[0].doc.id, 'ctm-255-2007',
  'jurema "UFM unidade fiscal": esperava o Código de 2007 no topo');
// A sigla ITBI vinha do OCR como "ITBl", com l no lugar do I, nas 11
// ocorrências do documento — e por isso a consulta caía no Código Civil, que
// cobre os dois termos. Corrigida em municipios/jurema/correcoes.json.
assert.equal(jurema('ITBI transmissão')[0].doc.id, 'ctm-255-2007',
  'jurema "ITBI transmissão": esperava o Código de 2007 — a correção de OCR do ITBl saiu?');
const jatoba = await rankerDe('jatoba');
assert.equal(jatoba('Valor de Referência')[0].doc.id, 'ctm-034-1997',
  'jatoba "Valor de Referência": o Código Tributário tem de vencer o Código Civil');

// O termo casa no início de uma palavra, nunca no meio. Antes disso a página 99
// do Código Civil — 24 ocorrências de "iss" dentro de "comissão" e "omissão",
// uma só de "serviço" — vencia o capítulo do ISS do Código Tributário, em cinco
// municípios. E "ativa" achava "administrativa" e "relativas" em centenas de
// páginas, enterrando a dívida ativa.
for (const slug of ['manari', 'vertente-do-lerio', 'jatoba', 'tacaratu', 'jurema', 'cortes', 'ingazeira']) {
  const rank = await rankerDe(slug);
  for (const consulta of ['ISS serviço', 'dívida ativa']) {
    const topo = rank(consulta)[0];
    assert.ok(topo, `[${slug}] "${consulta}" não retornou nada`);
    assert.notEqual(topo.doc.kind, 'federal',
      `[${slug}] "${consulta}": o topo é o Código Civil (${topo.doc.citation}) — casamento por substring de volta?`);
  }
}

// A busca por prefixo tem de continuar valendo, que é como as pessoas digitam.
assert.ok(jatoba('licenc').length > 0, '"licenc" deixou de achar "licença"');

// O outro lado do desempate por tipo: rebaixar o Código Civil não pode torná-lo
// inalcançável. Uma pergunta que a lei municipal não cobre continua chegando
// nele, porque a cobertura é conferida antes do tipo.
assert.equal(jatoba('testamento herança')[0].doc.kind, 'federal',
  '"testamento herança" tem de chegar ao Código Civil');

console.log(`OK: ordenação conferida em ${slugs.length} municípios, ${CONSULTAS.length} consultas cada; ${comRevogado} com norma revogada no resultado`);
