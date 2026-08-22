const cfg=window.MUNICIPIO||{};
const audiences=cfg.publicos||[],trails=cfg.trilhas||[],glossary=cfg.glossario||[];
const $=selector=>document.querySelector(selector);
let corpus={documents:[]},profile='todos',installPrompt,readerPage=null,readerTerms=[],readerScale=1,readerFacilitated=true;
const lexicon=new Map();

const STOP=new Set('a o as os de da do das dos e em no na nos nas para por com sem que qual quais quem como quando onde quanto tem ter um uma ao aos sua seu suas seus sobre seria pode posso direito dever'.split(' '));
const normalize=value=>(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const escape=value=>(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const termsFor=value=>[...new Set(normalize(value).split(/[^a-z0-9]+/).filter(word=>word.length>2&&!STOP.has(word)))];
const regexEscape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const accentPattern=value=>regexEscape(value).replace(/a/g,'[aáàãâä]').replace(/e/g,'[eéèêë]').replace(/i/g,'[iíìîï]').replace(/o/g,'[oóòõôö]').replace(/u/g,'[uúùûü]').replace(/c/g,'[cç]');

// O termo casa no início de uma palavra, nunca no meio dela. Sem isso, a busca
// morre justamente nas siglas que as pessoas digitam: a página 99 do Código
// Civil tem 24 ocorrências de "iss" — todas dentro de "comissão", "omissão" e
// "comissário" — e vencia o capítulo do ISS do Código Tributário. "ativa"
// achava "administrativa" e "relativas" em centenas de páginas, e enterrava a
// dívida ativa. A busca por prefixo continua valendo: "licenc" acha "licença"
// e "licenciamento", que é como as pessoas digitam.
const startsWord=term=>new RegExp(`\\b${regexEscape(term)}`);
const countWord=(haystack,term)=>(haystack.match(new RegExp(`\\b${regexEscape(term)}`,'g'))||[]).length;
const hasWord=(haystack,term)=>startsWord(term).test(haystack);
// No texto cru, com acento, \b não serve: "á" não é caractere de palavra para o
// motor, e " área" ficaria sem fronteira. Por isso a marcação captura o que vem
// antes e devolve. Lookbehind resolveria em uma linha, mas só existe no Safari
// 16.4 em diante, e este aplicativo precisa abrir em iPhone antigo.
const WORD_EDGE='(^|[^\\p{L}\\p{N}])';

function highlight(text,terms){
  if(!terms.length)return escape(text);
  const pattern=new RegExp(`${WORD_EDGE}(${terms.sort((a,b)=>b.length-a.length).map(accentPattern).join('|')})`,'giu');
  return escape(text).replace(pattern,(match,edge,term)=>`${edge}<mark class="mark">${term}</mark>`);
}

function snippet(text,terms){
  const low=normalize(text);
  let pos=Math.min(...terms.map(term=>low.search(startsWord(term))).filter(index=>index>=0));
  if(!Number.isFinite(pos))pos=0;
  const start=Math.max(0,pos-150),end=Math.min(text.length,pos+540);
  return `${start?'…':''}${text.slice(start,end)}${end<text.length?'…':''}`;
}

function rank(value){
  const terms=termsFor(value),scored=[];
  for(const doc of corpus.documents){
    const heading=normalize(`${doc.title} ${doc.citation}`);
    const titleMatched=terms.filter(term=>hasWord(heading,term)).length;
    for(const page of doc.pages){
      const hay=normalize(page.text);
      const matched=terms.filter(term=>hasWord(hay,term));
      const hits=matched.reduce((total,term)=>total+countWord(hay,term),0);
      if(hits)scored.push({doc,page,hits,matched:matched.length,titleMatched,coverage:terms.length?matched.length/terms.length:0});
    }
  }
  // Duas regras antes da relevância bruta, ambas aprendidas em defeito real:
  // norma revogada nunca vem antes da que está em vigor — em Jurema o Código de
  // 1994 vencia o de 2007 por ter mais ocorrências do termo; e uma palavra no
  // título ou na citação não vence um documento cujo corpo trata do assunto —
  // a citação do Código Civil histórico dizia "referência" e ganhava do Código
  // Tributário na busca por "Valor de Referência". Por isso a vigência decide
  // primeiro e titleMatched virou o último desempate.
  scored.sort((a,b)=>(revoked(a.doc)-revoked(b.doc))||(b.coverage-a.coverage)||(supporting(a.doc)-supporting(b.doc))||(b.matched-a.matched)||(b.hits-a.hits)||(b.titleMatched-a.titleMatched));
  return {terms,scored};
}

const revoked=doc=>doc.kind==='historical'?1:0;
// O Código Civil está no acervo como apoio, não como resposta. São 372 páginas
// densas, e na contagem bruta de ocorrências qualquer uma delas vence a página
// municipal certa: foi assim que "Valor de Referência" em Jatobá e "ISS
// serviço" em cinco municípios caíram no Código Civil. O tipo entra depois da
// cobertura, de propósito — assim a lei municipal não vence uma consulta que
// ela mal cobre, e uma pergunta de direito civil continua indo para o lugar
// certo.
const supporting=doc=>doc.kind==='federal'?1:0;

// avisos declarados em municipio.json: vigência pendente, projeto de lei,
// divergência entre fontes. Ficam antes de tudo porque mudam a leitura do resto.
function renderAvisos(){
  const lista=cfg.avisos||[];
  $('#avisos').innerHTML=lista.map(a=>`<section class="status status-${escape(a.tipo||'nota')}" aria-label="Aviso"><b>${escape(TITULO_AVISO[a.tipo]||'Atenção')}</b><span>${a.texto}</span></section>`).join('');
}

const TITULO_AVISO={projeto:'Há projetos de lei na biblioteca.',vigencia:'Atenção à vigência.',nota:'Observação.'};

function renderAudiences(){
  $('#audiences').innerHTML=audiences.map(([id,label])=>`<button class="chip ${id===profile?'active':''}" data-profile="${id}">${label}</button>`).join('');
  document.querySelectorAll('[data-profile]').forEach(button=>button.onclick=()=>{
    profile=button.dataset.profile;renderAudiences();renderTrails();
    $('#profileHint').textContent=profile==='todos'?'Escolha um perfil ou explore todos os assuntos.':`Conteúdo priorizado para: ${button.textContent}.`;
  });
}

function renderTrails(){
  const shown=profile==='todos'?trails:trails.filter(trail=>trail.audience.includes(profile));
  $('#trails').innerHTML=shown.map((trail,index)=>`<button class="trail" data-trail="${escape(trail.query)}"><span class="icon">${trail.icon}</span><small>0${index+1}</small><h3>${trail.title}</h3><p>${trail.desc}</p></button>`).join('');
  document.querySelectorAll('[data-trail]').forEach(button=>button.onclick=()=>{$('#query').value=button.dataset.trail;search(button.dataset.trail);});
}

// um projeto de lei não é lei: precisa se distinguir à primeira vista
const TIPO_DOC={historical:'histórica',projeto:'projeto de lei',municipal:'municipal',
  federal:'federal',decreto:'decreto',administrativa:'administrativa'};

function renderLibrary(){
  $('#library').innerHTML=corpus.documents.map(doc=>`<article class="law"><span class="doc">§</span><div><h3>${escape(doc.title)}</h3><p>${escape(doc.citation)} • ${doc.pageCount} página${doc.pageCount===1?'':'s'}</p></div><span class="badge badge-${doc.kind}">${escape(TIPO_DOC[doc.kind]||doc.kind)}</span></article>`).join('');
}

function renderGlossary(){$('#glossary').innerHTML=glossary.map(([term,meaning])=>`<div><dt>${term}</dt><dd>${meaning}</dd></div>`).join('');}

function buildLexicon(){
  lexicon.clear();
  for(const doc of corpus.documents)for(const page of doc.pages)if(!page.ocr){
    for(const word of normalize(page.text).match(/[a-z]+/g)||[])if(word.length>=3)lexicon.set(word,(lexicon.get(word)||0)+1);
  }
  'a o e as os de da do das dos em no na nos nas ao aos por para com sem que um uma lei art ibimirim prefeitura municipal'.split(' ').forEach(word=>lexicon.set(word,10000));
}

function splitJoinedWord(word){
  const key=normalize(word);
  if(key.length<10||lexicon.has(key))return word;
  const shortWords=new Set(['a','o','e','as','os','de','da','do','em','no','na','ao','ou','se','um']),best=Array(key.length+1).fill(null);best[0]={score:0,parts:[]};
  for(let end=1;end<=key.length;end++)for(let start=Math.max(0,end-24);start<end;start++){
    if(!best[start])continue;
    const part=key.slice(start,end),count=lexicon.get(part)||0;
    if(!count||(part.length<3&&!shortWords.has(part)))continue;
    const score=best[start].score+part.length*part.length-12+Math.log1p(count)*.15;
    if(!best[end]||score>best[end].score)best[end]={score,parts:[...best[start].parts,end]};
  }
  const cuts=best[key.length]?.parts||[];
  if(cuts.length<2)return word;
  let start=0;return cuts.map(end=>{const part=word.slice(start,end);start=end;return part}).join(' ');
}

function facilitateOcr(text){
  return text.replace(/([,.;:])(?=\p{L})/gu,'$1 ').replace(/(\p{Ll})(\p{Lu})/gu,'$1 $2').replace(/\p{L}{10,}/gu,splitJoinedWord);
}

function renderReader(){
  if(!readerPage)return;
  const {doc,page}=readerPage,shown=page.ocr&&readerFacilitated?facilitateOcr(page.text):page.text;
  $('#readerContent').style.setProperty('--reader-font-size',`${Math.round(16*readerScale)}px`);
  $('#readerContent').innerHTML=`<p class="reader-meta">${escape(doc.citation)} • página ${page.page}${page.ocr?' • texto obtido por OCR':''}</p><h2>${escape(doc.title)}</h2>${page.ocr?'<p class="ocr-note">A leitura facilitada separa automaticamente algumas palavras unidas pelo OCR. Use “Texto original” para conferir a extração sem ajustes.</p>':''}<pre>${highlight(shown,readerTerms)}</pre>`;
  $('#readerReset').textContent=`${Math.round(readerScale*100)}%`;
  $('#readerMode').hidden=!page.ocr;
  $('#readerMode').textContent=readerFacilitated?'Texto original':'Leitura facilitada';
}

function openPage(doc,page,terms){
  readerPage={doc,page};readerTerms=terms;readerScale=1;readerFacilitated=true;renderReader();
  $('#reader').showModal();
}

const money=value=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function validArea(input){const value=Number(String(input.value).replace(',','.'));return Number.isFinite(value)&&value>0?value:null;}

function setupFeeConsultation(){
  document.querySelectorAll('.fee-card [data-fee-page],.ufm-panel [data-fee-page]').forEach(button=>button.onclick=()=>openCtmPage(+button.dataset.feePage,['taxa','ufm','valor'],button.dataset.feeDoc));
}

const UFM_KEY=`municipio.ufm.${cfg.slug||'x'}`;
// inteiro sai sem casas (5.000 UFM); fracionário sai com pelo menos duas,
// senão 15,8 fica desalinhado de 8,14 na mesma tabela
const ufmFormat=value=>`${value.toLocaleString('pt-BR',Number.isInteger(value)?{}:{minimumFractionDigits:2,maximumFractionDigits:4})} UFM`;
let ufm=null;

function loadUfm(){
  try{const stored=JSON.parse(localStorage.getItem(UFM_KEY)||'null');ufm=stored&&stored.value>0?stored:null}catch{ufm=null}
}
function ufmToMoney(units){return ufm?money(units*ufm.value):null;}
function renderUfmStatus(){
  const box=$('#ufmStatus');
  if(!ufm){box.className='ufm-status ufm-status-empty';box.innerHTML='Nenhuma UFM informada. Os valores fixados em UFM aparecem apenas nessa unidade, sem conversão para reais.';return}
  box.className='ufm-status ufm-status-set';
  box.innerHTML=`Em uso: <b>${money(ufm.value)}</b> por UFM${ufm.year?` — exercício ${ufm.year}`:''}. Confirme o ato de atualização antes de lançar.`;
}
function applyUfm(){
  renderUfmStatus();renderCards();
  if(feeIndex.length)renderFeeResults();
  // a coluna em reais das cobranças nasce da UFM: mudou a unidade, redesenha
  if(typeof loadBases==='function'&&charges.length){loadBases();renderBasesExtras();renderCharges();}
}
function setupUfm(){
  loadUfm();
  const regra=cfg.ufm||{};
  if($('#ufmRegra'))$('#ufmRegra').innerHTML=regra.regra||'';
  if($('#ufmFonte')&&regra.fonte)$('#ufmFonte').innerHTML=`<button class="source-button" data-fee-doc="${regra.fonte.doc}" data-fee-page="${regra.fonte.pagina}">${escape(regra.fonte.rotulo)}</button>`;
  if(ufm){$('#ufmValue').value=ufm.value;if(ufm.year)$('#ufmYear').value=ufm.year}
  $('#ufmSave').onclick=()=>{
    const value=Number(String($('#ufmValue').value).replace(',','.')),year=parseInt($('#ufmYear').value,10);
    if(!Number.isFinite(value)||value<=0){$('#ufmStatus').className='ufm-status ufm-status-empty';$('#ufmStatus').textContent='Informe um valor de UFM maior que zero.';return}
    ufm={value,year:Number.isFinite(year)?year:null};
    try{localStorage.setItem(UFM_KEY,JSON.stringify(ufm))}catch{}
    applyUfm();
  };
  $('#ufmClear').onclick=()=>{ufm=null;try{localStorage.removeItem(UFM_KEY)}catch{}$('#ufmValue').value='';$('#ufmYear').value='';applyUfm()};
  renderUfmStatus();
}

// --- cartões de consulta, declarados em municipios/<slug>/municipio.json ---
// Três formatos cobrem o que os códigos usam: faixas por área, variantes com
// base mais adicional por metro, e soma de quantidades por unidade.
const cards=cfg.cartoes||[];
const cardEl=(card,sufixo)=>$(`#card-${card.id}-${sufixo}`);

function faixaDe(faixas,area){
  const faixa=(faixas||[]).find(([max])=>max===null||area<=max);
  if(faixa)return{rotulo:faixa[2],valor:faixa[1],estimado:false};
  return null;
}

function excedenteDe(card,area){
  const extra=card.excedente;
  if(!extra)return null;
  return{rotulo:extra.rotulo,valor:extra.base+(area-extra.limiar)*extra.taxa,estimado:true,formula:extra.formula};
}

function renderFaixas(card){
  const caixa=cardEl(card,'result'),area=validArea(cardEl(card,'campo'));
  if(!area){caixa.innerHTML='Informe a área para consultar a faixa.';return}
  const achado=faixaDe(card.faixas,area)||excedenteDe(card,area);
  if(!achado){caixa.innerHTML='Área fora das faixas previstas na tabela.';return}
  caixa.innerHTML=`<span>Faixa: ${escape(achado.rotulo)}</span><strong>${achado.estimado?'Estimativa: ':''}${money(achado.valor)} ${escape(card.periodo||'')}</strong>`
    +(achado.formula?`<small>${escape(achado.formula)}</small>`:'');
}

function renderVariantes(card){
  const caixa=cardEl(card,'result'),area=validArea(cardEl(card,'campo'));
  const escolha=cardEl(card,'seletor').value;
  const v=card.variantes.find(item=>item.id===escolha)||card.variantes[0];
  const comparativo=cardEl(card,'comparativo');
  if(!area){
    caixa.innerHTML='Informe a área para consultar a regra.';
    if(comparativo)comparativo.innerHTML='<p>Informe a área para visualizar a comparação.</p>';
    return;
  }
  const dentro=area<=v.limiar,valor=dentro?v.base:v.base+(area-v.limiar)*v.taxa;
  caixa.innerHTML=`<span>${escape(v.categoria)} • ${dentro?`até ${v.limiar.toLocaleString('pt-BR')} m²`:`acima de ${v.limiar.toLocaleString('pt-BR')} m²`}</span>`
    +`<strong>${dentro?'Valor':'Estimativa'}: ${money(valor)}</strong>`
    +(dentro?'':`<small>Fórmula da tabela: ${money(v.base)} + ${money(v.taxa)} por m² acrescido acima de ${v.limiar.toLocaleString('pt-BR')} m².</small>`);
  if(comparativo)comparativo.innerHTML=(v.anterior!=null?`<p><strong>CTM anterior:</strong> ${money(v.anterior)} para a categoria geral indicada no comparativo.</p>`:'')
    +`<p><strong>Código vigente:</strong> ${dentro?'valor fixo':'base mais adicional por área excedente'}, resultando em ${money(valor)} para a área informada.</p>`
    +(card.comparativo&&card.comparativo.nota?`<small>${escape(card.comparativo.nota)}</small>`:'');
}

function renderSoma(card){
  const caixa=cardEl(card,'result'),emUfm=card.unidade==='UFM';
  const partes=[];let total=0;
  for(const item of card.itens){
    const q=validArea($(`#card-${card.id}-${item.id}`));
    if(!q)continue;
    total+=q*item.taxa;
    partes.push(`${q.toLocaleString('pt-BR')} ${q===1?item.singular:item.plural} × ${emUfm?ufmFormat(item.taxa):money(item.taxa)}`);
  }
  if(!total){caixa.innerHTML='Informe as quantidades para calcular.';return}
  const reais=emUfm?ufmToMoney(total):money(total);
  const bruto=emUfm?(ufm?total*ufm.value:null):total;
  const teto=card.teto&&bruto!=null&&bruto>card.teto;
  caixa.innerHTML=`<span>${partes.join(' · ')}</span><strong>${emUfm?ufmFormat(total):money(total)} ${escape(card.periodo||'')}</strong>`
    +(reais?`<span class="solar-money">${teto?`Limitado ao teto: <b>${money(card.teto)}</b>`:`Equivale a <b>${reais}</b>`}${emUfm&&ufm?` com UFM de ${money(ufm.value)}${ufm.year?` (${ufm.year})`:''}`:''}.</span>`
      :'<small>Informe a UFM vigente acima para ver o valor em reais.</small>')
    +(teto?`<small>O valor calculado, ${reais}, ultrapassa o teto de ${money(card.teto)} previsto na lei.</small>`:'')
    +(card.rodape?`<small>${escape(card.rodape)}</small>`:'');
}

function renderGrupos(card){
  const caixa=cardEl(card,'result'),area=validArea(cardEl(card,'campo'));
  const grupo=card.grupos.find(g=>g.id===cardEl(card,'seletor').value)||card.grupos[0];
  if(!area){caixa.innerHTML='Informe a área para consultar a faixa.';return}
  const achado=faixaDe(grupo.faixas,area);
  if(!achado){caixa.innerHTML='Área fora das faixas previstas na tabela.';return}
  const emUfm=card.unidade==='UFM',reais=emUfm?ufmToMoney(achado.valor):null;
  caixa.innerHTML=`<span>${escape(grupo.rotulo)} • ${escape(achado.rotulo)}</span>`
    +`<strong>${emUfm?ufmFormat(achado.valor):money(achado.valor)} ${escape(card.periodo||'')}</strong>`
    +(emUfm?(reais?`<span class="solar-money">Equivale a <b>${reais}</b> com UFM de ${money(ufm.value)}${ufm.year?` (${ufm.year})`:''}.</span>`
      :'<small>Informe a UFM vigente acima para ver o valor em reais.</small>'):'')
    +(card.rodape?`<small>${escape(card.rodape)}</small>`:'');
}

const RENDER={faixas:renderFaixas,variantes:renderVariantes,soma:renderSoma,grupos:renderGrupos};
function renderCard(card){const fn=RENDER[card.tipo];if(fn)fn(card);}
function renderCards(){cards.forEach(renderCard);}

function campoHtml(card,id,rotulo,unidade,exemplo,passo){
  return `<label for="card-${card.id}-${id}">${escape(rotulo)}</label>`
    +`<div class="fee-input"><input id="card-${card.id}-${id}" type="number" min="0" step="${passo||0.01}" inputmode="decimal" placeholder="${escape(exemplo||'0')}"><span>${escape(unidade||'')}</span></div>`;
}

function cardHtml(card){
  let corpo='';
  if(card.tipo==='variantes'||card.tipo==='grupos'){
    const opcoes=card.variantes||card.grupos;
    corpo+=`<label for="card-${card.id}-seletor">${escape(card.seletor.rotulo)}</label>`
      +`<select id="card-${card.id}-seletor">${opcoes.map(v=>`<option value="${v.id}">${escape(v.rotulo)}</option>`).join('')}</select>`;
  }
  if(card.tipo==='soma'){
    corpo+=`<div class="solar-fields">${card.itens.map(item=>`<div>${campoHtml(card,item.id,item.rotulo,item.unidade,'0',item.passo)}</div>`).join('')}</div>`;
  }else{
    corpo+=campoHtml(card,'campo',card.campo.rotulo,card.campo.unidade,card.campo.exemplo);
  }
  const comp=card.comparativo?`<details class="fee-comparison"><summary>${escape(card.comparativo.titulo)}</summary>${card.comparativo.texto?`<p>${card.comparativo.texto}</p>`:`<div id="card-${card.id}-comparativo"></div>`}</details>`:'';
  const fontes=(card.fontes||[]).map(f=>`<button class="source-button" data-fee-doc="${f.doc}" data-fee-page="${f.pagina}">${escape(f.rotulo)}</button>`).join('');
  return `<article class="fee-card${card.unidade==='UFM'?' fee-card-ufm':''}"><span class="fee-kind">${escape(card.etiqueta)}</span>`
    +`<h3>${escape(card.titulo)}</h3><p>${card.descricao}</p>${corpo}`
    +`<div id="card-${card.id}-result" class="fee-result" aria-live="polite"></div>${comp}${fontes}</article>`;
}

function setupFeeCards(){
  const alvo=$('#feeCards');
  if(!alvo)return;
  alvo.innerHTML=cards.map(cardHtml).join('');
  for(const card of cards){
    const campos=card.tipo==='soma'?card.itens.map(i=>i.id):['campo'];
    campos.forEach(id=>cardEl(card,id).addEventListener('input',()=>renderCard(card)));
    if(card.tipo==='variantes'||card.tipo==='grupos')cardEl(card,'seletor').addEventListener('change',()=>renderCard(card));
  }
  renderCards();
}

const SIDE_LABEL=cfg.rotulos||{atual:'Vigente',anterior:'Anterior'};
const UNSOURCED=cfg.semFonte||'Este valor não tem página citável na biblioteca. Confira o original antes de usar.';
let fees={sections:[]},feeIndex=[],feeFilter='todas';

function buildFeeIndex(){
  feeIndex=[];
  for(const section of fees.sections){
    for(const [side,entries] of [['atual',section.current],['anterior',section.previous]]){
      for(const entry of entries){
        if(entry.kind==='heading')continue;
        feeIndex.push({...entry,side,section,haystack:normalize(`${entry.label} ${section.title}`)});
      }
    }
  }
}

function feeTag(entry){
  const section=entry.section;
  return (entry.side==='atual'?section.tag:section.prevTag)||SIDE_LABEL[entry.side];
}

// alguns itens trazem uma sequência de valores (zonas, faixas) num rótulo só;
// mostrar apenas o primeiro esconderia o resto da linha
const extrasHtml=(entry,fmt)=>entry.extras&&entry.extras.length
  ?`<span class="fee-plus">demais valores da linha: ${entry.extras.map(fmt).join(' · ')}</span>`:'';

function feeAmount(entry){
  if(entry.kind==='fixed')return `<strong class="fee-amount">${money(entry.value)}</strong>`;
  if(entry.kind==='formula')return `<strong class="fee-amount">${money(entry.base)}</strong><span class="fee-plus">+ ${money(entry.rate)} por ${escape(entry.unit||'unidade')} acrescido${entry.threshold?` acima de ${entry.threshold.toLocaleString('pt-BR')} ${escape(entry.unit||'')}`:''}</span>`;
  if(entry.kind==='ufm'){const reais=ufmToMoney(entry.ufm);return `<strong class="fee-amount">${ufmFormat(entry.ufm)}</strong>${extrasHtml(entry,ufmFormat)}<span class="fee-plus">${entry.per?`por ${escape(entry.per)} ao ano`:'conforme a tabela'}${reais?` · ${reais} com a UFM informada`:' · informe a UFM para ver em reais'}</span>`}
  if(entry.kind==='pct'){const base=entry.section.base||'';return `<strong class="fee-amount">${entry.valor.toLocaleString('pt-BR')}%</strong>${extrasHtml(entry,v=>v.toLocaleString('pt-BR')+'%')}<span class="fee-plus">${escape(base)}</span>`}
  if(entry.kind==='indice')return `<strong class="fee-amount">× ${entry.valor.toLocaleString('pt-BR')}</strong><span class="fee-plus">índice de correção do valor venal</span>`;
  if(entry.kind==='tiered')return `<span class="fee-tiers">${entry.tiers.map(tier=>`<span><b>${money(tier.value)}</b> ${escape(tier.label)}</span>`).join('')}${entry.outskirts?`<small>Centro. Periferia: ${entry.outskirts.map(tier=>money(tier.value)).join(' · ')}</small>`:''}</span>`;
  return `<span class="fee-raw">${escape(entry.raw||'valor não informado no comparativo')}</span>`;
}

// O valor unitário de uma linha da busca de taxas, em reais. Mesma regra das
// cobranças: devolve null quando falta a informação que só o caso traz.
function taxaEmReais(entry, informado){
  if(entry.kind==='fixed')return Number.isFinite(entry.value)?entry.value:null;
  if(entry.kind==='ufm')return ufm?entry.ufm*ufm.value:null;
  if(entry.kind==='pct')return Number.isFinite(informado)&&informado>0?(entry.valor/100)*informado:null;
  return null;
}

function unidadeDaTaxa(entry){
  return unidadeEFracao({por:entry.per,rotulo:entry.label});
}

function feeCalculator(entry,index){
  // a fórmula tem calculadora própria: base mais adicional por metro excedente
  if(entry.kind==='formula'){
    const unit=escape(entry.unit||'unidade');
    return `<div class="fee-calc"><label for="feeCalc${index}">Calcular para</label><div class="fee-input"><input id="feeCalc${index}" type="number" min="0.01" step="0.01" inputmode="decimal" data-fee-calc="${index}" placeholder="0"><span>${unit}</span></div><output id="feeCalcOut${index}" class="fee-calc-out">—</output></div>`;
  }
  if(!['fixed','ufm','pct'].includes(entry.kind))return '';
  // Sem a unidade informada não há o que multiplicar: dizer isso é mais útil
  // que oferecer um campo que não produz resposta.
  if(entry.kind==='ufm'&&!ufm)return '';
  const uf=unidadeDaTaxa(entry);
  const rot=uf?`Quantidade em ${escape(uf.unidade)}${uf.fracao?' — ou fração':''}`:'Quantas vezes';
  const incide=entry.kind==='pct'
    ?`<label for="feeInc${index}">${escape(entry.section.base||'Valor sobre o qual incide')} (R$)</label>`
     +`<div class="fee-input"><span class="fee-prefix">R$</span><input id="feeInc${index}" type="number" min="0.01" step="0.01"`
     +` inputmode="decimal" data-fee-incide="${index}" placeholder="0,00"></div>`
    :'';
  return `<div class="fee-calc">${incide}<label for="feeQtd${index}">${rot}</label>`
    +`<div class="fee-input"><input id="feeQtd${index}" type="number" min="0" step="0.01" inputmode="decimal"`
    +` data-fee-qtd="${index}" placeholder="1">${uf?`<span>${escape(uf.unidade)}</span>`:''}</div>`
    +`<output id="feeQtdOut${index}" class="fee-calc-out">—</output></div>`;
}

const AVISO_CONF={media:'Rótulo e valor pareados pela contagem: a coluna de valores vem deslocada no PDF. Confira na página indicada.',baixa:'Leitura ambígua no documento. Confira na página indicada antes de usar.'};

function feeSource(entry){
  const section=entry.section;
  if(entry.side==='anterior'){
    if(!section.prevDoc)return `<p class="fee-warn">⚠ ${UNSOURCED}</p>`;
    return `<button class="source-button" data-fee-doc="${section.prevDoc}" data-fee-page="${entry.page||1}">${escape(section.prevLabel||'Texto anterior')} — abrir a lei</button>`;
  }
  const {table,pages,status}=section;
  if(!pages||!pages.length)return `<p class="fee-warn">⚠ Página do Código não localizada para esta seção.</p>`;
  const cite=`${escape(table||cfg.rotulos?.atual||'Código vigente')} — p. ${pages.join(', ')}`;
  const warning=section.warning?`<p class="fee-warn">⚠ ${escape(section.warning)}</p>`:'';
  const badge=status==='divergente'?`<p class="fee-warn">⚠ ${escape(entry.section.note||'')}</p>`:status==='parcial'?'<p class="fee-note">Tabela localizada; nem todos os itens puderam ser conferidos linha a linha no texto extraído.</p>':'';
  const conf=AVISO_CONF[entry.confianca]?`<p class="fee-note">⚠ ${AVISO_CONF[entry.confianca]}</p>`:'';
  return `${warning}${badge}${conf}<button class="source-button" data-fee-doc="${entry.section.doc||(corpus.documents[0]||{}).id}" data-fee-page="${pages[0]}">${cite}</button>`;
}

function renderFeeResults(){
  const value=$('#feeQuery').value.trim(),terms=termsFor(value);
  let hits=feeIndex;
  if(feeFilter!=='todas')hits=hits.filter(entry=>entry.section.id===feeFilter);
  if(terms.length)hits=hits.filter(entry=>terms.every(term=>hasWord(entry.haystack,term)));
  else if(feeFilter==='todas'){$('#feeCount').textContent='Digite um termo ou escolha um tipo de taxa para listar os valores.';$('#feeResults').innerHTML='';return;}
  hits=[...hits].sort((a,b)=>(a.side==='atual'?0:1)-(b.side==='atual'?0:1));
  const top=hits.slice(0,60);
  $('#feeCount').textContent=`${hits.length} ${hits.length===1?'item encontrado':'itens encontrados'}${hits.length>top.length?` — exibindo os ${top.length} primeiros`:''}.`;
  $('#feeResults').innerHTML=top.length?top.map((entry,index)=>`<article class="fee-item fee-item-${entry.side}"><div class="fee-item-head"><span class="fee-tag fee-tag-${entry.side}">${escape(feeTag(entry))}</span><span class="fee-section">${escape(entry.section.title)}</span></div><p class="fee-label">${highlight(entry.label,terms)}</p><div class="fee-values">${feeAmount(entry)}</div>${feeCalculator(entry,index)}<div class="fee-item-foot">${feeSource(entry)}</div></article>`).join(''):'<p class="empty">Nenhuma taxa encontrada com esse termo. Tente uma palavra do ramo, da obra ou do serviço.</p>';
  $('#feeResults').querySelectorAll('[data-fee-calc]').forEach(input=>input.oninput=()=>{
    const entry=top[+input.dataset.feeCalc],area=validArea(input),out=$(`#feeCalcOut${input.dataset.feeCalc}`);
    if(!area){out.textContent='—';return;}
    const excess=Math.max(0,area-(entry.threshold||0));
    out.innerHTML=`Estimativa: <b>${money(entry.base+excess*entry.rate)}</b>`;
  });
  $('#feeResults').querySelectorAll('[data-fee-qtd],[data-fee-incide]').forEach(input=>{
    const i=input.dataset.feeQtd??input.dataset.feeIncide;
    const recalcular=()=>{
      const entry=top[+i],out=$(`#feeQtdOut${i}`);
      if(!out)return;
      const num=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};
      const informado=num($(`#feeInc${i}`)?.value);
      const unidade=taxaEmReais(entry,informado);
      if(unidade===null){out.innerHTML=entry.kind==='pct'?'informe o valor acima':'—';return}
      const uf=unidadeDaTaxa(entry);
      const bruto=num($(`#feeQtd${i}`)?.value);
      const qtd=quantidadeEfetiva(bruto,uf?.fracao);
      const total=unidade*(qtd??1);
      const subiu=qtd!==null&&uf?.fracao&&bruto!==qtd
        ?` <small>${bruto.toLocaleString('pt-BR')} → ${qtd.toLocaleString('pt-BR')} ${escape(uf.unidade)}</small>`:'';
      out.innerHTML=`<b>${money(total)}</b>${subiu}`;
    };
    input.oninput=recalcular;recalcular();
  });
  $('#feeResults').querySelectorAll('[data-fee-page]').forEach(button=>button.onclick=()=>openCtmPage(+button.dataset.feePage,terms,button.dataset.feeDoc));
}

function openCtmPage(number,terms,docId){
  const doc=corpus.documents.find(item=>item.id===(docId||(corpus.documents[0]||{}).id)),page=doc?.pages.find(item=>item.page===number);
  if(doc&&page)openPage(doc,page,terms.length?terms:['taxa','valor']);
}

function setupFeeFinder(){
  const sections=fees.sections.filter(section=>section.current.length||section.previous.length);
  $('#feeFilters').innerHTML=[['todas','Todas'],...sections.map(section=>[section.id,section.short||section.title])].map(([id,label])=>`<button class="chip${id===feeFilter?' active':''}" data-fee-filter="${id}">${escape(label)}</button>`).join('');
  $('#feeFilters').querySelectorAll('[data-fee-filter]').forEach(button=>button.onclick=()=>{
    feeFilter=button.dataset.feeFilter;
    $('#feeFilters').querySelectorAll('.chip').forEach(chip=>chip.classList.toggle('active',chip.dataset.feeFilter===feeFilter));
    renderFeeResults();
  });
  $('#feeQuery').addEventListener('input',renderFeeResults);
  renderFeeResults();
}

function looksLikeQuestion(value){return /\?$/.test(value.trim())||/^(quem|qual|quais|como|quando|onde|quanto|posso|pode|devo|tem|ha|há|o que|existe|seria)\b/i.test(value.trim());}

function renderAnswer(value,scored,terms){
  const box=$('#answer');
  if(!looksLikeQuestion(value)){box.hidden=true;return;}
  const evidence=scored.filter(item=>item.coverage>=Math.min(.5,2/Math.max(terms.length,1))).slice(0,3);
  const officialQuery=encodeURIComponent(`${value} ${(cfg.buscaOnline||{}).oficial||""}`);
  const generalQuery=encodeURIComponent(`${value} ${(cfg.buscaOnline||{}).ampla||''}`);
  if(!evidence.length){
    box.innerHTML=`<p class="answer-label">Resposta pelos documentos</p><h3>Não encontrei apoio suficiente na biblioteca local.</h3><p>Isso não significa que a regra não exista. Tente reformular a pergunta ou consulte as fontes online auxiliares.</p><div class="answer-actions"><a href="https://www.google.com/search?q=${officialQuery}" target="_blank" rel="noopener">Buscar em sites oficiais</a><a href="https://www.google.com/search?q=${generalQuery}" target="_blank" rel="noopener">Consulta online ampla</a></div>`;
    box.hidden=false;return;
  }
  box.innerHTML=`<p class="answer-label">Resposta baseada nos documentos</p><h3>Os trechos mais relacionados à pergunta indicam:</h3><p class="answer-warning">Síntese automática por relevância textual. Leia as fontes abaixo antes de usar a resposta em decisão, lançamento, licença, fiscalização ou autuação.</p><ol>${evidence.map((item,index)=>`<li><button data-evidence="${index}">${highlight(snippet(item.page.text,terms).slice(0,420),terms)}<span>${escape(item.doc.citation)} • página ${item.page.page}</span></button></li>`).join('')}</ol><div class="answer-actions"><a href="https://www.google.com/search?q=${officialQuery}" target="_blank" rel="noopener">Complementar em sites oficiais</a><a href="https://www.google.com/search?q=${generalQuery}" target="_blank" rel="noopener">Consulta online ampla</a></div><p class="online-note">Resultados online são auxiliares e não foram incorporados à resposta local. Confirme autoria, data, vigência e publicação oficial.</p>`;
  box.hidden=false;
  box.querySelectorAll('[data-evidence]').forEach(button=>button.onclick=()=>{const item=evidence[+button.dataset.evidence];openPage(item.doc,item.page,terms);});
}

function search(value){
  const {terms,scored}=rank(value);
  if(!terms.length){$('#resultsSection').hidden=true;return;}
  const top=scored.slice(0,40);
  $('#resultsTitle').textContent=`${scored.length} página${scored.length===1?'':'s'} encontrada${scored.length===1?'':'s'}`;
  renderAnswer(value,scored,terms);
  $('#results').innerHTML=top.length?top.map((item,index)=>`<article class="result" data-result="${index}"><h3>${escape(item.doc.title)} — página ${item.page.page}</h3><p>${highlight(snippet(item.page.text,terms),terms)}</p><span class="source">${escape(item.doc.citation)} · abrir texto da página →</span></article>`).join(''):'<p class="empty">Nenhum trecho encontrado. Tente termos mais curtos ou outra expressão.</p>';
  document.querySelectorAll('[data-result]').forEach(element=>element.onclick=()=>{const item=top[+element.dataset.result];openPage(item.doc,item.page,terms);});
  $('#resultsSection').hidden=false;$('#resultsSection').scrollIntoView({behavior:'smooth'});
}

// --- Cadastro de cobranças -------------------------------------------------
// O que o Município cobra, de quem, quando e com que fundamento. Ao contrário
// das tabelas de fees.js, que saem dos extratores, este cadastro é preenchido
// pela equipe do município — e por isso cada entrada é obrigada a apontar o
// dispositivo que a sustenta. Sem fundamento não grava: é o que permite
// responder "por que estou cobrando isto?" sem depender de quem montou.
//
// Não há servidor. O que a equipe edita fica no navegador, sobre o cadastro
// publicado, e sai daqui como arquivo — que volta ao repositório por revisão.
const CHARGE_KEY=`municipio.cobrancas.${cfg.slug||'x'}`;
const CHARGE_BASES={reais:'Reais',ufm:'Unidade fiscal',percentual:'Percentual',faixas:'Faixas',formula:'Fórmula'};
const CHARGE_CONF={conferido:'Conferido na lei',informado:'Informado pela equipe',revisar:'Precisa de revisão'};
let charges=[],chargeFilter='todos',chargeEditing=null,chargeDirty=false;

// --- bases fiscais e calculadora de cobrança ------------------------------
// Os códigos da região expressam valor de quatro maneiras, e três delas não dão
// reais sozinhas: em UFM, em percentual de uma unidade municipal (o Valor de
// Referência de Manari, por exemplo) e em percentual de algo que só o caso
// concreto informa — o valor venal, o preço do serviço. A quarta são os reais
// diretos. Ainda por cima a lei costuma dizer "por m²", "por dia", "por pista",
// e aí falta a quantidade.
//
// Daqui sai o que faltava: a coluna em reais na tabela e a calculadora embaixo
// dela. O que o Município fixa (UFM, VR, VRF) fica guardado no navegador; o que
// é do caso concreto entra na hora.

const BASES_KEY = `${CHARGE_KEY}-bases`;
let basesFiscais = {};

function loadBases() {
  try { basesFiscais = JSON.parse(localStorage.getItem(BASES_KEY)) || {}; } catch { basesFiscais = {}; }
  // a UFM já tinha painel próprio antes das outras bases existirem; ela continua
  // mandando, para não haver dois lugares dizendo coisas diferentes
  if (ufm) basesFiscais.ufm = { value: ufm.value, year: ufm.year };
}

function salvarBase(id, value, year) {
  basesFiscais[id] = { value, year: Number.isFinite(year) ? year : null };
  try { localStorage.setItem(BASES_KEY, JSON.stringify(basesFiscais)); } catch {}
}

function basesDeclaradas() {
  return (cfg.bases || []).filter(b => b.id !== 'ufm');
}

function valorDaBase(id) {
  if (id === 'ufm') return ufm ? ufm.value : null;
  const b = basesFiscais[id];
  if (b && Number.isFinite(b.value) && b.value > 0) return b.value;
  // Uma base pode vir com o valor que a própria lei fixa — a BCLA de Tacaratu
  // está no art. 281. Serve de ponto de partida, e a equipe troca se houver
  // atualização publicada.
  const decl = (cfg.bases || []).find(x => x.id === id);
  return decl && Number.isFinite(decl.padrao) ? decl.padrao : null;
}

function baseDeclarada(id) {
  return (cfg.bases || []).find(b => b.id === id) || (id === 'ufm' ? { id: 'ufm', sigla: 'UFM', rotulo: 'Unidade Fiscal do Município' } : null);
}

// Qual unidade municipal a cobrança usa. O percentual pode incidir sobre uma
// base do Município — e aí a conversão é automática — ou sobre valor venal e
// preço do serviço, que ninguém pode saber de antemão.
function baseFiscalDe(base) {
  if (!base) return null;
  if (base.unidade === 'ufm') return 'ufm';
  if (base.unidade === 'percentual' && base.sobreBase) return base.sobreBase;
  return null;
}

function precisaValorInformado(base) {
  // Duas formas dizem a mesma coisa: `tipo: percentual` numa cobrança de
  // alíquota única, e `unidade: percentual` numa tabela de itens. As duas
  // precisam que alguém informe o valor sobre o qual o percentual incide,
  // a menos que ele saia de uma base do Município.
  const ehPercentual = base?.tipo === 'percentual' || base?.unidade === 'percentual';
  return !!ehPercentual && !base.sobreBase;
}

// Converte o número da tabela em reais, quando isso é possível sem perguntar
// nada. Devolve null quando falta a base — e falta é informação, não erro.
function emReais(base, valor) {
  if (!Number.isFinite(valor)) return null;
  if (base.unidade === 'reais') return valor;
  const id = baseFiscalDe(base);
  if (!id) return null;
  const unidade = valorDaBase(id);
  if (!unidade) return null;
  return base.unidade === 'ufm' ? valor * unidade : (valor / 100) * unidade;
}

// "por m²", "por dia", "por pista" — a unidade de quantidade vem do campo `por`
// do item ou, quando ele não existe, da própria descrição.
// O `` do fim não serve aqui: depois de "m²" não há fronteira de palavra,
// porque `²` não é caractere de palavra e a posição fica entre dois não-palavra.
// Foi o que fez "por m² de área" não casar. Troca-se por um lookahead que só
// recusa letra, e que ainda impede "dia" de casar dentro de "diagonal".
const POR_NA_FRASE=/\bpor\s+(m²|m³|m2|m3|metro linear|metro|km|dias?|mês|mes|ano|unidade|pista|quarto|cabeça|cabeca|peça|peca|apartamento|documento|talão|talao|livro|matrícula|matricula|lote|exercício|exercicio|evento|semana|milheiro)(?![a-zà-ÿ])/i;

function unidadeDeQuantidade(item) {
  if (item?.por) return item.por;
  const achado = POR_NA_FRASE.exec(item?.rotulo || '');
  return achado ? achado[1].replace(/^m2$/, 'm²').replace(/^m3$/, 'm³') : null;
}

function itemTemQuantidade(base) {
  return (base?.itens || []).some(i => unidadeDeQuantidade(i));
}

// "m² ou fração" traz duas informações num campo só: a unidade e a regra de
// arredondamento. A lei que cobra "por m² ou fração" manda subir para o
// inteiro seguinte — 12,3 m² pagam 13 —, e ignorar isso erra o valor para
// menos em quase toda medição real.
function unidadeEFracao(item) {
  const bruto = unidadeDeQuantidade(item);
  if (!bruto) return null;
  const fracao = /ou\s+fra[cç][aã]o/i.test(bruto);
  const unidade = bruto.replace(/\s*ou\s+fra[cç][aã]o\s*/i, '').trim() || 'unidade';
  return { unidade, fracao };
}

function quantidadeEfetiva(qtd, fracao) {
  if (!Number.isFinite(qtd) || qtd <= 0) return null;
  return fracao ? Math.ceil(qtd) : qtd;
}

// O valor de UMA unidade da linha, em reais. Devolve null quando falta a
// informação que só o caso concreto traz — e falta continua sendo informação,
// não erro: a célula diz o que falta em vez de mostrar um número inventado.
function linhaEmReais(base, item, informado) {
  const v = item?.valor;
  if (!Number.isFinite(v)) return null;
  if (precisaValorInformado(base)) {
    return Number.isFinite(informado) && informado > 0 ? (v / 100) * informado : null;
  }
  return emReais(base, v);
}


function chargesPublicadas(){return ((window.MUNICIPIO_COBRANCAS||{}).cobrancas||[]).map(c=>({...c}));}

function loadCharges(){
  let local=null;
  try{local=JSON.parse(localStorage.getItem(CHARGE_KEY)||'null')}catch{local=null}
  chargeDirty=!!(local&&Array.isArray(local.cobrancas));
  charges=chargeDirty?local.cobrancas.map(c=>({...c})):chargesPublicadas();
}

function saveCharges(){
  chargeDirty=true;
  try{localStorage.setItem(CHARGE_KEY,JSON.stringify({cobrancas:charges}))}catch{}
  renderCharges();
}

// Um fundamento só vale se a página existir mesmo no documento citado. É a
// mesma regra que a suíte aplica ao cadastro publicado, repetida aqui para que
// o erro apareça na hora da digitação, e não meses depois.
function fundamentoValido(f){
  const doc=corpus.documents.find(d=>d.id===f.doc);
  return !!(doc&&doc.pages.some(p=>p.page===Number(f.pagina)));
}

// --- alerta de vigência ---------------------------------------------------
// Cada cobrança aponta documento, artigo e página. Quando algum documento da
// biblioteca declara alterar aquele artigo, a cobrança está apoiada em texto que
// já mudou — e é a própria biblioteca que sabe disso, não uma anotação à mão.
// A declaração vive em fontes.json, no campo "altera", e chega aqui pelo corpus.

// Só conta como número de artigo o que vem depois de "art."; sem isso o "9" de
// "art. 92, § 9º" viraria um artigo 9 inexistente.
function artigosDe(texto){
  // A expressão nasce aqui dentro de propósito: com a marca /g, um objeto
  // compartilhado carrega lastIndex de uma chamada para a outra e passa a
  // procurar no meio da frase seguinte.
  const citado=/\barts?\.?\s*(\d{1,4})|\bartigos?\s+(\d{1,4})/gi;
  const achados=new Set();
  for(const m of String(texto||'').matchAll(citado))achados.add(Number(m[1]||m[2]));
  return achados;
}

// "121-174" é faixa fechada; "277-A" é um artigo só, com letra.
function cobreArtigo(declarado,numero){
  const faixa=/^(\d{1,4})-(\d{1,4})$/.exec(String(declarado));
  if(faixa)return numero>=Number(faixa[1])&&numero<=Number(faixa[2]);
  return Number(String(declarado).replace(/-[A-Za-z]+$/,''))===numero;
}

function alteracoesDe(f){
  const numeros=artigosDe(f.artigo);
  if(!numeros.size)return [];
  const fora=[];
  for(const doc of corpus.documents){
    for(const a of doc.altera||[]){
      if(a.doc!==f.doc)continue;
      const atingidos=[...numeros].filter(n=>(a.artigos||[]).some(d=>cobreArtigo(d,n)));
      if(atingidos.length)fora.push({por:doc,escopo:a.escopo,pagina:a.pagina,artigos:atingidos});
    }
  }
  return fora;
}

function vigenciaHtml(c){
  const vistos=new Map();
  for(const f of c.fundamento||[]){
    for(const a of alteracoesDe(f)){
      const chave=`${a.por.id}|${a.artigos.join(',')}`;
      if(!vistos.has(chave))vistos.set(chave,a);
    }
  }
  if(!vistos.size)return '';
  const linhas=[...vistos.values()].map(a=>{
    const arts=a.artigos.length===1?`o art. ${a.artigos[0]}`:`os arts. ${a.artigos.join(', ')}`;
    const alvo=`${a.por.citation} alterou ${arts}${a.escopo?` — ${a.escopo}`:''}`;
    return `<li>${escape(alvo)} <button class="source-button" type="button"`
      +` data-fee-doc="${escape(a.por.id)}" data-fee-page="${escape(String(a.pagina||1))}">Ver a lei que alterou</button></li>`;
  }).join('');
  return `<div class="charge-vigencia"><strong>Atenção à vigência.</strong> Esta cobrança se apoia em`
    +` dispositivo que outra lei da biblioteca já alterou. Confira a redação nova antes de lançar.`
    +`<ul>${linhas}</ul></div>`;
}

function baseTexto(base){
  if(!base)return '—';
  if(base.tipo==='reais')return `${money(base.valor||0)}${base.por?` por ${base.por}`:''}`;
  if(base.tipo==='ufm')return `${(base.valor||0).toLocaleString('pt-BR')} ${base.unidade||'UFM'}${base.por?` por ${base.por}`:''}`;
  if(base.tipo==='percentual')return `${(base.percentual||0).toLocaleString('pt-BR')}%${base.sobre?` sobre ${base.sobre}`:''}`;
  if(base.tipo==='formula')return base.descricao||'fórmula descrita na lei';
  if(base.tipo==='itens'){
    const n=(base.itens||[]).length,vals=(base.itens||[]).map(i=>i.valor).filter(Number.isFinite);
    if(!vals.length)return `${n} itens`;
    const un=base.unidade==='percentual'?'%':'';
    const fmt=v=>base.unidade==='reais'?money(v):`${v.toLocaleString('pt-BR')}${un}`;
    return `${n} itens — de ${fmt(Math.min(...vals))} a ${fmt(Math.max(...vals))}`;
  }
  if(base.tipo==='faixas'){
    const n=(base.faixas||[]).length;
    const un=base.unidade==='percentual'?'%':base.unidade==='ufm'?' UFM':'';
    const vals=(base.faixas||[[0,0]]).map(f=>f[1]);
    const fmt=v=>v===0?'isento':base.unidade==='reais'?money(v):`${v.toLocaleString('pt-BR')}${un}`;
    return `${n} faixas por ${base.medida||'medida'} — de ${fmt(Math.min(...vals))} a ${fmt(Math.max(...vals))}`;
  }
  return '—';
}

function faixasHtml(base){
  if(base?.tipo!=='faixas')return '';
  const un=base.unidade==='percentual'?'%':base.unidade==='ufm'?' UFM':'';
  const linhas=(base.faixas||[]).map((f,i,arr)=>{
    const de=i===0?0:(arr[i-1][0]+1);
    const ate=f[0]===null?null:f[0];
    const faixa=ate===null?`a partir de ${de.toLocaleString('pt-BR')}`:`${de.toLocaleString('pt-BR')} a ${ate.toLocaleString('pt-BR')}`;
    const valor=f[1]===0?'Isento':base.unidade==='reais'?money(f[1]):`${f[1].toLocaleString('pt-BR')}${un}`;
    return `<tr><td>${escape(faixa)}</td><td>${escape(valor)}</td></tr>`;
  }).join('');
  return `<table class="charge-tiers"><caption>${escape(base.medida||'medida')}</caption>`
    +`<thead><tr><th>Faixa</th><th>Valor</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

// --- a cobrança que aponta para uma tabela do fees.js ---------------------
// Vários municípios têm a tabela extraída no fees.js e a cobrança apenas
// descrevendo-a por escrito. Repetir os valores no cadastro criaria duas
// verdades. Em vez disso a cobrança traz `base.tabela` com o id da seção, e o
// cartão desenha a tabela de lá, com a mesma coluna em reais e a mesma
// calculadora das outras.
const LIMITE_LINHAS = 14;

function itensDaSecao(secaoId) {
  const s = (fees.sections || []).find(x => x.id === secaoId);
  if (!s) return null;
  const linhas = (s.current || []).filter(e => e.kind && e.kind !== 'heading');
  if (!linhas.length) return null;
  const valorDe = e => e.kind === 'ufm' ? e.ufm : e.kind === 'pct' ? e.valor : e.value;
  const kinds = new Set(linhas.map(e => e.kind));
  // uma seção mistura unidades muito raramente; quando mistura, não há uma
  // coluna em reais que sirva para todas, e o cartão fica só com a tabela
  const unidade = kinds.size > 1 ? null
    : kinds.has('ufm') ? 'ufm' : kinds.has('pct') ? 'percentual' : 'reais';
  return {
    titulo: s.title || s.short || secaoId,
    total: linhas.length,
    unidade,
    // `per` no fees.js é UNIDADE — "m²", "unidade" —, não prazo. Mandá-lo para
    // a coluna de periodicidade errava duas vezes: escrevia unidade onde vai
    // prazo, e negava à coluna de quantidade a unidade que ela precisa.
    // Nenhuma linha é cortada aqui: a tabela dobra as excedentes e oferece
    // abri-las. Cortar em silêncio some com valor que a lei fixou.
    itens: linhas.map(e => ({
      rotulo: e.label || '',
      valor: valorDe(e),
      por: e.per || null,
    })),
  };
}

// Monta uma base de itens equivalente à da cobrança, a partir da seção citada.
function baseDaTabela(base) {
  if (!base?.tabela) return null;
  const secao = itensDaSecao(base.tabela);
  if (!secao || !secao.unidade) return null;
  return {
    tipo: 'itens',
    unidade: secao.unidade,
    sobreBase: base.sobreBase || (secao.unidade === 'ufm' ? 'ufm' : null),
    // o `sobre` é da cobrança, não da seção: sem carregá-lo, a tabela ligada
    // pedia "Valor sobre o qual incide" sem dizer qual, mesmo com a cobrança
    // declarando — foi o caso do ISS de Manari
    sobre: base.sobre || null,
    itens: secao.itens,
    __secao: secao,
  };
}


// Uma linha da tabela. Vive fora de itensHtml porque o botão de abrir as
// excedentes precisa montar as demais depois, uma a uma: Tacaratu liga uma
// seção de 1.299 linhas, e desenhar tudo de saída trava um telefone barato.
function linhaDaTabela(base, i, n){
  const un=base.unidade==='percentual'?'%':base.unidade==='ufm'?' UFM':'';
  const fmt=v=>!Number.isFinite(v)?'—':v===0?'Isento':base.unidade==='reais'?money(v):`${v.toLocaleString('pt-BR')}${un}`;
  const uf=unidadeEFracao(i);
  const isento=i.valor===0;
  const unit=linhaEmReais(base,i,null);
  const convertido=!isento&&base.unidade!=='reais'&&Number.isFinite(unit)?money(unit):null;
  const rotuloQtd=uf?`Quantidade em ${uf.unidade}`:'Quantidade';
  return `<tr data-linha="${n}">`
    +`<td>${escape(i.rotulo||'')}</td>`
    +`<td class="charge-val">${escape(fmt(i.valor))}`
      +(uf?`<small> por ${escape(uf.unidade)}${uf.fracao?' ou fração':''}</small>`:'')
      +(convertido?`<small class="charge-reais">= ${convertido}</small>`:'')
    +`</td>`
    +`<td class="charge-qtd">`
      +(isento?'<span class="charge-nada">—</span>'
        :`<input type="number" min="0" step="0.01" inputmode="decimal" data-qtd="${n}"`
         +` placeholder="1" aria-label="${escape(rotuloQtd)}">`
         +(uf?`<small>${escape(uf.unidade)}</small>`:''))
    +`</td>`
    +`<td class="charge-total" data-total="${n}">${isento?'Isento':'—'}</td>`
    +`<td>${escape(i.periodicidade||'')}</td></tr>`;
}

function itensHtml(base, c){
  // a cobrança pode trazer os itens, ou apontar a seção do fees.js que os tem
  const daTabela=base?.tipo!=='itens'?baseDaTabela(base):null;
  if(daTabela)base=daTabela;
  if(base?.tipo!=='itens')return '';
  // A conversão em reais deixou de ser uma coluna própria: ela desce para
  // baixo do valor tabelado, e o lugar dela na tabela passa a ser o total,
  // que é o que se cobra. Quem atende no balcão precisa do total.
  const col=colunaReaisHtml(base);
  const cid=escape(c?.id||'');
  const itens=base.itens||[];
  const visiveis=itens.slice(0,LIMITE_LINHAS);
  const restam=itens.length-visiveis.length;

  // O campo de incidência vale para a tabela inteira: informa-se o valor venal
  // (ou o preço do serviço) uma vez, e todas as linhas passam a somar.
  const campoIncide=precisaValorInformado(base)
    ?`<label class="charge-incide">${escape(base.sobre?`Informe ${base.sobre}`:'Valor sobre o qual incide')} (R$)`
      +`<input type="number" min="0" step="0.01" inputmode="decimal" data-incide placeholder="0,00"></label>`
    :'';

  return campoIncide+`<table class="charge-tiers" data-tabela="${cid}">`
    +(col&&!col.pronta?`<caption class="charge-falta-base">${col.aviso}</caption>`:col?`<caption>${col.aviso}</caption>`:'')
    +`<thead><tr><th>Discriminação</th><th>Valor</th><th>Qtd.</th><th>Total</th><th>Periodicidade</th></tr></thead>`
    +`<tbody>${visiveis.map((i,n)=>linhaDaTabela(base,i,n)).join('')}</tbody>`
    +(restam>0
      ?`<tfoot><tr><td colspan="9"><button type="button" class="text-button" data-dobra>`
        +`ver as outras ${restam} linhas (${itens.length} ao todo)</button></td></tr></tfoot>`
      :'')
    +`</table>`;
}

// --- o total de cada linha ------------------------------------------------
// Liga os campos de quantidade da tabela de uma cobrança. Não passa por
// renderCharges: recalcular a página inteira a cada tecla apagaria o que a
// pessoa acabou de digitar nas outras linhas.
function ligarLinhas(c, raiz){
  const card=raiz.querySelector(`[data-charge-card="${CSS.escape(c.id)}"]`);
  if(!card)return;
  let base=c.base?.tipo!=='itens'?(baseDaTabela(c.base)||c.base):c.base;
  if(base?.tipo!=='itens')return;
  const incide=card.querySelector('[data-incide]');
  const itens=base.itens||[];

  const numero=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:null};

  const atualizar=()=>{
    const informado=numero(incide?.value);
    card.querySelectorAll('[data-qtd]').forEach(inp=>{
      const n=Number(inp.dataset.qtd), item=itens[n];
      const cel=card.querySelector(`[data-total="${n}"]`);
      if(!cel||!item)return;
      const uf=unidadeEFracao(item);
      const unit=linhaEmReais(base,item,informado);
      if(unit===null){
        cel.innerHTML=precisaValorInformado(base)
          ?`<small>informe o valor acima</small>`
          :`<small>informe a unidade</small>`;
        return;
      }
      const bruto=numero(inp.value);
      const qtd=quantidadeEfetiva(bruto,uf?.fracao);
      const usada=qtd??1;
      const total=unit*usada;
      // quando "ou fração" arredonda, dizer o que foi cobrado a mais evita a
      // pergunta seguinte no balcão
      const subiu=qtd!==null&&uf?.fracao&&bruto!==qtd
        ?`<small>${bruto.toLocaleString('pt-BR')} → ${qtd.toLocaleString('pt-BR')} ${escape(uf.unidade)}</small>`:'';
      cel.innerHTML=`<b>${money(total)}</b>${subiu}`;
      cel.classList.toggle('charge-total-cheio',qtd!==null);
    });
  };

  card.querySelectorAll('[data-qtd],[data-incide]').forEach(i=>{i.oninput=atualizar});

  // As linhas além do limite nascem no clique, não na abertura do cartão: elas
  // só existem depois que alguém pediu. Uma vez montadas, ficam.
  const dobra=card.querySelector('[data-dobra]');
  if(dobra)dobra.onclick=()=>{
    const corpo=card.querySelector('.charge-tiers tbody');
    if(corpo.children.length<itens.length){
      corpo.insertAdjacentHTML('beforeend',
        itens.slice(LIMITE_LINHAS).map((i,k)=>linhaDaTabela(base,i,LIMITE_LINHAS+k)).join(''));
      corpo.querySelectorAll('[data-qtd]').forEach(i=>{i.oninput=atualizar});
      dobra.textContent=`mostrar só as primeiras ${LIMITE_LINHAS} (${itens.length} ao todo)`;
      atualizar();
      return;
    }
    const extras=[...corpo.children].slice(LIMITE_LINHAS);
    const abrindo=extras[0]?.hidden;
    extras.forEach(tr=>{tr.hidden=!abrindo});
    dobra.textContent=abrindo
      ? `mostrar só as primeiras ${LIMITE_LINHAS} (${itens.length} ao todo)`
      : `ver as outras ${itens.length-LIMITE_LINHAS} linhas (${itens.length} ao todo)`;
  };
  atualizar();
}

// --- painel das outras bases fiscais --------------------------------------
// A UFM já tinha o seu. Municípios que usam mais de uma unidade — Manari usa
// Valor de Referência, Valor de Referência Fiscal e UFM ao mesmo tempo —
// ganham um campo para cada, ao lado.
function renderBasesExtras() {
  const caixa = $('#basesExtra');
  if (!caixa) return;
  const lista = basesDeclaradas();
  if (!lista.length) { caixa.hidden = true; return; }
  caixa.hidden = false;
  caixa.innerHTML = `<p class="eyebrow">Outras unidades deste Município</p>` + lista.map(b => {
    const v = valorDaBase(b.id);
    return `<div class="base-linha">
      <label for="base-${escape(b.id)}">${escape(b.rotulo || b.sigla || b.id)}${b.sigla ? ` (${escape(b.sigla)})` : ''}</label>
      <div class="fee-input"><span class="fee-prefix">R$</span>
        <input id="base-${escape(b.id)}" data-base-id="${escape(b.id)}" type="number" min="0.0001" step="0.0001"
               inputmode="decimal" placeholder="0,0000" value="${v ?? ''}"></div>
      ${b.nota ? `<small>${escape(b.nota)}</small>` : ''}
    </div>`;
  }).join('');
  caixa.querySelectorAll('[data-base-id]').forEach(inp => {
    inp.onchange = () => {
      const v = Number(String(inp.value).replace(',', '.'));
      if (Number.isFinite(v) && v > 0) salvarBase(inp.dataset.baseId, v, null);
      else { delete basesFiscais[inp.dataset.baseId]; try { localStorage.setItem(BASES_KEY, JSON.stringify(basesFiscais)); } catch {} }
      renderCharges();
    };
  });
}

// --- a coluna em reais ----------------------------------------------------
function colunaReaisHtml(base) {
  const id = baseFiscalDe(base);
  if (base.unidade === 'reais') return null;          // já está em reais
  if (!id) return null;                                // depende do caso concreto
  const unidade = valorDaBase(id);
  const decl = baseDeclarada(id);
  return {
    titulo: 'Em reais',
    pronta: !!unidade,
    aviso: unidade
      ? `com ${escape(decl?.sigla || id.toUpperCase())} de ${money(unidade)}`
      : `informe ${escape(decl?.rotulo || id.toUpperCase())} acima para ver em reais`,
  };
}

// --- calculadora de uma cobrança -----------------------------------------
// Uma por cartão, e não uma por linha: tabela de 27 itens com 27 campos vira
// ruído. Escolhe-se o item, informa-se o que falta, e sai o valor.
function calculadoraHtml(c) {
  const base = baseDaTabela(c.base) || c.base;
  if (!base || !['itens', 'faixas', 'reais', 'ufm', 'percentual'].includes(base.tipo)) return '';
  // Onde há tabela de itens, cada linha agora tem o seu campo de quantidade e
  // o seu total. Uma segunda calculadora escondida atrás de um "Calcular o
  // valor" só repetiria, pior, o que a linha já faz.
  if (base.tipo === 'itens') return '';
  const itens = [];
  const precisaValor = precisaValorInformado(base);
  const temQtd = base.tipo === 'itens' ? itemTemQuantidade(base) : false;
  const id = baseFiscalDe(base);
  const unidade = id ? valorDaBase(id) : null;
  // sem item para escolher, sem quantidade e sem valor a informar não há o que
  // calcular — a tabela já mostra tudo
  if (!itens.length && !precisaValor && !['faixas','ufm','reais'].includes(base.tipo)) return '';

  const opcoes = itens.map((i, n) => `<option value="${n}">${escape(i.rotulo || `item ${n + 1}`)}</option>`).join('');
  const faixaOpc = base.tipo === 'faixas'
    ? `<label>Quantidade em ${escape(base.medida || 'medida')}<input type="number" min="0" step="0.01" inputmode="decimal" data-calc="medida" placeholder="0"></label>`
    : '';
  return `<details class="charge-calc" data-calc-id="${escape(c.id)}">
    <summary>Calcular o valor</summary>
    <div class="charge-calc-campos">
      ${itens.length ? `<label>Item<select data-calc="item">${opcoes}</select></label>` : ''}
      ${faixaOpc}
      ${precisaValor ? `<label>${escape(base.sobre ? `Informe ${base.sobre}` : 'Valor sobre o qual incide')} (R$)
        <input type="number" min="0" step="0.01" inputmode="decimal" data-calc="valorBase" placeholder="0,00"></label>` : ''}
      ${temQtd ? `<label data-calc-qtd hidden>Quantidade<input type="number" min="0" step="0.01" inputmode="decimal" data-calc="qtd" placeholder="1"></label>` : ''}
    </div>
    <p class="charge-calc-saida" data-calc="saida" aria-live="polite"></p>
    ${id && !unidade ? `<p class="charge-calc-falta">Informe ${escape(baseDeclarada(id)?.rotulo || id.toUpperCase())} no painel de unidade, acima, para o cálculo sair em reais.</p>` : ''}
  </details>`;
}

function ligarCalculadora(c, raiz) {
  const el = raiz.querySelector(`[data-calc-id="${CSS.escape(c.id)}"]`);
  if (!el) return;
  const campo = k => el.querySelector(`[data-calc="${k}"]`);
  const saida = campo('saida');
  const base = baseDaTabela(c.base) || c.base;

  const recalcular = () => {
    const itens = base.itens || [];
    const item = campo('item') ? itens[Number(campo('item').value)] : null;
    const rotuloQtd = el.querySelector('[data-calc-qtd]');
    const un = item ? unidadeDeQuantidade(item) : (base.tipo === 'faixas' ? base.medida : null);
    if (rotuloQtd) {
      rotuloQtd.hidden = !un;
      if (un) rotuloQtd.firstChild.textContent = `Quantidade em ${un}`;
    }

    let valor = item ? item.valor : base.valor ?? base.percentual;
    if (base.tipo === 'faixas') {
      const medida = Number(campo('medida')?.value || 0);
      const faixa = (base.faixas || []).find(([teto]) => teto === null || medida <= teto);
      valor = faixa ? faixa[1] : null;
    }
    if (!Number.isFinite(valor)) { saida.textContent = ''; return; }

    let reais = emReais(base, valor);
    if (precisaValorInformado(base)) {
      const informado = Number(String(campo('valorBase')?.value || '').replace(',', '.'));
      reais = Number.isFinite(informado) && informado > 0 ? (valor / 100) * informado : null;
    }
    if (reais === null) {
      const id = baseFiscalDe(base);
      saida.innerHTML = id
        ? `<b>${escape(String(valor).replace('.', ','))}${base.unidade === 'ufm' ? ' UFM' : '%'}</b> — falta a unidade para converter.`
        : `<b>${escape(String(valor).replace('.', ','))}%</b> — informe o valor sobre o qual incide.`;
      return;
    }

    const qtd = un ? Number(String(campo('qtd')?.value || '').replace(',', '.')) : null;
    const vezes = un && Number.isFinite(qtd) && qtd > 0 ? qtd : null;
    const total = vezes ? reais * vezes : reais;
    const detalhe = vezes
      ? `${money(reais)} por ${escape(un)} × ${vezes.toLocaleString('pt-BR')} ${escape(un)}`
      : (un ? `por ${escape(un)} — informe a quantidade para o total` : '');
    saida.innerHTML = `<b>${money(total)}</b>${detalhe ? ` <small>${detalhe}</small>` : ''}`
      + (c.periodicidade ? ` <small>· ${escape(c.periodicidade)}</small>` : '');
  };

  el.querySelectorAll('select,input').forEach(i => { i.oninput = recalcular; i.onchange = recalcular; });
  recalcular();
}


function fundamentoHtml(c){
  return (c.fundamento||[]).map(f=>{
    const doc=corpus.documents.find(d=>d.id===f.doc);
    const ok=fundamentoValido(f);
    const rotulo=`${doc?doc.citation:f.doc}${f.artigo?` — ${f.artigo}`:''}, p. ${f.pagina}`;
    return ok
      ? `<button class="source-button" type="button" data-fee-doc="${escape(f.doc)}" data-fee-page="${escape(String(f.pagina))}">Ver fundamento: ${escape(rotulo)}</button>`
      : `<span class="charge-broken">Fundamento não confere: ${escape(rotulo)}</span>`;
  }).join('');
}

function renderCharges(){
  const secao=$('#chargesSection');
  if(!secao)return;
  // A seção aparece mesmo vazia: um município que ainda não cadastrou nada é
  // exatamente quem precisa encontrar o botão de cadastrar.
  secao.hidden=false;

  const tributos=[...new Set(charges.map(c=>c.tributo).filter(Boolean))].sort();
  $('#chargeFilters').innerHTML=[['todos','Todos'],...tributos.map(t=>[t,t])]
    .map(([id,rot])=>`<button class="chip ${id===chargeFilter?'active':''}" data-charge-filter="${escape(id)}">${escape(rot)}</button>`).join('');
  document.querySelectorAll('[data-charge-filter]').forEach(b=>b.onclick=()=>{chargeFilter=b.dataset.chargeFilter;renderCharges()});

  const termos=termsFor($('#chargeQuery')?.value||'');
  const lista=charges.filter(c=>{
    if(chargeFilter!=='todos'&&c.tributo!==chargeFilter)return false;
    if(!termos.length)return true;
    const hay=normalize([c.rotulo,c.tributo,c.fatoGerador,c.sujeitoPassivo,c.vencimento,c.nota].filter(Boolean).join(' '));
    return termos.every(t=>hasWord(hay,t));
  });

  $('#chargeSummary').textContent=`${charges.length} cobrança${charges.length===1?'':'s'} cadastrada${charges.length===1?'':'s'}`
    +(lista.length!==charges.length?` · ${lista.length} no filtro`:'');

  $('#chargeList').innerHTML=lista.length?lista.map(c=>`
    <article class="charge-card" data-charge-card="${escape(c.id)}">
      <header>
        <div><span class="charge-tributo">${escape(c.tributo||'—')}</span><h3>${escape(c.rotulo||'(sem rótulo)')}</h3></div>
        <span class="charge-conf charge-conf-${escape(c.conferencia||'informado')}">${escape(CHARGE_CONF[c.conferencia]||CHARGE_CONF.informado)}</span>
      </header>
      <p class="charge-base-line"><b>${escape(baseTexto(c.base))}</b>${c.periodicidade?` · ${escape(c.periodicidade)}`:''}</p>
      ${faixasHtml(c.base)}
      ${itensHtml(c.base, c)}
      ${calculadoraHtml(c)}
      ${c.base?.sobre?`<p class="charge-sobre">Incide sobre: ${escape(c.base.sobre)}</p>`:''}
      <dl class="charge-meta">
        ${c.fatoGerador?`<dt>Fato gerador</dt><dd>${escape(c.fatoGerador)}</dd>`:''}
        ${c.sujeitoPassivo?`<dt>Quem paga</dt><dd>${escape(c.sujeitoPassivo)}</dd>`:''}
        ${c.vencimento?`<dt>Quando</dt><dd>${escape(c.vencimento)}</dd>`:''}
      </dl>
      ${vigenciaHtml(c)}
      <div class="charge-sources">${fundamentoHtml(c)}</div>
      ${c.nota?`<p class="charge-note">${escape(c.nota)}</p>`:''}
      <button class="text-button" type="button" data-charge-edit="${escape(c.id)}">Editar</button>
    </article>`).join('')
    :charges.length
      ?'<p class="empty">Nenhuma cobrança encontrada com esse filtro.</p>'
      :'<p class="empty">Nenhuma cobrança cadastrada ainda. Comece por uma que você já explica com frequência — o cadastro vai pedir o dispositivo que a sustenta.</p>';

  lista.forEach(c=>{ligarLinhas(c,$('#chargeList'));ligarCalculadora(c,$('#chargeList'))});
  document.querySelectorAll('[data-charge-edit]').forEach(b=>b.onclick=()=>openChargeForm(b.dataset.chargeEdit));
  document.querySelectorAll('#chargeList [data-fee-page]').forEach(b=>b.onclick=()=>
    openCtmPage(+b.dataset.feePage,termos.length?termos:['taxa','valor'],b.dataset.feeDoc));

  const nota=$('#chargeLocalNote');
  nota.hidden=!chargeDirty;
  nota.className='ufm-status ufm-status-set';
  nota.textContent='Há alterações suas guardadas neste aparelho, ainda não enviadas. Use “Exportar cadastro” para mandá-las a quem mantém o aplicativo.';
  $('#chargeReset').hidden=!chargeDirty;
}

// --- formulário ------------------------------------------------------------
function baseCamposHtml(tipo,base){
  const b=base||{};
  const campo=(id,rot,val,ph,tipoInput)=>`<label for="${id}">${rot}</label><input id="${id}" ${tipoInput||''} value="${escape(String(val??''))}" placeholder="${escape(ph||'')}">`;
  if(tipo==='reais')return campo('cfValor','Valor em reais',b.valor,'0,00','type="number" step="0.01" min="0"')+campo('cfPor','Por',b.por,'imóvel/ano, unidade, m²…');
  if(tipo==='ufm')return campo('cfValor','Quantidade',b.valor,'0','type="number" step="0.0001" min="0"')
    +campo('cfUnidade','Unidade',b.unidade||'UFM','UFM, VR…')+campo('cfPor','Por',b.por,'unidade, ano…');
  if(tipo==='percentual')return campo('cfPercentual','Percentual (%)',b.percentual,'0,00','type="number" step="0.01" min="0"')
    +campo('cfSobre','Incide sobre',b.sobre,'o preço do serviço, a tarifa B4a da ANEEL…');
  if(tipo==='formula')return `<label for="cfDescricao">Como se calcula</label><textarea id="cfDescricao" rows="3" placeholder="R$ 1.160,00 mais R$ 0,35 por m² acrescido…">${escape(b.descricao||'')}</textarea>`;
  if(tipo==='itens'){
    const linhas=(b.itens||[]).map(i=>[i.rotulo,i.valor,i.por||'',i.periodicidade||''].join('\t')).join('\n');
    return `<label for="cfUnidadeItens">Unidade do valor</label>`
      +`<select id="cfUnidadeItens">${['reais','percentual','ufm'].map(u=>`<option value="${u}" ${b.unidade===u?'selected':''}>${CHARGE_BASES[u]}</option>`).join('')}</select>`
      +`<label for="cfItens">Itens — um por linha: <b>discriminação</b>, <b>valor</b>, <b>por</b> e <b>periodicidade</b>, separados por tabulação. Os dois últimos são opcionais.</label>`
      +`<textarea id="cfItens" rows="10" placeholder="Faixas, por unidade&#9;8,00&#9;unidade&#9;Semanal">${escape(linhas)}</textarea>`;
  }
  if(tipo==='faixas'){
    const linhas=(b.faixas||[]).map(f=>`${f[0]===null?'':f[0]}\t${f[1]}`).join('\n');
    return `<label for="cfUnidadeFaixa">Unidade do valor</label>`
      +`<select id="cfUnidadeFaixa">${['percentual','reais','ufm'].map(u=>`<option value="${u}" ${b.unidade===u?'selected':''}>${CHARGE_BASES[u]}</option>`).join('')}</select>`
      +campo('cfMedida','Medida das faixas',b.medida,'kWh/mês, m², pavimentos…')
      +campo('cfSobre','Incide sobre (se for percentual)',b.sobre,'a tarifa B4a da ANEEL…')
      +`<label for="cfFaixas">Faixas — uma por linha: <b>teto</b> e <b>valor</b>, separados por tabulação ou ponto e vírgula. Deixe o teto vazio na última, que é aberta.</label>`
      +`<textarea id="cfFaixas" rows="8" placeholder="30&#9;0,80&#10;50&#9;1,34&#10;&#9;29,99">${escape(linhas)}</textarea>`;
  }
  return '';
}

function lerFaixas(texto){
  const faixas=[];
  for(const linha of (texto||'').split('\n')){
    if(!linha.trim())continue;
    const partes=linha.split(/[\t;]/).map(p=>p.trim());
    if(partes.length<2)throw new Error(`A linha “${linha.trim()}” não tem teto e valor separados.`);
    const teto=partes[0]===''?null:Number(partes[0].replace(/\./g,'').replace(',','.'));
    const valor=Number(partes[1].replace(/\./g,'').replace(',','.'));
    if(teto!==null&&!Number.isFinite(teto))throw new Error(`Teto inválido em “${linha.trim()}”.`);
    if(!Number.isFinite(valor)||valor<0)throw new Error(`Valor inválido em “${linha.trim()}”. Use 0 para isento.`);
    faixas.push([teto,valor]);
  }
  if(!faixas.length)throw new Error('Informe ao menos uma faixa.');
  const tetos=faixas.map(f=>f[0]);
  if(tetos.slice(0,-1).some(t=>t===null))throw new Error('Só a última faixa pode ficar com o teto vazio.');
  const fechados=tetos.slice(0,-1);
  if(fechados.some((t,i)=>i&&t<=fechados[i-1]))throw new Error('Os tetos precisam subir, do menor para o maior.');
  return faixas;
}

function lerItens(texto){
  const itens=[];
  for(const linha of (texto||'').split('\n')){
    if(!linha.trim())continue;
    const [rotulo,valor,por,periodicidade]=linha.split('\t').map(p=>(p||'').trim());
    if(!rotulo)throw new Error(`A linha “${linha.trim()}” está sem discriminação.`);
    const n=Number((valor||'').replace(/\./g,'').replace(',','.'));
    if(!Number.isFinite(n)||n<0)throw new Error(`Valor inválido em “${rotulo}”.`);
    itens.push({rotulo,valor:n,...(por?{por}:{}),...(periodicidade?{periodicidade}:{})});
  }
  if(!itens.length)throw new Error('Informe ao menos um item.');
  return itens;
}

function fundamentoLinhaHtml(f,i){
  const opcoes=corpus.documents.map(d=>`<option value="${escape(d.id)}" ${f.doc===d.id?'selected':''}>${escape(d.title)}</option>`).join('');
  return `<div class="charge-fund" data-fund="${i}">
    <select data-fund-doc>${opcoes}</select>
    <input data-fund-pagina type="number" min="1" placeholder="página" value="${escape(String(f.pagina??''))}">
    <input data-fund-artigo placeholder="art. 313, § 5º" value="${escape(f.artigo||'')}">
    <button class="text-button" type="button" data-fund-remove>remover</button>
  </div>`;
}

function renderFundamentos(lista){
  $('#cfFundamentos').innerHTML=(lista.length?lista:[{doc:corpus.documents[0]?.id,pagina:'',artigo:''}])
    .map(fundamentoLinhaHtml).join('');
  document.querySelectorAll('[data-fund-remove]').forEach(b=>b.onclick=()=>{
    const linhas=lerFundamentosDoForm();
    linhas.splice(+b.closest('[data-fund]').dataset.fund,1);
    renderFundamentos(linhas);
  });
}

function lerFundamentosDoForm(){
  return [...document.querySelectorAll('#cfFundamentos [data-fund]')].map(el=>({
    doc:el.querySelector('[data-fund-doc]').value,
    pagina:el.querySelector('[data-fund-pagina]').value,
    artigo:el.querySelector('[data-fund-artigo]').value.trim(),
  }));
}

function openChargeForm(id){
  chargeEditing=id?charges.find(c=>c.id===id)||null:null;
  const c=chargeEditing||{};
  $('#chargeFormTitle').textContent=chargeEditing?'Editar cobrança':'Cadastrar cobrança';
  $('#cfRotulo').value=c.rotulo||'';
  $('#cfTributo').value=c.tributo||'';
  $('#cfTributos').innerHTML=[...new Set(charges.map(x=>x.tributo).filter(Boolean))]
    .map(t=>`<option value="${escape(t)}">`).join('');
  $('#cfFato').value=c.fatoGerador||'';
  $('#cfSujeito').value=c.sujeitoPassivo||'';
  $('#cfBaseTipo').value=c.base?.tipo||'reais';
  $('#cfBaseCampos').innerHTML=baseCamposHtml($('#cfBaseTipo').value,c.base);
  $('#cfPeriodicidade').value=c.periodicidade||'anual';
  $('#cfVencimento').value=c.vencimento||'';
  $('#cfConferencia').value=c.conferencia||'informado';
  $('#cfNota').value=c.nota||'';
  $('#cfErro').hidden=true;
  $('#cfDelete').hidden=!chargeEditing;
  renderFundamentos(c.fundamento||[]);
  $('#chargeForm').showModal();
}

function coletarBase(){
  const tipo=$('#cfBaseTipo').value,v=id=>$(`#${id}`)?.value.trim()||'';
  const num=id=>Number(v(id).replace(/\./g,'').replace(',','.'));
  if(tipo==='reais'){const valor=num('cfValor');if(!Number.isFinite(valor)||valor<0)throw new Error('Informe o valor em reais.');return{tipo,valor,por:v('cfPor')||undefined}}
  if(tipo==='ufm'){const valor=num('cfValor');if(!Number.isFinite(valor)||valor<=0)throw new Error('Informe a quantidade.');return{tipo,valor,unidade:v('cfUnidade')||'UFM',por:v('cfPor')||undefined}}
  if(tipo==='percentual'){const p=num('cfPercentual');if(!Number.isFinite(p)||p<=0)throw new Error('Informe o percentual.');return{tipo,percentual:p,sobre:v('cfSobre')||undefined}}
  if(tipo==='formula'){const d=v('cfDescricao');if(!d)throw new Error('Descreva como se calcula.');return{tipo,descricao:d}}
  if(tipo==='itens')return{tipo,unidade:v('cfUnidadeItens')||'reais',itens:lerItens($('#cfItens').value)};
  if(tipo==='faixas')return{tipo,unidade:v('cfUnidadeFaixa')||'percentual',medida:v('cfMedida')||undefined,sobre:v('cfSobre')||undefined,faixas:lerFaixas($('#cfFaixas').value)};
  throw new Error('Forma de cálculo desconhecida.');
}

function salvarCobranca(){
  const erro=$('#cfErro');
  try{
    const rotulo=$('#cfRotulo').value.trim(),tributo=$('#cfTributo').value.trim();
    if(!rotulo)throw new Error('Diga o que se cobra.');
    if(!tributo)throw new Error('Informe o tributo.');
    const fundamento=lerFundamentosDoForm().filter(f=>f.doc&&String(f.pagina).trim());
    if(!fundamento.length)throw new Error('Aponte ao menos um dispositivo. Sem fundamento a cobrança não grava.');
    for(const f of fundamento){
      if(!fundamentoValido(f)){
        const doc=corpus.documents.find(d=>d.id===f.doc);
        throw new Error(`A página ${f.pagina} não existe em “${doc?doc.title:f.doc}”, que tem ${doc?doc.pageCount:0} páginas.`);
      }
    }
    const base=coletarBase();
    // valor em unidade fiscal nunca guarda reais junto: é a regra do projeto,
    // e é o que impede a conversão de um exercício vazar para outro.
    if(base.tipo==='ufm'&&'value'in base)delete base.value;
    const id=chargeEditing?chargeEditing.id
      :`${normalize(tributo)}-${normalize(rotulo)}`.replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||`cobranca-${charges.length+1}`;
    const registro={
      id,tributo,rotulo,
      fatoGerador:$('#cfFato').value.trim(),
      sujeitoPassivo:$('#cfSujeito').value.trim(),
      base,
      periodicidade:$('#cfPeriodicidade').value,
      vencimento:$('#cfVencimento').value.trim(),
      fundamento:fundamento.map(f=>({doc:f.doc,pagina:Number(f.pagina),...(f.artigo?{artigo:f.artigo}:{})})),
      conferencia:$('#cfConferencia').value,
      nota:$('#cfNota').value.trim(),
    };
    const i=charges.findIndex(c=>c.id===id);
    if(i>=0)charges[i]=registro;else charges.push(registro);
    saveCharges();
    erro.hidden=true;erro.textContent='';
    $('#chargeForm').close();
  }catch(e){erro.hidden=false;erro.textContent=e.message}
}

function exportarCobrancas(){
  const payload={
    sobre:(window.MUNICIPIO_COBRANCAS||{}).sobre
      ||'Cadastro de cobranças do município. Cada entrada aponta o dispositivo que a sustenta.',
    atualizado:new Date().toISOString().slice(0,10),
    cobrancas:charges,
  };
  const texto=JSON.stringify(payload,null,2);
  $('#chargeExportText').value=texto;
  $('#chargeExportDlg').showModal();
  $('#chargeDownload').onclick=()=>{
    const url=URL.createObjectURL(new Blob([texto],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`cobrancas-${cfg.slug||'municipio'}.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('#chargeCopy').onclick=async()=>{
    try{await navigator.clipboard.writeText(texto);$('#chargeCopy').textContent='Copiado'}
    catch{$('#chargeExportText').select();$('#chargeCopy').textContent='Selecionado — use Ctrl+C'}
    setTimeout(()=>{$('#chargeCopy').textContent='Copiar texto'},2500);
  };
}

function setupCharges(){
  loadBases();renderBasesExtras();
  if(!$('#chargesSection'))return;
  loadCharges();
  renderCharges();
  $('#chargeQuery').addEventListener('input',renderCharges);
  $('#chargeNew').onclick=()=>openChargeForm(null);
  $('#chargeExport').onclick=exportarCobrancas;
  $('#chargeReset').onclick=()=>{
    try{localStorage.removeItem(CHARGE_KEY)}catch{}
    loadCharges();renderCharges();
  };
  $('#chargeFormClose').onclick=()=>$('#chargeForm').close();
  $('#chargeExportClose').onclick=()=>$('#chargeExportDlg').close();
  $('#cfSave').onclick=salvarCobranca;
  $('#cfDelete').onclick=()=>{
    if(!chargeEditing)return;
    charges=charges.filter(c=>c.id!==chargeEditing.id);
    saveCharges();$('#chargeForm').close();
  };
  $('#cfBaseTipo').addEventListener('change',()=>{
    $('#cfBaseCampos').innerHTML=baseCamposHtml($('#cfBaseTipo').value,null);
  });
  $('#cfAddFundamento').onclick=()=>renderFundamentos([...lerFundamentosDoForm(),{doc:corpus.documents[0]?.id,pagina:'',artigo:''}]);
}

async function init(){
  renderAvisos();renderAudiences();renderTrails();renderGlossary();
  if(window.MUNICIPIO_LAWS){corpus=window.MUNICIPIO_LAWS;buildLexicon();renderLibrary();setupUfm();setupFeeCards();setupFeeConsultation();setupCharges();}
  else $('#library').innerHTML='<p class="empty">A base legal não pôde ser carregada. Reabra o aplicativo ou reinstale o pacote.</p>';
  if(window.MUNICIPIO_FEES){fees=window.MUNICIPIO_FEES;buildFeeIndex();setupFeeFinder();
    // as cobranças desenham antes das taxas carregarem; quem aponta para uma
    // seção do fees.js só consegue montar a tabela agora
    if(charges.length)renderCharges();}
  else $('#feeCount').textContent='A tabela de taxas não pôde ser carregada.';
  $('#query').addEventListener('keydown',event=>{if(event.key==='Enter')search(event.target.value)});
  $('#clear').onclick=()=>{$('#query').value='';$('#resultsSection').hidden=true;$('#inicio').scrollIntoView({behavior:'smooth'});};
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;$('#install').hidden=false});
  $('#install').onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#install').hidden=true}};
  $('#readerDecrease').onclick=()=>{readerScale=Math.max(.75,readerScale-.125);renderReader()};
  $('#readerIncrease').onclick=()=>{readerScale=Math.min(2,readerScale+.125);renderReader()};
  $('#readerReset').onclick=()=>{readerScale=1;renderReader()};
  $('#readerMode').onclick=()=>{readerFacilitated=!readerFacilitated;renderReader()};
  if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js');
}
init();
