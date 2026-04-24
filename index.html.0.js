
'use strict';
const pageStack=document.getElementById('pageStack');
const megaNav=document.getElementById('megaNav');
const statusEl=document.getElementById('status');
const printSandbox=document.getElementById('printSandbox');
const langElBtn=document.getElementById('langElBtn');
const langEnBtn=document.getElementById('langEnBtn');
let printPageStyleEl = null;
const JSON_CANDIDATES=['chapter_content_bilingual.json','chapter_content.json'];
let contentLang = localStorage.getItem('hmkContentLang') || 'el';
function locKey(key){ return contentLang === 'en' ? `${key}_en` : key; }
function getLoc(obj,key,fallback=''){
  if(!obj) return fallback;
  const v = obj[locKey(key)];
  if(v != null && v !== '') return v;
  const base = obj[key];
  return base != null ? base : fallback;
}
function getLocArray(obj,key){
  if(!obj) return [];
  const v = obj[locKey(key)];
  if(Array.isArray(v)) return v;
  return Array.isArray(obj[key]) ? obj[key] : [];
}
function updateLangButtons(){
  document.documentElement.lang = contentLang;
  langElBtn?.classList.toggle('active', contentLang==='el');
  langEnBtn?.classList.toggle('active', contentLang==='en');
}
function rerenderBook(){
  if(!bookData) return;
  renderPages(bookData);
  deriveNav(bookData);
  updateActiveNav();
  setStatus(`${contentLang==='en' ? 'Pages' : 'Σελίδες'}: ${(bookData.pages||[]).length}`);
}
langElBtn?.addEventListener('click', ()=>{ contentLang='el'; localStorage.setItem('hmkContentLang', contentLang); updateLangButtons(); rerenderBook(); });
langEnBtn?.addEventListener('click', ()=>{ contentLang='en'; localStorage.setItem('hmkContentLang', contentLang); updateLangButtons(); rerenderBook(); });
updateLangButtons();

function applyPrintPageSettings(defs){
  if(!printPageStyleEl){
    printPageStyleEl = document.createElement('style');
    printPageStyleEl.id = 'dynamic-print-page-style';
    document.head.appendChild(printPageStyleEl);
  }
  const size = String(defs?.pageSize || 'A4').trim() || 'A4';
  const orientation = String(defs?.orientation || 'portrait').trim() || 'portrait';
  printPageStyleEl.textContent = `@media print{ @page{ size:${size} ${orientation}; margin:0 } }`;
}

function setStatus(msg){ statusEl.textContent = msg || ''; }
function esc(s=''){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function applyScreenScale(){
  const avail=Math.max(320, window.innerWidth - 48);
  const scale=Math.min(1, avail / 794);
  document.documentElement.style.setProperty('--screen-scale', String(scale));
}
window.addEventListener('resize', applyScreenScale, {passive:true});

function replaceTokens(value, ctx){
  return String(value || '')
    .replace(/\{page\}/g, String(ctx.page || ''))
    .replace(/\{pages\}/g, String(ctx.pages || ''));
}
function placementClass(item){
  const p=String(item?.placement || '').trim().toLowerCase();
  if(p==='left' || p==='float-left') return 'float-left';
  if(p==='right' || p==='float-right') return 'float-right';
  return 'wide';
}
function withCacheBust(url){
  try{
    const u=new URL(url, window.location.href);
    u.searchParams.set('_cb', String(Date.now()));
    return u.toString();
  }catch(_e){ return url; }
}
function normalizeAppSrc(url=''){
  const raw=String(url || '').trim();
  if(!raw) return raw;
  if(/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const path=(window.location.pathname || '').replace(/\\/g,'/').toLowerCase();
  const inBook=/\/book(\/|$)/.test(path);
  const appEntry=inBook ? '../index.html' : './index.html';
  return raw
    .replace(/^\.\.\/index_printmatch\.html/i, appEntry)
    .replace(/^\.\.\/index\.html/i, appEntry)
    .replace(/^\.\.\/app\/em_wave_app\.html/i, appEntry)
    .replace(/^\.\//, './')
    .replace(/\.\.\/index_printmatch\.html/g, appEntry)
    .replace(/\.\.\/index\.html/g, appEntry)
    .replace(/\.\.\/app\/em_wave_app\.html/g, appEntry);
}
function imageSrcCandidates(src=''){
  const raw=String(src||'').trim();
  if(!raw) return [];
  if(/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return [raw];
  const path=(window.location.pathname||'').replace(/\\/g,'/').toLowerCase();
  const inBook=/\/book(\/|$)/.test(path);
  const list=[];
  const push=v=>{ if(v && !list.includes(v)) list.push(v); };
  push(raw);
  if(inBook){
    if(raw.startsWith('images/')) push(`./${raw}`);
    if(raw.startsWith('./images/')) push(raw.slice(2));
    if(raw.startsWith('book/images/')) push(raw.replace(/^book\//,''));
    if(raw.startsWith('../book/images/')) push(raw.replace(/^\.\.\/book\//,''));
  }else{
    if(raw.startsWith('images/')) push(`./book/${raw}`);
    if(raw.startsWith('./images/')) push(`./book/${raw.slice(2)}`);
    if(raw.startsWith('/images/')) push(`./book${raw}`);
    if(raw.startsWith('book/images/')) push(`./${raw}`);
    if(raw.startsWith('../book/images/')) push(raw.replace(/^\.\.\//,'./'));
  }
  return list;
}
function applyImageWithFallback(img, rawSrc=''){
  const candidates=imageSrcCandidates(rawSrc);
  let i=0;
  const tryNext=()=>{
    if(i>=candidates.length){
      img.dispatchEvent(new CustomEvent('imagefallbackfailed'));
      return;
    }
    img.src=candidates[i++];
  };
  img.addEventListener('error', tryNext);
  tryNext();
}
function waitForImage(img){
  return new Promise(resolve=>{
    if(!img || img.complete) return resolve();
    img.addEventListener('load', ()=>resolve(), {once:true});
    img.addEventListener('error', ()=>resolve(), {once:true});
  });
}
function wait(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
function waitForIframeLoad(iframe){
  return new Promise(resolve=>{
    if(!iframe) return resolve();
    let done = false;
    const finish = ()=>{ if(done) return; done = true; resolve(); };
    try{
      const doc = iframe.contentDocument;
      if(doc && doc.readyState === 'complete') return resolve();
    }catch(_e){}
    iframe.addEventListener('load', finish, {once:true});
    iframe.addEventListener('error', finish, {once:true});
    setTimeout(finish, 3500);
  });
}
async function waitForFigureImages(){
  const imgs = Array.from(document.querySelectorAll('.media-frame img:not(.print-scene-snapshot)'));
  for(const img of imgs) await waitForImage(img);
}
function cleanupPrintSandbox(){
  if(printSandbox) printSandbox.innerHTML = '';
}
async function buildSceneSnapshotFromClone(src='', sourceFrame=null){
  if(!printSandbox || !src) return null;
  cleanupPrintSandbox();

  const liveRect = sourceFrame?.getBoundingClientRect ? sourceFrame.getBoundingClientRect() : null;
  const liveW = Math.max(1, Math.round(liveRect?.width || 340));
  const liveH = Math.max(1, Math.round(liveRect?.height || Math.round(liveW * 1.15)));

  const maxSandboxW = 1600;
  const maxSandboxH = 2200;
  const scale = Math.max(2, Math.min(4, Math.floor(maxSandboxW / liveW) || 2));
  let cloneW = Math.max(liveW * scale, liveW);
  let cloneH = Math.max(liveH * scale, liveH);

  if(cloneW > maxSandboxW){
    const k = maxSandboxW / cloneW;
    cloneW = Math.round(cloneW * k);
    cloneH = Math.round(cloneH * k);
  }
  if(cloneH > maxSandboxH){
    const k = maxSandboxH / cloneH;
    cloneW = Math.round(cloneW * k);
    cloneH = Math.round(cloneH * k);
  }

  printSandbox.style.width = `${cloneW}px`;
  printSandbox.style.height = `${cloneH}px`;

  const holder = document.createElement('div');
  holder.style.cssText = `width:${cloneW}px;height:${cloneH}px;overflow:hidden;background:#fff;display:block`;

  const iframe = document.createElement('iframe');
  iframe.loading = 'eager';
  iframe.referrerPolicy = 'no-referrer';
  iframe.allow = 'fullscreen';
  iframe.style.cssText = `width:${cloneW}px;height:${cloneH}px;border:0;display:block;background:#fff`;
  iframe.src = withCacheBust(src);

  holder.appendChild(iframe);
  printSandbox.appendChild(holder);

  await waitForIframeLoad(iframe);
  await wait(650);

  let shot = await requestIframePrintSnapshotWithRetry(iframe, 4);
  if(!shot){
    await wait(450);
    shot = await requestIframePrintSnapshotWithRetry(iframe, 3);
  }

  holder.remove();
  printSandbox.style.width = '1px';
  printSandbox.style.height = '1px';
  return shot;
}
async function requestIframePrintSnapshot(iframe){
  if(!iframe) return null;
  try{
    const direct=iframe.contentWindow?.getBookPrintSnapshot || iframe.contentWindow?.EMWaveApp?.getPrintSnapshot;
    if(typeof direct==='function'){
      const r=await Promise.resolve(direct.call(iframe.contentWindow));
      if(r) return r;
    }
  }catch(_e){}
  return await new Promise(resolve=>{
    const requestId=`snap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let settled=false;
    const cleanup=()=>{ if(settled) return; settled=true; window.removeEventListener('message', onMessage); clearTimeout(timer); };
    const onMessage=(event)=>{
      if(event.source!==iframe.contentWindow) return;
      const data=event.data;
      if(!data || data.type!=='hm_print_snapshot' || data.requestId!==requestId) return;
      cleanup();
      resolve(data.dataUrl || null);
    };
    const timer=setTimeout(()=>{ cleanup(); resolve(null); }, 4800);
    window.addEventListener('message', onMessage);
    try{ iframe.contentWindow?.postMessage({type:'capturePrintSnapshot', requestId}, '*'); }
    catch(_e){ cleanup(); resolve(null); }
  });
}
async function requestIframePrintSnapshotWithRetry(iframe, attempts=3){
  for(let i=0;i<attempts;i++){
    const shot = await requestIframePrintSnapshot(iframe);
    if(shot) return shot;
    await new Promise(resolve => setTimeout(resolve, 220));
  }
  return null;
}
let printSnapshotsPrepared = false;
let printFlowRunning = false;
let bookData = null;

function cleanupPrintSnapshots(){
  document.querySelectorAll('.print-scene-snapshot').forEach(img=>img.remove());
  document.querySelectorAll('.media-frame.print-ready').forEach(el=>el.classList.remove('print-ready'));
  cleanupPrintSandbox();
  printSnapshotsPrepared = false;
  printFlowRunning = false;
}
async function preparePrintSnapshots(force=false){
  if(printSnapshotsPrepared && !force) return 0;
  cleanupPrintSnapshots();
  await waitForFigureImages();

  const frames = Array.from(document.querySelectorAll('.media-frame.scene-frame'));
  let readyCount = 0;

  for(const frame of frames){
    const liveIframe = frame.querySelector('iframe');
    if(!liveIframe) continue;

    let dataUrl = await requestIframePrintSnapshotWithRetry(liveIframe, 5);
    if(!dataUrl){
      dataUrl = await buildSceneSnapshotFromClone(liveIframe.src || normalizeAppSrc(liveIframe.getAttribute('src') || ''), frame);
    }
    if(!dataUrl) continue;

    const img = document.createElement('img');
    img.className = 'print-scene-snapshot';
    img.alt = 'Στιγμιότυπο σκηνής';
    img.src = dataUrl;
    frame.appendChild(img);
    await waitForImage(img);
    frame.classList.add('print-ready');
    readyCount += 1;
  }

  await wait(120);
  printSnapshotsPrepared = true;
  return readyCount;
}
async function beginPrintFlow(){
  if(printFlowRunning) return;
  printFlowRunning = true;
  setStatus('Ετοιμάζονται στατικά στιγμιότυπα για την εκτύπωση…');
  try{
    await preparePrintSnapshots(true);
  }catch(err){
    console.warn(err);
  }
  setStatus('');
  window.print();
}
function resolveAppHref(){
  const path = (window.location.pathname || '').replace(/\\/g,'/');
  if(/\/book(\/|$)/i.test(path)) return '../index.html';
  return 'index.html';
}
window.addEventListener('beforeprint', ()=>{
  if(!printSnapshotsPrepared){
    try{ preparePrintSnapshots(false); }catch(_e){}
  }
});
window.addEventListener('afterprint', ()=>{
  cleanupPrintSnapshots();
  setStatus('');
});

function sceneAspect(item){
  const customAspect = item?.aspectRatio || item?.sceneAspect || item?.aspect;
  if(customAspect && customAspect !== 'natural'){
    if(typeof customAspect === 'number' && Number.isFinite(customAspect) && customAspect > 0) return customAspect;
    const txt = String(customAspect).trim();
    const frac = txt.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if(frac){
      const a = Number(frac[1]), c = Number(frac[2]);
      if(a > 0 && c > 0) return a / c;
    }
    const n = Number(txt);
    if(Number.isFinite(n) && n > 0) return n;
  }
  const src=String(item.singleSrc||'');
  let layout='';
  try{
    const u=new URL(normalizeAppSrc(src), window.location.href);
    layout=(u.searchParams.get('layout')||'').toLowerCase();
  }catch(_e){}
  const g=146.2, r=219.3, c=34;
  if(layout==='rod_only') return 340/(r+c);
  if(layout==='rod_1graph') return 340/(r+g+c);
  if(layout==='rod_2graphs') return 340/(r+g*2+c);
  if(layout==='rod_3graphs') return 340/(r+g*3+c);
  return 16/9;
}


function slugifyForId(value=''){
  const s = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9\u0370-\u03ff]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48);
  return s || 'anchor';
}
function normalizeDomId(value=''){
  const raw = String(value || '').trim();
  if(!raw) return '';
  const safe = raw.replace(/[^A-Za-z0-9_:\-.\u0370-\u03ff]+/g,'-').replace(/^-+|-+$/g,'');
  return (/^[A-Za-z_\u0370-\u03ff]/.test(safe) ? safe : `a-${safe}`) || '';
}
function itemNavTitle(item, fallback=''){
  return String(getLoc(item,'navLabel','') || getLoc(item,'title','') || getLoc(item,'label','') || getLoc(item,'caption','') || fallback || '').trim();
}
function isStructuralNavItem(item){
  return ['part_title','section_heading','scene','figure','side_note','note','hero','nav_anchor'].includes(item?.type);
}
function itemAnchorId(page, pageIndex, item, itemIndex){
  const explicit = normalizeDomId(item?.id || item?.anchorId || item?.targetId || '');
  if(explicit) return explicit;
  if(!isStructuralNavItem(item)) return '';
  const pageId = normalizeDomId(page?.id || `page-${pageIndex+1}`) || `page-${pageIndex+1}`;
  const title = itemNavTitle(item, item?.type || 'item');
  return normalizeDomId(`${pageId}-${itemIndex+1}-${slugifyForId(title || item?.type || 'item')}`);
}
function attachItemAnchor(el, item, ctx){
  if(!el || !ctx || !isStructuralNavItem(item)) return el;
  const id = itemAnchorId(ctx.page, ctx.pageIndex, item, ctx.itemIndex);
  if(id) el.id = id;
  if(item?.showInNav === false) el.dataset.navHidden = '1';
  return el;
}
function renderNavAnchor(item){
  const s=document.createElement('span');
  s.className='nav-anchor';
  s.setAttribute('aria-hidden','true');
  return s;
}
function collectNavTargets(data){
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  const targets = [];
  const byId = new Map();
  pages.forEach((page, pageIndex)=>{
    const pageId = normalizeDomId(page.id || `page-${pageIndex+1}`);
    const pageTitle = String((page.items||[]).map(it=>itemNavTitle(it,'')).find(Boolean) || getLoc(page.header,'right','') || getLoc(page.header,'left','') || pageId).trim();
    const pageTarget = {id:pageId, pageId, pageIndex, title:pageTitle, type:'page'};
    targets.push(pageTarget); byId.set(pageId, pageTarget);
    (page.items||[]).forEach((item,itemIndex)=>{
      if(!isStructuralNavItem(item) || item.showInNav === false) return;
      const id = itemAnchorId(page,pageIndex,item,itemIndex);
      const title = itemNavTitle(item, pageTitle || id);
      if(!id || !title) return;
      const t = {id, pageId, pageIndex, itemIndex, title, type:item.type};
      targets.push(t); byId.set(id,t);
    });
  });
  return {targets, byId};
}
function targetPageIndex(targetId, targetMap, fallback=0){
  const target = targetMap.get(String(targetId || ''));
  return target ? target.pageIndex : fallback;
}

function renderHero(item){
  const wrap=document.createElement('section');
  wrap.className='hero';
  wrap.innerHTML=`${getLoc(item,'eyebrow','')?`<p class="eyebrow">${getLoc(item,'eyebrow','')}</p>`:''}${getLoc(item,'title','')?`<h1>${getLoc(item,'title','')}</h1>`:''}${getLoc(item,'subtitle','')?`<p class="subtitle">${getLoc(item,'subtitle','')}</p>`:''}`;
  return wrap;
}
function renderPartTitle(item){
  const d=document.createElement('section');
  d.className='part-head';
  d.innerHTML=`${getLoc(item,'label','')?`<p class="part-kicker">${getLoc(item,'label','')}</p>`:''}${getLoc(item,'title','')?`<h2 class="part-title-main">${getLoc(item,'title','')}</h2>`:''}`;
  return d;
}
function renderSectionHeading(item){
  const h=document.createElement('h2');
  h.className='section-heading';
  h.textContent=getLoc(item,'title','');
  return h;
}
function renderParagraph(item){
  const p=document.createElement('p');
  p.className='paragraph';
  p.innerHTML=getLoc(item,'html','');
  return p;
}
function renderNote(item){
  const d=document.createElement('div');
  d.className='note';
  d.innerHTML=`${getLoc(item,'label','')?`<span class="label">${getLoc(item,'label','')}</span>`:''}${getLoc(item,'html','')||''}`;
  return d;
}
function renderSideNote(item){
  const d=document.createElement('aside');
  d.className=`side-note ${placementClass(item)}`;
  if(item.frameWidth) d.style.setProperty('--figure-width', `${item.frameWidth}px`);
  const label=getLoc(item,'label','');
  const title=getLoc(item,'title','');
  d.innerHTML=`${label?`<span class="label">${label}</span>`:''}${title?`<span class="title">${title}</span>`:''}${getLoc(item,'html','')||''}`;
  return d;
}
function renderFigure(item){
  const fig=document.createElement('figure');
  fig.className=`media ${placementClass(item)}`;
  if(item.frameWidth) fig.style.setProperty('--figure-width', `${item.frameWidth}px`);
  const frame=document.createElement('div');
  frame.className=`media-frame ${item.aspect==='natural'?'natural':''}`.trim();
  const img=document.createElement('img');
  img.alt=getLoc(item,'alt','') || getLoc(item,'title','') || (contentLang==='en' ? 'Figure' : 'Εικόνα');
  img.addEventListener('imagefallbackfailed', ()=>{
    img.remove();
    const ph=document.createElement('div');
    ph.className='media-placeholder';
    ph.innerHTML=`<div><strong>${esc(getLoc(item,'title','') || (contentLang==='en' ? 'Figure' : 'Εικόνα'))}</strong><br>${contentLang==='en' ? 'Image file not found.' : 'Το αρχείο εικόνας δεν βρέθηκε.'}</div>`;
    frame.appendChild(ph);
  }, {once:true});
  applyImageWithFallback(img, item.src || '');
  frame.appendChild(img);
  fig.appendChild(frame);
  if(!item.hideCaption){
    const cap=document.createElement('figcaption');
    cap.textContent=getLoc(item,'caption','') || getLoc(item,'title','') || (contentLang==='en' ? 'Figure' : 'Εικόνα');
    fig.appendChild(cap);
  }
  return fig;
}
function renderScene(item){
  const fig=document.createElement('figure');
  fig.className=`media ${placementClass(item)}`;
  if(item.frameWidth) fig.style.setProperty('--figure-width', `${item.frameWidth}px`);
  const frame=document.createElement('div');
  frame.className='media-frame scene-frame';
  frame.style.aspectRatio=String(sceneAspect(item));
  const iframe=document.createElement('iframe');
  iframe.loading='eager';
  iframe.referrerPolicy='no-referrer';
  iframe.allow='fullscreen';
  iframe.src=withCacheBust(normalizeAppSrc(item.singleSrc || ''));
  frame.appendChild(iframe);
  fig.appendChild(frame);
  if(!item.hideCaption){
    const cap=document.createElement('figcaption');
    cap.textContent=getLoc(item,'caption','') || getLoc(item,'title','') || (contentLang==='en' ? 'Scene' : 'Σκηνή');
    fig.appendChild(cap);
  }
  return fig;
}
function renderCallout(item){
  const d=document.createElement('div');
  d.className='callout';
  const setup=(item.setupChips||[]).length ? `<div class="callout-row"><span class="callout-label">${getLoc(item,'setupLabel', contentLang==='en' ? 'Set' : 'Ρύθμισε')}</span>${(item.setupChips||[]).map(t=>`<span class="callout-chip">${t}</span>`).join('')}</div>` : '';
  const press=(item.pressChips||[]).length ? `<div class="callout-row"><span class="callout-label">${getLoc(item,'pressLabel', contentLang==='en' ? 'Press' : 'Πίεσε')}</span>${(item.pressChips||[]).map(t=>`<span class="callout-chip">${t}</span>`).join('')}</div>` : '';
  const observe=getLocArray(item,'observeItems').length ? `<div class="callout-observe"><span class="callout-observe-title">${getLoc(item,'observeTitle', contentLang==='en' ? 'Observe' : 'Παρατήρησε')}</span><ul>${getLocArray(item,'observeItems').map(t=>`<li>${t}</li>`).join('')}</ul></div>` : '';
  d.innerHTML=`<div class="callout-title">${getLoc(item,'title', contentLang==='en' ? 'Try' : 'Δοκίμασε')}</div>${setup}${press}${observe}`;
  return d;
}
function renderItem(item, ctx=null){
  let node;
  if(!item || typeof item!=='object'){
    node=document.createElement('div');
    node.textContent='Άκυρο item';
    return node;
  }
  switch(item.type){
    case 'hero': node = renderHero(item); break;
    case 'part_title': node = renderPartTitle(item); break;
    case 'section_heading': node = renderSectionHeading(item); break;
    case 'paragraph': node = renderParagraph(item); break;
    case 'note': node = renderNote(item); break;
    case 'side_note': node = renderSideNote(item); break;
    case 'figure': node = renderFigure(item); break;
    case 'scene': node = renderScene(item); break;
    case 'nav_anchor': node = renderNavAnchor(item); break;
    case 'interactive_callout': node = renderCallout(item); break;
    case 'clear': { node=document.createElement('div'); node.className='clear'; break; }
    default: {
      node=document.createElement('div');
      node.textContent=`Άγνωστο block: ${item.type}`;
      break;
    }
  }
  return attachItemAnchor(node, item, ctx);
}
function buildHeader(page, pageNo, total){
  const h=document.createElement('div');
  h.className='sheet-header';
  if(Number((bookData?.layoutDefaults || {}).headerFontSize) <= 0) h.classList.add('hidden');
  h.innerHTML=`<div class="l">${replaceTokens(getLoc(page.header,'left',''), {page:pageNo,pages:total})}</div><div class="c">${replaceTokens(getLoc(page.header,'center',''), {page:pageNo,pages:total})}</div><div class="r">${replaceTokens(getLoc(page.header,'right',''), {page:pageNo,pages:total})}</div>`;
  return h;
}
function buildFooter(page, pageNo, total, showNumbers=true){
  const f=document.createElement('div');
  f.className='sheet-footer';
  if(Number((bookData?.layoutDefaults || {}).footerFontSize) <= 0) f.classList.add('hidden');
  const rightValue = showNumbers === false ? '' : getLoc(page.footer,'right','');
  f.innerHTML=`<div class="l">${replaceTokens(getLoc(page.footer,'left',''), {page:pageNo,pages:total})}</div><div class="c">${replaceTokens(getLoc(page.footer,'center',''), {page:pageNo,pages:total})}</div><div class="r">${replaceTokens(rightValue, {page:pageNo,pages:total})}</div>`;
  return f;
}
function renderPages(data){
  const pages=Array.isArray(data.pages) ? data.pages : [];
  const total=pages.length;
  pageStack.innerHTML='';
  pages.forEach((page, idx)=>{
    const wrap=document.createElement('div');
    wrap.className='sheet-wrap';
    wrap.id=page.id || `page-${idx+1}`;
    const sheet=document.createElement('section');
    sheet.className='sheet';
    const inner=document.createElement('div');
    inner.className='sheet-inner';
    inner.appendChild(buildHeader(page, idx+1, total));
    const body=document.createElement('div');
    body.className='sheet-body';
    (page.items || []).forEach((item, itemIndex) => body.appendChild(renderItem(item, {page, pageIndex:idx, itemIndex})));
    inner.appendChild(body);
    inner.appendChild(buildFooter(page, idx+1, total, data.layoutDefaults?.showPageNumbers));
    sheet.appendChild(inner);
    wrap.appendChild(sheet);
    pageStack.appendChild(wrap);
  });
}
function appendNavTools(data){
  const nav = data?.nav || {};
  const showApp = nav.showApp !== false;
  const showPrint = nav.showPrint !== false;

  if(showApp){
    const appNode = document.createElement('div');
    appNode.className = 'menu-item menu-tool';
    const appLink = document.createElement('a');
    appLink.className = 'menu-btn';
    appLink.href = resolveAppHref();
    appLink.textContent = contentLang==='en' ? 'Open app' : 'Στην εφαρμογή';
    appNode.appendChild(appLink);
    megaNav.appendChild(appNode);
  }

  if(showPrint){
    const printNode = document.createElement('div');
    printNode.className = 'menu-item menu-tool';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-btn';
    btn.id = 'printBtn';
    btn.textContent = contentLang==='en' ? 'Print' : 'Εκτύπωση';
    btn.addEventListener('click', async ()=>{ await beginPrintFlow(); });
    printNode.appendChild(btn);
    megaNav.appendChild(printNode);
  }
}

function renderNavGroups(groups, pageToGroup, data){
  megaNav.innerHTML = '';
  groups.forEach(group => {
    if(group.hidden) return;
    const node = document.createElement('div');
    node.className = 'menu-item';
    node.dataset.groupKey = group.key;
    const entries = (group.entries || []).filter(entry => !entry.hidden);
    const links = entries.map(entry => `<a class="menu-section-link" href="#${esc(entry.id)}">${esc(entry.text)}</a>`).join('');
    node.innerHTML = `<a class="menu-trigger" href="#${esc(group.id)}">${esc(group.title)}<span class="caret">▾</span></a><div class="menu-dropdown">${links}</div>`;
    megaNav.appendChild(node);
  });
  appendNavTools(data);
  megaNav.dataset.pageGroupMap = JSON.stringify(Object.fromEntries(pageToGroup));
}

function deriveManualNav(data){
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const {byId: targetMap} = collectNavTargets(data);
  const rawGroups = Array.isArray(data?.nav?.groups) ? data.nav.groups : [];
  const visibleGroups = rawGroups
    .map((group, idx) => {
      const fallbackId = pages[0]?.id || 'page-1';
      const id = String(group.target || group.targetId || group.id || fallbackId).trim() || fallbackId;
      const target = targetMap.get(id);
      const entries = Array.isArray(group.entries) ? group.entries : [];
      return {
        key: `manual-${idx}`,
        id,
        pageId: target?.pageId || id,
        title: String(getLoc(group,'title', group.title || target?.title || id || `Menu ${idx+1}`)).trim() || id,
        hidden: !!group.hidden,
        entries: entries.map(entry => {
          const entryId = String(entry.target || entry.targetId || entry.id || id).trim() || id;
          const entryTarget = targetMap.get(entryId);
          return {
            id: entryId,
            pageId: entryTarget?.pageId || entryId,
            text: String(getLoc(entry,'title', entry.title || entryTarget?.title || entryId)).trim() || entryId,
            hidden: !!entry.hidden
          };
        })
      };
    })
    .filter(group => group.title && group.id);

  const groups = visibleGroups.length ? visibleGroups : [{
    key:'manual-0',
    id:pages[0]?.id || 'page-1',
    pageId:pages[0]?.id || 'page-1',
    title:contentLang==='en' ? 'Book' : 'Βιβλίο',
    entries:[]
  }];

  const pageToGroup = new Map();
  const anchors = groups.map((g, idx)=>({
    key:g.key,
    index:targetPageIndex(g.id, targetMap, idx)
  })).sort((a,b)=>a.index-b.index);

  pages.forEach((page, idx)=>{
    const pageId = page.id || `page-${idx+1}`;
    let active = anchors[0]?.key || groups[0].key;
    for(const a of anchors){
      if(a.index <= idx) active = a.key;
      else break;
    }
    pageToGroup.set(pageId, active);
  });
  groups.forEach(group => {
    if(group.id) pageToGroup.set(group.id, group.key);
    if(group.pageId) pageToGroup.set(group.pageId, group.key);
    (group.entries || []).forEach(entry => {
      if(entry.id) pageToGroup.set(entry.id, group.key);
      if(entry.pageId) pageToGroup.set(entry.pageId, group.key);
    });
  });

  renderNavGroups(groups, pageToGroup, data);
}

function deriveNav(data){
  if(data?.nav?.mode === 'manual' && Array.isArray(data?.nav?.groups) && data.nav.groups.length){
    deriveManualNav(data);
    return;
  }
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const groups = [];
  const pageToGroup = new Map();
  let currentGroup = null;

  const ignoredTitles = new Set([
    'Δοκίμασε','Σχολική Περιγραφή','Ποια είναι η εικόνα των πεδίων;','Συμβάντα','Πώς εξελίσσεται η διάδοση των πεδίων;','Στιγμιότυπο','Σύμβαση','Πώς να το χρησιμοποιήσεις','Τι να περιμένεις','Εικόνα 1','Εικόνα 2','Πυρήνας',
    'Try','School description','What is the picture of the fields?','Events','How does the propagation of the fields evolve?','Snapshot','Convention','How to use it','What to expect','Figure 1','Figure 2','Core'
  ]);

  function menuGroupTitle(groupIndex, page, partItem){
    if(partItem && String(itemNavTitle(partItem,'')).trim()) return String(itemNavTitle(partItem,'')).trim();
    if(groupIndex === 0) return contentLang==='en' ? 'Introduction' : 'Εισαγωγή';
    if(groupIndex === 1) return contentLang==='en' ? 'School version' : 'Σχολικά';
    const right = String(getLoc(page?.header,'right','')).trim();
    return right || (contentLang==='en' ? `Page ${groupIndex+1}` : `Σελίδα ${groupIndex+1}`);
  }

  pages.forEach((page, idx) => {
    const pageId = page.id || `page-${idx+1}`;
    const partIndex = (page.items || []).findIndex(it => it.type === 'part_title' && it.showInNav !== false);
    const partItem = partIndex >= 0 ? page.items[partIndex] : null;
    const startsNewGroup = !currentGroup || !!partItem;

    if(startsNewGroup){
      const groupId = partItem ? itemAnchorId(page, idx, partItem, partIndex) : pageId;
      currentGroup = {
        key: `group-${groups.length}`,
        id: groupId,
        pageId,
        title: menuGroupTitle(groups.length, page, partItem),
        entries: [],
        seen: new Set()
      };
      groups.push(currentGroup);
    }

    pageToGroup.set(pageId, currentGroup.key);

    (page.items || []).forEach((it, itemIndex) => {
      if(it.showInNav === false) return;
      const raw = String(itemNavTitle(it,'')).trim();
      if(!raw || ignoredTitles.has(raw)) return;
      if(!['section_heading','scene','nav_anchor'].includes(it.type)) return;
      const key = raw.toLowerCase();
      if(currentGroup.seen.has(key)) return;
      currentGroup.seen.add(key);
      currentGroup.entries.push({ id:itemAnchorId(page, idx, it, itemIndex) || pageId, pageId, text:raw });
    });

    if(currentGroup.entries.length === 0){
      const key = currentGroup.title.toLowerCase();
      currentGroup.seen.add(key);
      currentGroup.entries.push({ id:currentGroup.id || pageId, pageId, text:currentGroup.title });
    }
  });

  groups.forEach(group => {
    if(group.id) pageToGroup.set(group.id, group.key);
    if(group.pageId) pageToGroup.set(group.pageId, group.key);
    (group.entries || []).forEach(entry => {
      if(entry.id) pageToGroup.set(entry.id, group.key);
      if(entry.pageId) pageToGroup.set(entry.pageId, group.key);
    });
  });
  groups.forEach(g=>delete g.seen);
  renderNavGroups(groups, pageToGroup, data);
}
function updateActiveNav(){
  const targetEls=Array.from(document.querySelectorAll('.sheet-wrap[id], .sheet-body [id]'));
  const y=window.scrollY + 140;
  let activeId='';
  for(const el of targetEls){
    if(el.getBoundingClientRect().top + window.scrollY <= y) activeId=el.id;
  }
  let pageToGroup = {};
  try{ pageToGroup = JSON.parse(megaNav.dataset.pageGroupMap || '{}'); }catch(_e){}
  let activeGroupKey = pageToGroup[activeId] || '';
  if(!activeGroupKey){
    const el = activeId ? document.getElementById(activeId) : null;
    const page = el?.closest?.('.sheet-wrap[id]');
    activeGroupKey = page ? pageToGroup[page.id] || '' : '';
  }
  megaNav.querySelectorAll('.menu-item').forEach(node=>{
    if(node.dataset.groupKey){
      node.classList.toggle('active', node.dataset.groupKey === activeGroupKey);
    }
  });
}
window.addEventListener('scroll', updateActiveNav, {passive:true});

async function loadData(){
  let lastErr=null;
  for(const name of JSON_CANDIDATES){
    try{
      const res=await fetch(name, {cache:'no-store'});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }catch(err){
      lastErr=err;
    }
  }
  throw lastErr || new Error('Δεν βρέθηκε JSON');
}
function fontPresetValue(key, fallback){
  const presets = {
    serif: 'Georgia,"Noto Serif","Times New Roman",serif',
    sans: 'system-ui,-apple-system,"Segoe UI",Arial,sans-serif',
    classic: '"Avenir Next","Segoe UI",system-ui,-apple-system,Arial,sans-serif'
  };
  return presets[key] || fallback;
}
function applyLayoutDefaults(defs){
  const root = document.documentElement;
  if(!defs || typeof defs !== 'object') return;
  if(defs.pageWidthPx != null) root.style.setProperty('--sheet-width', `${Number(defs.pageWidthPx)}px`);
  if(defs.pageHeightPx != null) root.style.setProperty('--sheet-height', `${Number(defs.pageHeightPx)}px`);
  if(defs.pagePaddingTopPx != null) root.style.setProperty('--sheet-pad-top', `${Number(defs.pagePaddingTopPx)}px`);
  if(defs.pagePaddingRightPx != null) root.style.setProperty('--sheet-pad-right', `${Number(defs.pagePaddingRightPx)}px`);
  if(defs.pagePaddingBottomPx != null) root.style.setProperty('--sheet-pad-bottom', `${Number(defs.pagePaddingBottomPx)}px`);
  if(defs.pagePaddingLeftPx != null) root.style.setProperty('--sheet-pad-left', `${Number(defs.pagePaddingLeftPx)}px`);
  if(defs.bodyFontSize != null) root.style.setProperty('--body-font-size', `${Number(defs.bodyFontSize)}px`);
  if(defs.lineHeight != null) root.style.setProperty('--body-leading', String(defs.lineHeight));
  if(defs.paragraphGap != null) root.style.setProperty('--para-gap', `${Number(defs.paragraphGap)}px`);
  if(defs.sectionGap != null) root.style.setProperty('--section-gap', `${Number(defs.sectionGap)}px`);
  if(defs.noteGap != null) root.style.setProperty('--note-gap', `${Number(defs.noteGap)}px`);
  if(defs.calloutGap != null) root.style.setProperty('--callout-gap', `${Number(defs.calloutGap)}px`);
  if(defs.headerTopPx != null) root.style.setProperty('--header-top', `${Number(defs.headerTopPx)}px`);
  if(defs.headerHeightPx != null) root.style.setProperty('--header-h', `${Number(defs.headerHeightPx)}px`);
  if(defs.footerBottomPx != null) root.style.setProperty('--footer-bottom', `${Number(defs.footerBottomPx)}px`);
  if(defs.footerHeightPx != null) root.style.setProperty('--footer-h', `${Number(defs.footerHeightPx)}px`);
  if(defs.headerFontSize != null) root.style.setProperty('--header-font-size', `${Number(defs.headerFontSize)}px`);
  if(defs.footerFontSize != null) root.style.setProperty('--footer-font-size', `${Number(defs.footerFontSize)}px`);
  if(defs.bodyFontFamily != null) root.style.setProperty('--body-font-family', fontPresetValue(defs.bodyFontFamily, defs.bodyFontFamily));
  if(defs.headingFontFamily != null) root.style.setProperty('--heading-font-family', fontPresetValue(defs.headingFontFamily, defs.headingFontFamily));
  if(defs.heroEyebrowFontSize != null) root.style.setProperty('--hero-eyebrow-font-size', `${Number(defs.heroEyebrowFontSize)}px`);
  if(defs.heroTitleFontSize != null) root.style.setProperty('--hero-title-font-size', `${Number(defs.heroTitleFontSize)}px`);
  if(defs.heroSubtitleFontSize != null) root.style.setProperty('--hero-subtitle-font-size', `${Number(defs.heroSubtitleFontSize)}px`);
  if(defs.heroTitleFontFamily != null) root.style.setProperty('--hero-title-font-family', fontPresetValue(defs.heroTitleFontFamily, defs.heroTitleFontFamily));
  if(defs.partKickerFontSize != null) root.style.setProperty('--part-kicker-font-size', `${Number(defs.partKickerFontSize)}px`);
  if(defs.partTitleFontSize != null) root.style.setProperty('--part-title-font-size', `${Number(defs.partTitleFontSize)}px`);
  if(defs.partTitleFontFamily != null) root.style.setProperty('--part-title-font-family', fontPresetValue(defs.partTitleFontFamily, defs.partTitleFontFamily));
  if(defs.sectionHeadingFontSize != null) root.style.setProperty('--section-heading-font-size', `${Number(defs.sectionHeadingFontSize)}px`);
  if(defs.sectionHeadingFontFamily != null) root.style.setProperty('--section-heading-font-family', fontPresetValue(defs.sectionHeadingFontFamily, defs.sectionHeadingFontFamily));
  if(defs.noteFontSize != null) root.style.setProperty('--note-font-size', `${Number(defs.noteFontSize)}px`);
  if(defs.noteLineHeight != null) root.style.setProperty('--note-line-height', String(defs.noteLineHeight));
  if(defs.noteLabelFontSize != null) root.style.setProperty('--note-label-font-size', `${Number(defs.noteLabelFontSize)}px`);
  if(defs.captionFontSize != null) root.style.setProperty('--caption-font-size', `${Number(defs.captionFontSize)}px`);
  if(defs.calloutFontSize != null) root.style.setProperty('--callout-font-size', `${Number(defs.calloutFontSize)}px`);
  if(defs.calloutTitleFontSize != null) root.style.setProperty('--callout-title-font-size', `${Number(defs.calloutTitleFontSize)}px`);
  if(defs.calloutLabelFontSize != null) root.style.setProperty('--callout-label-font-size', `${Number(defs.calloutLabelFontSize)}px`);
  if(defs.calloutChipFontSize != null) root.style.setProperty('--callout-chip-font-size', `${Number(defs.calloutChipFontSize)}px`);
  if(defs.calloutObserveTitleFontSize != null) root.style.setProperty('--callout-observe-title-font-size', `${Number(defs.calloutObserveTitleFontSize)}px`);
}
async function boot(){
  applyScreenScale();
  const data=await loadData();
  bookData = data;
  if(data?.schemaVersion !== 'pages-v1' && !Array.isArray(data?.pages)){
    throw new Error('Το βιβλίο περιμένει page-first JSON (pages-v1).');
  }
  const defs=data.layoutDefaults || {};
  applyLayoutDefaults(defs);
  applyPrintPageSettings(defs);
  renderPages(data);
  deriveNav(data);
  updateActiveNav();
  setStatus(`${contentLang==='en' ? 'Pages' : 'Σελίδες'}: ${(data.pages||[]).length}`);
}
boot().catch(err=>{
  console.error(err);
  setStatus(`Σφάλμα φόρτωσης: ${err.message}`);
});
