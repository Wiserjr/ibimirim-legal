const {audiences,trails,glossary}=window.IBIMIRIM_CONTENT;
const $=selector=>document.querySelector(selector);
let corpus={documents:[]},profile='todos',installPrompt,readerPage=null,readerTerms=[],readerScale=1,readerFacilitated=true;
const lexicon=new Map();

const STOP=new Set('a o as os de da do das dos e em no na nos nas para por com sem que qual quais quem como quando onde quanto tem ter um uma ao aos sua seu suas seus sobre seria pode posso direito dever'.split(' '));
const normalize=value=>(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const escape=value=>(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const termsFor=value=>[...new Set(normalize(value).split(/[^a-z0-9]+/).filter(word=>word.length>2&&!STOP.has(word)))];
const regexEscape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const accentPattern=value=>regexEscape(value).replace(/a/g,'[aáàãâä]').replace(/e/g,'[eéèêë]').replace(/i/g,'[iíìîï]').replace(/o/g,'[oóòõôö]').replace(/u/g,'[uúùûü]').replace(/c/g,'[cç]');

function highlight(text,terms){
  if(!terms.length)return escape(text);
  const pattern=new RegExp(`(${terms.sort((a,b)=>b.length-a.length).map(accentPattern).join('|')})`,'giu');
  return escape(text).replace(pattern,'<mark class="mark">$1</mark>');
}

function snippet(text,terms){
  const low=normalize(text);
  let pos=Math.min(...terms.map(term=>low.indexOf(term)).filter(index=>index>=0));
  if(!Number.isFinite(pos))pos=0;
  const start=Math.max(0,pos-150),end=Math.min(text.length,pos+540);
  return `${start?'…':''}${text.slice(start,end)}${end<text.length?'…':''}`;
}

function rank(value){
  const terms=termsFor(value),scored=[];
  for(const doc of corpus.documents){
    const heading=normalize(`${doc.title} ${doc.citation}`);
    const titleMatched=terms.filter(term=>heading.includes(term)).length;
    for(const page of doc.pages){
      const hay=normalize(page.text);
      const matched=terms.filter(term=>hay.includes(term));
      const hits=matched.reduce((total,term)=>total+(hay.match(new RegExp(regexEscape(term),'g'))||[]).length,0);
      if(hits)scored.push({doc,page,hits,matched:matched.length,titleMatched,coverage:terms.length?matched.length/terms.length:0});
    }
  }
  scored.sort((a,b)=>(b.titleMatched-a.titleMatched)||(b.coverage-a.coverage)||(b.matched-a.matched)||(b.hits-a.hits)||(a.doc.kind==='historical'?1:-1));
  return {terms,scored};
}

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

function renderLibrary(){
  $('#library').innerHTML=corpus.documents.map(doc=>`<article class="law"><span class="doc">§</span><div><h3>${escape(doc.title)}</h3><p>${escape(doc.citation)} • ${doc.pageCount} página${doc.pageCount===1?'':'s'}</p></div><span class="badge">${doc.kind==='historical'?'histórica':doc.kind}</span></article>`).join('');
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
const operatingBands=[
  [50,100,'até 50,00 m²'],[100,150,'acima de 50,00 até 100,00 m²'],[150,200,'acima de 100,00 até 150,00 m²'],[200,250,'acima de 150,00 até 200,00 m²'],[300,300,'acima de 200,00 até 300,00 m²'],[450,400,'acima de 300,00 até 450,00 m²'],[700,500,'acima de 450,00 até 700,00 m²'],[1000,600,'acima de 700,00 até 1.000,00 m²'],[1350,680,'acima de 1.000,00 até 1.350,00 m²'],[1750,760,'acima de 1.350,00 até 1.750,00 m²'],[2200,840,'acima de 1.750,00 até 2.200,00 m²'],[2700,920,'acima de 2.200,00 até 2.700,00 m²'],[3250,1000,'acima de 2.700,00 até 3.250,00 m²'],[3850,1080,'acima de 3.250,00 até 3.850,00 m²']
];

function validArea(input){const value=Number(String(input.value).replace(',','.'));return Number.isFinite(value)&&value>0?value:null;}
function renderOperatingFee(){
  const area=validArea($('#operatingArea')),box=$('#operatingResult');
  if(!area){box.innerHTML='Informe a área para consultar a faixa.';return;}
  const band=operatingBands.find(([max])=>area<=max);
  if(band){box.innerHTML=`<span>Faixa: ${band[2]}</span><strong>${money(band[1])} por ano</strong>`;return;}
  const estimated=1160+(area-3850)*.35;
  box.innerHTML=`<span>Acima de 3.850,00 m²</span><strong>Estimativa: ${money(estimated)} por ano</strong><small>Fórmula da tabela: R$ 1.160,00 + R$ 0,35 por m² acrescido.</small>`;
}

function renderConstructionFee(){
  const area=validArea($('#constructionArea')),box=$('#constructionResult'),type=$('#constructionType').value;
  const comparison=$('#constructionComparison');
  if(!area){box.innerHTML='Informe a área para consultar a regra.';comparison.innerHTML='<p>Informe a área para visualizar a comparação.</p>';return;}
  const base=type==='residential'?50:150,oldValue=type==='residential'?78.07:117,estimated=area<=50?base:base+(area-50)*.30;
  const category=type==='residential'?'Residencial com até 4 pavimentos':'Comercial, serviços, industrial ou residencial com 5+ pavimentos';
  box.innerHTML=`<span>${category} • ${area<=50?'até 50,00 m²':'acima de 50,00 m²'}</span><strong>${area<=50?'Valor':'Estimativa'}: ${money(estimated)}</strong>${area>50?`<small>Fórmula da tabela: ${money(base)} + R$ 0,30 por m² acrescido acima de 50 m².</small>`:''}`;
  comparison.innerHTML=`<p><strong>CTM anterior:</strong> ${money(oldValue)} para a categoria geral indicada no comparativo.</p><p><strong>CTM 2025:</strong> ${area<=50?'valor fixo':'base mais adicional por área excedente'}, resultando em ${money(estimated)} para a área informada.</p><small>O comparativo anterior também lista cobranças próprias de alvará com e sem laje; elas não devem ser confundidas com as novas categorias da Tabela IV.</small>`;
}

function setupFeeConsultation(){
  $('#operatingArea').addEventListener('input',renderOperatingFee);
  $('#constructionArea').addEventListener('input',renderConstructionFee);
  $('#constructionType').addEventListener('change',renderConstructionFee);
  document.querySelectorAll('[data-fee-source]').forEach(button=>button.onclick=()=>openCtmPage(+button.dataset.feeSource,['taxa','licenca','valor']));
  document.querySelectorAll('.fee-card [data-fee-page],.ufm-panel [data-fee-page]').forEach(button=>button.onclick=()=>openCtmPage(+button.dataset.feePage,['taxa','ufm','torre','placa'],button.dataset.feeDoc));
  setupSolarFee();setupUfm();
}

const UFM_KEY='ibimirim.ufm';
const ufmFormat=value=>`${value.toLocaleString('pt-BR',{maximumFractionDigits:4})} UFM`;
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
function applyUfm(){renderUfmStatus();renderSolarFee();if(feeIndex.length)renderFeeResults();}
function setupUfm(){
  loadUfm();
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

const SOLAR_CAP=100000;
const SOLAR_RATES=[['#solarTowers',5000,'torre','torres'],['#solarAntennas',1000,'antena','antenas'],['#solarArea',.35,'m² de placa solar','m² de placa solar']];
function renderSolarFee(){
  const box=$('#solarResult');if(!box)return;
  const parts=[];let units=0;
  for(const [selector,rate,singular,plural] of SOLAR_RATES){
    const quantity=Number(String($(selector).value).replace(',','.'));
    if(!Number.isFinite(quantity)||quantity<=0)continue;
    units+=quantity*rate;
    parts.push(`${quantity.toLocaleString('pt-BR')} ${quantity===1?singular:plural} × ${ufmFormat(rate)}`);
  }
  if(!units){box.innerHTML='Informe as quantidades para calcular.';return}
  const reais=ufmToMoney(units),capped=ufm&&units*ufm.value>SOLAR_CAP;
  box.innerHTML=`<span>${parts.join(' · ')}</span><strong>${ufmFormat(units)} por ano</strong>`
    +(reais?`<span class="solar-money">${capped?`Limitado ao teto: <b>${money(SOLAR_CAP)}</b>`:`Equivale a <b>${reais}</b>`} com UFM de ${money(ufm.value)}${ufm.year?` (${ufm.year})`:''}.</span>`
      :'<small>Informe a UFM vigente acima para ver o valor em reais.</small>')
    +(capped?`<small>O valor calculado, ${reais}, ultrapassa o teto de ${money(SOLAR_CAP)} por alvará previsto no parágrafo único do art. 2º.</small>`:'')
    +'<small>Placas de uso domiciliar são isentas. Confirme o enquadramento antes de lançar.</small>';
}
function setupSolarFee(){
  for(const [selector] of SOLAR_RATES)$(selector).addEventListener('input',renderSolarFee);
  renderSolarFee();
}

const SIDE_LABEL={atual:'CTM 2025',anterior:'CTM anterior'};
const UNSOURCED='Origem: planilha comparativa da equipe. O PDF do Código anterior não está na biblioteca, então este valor não tem página citável. Confira o original antes de usar.';
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

function feeAmount(entry){
  if(entry.kind==='fixed')return `<strong class="fee-amount">${money(entry.value)}</strong>`;
  if(entry.kind==='formula')return `<strong class="fee-amount">${money(entry.base)}</strong><span class="fee-plus">+ ${money(entry.rate)} por ${escape(entry.unit||'unidade')} acrescido${entry.threshold?` acima de ${entry.threshold.toLocaleString('pt-BR')} ${escape(entry.unit||'')}`:''}</span>`;
  if(entry.kind==='ufm'){const reais=ufmToMoney(entry.ufm);return `<strong class="fee-amount">${ufmFormat(entry.ufm)}</strong><span class="fee-plus">por ${escape(entry.per||'unidade')} ao ano${reais?` · ${reais} com a UFM informada`:' · informe a UFM para ver em reais'}</span>`}
  if(entry.kind==='tiered')return `<span class="fee-tiers">${entry.tiers.map(tier=>`<span><b>${money(tier.value)}</b> ${escape(tier.label)}</span>`).join('')}${entry.outskirts?`<small>Centro. Periferia: ${entry.outskirts.map(tier=>money(tier.value)).join(' · ')}</small>`:''}</span>`;
  return `<span class="fee-raw">${escape(entry.raw||'valor não informado no comparativo')}</span>`;
}

function feeCalculator(entry,index){
  if(entry.kind!=='formula')return '';
  const unit=escape(entry.unit||'unidade');
  return `<div class="fee-calc"><label for="feeCalc${index}">Calcular para</label><div class="fee-input"><input id="feeCalc${index}" type="number" min="0.01" step="0.01" inputmode="decimal" data-fee-calc="${index}" placeholder="0"><span>${unit}</span></div><output id="feeCalcOut${index}" class="fee-calc-out">—</output></div>`;
}

function feeSource(entry){
  const section=entry.section;
  if(entry.side==='anterior'){
    if(!section.prevDoc)return `<p class="fee-warn">⚠ ${UNSOURCED}</p>`;
    return `<button class="source-button" data-fee-doc="${section.prevDoc}" data-fee-page="${entry.page||1}">${escape(section.prevLabel||'Texto anterior')} — abrir a lei</button>`;
  }
  const {table,pages,status}=section;
  if(!pages||!pages.length)return `<p class="fee-warn">⚠ Página do Código não localizada para esta seção.</p>`;
  const cite=`${escape(table||'Código de 2025')} — p. ${pages.join(', ')}`;
  const warning=section.warning?`<p class="fee-warn">⚠ ${escape(section.warning)}</p>`:'';
  const badge=status==='divergente'?`<p class="fee-warn">⚠ ${escape(entry.section.note||'')}</p>`:status==='parcial'?'<p class="fee-note">Tabela localizada; nem todos os itens puderam ser conferidos linha a linha no texto extraído.</p>':'';
  return `${warning}${badge}<button class="source-button" data-fee-doc="${entry.section.doc||'ctm-2025'}" data-fee-page="${pages[0]}">${cite}</button>`;
}

function renderFeeResults(){
  const value=$('#feeQuery').value.trim(),terms=termsFor(value);
  let hits=feeIndex;
  if(feeFilter!=='todas')hits=hits.filter(entry=>entry.section.id===feeFilter);
  if(terms.length)hits=hits.filter(entry=>terms.every(term=>entry.haystack.includes(term)));
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
  const doc=corpus.documents.find(item=>item.id===(docId||'ctm-2025')),page=doc?.pages.find(item=>item.page===number);
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
  const officialQuery=encodeURIComponent(`${value} site:ibimirim.pe.gov.br OR site:transparencia.ibimirim.pe.gov.br`);
  const generalQuery=encodeURIComponent(`${value} legislação municipal Ibimirim PE`);
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

async function init(){
  renderAudiences();renderTrails();renderGlossary();
  try{corpus=await fetch('./data/laws.json').then(response=>{if(!response.ok)throw Error();return response.json()});buildLexicon();renderLibrary();setupFeeConsultation();}
  catch{$('#library').innerHTML='<p class="empty">A base legal não pôde ser carregada. Reabra o aplicativo ou reinstale o pacote.</p>';}
  try{fees=await fetch('./data/fees.json').then(response=>{if(!response.ok)throw Error();return response.json()});buildFeeIndex();setupFeeFinder();}
  catch{$('#feeCount').textContent='A tabela de taxas não pôde ser carregada.';}
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
