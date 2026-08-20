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
function applyUfm(){renderUfmStatus();renderCards();if(feeIndex.length)renderFeeResults();}
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

function feeCalculator(entry,index){
  if(entry.kind!=='formula')return '';
  const unit=escape(entry.unit||'unidade');
  return `<div class="fee-calc"><label for="feeCalc${index}">Calcular para</label><div class="fee-input"><input id="feeCalc${index}" type="number" min="0.01" step="0.01" inputmode="decimal" data-fee-calc="${index}" placeholder="0"><span>${unit}</span></div><output id="feeCalcOut${index}" class="fee-calc-out">—</output></div>`;
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

function itensHtml(base){
  if(base?.tipo!=='itens')return '';
  const un=base.unidade==='percentual'?'%':'';
  const fmt=v=>!Number.isFinite(v)?'—':v===0?'Isento':base.unidade==='reais'?money(v):`${v.toLocaleString('pt-BR')}${un}`;
  const linhas=(base.itens||[]).map(i=>
    `<tr><td>${escape(i.rotulo||'')}</td><td>${escape(fmt(i.valor))}${i.por?`<small> por ${escape(i.por)}</small>`:''}</td>`
    +`<td>${escape(i.periodicidade||'')}</td></tr>`).join('');
  return `<table class="charge-tiers"><thead><tr><th>Discriminação</th><th>Valor</th><th>Periodicidade</th></tr></thead>`
    +`<tbody>${linhas}</tbody></table>`;
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
    <article class="charge-card">
      <header>
        <div><span class="charge-tributo">${escape(c.tributo||'—')}</span><h3>${escape(c.rotulo||'(sem rótulo)')}</h3></div>
        <span class="charge-conf charge-conf-${escape(c.conferencia||'informado')}">${escape(CHARGE_CONF[c.conferencia]||CHARGE_CONF.informado)}</span>
      </header>
      <p class="charge-base-line"><b>${escape(baseTexto(c.base))}</b>${c.periodicidade?` · ${escape(c.periodicidade)}`:''}</p>
      ${faixasHtml(c.base)}
      ${itensHtml(c.base)}
      ${c.base?.sobre?`<p class="charge-sobre">Incide sobre: ${escape(c.base.sobre)}</p>`:''}
      <dl class="charge-meta">
        ${c.fatoGerador?`<dt>Fato gerador</dt><dd>${escape(c.fatoGerador)}</dd>`:''}
        ${c.sujeitoPassivo?`<dt>Quem paga</dt><dd>${escape(c.sujeitoPassivo)}</dd>`:''}
        ${c.vencimento?`<dt>Quando</dt><dd>${escape(c.vencimento)}</dd>`:''}
      </dl>
      <div class="charge-sources">${fundamentoHtml(c)}</div>
      ${c.nota?`<p class="charge-note">${escape(c.nota)}</p>`:''}
      <button class="text-button" type="button" data-charge-edit="${escape(c.id)}">Editar</button>
    </article>`).join('')
    :charges.length
      ?'<p class="empty">Nenhuma cobrança encontrada com esse filtro.</p>'
      :'<p class="empty">Nenhuma cobrança cadastrada ainda. Comece por uma que você já explica com frequência — o cadastro vai pedir o dispositivo que a sustenta.</p>';

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
  if(window.MUNICIPIO_FEES){fees=window.MUNICIPIO_FEES;buildFeeIndex();setupFeeFinder();}
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
