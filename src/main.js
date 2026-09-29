import './style.css';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createWorker } from 'tesseract.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// In sviluppo locale evitiamo che una vecchia PWA/service worker conservi CSS o JS precedenti.
// In produzione il service worker continua invece a essere gestito da vite-plugin-pwa.
if (import.meta.env.DEV) {
  if ('serviceWorker' in navigator) {
    const appScope = new URL(import.meta.env.BASE_URL, location.origin).href;
    navigator.serviceWorker.getRegistrations().then(regs => regs.filter(reg => reg.scope === appScope).forEach(reg => reg.unregister())).catch(() => {});
  }
  if ('caches' in window) {
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(`ada-web-${import.meta.env.BASE_URL}-`)).map(key => caches.delete(key)))).catch(() => {});
  }
}

const state = {
  files: [],
  currentIndex: 0,
  findings: [],
  pages: [],
  pdfBytes: null,
  outputBytes: null,
  abort: false,
  ocrEnabled: true,
  ocrWorker: null,
  redactionMode: 'black',
  currentPage: 1,
  totalPages: 0,
  manualMode: false,
  adjustMode: false,
  precisionMode: 'precise',
  previewZoom: 1,
  filters: { type: 'all', status: 'all', page: 'all', search: '' },
  mobileView: 'preview',
};

const PATTERNS = [
  { type: 'Codice fiscale', key: 'cf', re: /\b[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/gi },
  { type: 'IBAN', key: 'iban', re: /\bIT\s?\d{2}\s?[A-Z]\s?\d{5}\s?\d{5}\s?[A-Z0-9]{12}\b/gi },
  { type: 'Email / PEC', key: 'email', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: 'P. IVA', key: 'piva', re: /\b(?:IT\s*)?\d{11}\b/g },
  { type: 'Telefono', key: 'phone', re: /(?<!\d)(?:\+39\s?)?(?:0\d{1,4}[\s./-]?\d{5,8}|3\d{2}[\s./-]?\d{6,7})(?!\d)/g },
  { type: 'Data', key: 'date', re: /\b(?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[0-2])[\/.-](?:19|20)\d{2}\b/g },
];

const ENABLED_TYPES = {
  cf: true, iban: true, email: true, piva: true, phone: true, date: false, name: true, address: true
};

function escapeHtml(s='') {
  return s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}

const POLICY_ACCEPT_KEY = 'ada_web_policy_accept_v016';

function policiesAccepted(){
  try { return !!localStorage.getItem(POLICY_ACCEPT_KEY); } catch { return false; }
}

function renderFirstUseModal(){
  if (policiesAccepted()) return '';
  return `
    <div class="modal-backdrop" id="policyModal" role="dialog" aria-modal="true" aria-labelledby="policyModalTitle">
      <div class="policy-modal">
        <div class="policy-modal-head">
          <div>
            <div class="policy-kicker">Primo accesso</div>
            <h2 id="policyModalTitle">Disclaimer, privacy e condizioni d'uso</h2>
            <p>Prima di utilizzare A.D.A. Web consulta le sezioni seguenti e conferma di aver compreso le principali condizioni di utilizzo.</p>
          </div>
          <img class="policy-modal-icon" src="${import.meta.env.BASE_URL}ada-icon.png" alt="Icona A.D.A.">
        </div>
        <div class="policy-status" id="policyStatus">Apri tutte le sezioni (0/3) per continuare.</div>
        <div class="policy-sections">
          <details data-policy-section="use">
            <summary>Condizioni d'uso</summary>
            <div>
              <p>A.D.A. Web è uno strumento di supporto all'anonimizzazione documentale. Non costituisce un parere giuridico, non sostituisce le valutazioni dell'amministrazione o del titolare del trattamento e non garantisce automaticamente l'idoneità dell'oscuramento in ogni contesto.</p>
              <p>L'utente deve sempre valutare la finalità del trattamento o della pubblicazione del documento e verificare che i dati residui non consentano l'identificazione diretta o indiretta dell'interessato.</p>
            </div>
          </details>
          <details data-policy-section="privacy">
            <summary>Privacy locale</summary>
            <div>
              <p>Il documento viene elaborato localmente nel browser del dispositivo. Questa versione non prevede backend per il caricamento dei PDF e non archivia i file su server remoti.</p>
              <p>Alla chiusura della sessione o al reset, l'app rilascia i riferimenti temporanei mantenuti in memoria. L'utente resta comunque responsabile del dispositivo e dell'ambiente in cui opera.</p>
            </div>
          </details>
          <details data-policy-section="ops">
            <summary>Avvertenze operative</summary>
            <div>
              <p>Il controllo visivo dell'operatore è sempre obbligatorio. I rilevamenti automatici, specialmente su scansioni OCR o documenti complessi, possono risultare incompleti o eccessivi e vanno corretti prima dell'esportazione.</p>
              <p>Particolare attenzione è richiesta per documenti destinati a pubblicazione, trasparenza amministrativa, addestramento di sistemi AI, ricerca o condivisione con terzi.</p>
            </div>
          </details>
        </div>
        <label class="policy-check">
          <input id="policyConfirm" type="checkbox" disabled>
          <span>Dichiaro di aver letto le tre sezioni e di assumermi la responsabilità del controllo finale del documento.</span>
        </label>
        <div class="policy-actions">
          <button id="policyCloseBtn" class="ghost" type="button">Non accetto</button>
          <button id="policyAcceptBtn" class="primary" type="button" disabled>Accetta e continua</button>
        </div>
      </div>
    </div>
  `;
}

function bindPolicyModal(){
  const modal = document.querySelector('#policyModal');
  if(!modal) { document.body.classList.remove('modal-open'); return; }
  document.body.classList.add('modal-open');
  const visited = new Set();
  const confirm = modal.querySelector('#policyConfirm');
  const accept = modal.querySelector('#policyAcceptBtn');
  const close = modal.querySelector('#policyCloseBtn');
  const status = modal.querySelector('#policyStatus');
  const sections = modal.querySelectorAll('[data-policy-section]');
  const update = () => {
    const readAll = visited.size >= sections.length;
    confirm.disabled = !readAll;
    if(!readAll) confirm.checked = false;
    accept.disabled = !(readAll && confirm.checked);
    status.textContent = readAll
      ? 'Tutte le sezioni sono state consultate. Conferma per proseguire.'
      : `Apri tutte le sezioni (${visited.size}/${sections.length}) per continuare.`;
  };
  sections.forEach(section => {
    section.addEventListener('toggle', () => {
      if(section.open) visited.add(section.dataset.policySection);
      update();
    });
  });
  confirm.addEventListener('change', update);
  close.addEventListener('click', () => {
    try { window.close(); } catch {}
    status.textContent = 'Per utilizzare A.D.A. Web è necessario accettare le condizioni. Puoi chiudere questa scheda del browser.';
  });
  accept.addEventListener('click', () => {
    try { localStorage.setItem(POLICY_ACCEPT_KEY, JSON.stringify({ acceptedAt: new Date().toISOString(), version: '0.2.0-beta' })); } catch {}
    modal.remove();
    document.body.classList.remove('modal-open');
  });
  update();
}

function render() {
  document.querySelector('#app').innerHTML = `
    <header class="topbar mic-header understated-header">
      <div class="brand-lockup">
        <div class="brand-symbol">
          <img class="app-icon" src="${import.meta.env.BASE_URL}ada-icon.png" alt="Icona A.D.A.">
        </div>
        <div class="brand-copy">
          <div class="eyebrow">A.D.A. WEB • 0.2.0-beta</div>
          <h1>A.D.A. <span>Anonimizzatore Documenti Autonomo</span></h1>
          <div class="institution-credit">Tool sviluppato dalla Soprintendenza ABAP per le Province di Salerno e Avellino, Ufficio Informatico.</div>
          <div class="style-note">Interfaccia ispirata ai colori e allo stile istituzionale, senza utilizzo del marchio ufficiale.</div>
        </div>
      </div>
      <div class="local-badge">🔒 Elaborazione locale</div>
    </header>

    <main class="layout">
      <section class="panel hero">
        <div class="dropzone" id="dropzone">
          <div class="drop-icon">📄</div>
          <h2>Carica uno o più PDF</h2>
          <p>I documenti restano sul dispositivo. Nessun upload, nessun server.</p>
          <input id="fileInput" type="file" accept="application/pdf" multiple hidden />
          <button class="primary" id="chooseBtn">Seleziona PDF</button>
        </div>

        <div class="privacy-note">
          <strong>Privacy by design:</strong> i file vengono elaborati nella memoria del browser. Alla chiusura o al reset della sessione, gli oggetti temporanei vengono rilasciati.
        </div>
      </section>

      <section class="panel settings">
        <div class="panel-title">Tipi di dati</div>
        <div class="chips" id="typeChips">
          ${chip('cf','Codice fiscale')}${chip('iban','IBAN')}${chip('email','Email / PEC')}${chip('phone','Telefono')}${chip('piva','P. IVA')}${chip('name','Nomi')}${chip('address','Indirizzi')}${chip('date','Date')}
        </div>
        <div class="setting-row">
          <label><input type="checkbox" id="ocrToggle" ${state.ocrEnabled?'checked':''}> OCR locale per pagine scansite</label>
        </div>
        <div class="setting-row">
          <label for="redactionMode">Tipo oscuramento</label>
          <select id="redactionMode">
            <option value="black" ${state.redactionMode==='black'?'selected':''}>Blocco nero continuo</option>
            <option value="redacted" ${state.redactionMode==='redacted'?'selected':''}>[REDACTED]</option>
            <option value="stars" ${state.redactionMode==='stars'?'selected':''}>***</option>
          </select>
        </div>
        <div class="setting-row">
          <label for="precisionMode">Precisione rettangoli</label>
          <select id="precisionMode">
            <option value="precise" ${state.precisionMode==='precise'?'selected':''}>Precisa</option>
            <option value="normal" ${state.precisionMode==='normal'?'selected':''}>Normale</option>
            <option value="wide" ${state.precisionMode==='wide'?'selected':''}>Ampia</option>
          </select>
        </div>
      </section>

      <section class="panel workspace">
        <div class="workspace-head">
          <div>
            <div class="panel-title">Coda documenti</div>
            <div class="muted" id="queueText">Nessun documento caricato</div>
          </div>
          <div class="actions">
            <button id="analyzeBtn" class="primary" disabled>Rileva dati</button>
            <button id="cancelBtn" class="ghost" disabled>Annulla</button>
            <button id="resetBtn" class="ghost">Reset</button>
          </div>
        </div>
        <div class="progress-wrap hidden" id="progressWrap">
          <div class="progress-label" id="progressLabel">Preparazione…</div>
          <div class="progress"><div id="progressBar"></div></div>
        </div>
      </section>

      <div class="mobile-workspace-tabs" role="tablist" aria-label="Vista mobile">
        <button id="mobilePreviewTab" class="mobile-tab active" type="button" role="tab" aria-selected="true">Anteprima</button>
        <button id="mobileFindingsTab" class="mobile-tab" type="button" role="tab" aria-selected="false">Rilevamenti <span id="mobileFindingsBadge">0</span></button>
      </div>

      <section class="split" id="reviewSplit" data-mobile-view="preview">
        <div class="panel findings-panel">
          <div class="findings-head">
            <div>
              <div class="panel-title">Rilevamenti</div>
              <div class="muted" id="findingsCount">0 rilevamenti</div>
            </div>
            <button id="resetFiltersBtn" class="ghost compact filter-reset" type="button">Azzera filtri</button>
          </div>
          <div class="findings-filters" id="findingsFilters">
            <label class="filter-field">
              <span>Tipo</span>
              <select id="filterType">
                <option value="all">Tutti</option>
                <option value="name">Nomi</option>
                <option value="cf">Codici fiscali</option>
                <option value="email">Email / PEC</option>
                <option value="phone">Telefoni</option>
                <option value="iban">IBAN</option>
                <option value="piva">P. IVA</option>
                <option value="address">Indirizzi</option>
                <option value="date">Date</option>
                <option value="manual">Aree manuali</option>
              </select>
            </label>
            <label class="filter-field">
              <span>Stato</span>
              <select id="filterStatus">
                <option value="all">Tutti</option>
                <option value="active">Attivi</option>
                <option value="inactive">Disattivati</option>
              </select>
            </label>
            <label class="filter-field">
              <span>Pagina</span>
              <select id="filterPage">
                <option value="all">Tutte</option>
                <option value="current">Pagina corrente</option>
              </select>
            </label>
            <label class="filter-field filter-search">
              <span>Ricerca</span>
              <input id="filterSearch" type="search" placeholder="Cerca nei rilevamenti…" autocomplete="off">
            </label>
          </div>
          <div id="findings" class="findings empty">Carica e analizza un documento.</div>
        </div>
        <div class="panel preview-panel">
          <div class="preview-head">
            <div>
              <div class="panel-title">Anteprima</div>
              <div class="muted" id="pageLabel"></div>
            </div>
            <div class="preview-controls">
              <button id="prevPageBtn" class="ghost compact" disabled>←</button>
              <button id="nextPageBtn" class="ghost compact" disabled>→</button>
              <button id="manualAreaBtn" class="ghost" disabled>＋ Area manuale</button>
              <button id="adjustAreaBtn" class="ghost" disabled>↔ Regola aree</button>
              <select id="zoomSelect" class="zoom-select" disabled>
                <option value="0.8" ${state.previewZoom===0.8?'selected':''}>80%</option>
                <option value="1" ${state.previewZoom===1?'selected':''}>100%</option>
                <option value="1.25" ${state.previewZoom===1.25?'selected':''}>125%</option>
                <option value="1.5" ${state.previewZoom===1.5?'selected':''}>150%</option>
                <option value="2" ${state.previewZoom===2?'selected':''}>200%</option>
              </select>
            </div>
          </div>
          <div id="thumbStrip" class="thumb-strip hidden"></div>
          <div id="preview" class="preview empty">L'anteprima apparirà qui.</div>
        </div>
      </section>

      <section class="panel export-panel">
        <div>
          <strong>Controllo visivo dell’operatore obbligatorio.</strong>
          <div class="muted">Verifica sempre i rilevamenti prima dell’esportazione.</div>
        </div>
        <div class="actions">
          <button id="exportBtn" class="danger" disabled>Anonimizza e scarica</button>
        </div>
      </section>

      <section class="panel info-panel">
        <details open>
          <summary>Informazioni, privacy e disclaimer</summary>
          <div class="info-grid">
            <div class="info-card privacy-card">
              <h3>Elaborazione locale</h3>
              <p>A.D.A. Web elabora i documenti nel browser del dispositivo. Il progetto non prevede un backend per caricare i PDF né un archivio remoto dei documenti.</p>
            </div>
            <div class="info-card warning-card">
              <h3>Uso responsabile</h3>
              <p>Il software è uno strumento di supporto e non sostituisce la valutazione giuridica, amministrativa o del titolare del trattamento. Prima dell’utilizzo o della diffusione del documento è necessario verificare manualmente che l’oscuramento sia adeguato alla finalità concreta.</p>
            </div>
          </div>
          <div class="disclaimer-text">
            <p><strong>Attenzione:</strong> la rimozione di nomi o identificativi diretti, da sola, può non essere sufficiente a rendere un documento anonimo se informazioni di contesto permettono ancora di identificare una persona. Particolare cautela è richiesta prima di utilizzare documenti in attività di ricerca, addestramento o valutazione di sistemi di intelligenza artificiale, condivisione con terzi, pubblicazione online o adempimenti di trasparenza.</p>
            <p>A.D.A. Web non determina automaticamente se un documento debba essere anonimizzato, pseudonimizzato, pubblicato o condiviso: tali decisioni dipendono dalla base giuridica, dalla finalità e dal contesto del trattamento.</p>
          </div>
        </details>

        <details>
          <summary>Per saperne di più</summary>
          <div class="reference-list">
            <a href="https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=it" target="_blank" rel="noopener noreferrer"><strong>Regolamento (UE) 2016/679 — GDPR</strong><span>Principi di protezione dei dati, minimizzazione, privacy by design e anonimizzazione.</span></a>
            <a href="https://www.garanteprivacy.it/web/guest/home/docweb/-/docweb-display/docweb/3134436" target="_blank" rel="noopener noreferrer"><strong>Garante Privacy — Trasparenza sul web e dati personali</strong><span>Linee guida per atti e documenti amministrativi pubblicati online.</span></a>
            <a href="https://www.edpb.europa.eu/documents/opinion-of-the-board-art-64/opinion-282024-on-certain-data-protection-aspects-related-to_it" target="_blank" rel="noopener noreferrer"><strong>EDPB — Parere 28/2024 sui modelli di IA</strong><span>Aspetti di protezione dei dati nel trattamento di dati personali nel contesto dei modelli di IA.</span></a>
            <a href="https://www.edpb.europa.eu/public-consultations/guidelines-012025-on-pseudonymisation_it" target="_blank" rel="noopener noreferrer"><strong>EDPB — Linee guida 01/2025 sulla pseudonimizzazione</strong><span>Quadro europeo di riferimento sulla pseudonimizzazione.</span></a>
            <a href="https://www.edpb.europa.eu/public-consultations/guidelines-022026-on-anonymisation_en" target="_blank" rel="noopener noreferrer"><strong>EDPB — Guidelines 02/2026 on Anonymisation</strong><span>Documento in consultazione pubblica sull’anonimizzazione: utile come riferimento tecnico-giuridico aggiornato.</span></a>
          </div>
        </details>
      </section>
    </main>
    <footer class="mic-footer understated-footer">
      <div class="footer-mark">
        <img src="${import.meta.env.BASE_URL}ada-icon.png" alt="Icona A.D.A.">
      </div>
      <div><strong>A.D.A. Web</strong> · elaborazione locale · nessun documento viene trasmesso a server esterni<br><span>Tool sviluppato dalla Soprintendenza ABAP per le Province di Salerno e Avellino, Ufficio Informatico.</span></div>
    </footer>
    ${renderFirstUseModal()}
  `;
  bind();
}

function chip(key,label){
  return `<label class="chip ${ENABLED_TYPES[key]?'on':''}"><input data-type="${key}" type="checkbox" ${ENABLED_TYPES[key]?'checked':''}>${label}</label>`;
}

function bind(){
  const fileInput = document.querySelector('#fileInput');
  document.querySelector('#chooseBtn').onclick = () => fileInput.click();
  fileInput.onchange = e => addFiles([...e.target.files]);
  const dz = document.querySelector('#dropzone');
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('dragging')}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('dragging')}));
  dz.addEventListener('drop',e=>addFiles([...e.dataTransfer.files].filter(f=>f.type==='application/pdf')));

  document.querySelectorAll('[data-type]').forEach(i=>i.onchange=e=>{
    ENABLED_TYPES[e.target.dataset.type]=e.target.checked;
    e.target.closest('.chip').classList.toggle('on',e.target.checked);
  });
  document.querySelector('#ocrToggle').onchange=e=>state.ocrEnabled=e.target.checked;
  document.querySelector('#redactionMode').onchange=e=>state.redactionMode=e.target.value;
  document.querySelector('#precisionMode').onchange=e=>{state.precisionMode=e.target.value; if(state.pdfBytes) renderPreview(state.currentPage);};
  document.querySelector('#analyzeBtn').onclick=analyzeCurrent;
  document.querySelector('#cancelBtn').onclick=()=>{state.abort=true;};
  document.querySelector('#resetBtn').onclick=resetSession;
  document.querySelector('#exportBtn').onclick=exportRedacted;
  document.querySelector('#prevPageBtn').onclick=()=>goToPage(state.currentPage-1);
  document.querySelector('#nextPageBtn').onclick=()=>goToPage(state.currentPage+1);
  document.querySelector('#manualAreaBtn').onclick=toggleManualMode;
  document.querySelector('#adjustAreaBtn').onclick=toggleAdjustMode;
  document.querySelector('#zoomSelect').onchange=e=>{state.previewZoom=Number(e.target.value)||1; if(state.pdfBytes) renderPreview(state.currentPage);};
  const mobilePreviewTab=document.querySelector('#mobilePreviewTab');
  const mobileFindingsTab=document.querySelector('#mobileFindingsTab');
  const setMobileView=(view)=>{
    state.mobileView=view;
    const split=document.querySelector('#reviewSplit');
    if(split) split.dataset.mobileView=view;
    [mobilePreviewTab,mobileFindingsTab].forEach((btn,idx)=>{
      if(!btn) return;
      const active=(idx===0&&view==='preview')||(idx===1&&view==='findings');
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',active?'true':'false');
    });
    if(view==='findings') document.querySelector('.findings-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  if(mobilePreviewTab) mobilePreviewTab.onclick=()=>setMobileView('preview');
  if(mobileFindingsTab) mobileFindingsTab.onclick=()=>setMobileView('findings');
  setMobileView(state.mobileView);

  // 0.1.9: attiva la UI compatta in base alla larghezza REALE del pannello
  // Rilevamenti, non solo alla viewport. Questo evita layout errati con zoom browser,
  // finestre ridimensionate o colonne che diventano troppo strette.
  const updateResponsiveReview = () => {
    const findingsPanel = document.querySelector('.findings-panel');
    const split = document.querySelector('#reviewSplit');
    if(!findingsPanel || !split) return;
    // Measure available desktop-column space, not the panel that this class
    // hides/expands. Otherwise ResizeObserver alternates compact/full forever.
    // Keep in sync with .split: minmax(340px,.9fr) minmax(0,1.5fr).
    const gap = parseFloat(getComputedStyle(split).columnGap) || 0;
    const panelWidth = Math.max(340, (split.getBoundingClientRect().width - gap) * .9 / 2.4);
    const visualWidth = window.visualViewport?.width || window.innerWidth;
    const compact = (panelWidth > 0 && panelWidth < 620) || visualWidth < 1100;
    document.body.classList.toggle('ada-compact-review', compact);
  };
  updateResponsiveReview();
  if('ResizeObserver' in window){
    const ro = new ResizeObserver(updateResponsiveReview);
    ro.observe(document.querySelector('#reviewSplit'));
    ro.observe(document.querySelector('.findings-panel'));
  }
  window.addEventListener('resize', updateResponsiveReview, {passive:true});
  window.visualViewport?.addEventListener('resize', updateResponsiveReview, {passive:true});

  const filterType=document.querySelector('#filterType');
  const filterStatus=document.querySelector('#filterStatus');
  const filterPage=document.querySelector('#filterPage');
  const filterSearch=document.querySelector('#filterSearch');
  filterType.value=state.filters.type;
  filterStatus.value=state.filters.status;
  filterPage.value=state.filters.page;
  filterSearch.value=state.filters.search;
  filterType.onchange=e=>{state.filters.type=e.target.value;renderFindings();};
  filterStatus.onchange=e=>{state.filters.status=e.target.value;renderFindings();};
  filterPage.onchange=e=>{state.filters.page=e.target.value;renderFindings();};
  filterSearch.oninput=e=>{state.filters.search=e.target.value;renderFindings();};
  document.querySelector('#resetFiltersBtn').onclick=()=>{
    state.filters={type:'all',status:'all',page:'all',search:''};
    syncFindingFilterControls();
    renderFindings();
  };
  bindPolicyModal();
  updateQueue();
  updatePreviewControls();
}

function addFiles(files){
  if(!files.length) return;
  state.files.push(...files);
  state.currentIndex = state.files.length- files.length;
  updateQueue();
}

function updateQueue(){
  const q = document.querySelector('#queueText');
  const a = document.querySelector('#analyzeBtn');
  if(!q||!a) return;
  if(!state.files.length){ q.textContent='Nessun documento caricato'; a.disabled=true; return; }
  q.textContent = `${state.files.length} file • corrente: ${state.files[state.currentIndex].name}`;
  a.disabled=false;
}

function setBusy(on,label=''){
  document.querySelector('#progressWrap').classList.toggle('hidden',!on);
  document.querySelector('#analyzeBtn').disabled=on || !state.files.length;
  document.querySelector('#cancelBtn').disabled=!on;
  if(label) document.querySelector('#progressLabel').textContent=label;
}
function progress(p,label){
  document.querySelector('#progressBar').style.width=`${Math.max(0,Math.min(100,p))}%`;
  if(label) document.querySelector('#progressLabel').textContent=label;
}

async function analyzeCurrent(){
  if(!state.files.length) return;
  state.abort=false; state.findings=[]; state.pages=[]; state.outputBytes=null; state.currentPage=1; state.totalPages=0; state.manualMode=false; state.adjustMode=false;
  setBusy(true,'Lettura PDF…'); progress(2);
  try{
    const file=state.files[state.currentIndex];
    state.pdfBytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask=pdfjsLib.getDocument({data:state.pdfBytes.slice()});
    const pdf=await loadingTask.promise;
    state.totalPages=pdf.numPages;
    updatePreviewControls();
    for(let p=1;p<=pdf.numPages;p++){
      if(state.abort) throw new Error('Operazione annullata');
      const page=await pdf.getPage(p);
      const viewport=page.getViewport({scale:1.35});
      const textContent=await page.getTextContent();
      const items=textContent.items.filter(i=>i.str && i.str.trim());
      const text=items.map(i=>i.str).join(' ');
      const pageData={pageNumber:p,viewport,items,text,ocrText:'',ocrWords:[]};

      if(text.trim().length<25 && state.ocrEnabled){
        progress(((p-1)/pdf.numPages)*70+5,`OCR locale pagina ${p}/${pdf.numPages}…`);
        const canvas=document.createElement('canvas');
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
        await page.render({canvasContext:ctx,viewport}).promise;
        if(!state.ocrWorker){
          state.ocrWorker=await createWorker('ita',1,{logger:m=>{ if(m.progress) progress(Math.min(75,5+m.progress*60),`OCR: ${m.status}`); }});
        }
        const r=await state.ocrWorker.recognize(canvas,{}, { blocks:true });
        pageData.ocrText=r.data.text||'';
        pageData.ocrWords=extractOcrWords(r.data);
      }
      state.pages.push(pageData);
      detectPage(pageData);
      progress(5+(p/pdf.numPages)*75,`Analisi pagina ${p}/${pdf.numPages}…`);
    }
    dedupeFindings();
    renderFindings();
    await renderPreview(1);
    await renderThumbnailStrip();
    document.querySelector('#exportBtn').disabled=state.findings.length===0;
    updatePreviewControls();
    progress(100,`Completato • ${state.findings.length} rilevamenti`);
  }catch(err){
    progress(100,err.message||'Errore');
  }finally{
    setBusy(false);
  }
}

function extractOcrWords(data){
  const out=[];
  const blocks=data.blocks||[];
  for(const b of blocks) for(const par of (b.paragraphs||[])) for(const line of (par.lines||[])) for(const w of (line.words||[])){
    if(w.text?.trim() && w.bbox) out.push({text:w.text,bbox:w.bbox});
  }
  return out;
}

function detectPage(page){
  const text=(page.text+' '+page.ocrText).replace(/\s+/g,' ');
  for(const def of PATTERNS){
    if(!ENABLED_TYPES[def.key]) continue;
    for(const m of text.matchAll(new RegExp(def.re.source,def.re.flags))){
      addFinding(def.type,def.key,m[0],page.pageNumber);
    }
  }
  if(ENABLED_TYPES.name){
    const nameRe=/\b(?:Sig\.?|Sig\.ra|Dott\.?|Dott\.ssa|Avv\.?|Ing\.?|Arch\.?)?\s*([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ']{2,})\s+([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ']{2,})\b/g;
    for(const m of text.matchAll(nameRe)){
      const v=(m[1]+' '+m[2]).trim();
      if(!/^(Comune|Ministero|Direzione|Ufficio|Provincia|Regione|Protocollo|Oggetto)$/i.test(v)) addFinding('Nome','name',v,page.pageNumber);
    }
  }
  if(ENABLED_TYPES.address){
    const addrRe=/\b(?:Via|Viale|Piazza|Corso|Largo|Vicolo|Strada|Località)\s+[A-ZÀ-ÖØ-Ý][\wÀ-ÿ'.\- ]{2,50}(?:,?\s*\d{1,4}[A-Za-z\/]*)?/g;
    for(const m of text.matchAll(addrRe)) addFinding('Indirizzo','address',m[0].trim(),page.pageNumber);
  }
}

function addFinding(type,key,value,page){
  if(!value || value.length<3) return;
  state.findings.push({id:crypto.randomUUID(),type,key,value:value.trim(),page,enabled:true});
}
function dedupeFindings(){
  const seen=new Set();
  state.findings=state.findings.filter(f=>{
    const k=`${f.key}|${f.value.toLowerCase()}|${f.page}`;
    if(seen.has(k)) return false; seen.add(k); return true;
  });
}

function syncFindingFilterControls(){
  const type=document.querySelector('#filterType');
  const status=document.querySelector('#filterStatus');
  const page=document.querySelector('#filterPage');
  const search=document.querySelector('#filterSearch');
  if(type) type.value=state.filters.type;
  if(status) status.value=state.filters.status;
  if(search) search.value=state.filters.search;
  if(page){
    const wanted=String(state.filters.page);
    const currentOptions=[...page.options].map(o=>o.value);
    if(!currentOptions.includes(wanted) && wanted!=='all' && wanted!=='current') state.filters.page='all';
    page.value=state.filters.page;
  }
}

function updateFindingPageFilterOptions(){
  const select=document.querySelector('#filterPage');
  if(!select) return;
  const selected=String(state.filters.page);
  const pages=Math.max(state.totalPages||0,...state.findings.map(f=>Number(f.page)||0));
  select.innerHTML=`<option value="all">Tutte</option><option value="current">Pagina corrente</option>${Array.from({length:pages},(_,i)=>`<option value="${i+1}">Pagina ${i+1}</option>`).join('')}`;
  const valid=[...select.options].some(o=>o.value===selected);
  if(!valid) state.filters.page='all';
  select.value=state.filters.page;
}

function filteredFindings(){
  const q=normalize(state.filters.search);
  return state.findings.filter(f=>{
    if(state.filters.type!=='all' && f.key!==state.filters.type) return false;
    if(state.filters.status==='active' && !f.enabled) return false;
    if(state.filters.status==='inactive' && f.enabled) return false;
    if(state.filters.page==='current' && Number(f.page)!==Number(state.currentPage)) return false;
    if(state.filters.page!=='all' && state.filters.page!=='current' && Number(f.page)!==Number(state.filters.page)) return false;
    if(q){
      const hay=normalize(`${f.type} ${f.value||''} pagina ${f.page}`);
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderFindings(){
  const el=document.querySelector('#findings');
  const count=document.querySelector('#findingsCount');
  if(!el) return;
  updateFindingPageFilterOptions();
  syncFindingFilterControls();
  const total=state.findings.length;
  const visible=filteredFindings();
  if(count) count.textContent=total ? `${visible.length} di ${total} rilevamenti` : '0 rilevamenti';
  const mobileBadge=document.querySelector('#mobileFindingsBadge');
  if(mobileBadge) mobileBadge.textContent=String(total);
  if(!total){
    el.className='findings empty';
    el.textContent='Nessun dato rilevato automaticamente. Puoi aggiungere aree manuali dall’anteprima.';
    return;
  }
  if(!visible.length){
    el.className='findings empty filtered-empty';
    el.innerHTML='<div><strong>Nessun rilevamento con questi filtri.</strong><br><span class="muted">Modifica i filtri oppure premi “Azzera filtri”.</span></div>';
    return;
  }
  el.className='findings';
  el.innerHTML=visible.map(f=>`<div class="finding ${f.enabled?'':'off'} ${f.manual?'manual-finding':''}" data-finding-row="${f.id}">
    <label class="switch"><input type="checkbox" data-fid="${f.id}" ${f.enabled?'checked':''}><span></span></label>
    <div class="finding-main"><div class="finding-type">${escapeHtml(f.type)} • pag. ${f.page}</div>${f.manual
      ? `<div class="manual-label">Area selezionata manualmente</div>`
      : `<input data-edit="${f.id}" value="${escapeHtml(f.value)}">`}</div>
    ${f.manual?`<button class="remove-finding" data-remove="${f.id}" title="Elimina area">×</button>`:''}
  </div>`).join('');
  el.querySelectorAll('[data-fid]').forEach(i=>i.onchange=e=>{
    const f=state.findings.find(x=>x.id===e.target.dataset.fid);
    if(!f) return;
    f.enabled=e.target.checked;
    renderFindings();
    renderPreview(f.page);
  });
  el.querySelectorAll('[data-edit]').forEach(i=>i.onchange=e=>{
    const f=state.findings.find(x=>x.id===e.target.dataset.edit);
    if(!f) return;
    f.value=e.target.value;
    renderFindings();
    renderPreview(f.page);
  });
  el.querySelectorAll('[data-remove]').forEach(b=>b.onclick=e=>{
    const id=e.currentTarget.dataset.remove;
    const f=state.findings.find(x=>x.id===id);
    state.findings=state.findings.filter(x=>x.id!==id);
    renderFindings();
    if(f) renderPreview(f.page);
    document.querySelector('#exportBtn').disabled=state.findings.length===0;
  });
}

async function renderPreview(pageNum){
  if(!state.pdfBytes) return;
  pageNum=Math.max(1,Math.min(pageNum,state.totalPages||1));
  state.currentPage=pageNum;
  if(state.filters.page==='current') renderFindings();
  const preview=document.querySelector('#preview');
  preview.className='preview'; preview.innerHTML='';
  const pdf=await pdfjsLib.getDocument({data:state.pdfBytes.slice()}).promise;
  state.totalPages=pdf.numPages;
  const page=await pdf.getPage(pageNum);
  const viewport=page.getViewport({scale:1.35});
  const wrap=document.createElement('div'); wrap.className='canvas-wrap';
  wrap.style.width=`${state.previewZoom*100}%`;
  wrap.style.maxWidth='none';
  const canvas=document.createElement('canvas'); const ctx=canvas.getContext('2d');
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  canvas.style.width='100%';canvas.style.height='auto';
  await page.render({canvasContext:ctx,viewport}).promise;
  wrap.appendChild(canvas);
  const overlay=document.createElement('div'); overlay.className='overlay';
  overlay.innerHTML=`<div class="preview-watermark">ANTEPRIMA • pag. ${pageNum}</div>`;
  wrap.appendChild(overlay); preview.appendChild(wrap);
  document.querySelector('#pageLabel').textContent=`Pagina ${pageNum} di ${pdf.numPages}`;

  const pageFindings=state.findings.filter(f=>f.enabled&&f.page===pageNum);
  const tc=await page.getTextContent();
  const items=tc.items.filter(i=>i.str&&i.str.trim());
  for(const f of pageFindings){
    if((f.manual && f.coords) || f.overrideCoords){
      const box=appendManualBox(overlay,f.overrideCoords||f.coords,false);
      box.dataset.findingId=f.id;
      box.classList.add(f.manual?'manual-box':'adjusted-box');
      continue;
    }
    const matches=findRectsForFinding(f,items,viewport);
    for(const coords of matches){
      const box=appendManualBox(overlay,coords,false);
      box.dataset.findingId=f.id;
      box.classList.add('auto-box');
    }
  }
  applyInteractionMode(overlay);
  updatePreviewControls();
  highlightActiveThumbnail();
}

function precisionConfig(){
  if(state.precisionMode==='wide') return {top:1.02,height:1.25,padX:3};
  if(state.precisionMode==='normal') return {top:.95,height:1.10,padX:2};
  return {top:.88,height:.98,padX:1};
}

function findRectsForFinding(f,items,viewport){
  const needle=normalize(f.value);
  if(!needle) return [];
  const cfg=precisionConfig();
  const rects=[];
  for(const item of items){
    const istr=normalize(item.str);
    if(!istr) continue;
    const tx=pdfjsLib.Util.transform(viewport.transform,item.transform);
    const fontH=Math.max(6,Math.hypot(tx[2],tx[3]));
    const fullW=Math.max(1,item.width*viewport.scale);
    let x=tx[4], w=fullW;
    let matched=false;
    const idx=istr.indexOf(needle);
    if(idx>=0){
      const ratioStart=idx/Math.max(1,istr.length);
      const ratioLen=needle.length/Math.max(1,istr.length);
      x += fullW*ratioStart;
      w = Math.max(fontH*.7,fullW*ratioLen);
      matched=true;
    }else if(needle.includes(istr) && istr.length>3){
      matched=true;
    }
    if(!matched) continue;
    x=Math.max(0,x-cfg.padX);
    w=Math.min(viewport.width-x,w+cfg.padX*2);
    const y=Math.max(0,tx[5]-fontH*cfg.top);
    const h=Math.min(viewport.height-y,fontH*cfg.height);
    rects.push({x:x/viewport.width,y:y/viewport.height,w:w/viewport.width,h:h/viewport.height});
  }
  return rects;
}

function appendManualBox(overlay,coords,draft=false){
  const r=document.createElement('div');
  r.className=`redaction-box manual-box${draft?' draft':''}`;
  r.style.left=`${coords.x*100}%`;r.style.top=`${coords.y*100}%`;r.style.width=`${coords.w*100}%`;r.style.height=`${coords.h*100}%`;
  overlay.appendChild(r);
  return r;
}

function updatePreviewControls(){
  const prev=document.querySelector('#prevPageBtn');
  const next=document.querySelector('#nextPageBtn');
  const manual=document.querySelector('#manualAreaBtn');
  const adjust=document.querySelector('#adjustAreaBtn');
  const zoom=document.querySelector('#zoomSelect');
  if(!prev||!next||!manual||!adjust||!zoom) return;
  const hasPdf=!!state.pdfBytes && state.totalPages>0;
  prev.disabled=!hasPdf || state.currentPage<=1;
  next.disabled=!hasPdf || state.currentPage>=state.totalPages;
  manual.disabled=!hasPdf;
  adjust.disabled=!hasPdf;
  zoom.disabled=!hasPdf;
  manual.classList.toggle('active',state.manualMode);
  adjust.classList.toggle('active',state.adjustMode);
  manual.textContent=state.manualMode?'✓ Disegna area':'＋ Area manuale';
  adjust.textContent=state.adjustMode?'✓ Regola aree':'↔ Regola aree';
}

async function goToPage(page){
  if(!state.pdfBytes) return;
  await renderPreview(page);
}

function toggleManualMode(){
  if(!state.pdfBytes) return;
  state.manualMode=!state.manualMode;
  if(state.manualMode) state.adjustMode=false;
  renderPreview(state.currentPage);
}

function toggleAdjustMode(){
  if(!state.pdfBytes) return;
  state.adjustMode=!state.adjustMode;
  if(state.adjustMode) state.manualMode=false;
  renderPreview(state.currentPage);
}

function applyInteractionMode(overlay){
  overlay.classList.toggle('manual-mode',state.manualMode);
  overlay.classList.toggle('adjust-mode',state.adjustMode);
  if(state.manualMode) applyManualDrawing(overlay);
  if(state.adjustMode) enableBoxAdjustment(overlay);
}

function applyManualDrawing(overlay){
  let start=null,draft=null;
  const point=e=>{
    const rect=overlay.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};
  };
  overlay.onpointerdown=e=>{
    if(e.target.classList.contains('preview-watermark')) return;
    e.preventDefault(); overlay.setPointerCapture?.(e.pointerId);
    start=point(e); draft=appendManualBox(overlay,{x:start.x,y:start.y,w:0,h:0},true);
  };
  overlay.onpointermove=e=>{
    if(!start||!draft) return; e.preventDefault();
    const p=point(e); const x=Math.min(start.x,p.x),y=Math.min(start.y,p.y),w=Math.abs(p.x-start.x),h=Math.abs(p.y-start.y);
    draft.style.left=`${x*100}%`;draft.style.top=`${y*100}%`;draft.style.width=`${w*100}%`;draft.style.height=`${h*100}%`;
  };
  const finish=e=>{
    if(!start) return;
    const p=point(e); const coords={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)};
    start=null; draft?.remove(); draft=null;
    if(coords.w<0.005||coords.h<0.003) return;
    state.findings.push({id:crypto.randomUUID(),type:'Area manuale',key:'manual',value:'',page:state.currentPage,enabled:true,manual:true,coords});
    renderFindings();
    document.querySelector('#exportBtn').disabled=false;
    renderPreview(state.currentPage);
  };
  overlay.onpointerup=finish;
  overlay.onpointercancel=()=>{start=null;draft?.remove();draft=null;};
}

function enableBoxAdjustment(overlay){
  const boxes=[...overlay.querySelectorAll('.redaction-box:not(.draft)')];
  for(const box of boxes){
    const id=box.dataset.findingId;
    const f=state.findings.find(x=>x.id===id);
    if(!f) continue;
    box.classList.add('editable-box');
    const handle=document.createElement('span');
    handle.className='resize-handle';
    box.appendChild(handle);
    let action=null,start=null,initial=null;
    const readCoords=()=>({
      x:parseFloat(box.style.left)/100,
      y:parseFloat(box.style.top)/100,
      w:parseFloat(box.style.width)/100,
      h:parseFloat(box.style.height)/100,
    });
    const point=e=>{
      const r=overlay.getBoundingClientRect();
      return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};
    };
    const down=e=>{
      e.preventDefault();e.stopPropagation();
      action=e.target===handle?'resize':'move';
      start=point(e);initial=readCoords();
      box.setPointerCapture?.(e.pointerId);
    };
    box.addEventListener('pointerdown',down);
    box.addEventListener('pointermove',e=>{
      if(!action) return;
      e.preventDefault();e.stopPropagation();
      const p=point(e),dx=p.x-start.x,dy=p.y-start.y;
      let c={...initial};
      if(action==='move'){
        c.x=Math.max(0,Math.min(1-c.w,initial.x+dx));
        c.y=Math.max(0,Math.min(1-c.h,initial.y+dy));
      }else{
        c.w=Math.max(.005,Math.min(1-c.x,initial.w+dx));
        c.h=Math.max(.003,Math.min(1-c.y,initial.h+dy));
      }
      box.style.left=`${c.x*100}%`;box.style.top=`${c.y*100}%`;box.style.width=`${c.w*100}%`;box.style.height=`${c.h*100}%`;
    });
    const up=e=>{
      if(!action) return;
      e.preventDefault();e.stopPropagation();
      const c=readCoords();
      if(f.manual) f.coords=c; else f.overrideCoords=c;
      action=null;start=null;initial=null;
    };
    box.addEventListener('pointerup',up);
    box.addEventListener('pointercancel',()=>{action=null;start=null;initial=null;});
  }
}

async function renderThumbnailStrip(){
  if(!state.pdfBytes) return;
  const strip=document.querySelector('#thumbStrip');
  strip.innerHTML=''; strip.classList.remove('hidden');
  const pdf=await pdfjsLib.getDocument({data:state.pdfBytes.slice()}).promise;
  for(let p=1;p<=pdf.numPages;p++){
    const btn=document.createElement('button');btn.className='thumb';btn.dataset.page=String(p);btn.title=`Vai a pagina ${p}`;
    const page=await pdf.getPage(p); const vp=page.getViewport({scale:.18});
    const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(vp.width));c.height=Math.max(1,Math.ceil(vp.height));
    await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    const label=document.createElement('span');label.textContent=String(p);
    btn.append(c,label);btn.onclick=()=>goToPage(p);strip.appendChild(btn);
  }
  highlightActiveThumbnail();
}

function highlightActiveThumbnail(){
  document.querySelectorAll('.thumb').forEach(b=>b.classList.toggle('active',Number(b.dataset.page)===state.currentPage));
  const active=document.querySelector('.thumb.active');
  active?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
}

function normalize(s){return (s||'').toLowerCase().replace(/\s+/g,' ').trim();}

async function exportRedacted(){
  if(!state.pdfBytes) return;
  state.abort=false; setBusy(true,'Preparazione esportazione…'); progress(5);
  try{
    const src=await pdfjsLib.getDocument({data:state.pdfBytes.slice()}).promise;
    const out=await PDFDocument.create();
    const helv=await out.embedFont(StandardFonts.Helvetica);
    for(let p=1;p<=src.numPages;p++){
      if(state.abort) throw new Error('Esportazione annullata');
      const page=await src.getPage(p);
      const vp=page.getViewport({scale:2});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
      const ctx=canvas.getContext('2d');
      await page.render({canvasContext:ctx,viewport:vp}).promise;
      const t=await page.getTextContent();
      const items=t.items.filter(i=>i.str&&i.str.trim());
      const fs=state.findings.filter(f=>f.enabled&&f.page===p);
      for(const f of fs.filter(x=>(x.manual&&x.coords)||x.overrideCoords)){
        const c=f.overrideCoords||f.coords; ctx.fillStyle='black'; ctx.fillRect(c.x*vp.width,c.y*vp.height,c.w*vp.width,c.h*vp.height);
      }
      for(const f of fs.filter(x=>!x.manual&&!x.overrideCoords)){
        for(const c of findRectsForFinding(f,items,vp)){
          ctx.fillStyle='black';
          ctx.fillRect(c.x*vp.width,c.y*vp.height,c.w*vp.width,c.h*vp.height);
        }
      }
      // OCR-only findings: conservative full-page text cannot be mapped reliably without word boxes in this MVP.
      // If OCR words exist, map exact/partial word matches and burn them into the raster.
      const pd=state.pages.find(x=>x.pageNumber===p);
      if(pd?.ocrWords?.length){
        for(const f of fs){
          const parts=normalize(f.value).split(' ').filter(Boolean);
          for(const w of pd.ocrWords){
            if(parts.some(part=>normalize(w.text)===part && part.length>2)){
              const sx=vp.width/pd.viewport.width, sy=vp.height/pd.viewport.height;
              const b=w.bbox; ctx.fillStyle='black';ctx.fillRect(b.x0*sx,b.y0*sy,(b.x1-b.x0)*sx,(b.y1-b.y0)*sy);
            }
          }
        }
      }
      const png=await new Promise(res=>canvas.toBlob(res,'image/png',0.92));
      const pngBytes=new Uint8Array(await png.arrayBuffer());
      const img=await out.embedPng(pngBytes);
      const op=out.addPage([vp.width,vp.height]); op.drawImage(img,{x:0,y:0,width:vp.width,height:vp.height});
      if(state.redactionMode!=='black' && fs.length){
        op.drawText(state.redactionMode==='redacted'?'[REDACTED]':'***',{x:12,y:12,size:8,font:helv,color:rgb(.2,.2,.2)});
      }
      progress(10+(p/src.numPages)*80,`Anonimizzazione pagina ${p}/${src.numPages}…`);
    }
    state.outputBytes=await out.save();
    const blob=new Blob([state.outputBytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    const srcName=state.files[state.currentIndex].name.replace(/\.pdf$/i,'');
    a.href=url;a.download=`${srcName}_ANONIMIZZATO.pdf`;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    progress(100,'Documento anonimizzato e scaricato');
  }catch(err){ progress(100,err.message||'Errore esportazione'); }
  finally{setBusy(false);}
}

async function resetSession(){
  state.abort=true;
  if(state.ocrWorker){ try{await state.ocrWorker.terminate();}catch{} state.ocrWorker=null; }
  state.files=[];state.findings=[];state.pages=[];state.pdfBytes=null;state.outputBytes=null;state.currentIndex=0;state.currentPage=1;state.totalPages=0;state.manualMode=false; state.adjustMode=false;state.filters={type:'all',status:'all',page:'all',search:''};
  render();
}

window.addEventListener('beforeunload',()=>{ state.pdfBytes=null;state.outputBytes=null;state.files=[];state.pages=[];state.findings=[]; });
render();
