// A calculadora das cobranças converte o número da tabela em reais. Ela erra
// silenciosamente: um valor sai, só que errado, e ninguém percebe. Por isso os
// quatro caminhos de conversão e o reconhecimento da unidade ficam presos aqui.
//
// O caso que motivou o arquivo: `\b` no fim de "por m²" nunca fecha, porque `²`
// não é caractere de palavra e a posição fica entre dois não-palavra. O campo de
// quantidade simplesmente não aparecia, e a tabela parecia certa.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

const raiz = new URL('../', import.meta.url);
const src = (await readFile(new URL('app/app.js', raiz), 'utf8'))
  .replace(/\ninit\(\);\s*$/, '\n');

const sandbox = { window: {}, console, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
createContext(sandbox);
runInContext(
  `${src}\n;globalThis.__u=unidadeDeQuantidade;globalThis.__r=emReais;`
  + 'globalThis.__p=precisaValorInformado;globalThis.__b=baseFiscalDe;'
  + 'globalThis.__setUfm=v=>{ufm=v};globalThis.__setBases=b=>{basesFiscais=b};'
  + 'globalThis.__setCfgBases=b=>{cfg.bases=b};'
  + 'globalThis.__uf=unidadeEFracao;globalThis.__qe=quantidadeEfetiva;globalThis.__lr=linhaEmReais;',
  sandbox, { filename: 'app.js' });
const { __u: unidadeDe, __r: emReais, __p: precisaValor, __b: baseFiscal,
        __uf: unidadeEFracao, __qe: quantidadeEfetiva, __lr: linhaEmReais } = sandbox;

// --- a unidade de quantidade sai do rótulo ---------------------------------
const casos = [
  ['Expedição de alvará, por m² de área de piso', 'm²'],
  ['Comércio, indústria e depósitos — 3% por m² de área ocupada', 'm²'],
  ['Remoção de entulho, por m³', 'm³'],
  ['Feira livre — por dia e por m²', 'dia'],
  ['Boliches, 10% por pista', 'pista'],
  ['Abate, por cabeça', 'cabeça'],
  ['Rede de tubulação, por km, anualmente', 'km'],
  ['Alinhamento, por metro linear', 'metro linear'],
  ['Sinalização por diagonal do terreno', null],
  ['Hotéis, motéis e pensões — até 10 quartos', null],
];
for (const [rotulo, esperado] of casos) {
  assert.equal(unidadeDe({ rotulo }), esperado, `unidade de ${JSON.stringify(rotulo)}`);
}
// o campo `por` do item manda sobre o texto
assert.equal(unidadeDe({ rotulo: 'qualquer coisa', por: 'unidade' }), 'unidade', 'o campo `por` tem precedência');

// --- os quatro caminhos de conversão --------------------------------------
sandbox.__setCfgBases([{ id: 'vr', sigla: 'VR' }, { id: 'bcla', sigla: 'BCLA', padrao: 1000 }]);
sandbox.__setBases({ vr: { value: 120 } });
sandbox.__setUfm({ value: 4.5, year: 2026 });

assert.equal(emReais({ tipo: 'itens', unidade: 'reais' }, 80), 80, 'reais passa direto');
assert.equal(emReais({ tipo: 'itens', unidade: 'ufm' }, 10), 45, '10 UFM a R$ 4,50');
assert.equal(emReais({ tipo: 'itens', unidade: 'percentual', sobreBase: 'vr' }, 25), 30, '25% de R$ 120');
assert.equal(emReais({ tipo: 'itens', unidade: 'percentual', sobreBase: 'bcla' }, 1), 10,
  'a base pode vir com o valor que a própria lei fixa');
assert.equal(emReais({ tipo: 'itens', unidade: 'percentual' }, 5), null,
  'percentual sem base do Município não converte sozinho — é do caso concreto');

// --- quem precisa que alguém informe o valor -------------------------------
assert.ok(precisaValor({ tipo: 'percentual', percentual: 1, sobre: 'o valor venal' }),
  'alíquota única sobre valor venal precisa do valor');
assert.ok(precisaValor({ tipo: 'itens', unidade: 'percentual' }), 'tabela em percentual sem base declarada');
assert.ok(!precisaValor({ tipo: 'itens', unidade: 'percentual', sobreBase: 'vr' }), 'com base do Município, não');
assert.ok(!precisaValor({ tipo: 'itens', unidade: 'ufm' }), 'UFM não é percentual');

// --- de onde vem a base ----------------------------------------------------
assert.equal(baseFiscal({ unidade: 'ufm' }), 'ufm', 'UFM é base por si');
assert.equal(baseFiscal({ unidade: 'percentual', sobreBase: 'vrf' }), 'vrf');
assert.equal(baseFiscal({ unidade: 'reais' }), null, 'reais não tem base a converter');

// --- sem a unidade informada, nada é inventado -----------------------------
sandbox.__setUfm(null);
sandbox.__setBases({});
assert.equal(emReais({ tipo: 'itens', unidade: 'ufm' }, 10), null, 'sem UFM não há reais');
assert.equal(emReais({ tipo: 'itens', unidade: 'percentual', sobreBase: 'vr' }, 25), null, 'sem VR não há reais');
assert.equal(emReais({ tipo: 'itens', unidade: 'percentual', sobreBase: 'bcla' }, 1), 10,
  'a BCLA continua, porque o valor é da lei e não do exercício');

// --- "ou fração": a regra de arredondamento vem colada na unidade ---------
// Cortês cobra "R$ 0,60 por m² ou fração" no painel de anúncio. Quem mede
// 12,3 m² paga 13, e tratar a fração como decimal cobra a menos em quase toda
// medição real — o erro só não aparece quando a medida sai redonda.
// o sandbox é outro realm: copia-se para cá antes de comparar estruturas
const uf = i => { const r = unidadeEFracao(i); return r && { ...r }; };
assert.deepEqual(uf({ por: 'm² ou fração' }), { unidade: 'm²', fracao: true });
assert.deepEqual(uf({ por: 'm²' }), { unidade: 'm²', fracao: false });
assert.deepEqual(uf({ rotulo: 'Alvará, por dia' }), { unidade: 'dia', fracao: false });
assert.equal(uf({ rotulo: 'Taxa de expediente' }), null, 'sem unidade não inventa uma');

assert.equal(quantidadeEfetiva(12.3, true), 13, '12,3 m² ou fração pagam 13');
assert.equal(quantidadeEfetiva(12.3, false), 12.3, 'sem "ou fração" o decimal vale');
assert.equal(quantidadeEfetiva(0.5, true), 1, 'meia unidade ainda paga uma');
assert.equal(quantidadeEfetiva(13, true), 13, 'inteiro não sobe');
assert.equal(quantidadeEfetiva(0, true), null, 'zero não é quantidade');
assert.equal(quantidadeEfetiva(NaN, true), null, 'campo vazio não é quantidade');

// --- o valor de uma linha, em reais ---------------------------------------
sandbox.__setCfgBases([{ id: 'vr', sigla: 'VR' }]);
sandbox.__setBases({ vr: { value: 120 } });
sandbox.__setUfm({ value: 1.44, year: 2013 });

assert.equal(linhaEmReais({ tipo: 'itens', unidade: 'reais' }, { valor: 0.6 }), 0.6);
assert.equal(linhaEmReais({ tipo: 'itens', unidade: 'ufm' }, { valor: 3 }), 4.32, '3 UFM a R$ 1,44');
assert.equal(linhaEmReais({ tipo: 'itens', unidade: 'percentual', sobreBase: 'vr' }, { valor: 25 }), 30);
assert.equal(linhaEmReais({ tipo: 'itens', unidade: 'percentual' }, { valor: 2 }, 10000), 200,
  '2% de R$ 10.000 — o valor vem do caso concreto');
assert.equal(linhaEmReais({ tipo: 'itens', unidade: 'percentual' }, { valor: 2 }, null), null,
  'sem o valor informado não se inventa um total');
assert.equal(linhaEmReais({ tipo: 'itens', unidade: 'ufm' }, { valor: null }), null, 'linha sem valor');

console.log('OK: calculadora — unidade, fração, quatro conversões, e o valor de cada linha');
