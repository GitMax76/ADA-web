import './style.css';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';
import { createWorker } from 'tesseract.js';
import { recognizeOrientedPage } from './ocr-layout.js';
import { completeAddresses, signatureSuggestion } from './contact-regions.js';

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
  busy: false,
  documents: new Map(),
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
  manualKind: 'manual',
  adjustMode: false,
  precisionMode: 'precise',
  previewZoom: 1,
  filters: { type: 'all', status: 'all', page: 'all', search: '' },
  mobileView: 'preview',
  wizardStep: 1,
  pdfType: 'unknown',
  currentStage: 'idle',
  analysisWarnings: [],
  analysisSettings: null,
  diagEvents: [],
};

const PATTERNS = [
  { type: 'Codice fiscale', key: 'cf', re: /\b[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/gi },
  { type: 'Protocollo / identificativo', key: 'protocol', re: /\bINPS-ISEE-\d{4}-[A-Z0-9]+-\d{2}\b/gi },
  { type: 'IBAN', key: 'iban', re: /\bIT\s?\d{2}\s?[A-Z]\s?\d{5}\s?\d{5}\s?[A-Z0-9]{12}\b/gi },
  { type: 'Email / PEC', key: 'email', re: /\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9-]+(?:\s*\.\s*[A-Z0-9-]+)*\s*\.\s*[A-Z]{2,}\b/gi },
  { type: 'P. IVA', key: 'piva', re: /\b(?:IT\s*)?\d{11}\b/g },
  { type: 'Telefono', key: 'phone', re: /(?<![A-Z0-9-])(?:\+39\s?)?(?:0\d{1,4}[\s./-]?\d{5,8}|3\d{2}[\s./-]?\d{6,7})(?![A-Z0-9-])/gi },
  { type: 'Data', key: 'date', re: /\b(?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[0-2])[\/.-](?:19|20)\d{2}\b/g },
  { type: 'Importo / valore', key: 'amount', re: /(?<![\d.,])(?:[+-]\s*)?\d{1,3}(?:\.\d{3})*,\d{2}(?![\d.,])/g },
];

const ENABLED_TYPES = {
  cf: true, personalid: true, birthdate: true, protocol: true, iban: true, email: true,
  piva: true, phone: true, date: false, amount: false, name: true, address: true, signature: true
};

function escapeHtml(s='') {
  return s.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}


const APP_VERSION='0.3.4-beta';
const BUG_REPO_URL='https://github.com/GitMax76/ADA-web/issues/new';
const DIAG_MAX=20;
const OCR_INIT_TIMEOUT=60000;
const OCR_PAGE_TIMEOUT=90000;

const PROFILES={
  standard:{label:'Standard',types:{cf:true,personalid:true,birthdate:true,protocol:true,iban:true,email:true,piva:true,phone:true,name:true,address:true,signature:true,date:false,amount:false}},
  transparency:{label:'Trasparenza / Pubblicazione',types:{cf:true,personalid:true,birthdate:true,protocol:true,iban:true,email:true,piva:true,phone:true,name:true,address:true,signature:true,date:true,amount:false}},
  ai:{label:'Dataset / AI / Ricerca',types:{cf:true,personalid:true,birthdate:true,protocol:true,iban:true,email:true,piva:true,phone:true,name:true,address:true,signature:true,date:true,amount:true}},
};

function environmentSummary(){
  const ua=navigator.userAgent||'';
  const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Altro';
  const os=/Windows/i.test(ua)?'Windows':/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS/iPadOS':/Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Altro';
  const device=(navigator.maxTouchPoints||0)>0 && Math.min(screen.width,screen.height)<900?'mobile/tablet':'desktop';
  return {browser,os,device};
}

function safeErrorCode(stage,err){
  if(err && err.code) return String(err.code).replace(/[^A-Z0-9_-]/gi,'_').slice(0,60);
  const name=String((err&&err.name)||'Error').replace(/[^A-Z0-9_-]/gi,'_').slice(0,40);
  return String(stage||'UNKNOWN').toUpperCase().replace(/[^A-Z0-9_-]/g,'_')+'_'+name.toUpperCase();
}

function recordDiag(event,status='ok',details={}){
  const allowed={};
  for(const key of ['stage','code','page','pages','fileSizeMb','pdfType','ocrEnabled','findings','filesCount','warning']){
    if(details[key]!==undefined) allowed[key]=details[key];
  }
  state.diagEvents.push(Object.assign({
    at:new Date().toISOString(),
    event:String(event).slice(0,60),
    status:String(status).slice(0,20),
  },allowed));
  if(state.diagEvents.length>DIAG_MAX) state.diagEvents.splice(0,state.diagEvents.length-DIAG_MAX);
}

function diagnosticSnapshot(){
  const file=state.files[state.currentIndex];
  return {
    app:'A.D.A. Web',
    version:APP_VERSION,
    generatedAt:new Date().toISOString(),
    environment:environmentSummary(),
    session:{
      stage:state.currentStage,
      filesCount:state.files.length,
      pages:state.totalPages||0,
      fileSizeMb:file?Math.round((file.size/1024/1024)*2)/2:null,
      pdfType:state.pdfType,
      ocrEnabled:state.ocrEnabled,
      findings:state.findings.length,
    },
    events:state.diagEvents.slice(-DIAG_MAX),
    privacy:'Nessun contenuto del documento, nome file, percorso locale o dato rilevato è incluso.',
  };
}

function updateAnalysisHint(message='',kind='info'){
  const el=document.querySelector('#analysisHint');
  if(!el) return;
  el.textContent=message;
  el.className='analysis-hint'+(message?' show':'')+(kind?' '+kind:'');
}

function updateWizard(step){
  state.wizardStep=Math.max(1,Math.min(5,step||1));
  document.querySelectorAll('[data-wizard-step]').forEach(el=>{
    const n=Number(el.dataset.wizardStep);
    el.classList.toggle('done',n<state.wizardStep);
    el.classList.toggle('active',n===state.wizardStep);
  });
}

function syncTypeChips(){
  document.querySelectorAll('[data-type]').forEach(i=>{
    i.checked=!!ENABLED_TYPES[i.dataset.type];
    if(i.closest('.chip')) i.closest('.chip').classList.toggle('on',i.checked);
  });
}

function applyProfile(name){
  if(!PROFILES[name]) return;
  Object.assign(ENABLED_TYPES,PROFILES[name].types);
  syncTypeChips();
}

function withTimeout(promise,ms,code){
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
      const e=new Error(code);
      e.code=code;
      reject(e);
    },ms);
  });
  return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}

function renderBugModal(){
  return [
    '<div class="modal-backdrop hidden" id="bugModal" role="dialog" aria-modal="true" aria-labelledby="bugModalTitle">',
      '<div class="policy-modal bug-modal">',
        '<div class="policy-modal-head">',
          '<div><div class="policy-kicker">Assistenza</div><h2 id="bugModalTitle">Segnala un problema</h2><p>Descrivi cosa è successo. A.D.A. prepara solo informazioni tecniche non contenenti il documento.</p></div>',
          '<button class="ghost compact" id="bugCloseBtn" type="button" aria-label="Chiudi">×</button>',
        '</div>',
        '<label class="bug-field"><span>Tipo di problema</span><select id="bugCategory">',
          '<option>Caricamento documento</option>',
          '<option>Analisi bloccata o molto lenta</option>',
          '<option>Dato non rilevato</option>',
          '<option>Falso positivo / oscuramento errato</option>',
          '<option>Anteprima o navigazione</option>',
          '<option>Download / esportazione</option>',
          '<option>Altro</option>',
        '</select></label>',
        '<label class="bug-field"><span>Descrizione facoltativa</span><textarea id="bugDescription" rows="4" placeholder="Spiega in poche parole cosa stavi facendo. Non inserire nomi, codici fiscali o contenuti del documento."></textarea></label>',
        '<div class="bug-privacy">🔒 Il report non include file, nome del file, testo del PDF, dati rilevati o percorsi locali.</div>',
        '<details class="bug-diagnostics"><summary>Controlla le informazioni diagnostiche</summary><pre id="bugDiagnosticsPreview"></pre></details>',
        '<div class="policy-actions bug-actions">',
          '<button class="ghost" id="bugCopyBtn" type="button">Copia diagnostica</button>',
          '<button class="ghost" id="bugDownloadBtn" type="button">Scarica report</button>',
          '<button class="primary" id="bugIssueBtn" type="button">Apri segnalazione GitHub</button>',
        '</div>',
      '</div>',
    '</div>'
  ].join('');
}

function bindBugModal(){
  const modal=document.querySelector('#bugModal');
  const open=document.querySelector('#bugReportBtn');
  if(!modal||!open) return;
  const refresh=()=>{
    const pre=modal.querySelector('#bugDiagnosticsPreview');
    if(pre) pre.textContent=JSON.stringify(diagnosticSnapshot(),null,2);
  };
  const close=()=>{
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  };
  open.onclick=()=>{
    refresh();
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
  };
  modal.querySelector('#bugCloseBtn').onclick=close;
  modal.addEventListener('click',e=>{if(e.target===modal) close();});
  modal.querySelector('#bugCopyBtn').onclick=async()=>{
    refresh();
    try{
      await navigator.clipboard.writeText(modal.querySelector('#bugDiagnosticsPreview').textContent);
      modal.querySelector('#bugCopyBtn').textContent='Copiato ✓';
      setTimeout(()=>modal.querySelector('#bugCopyBtn').textContent='Copia diagnostica',1400);
    }catch{}
  };
  modal.querySelector('#bugDownloadBtn').onclick=()=>{
    refresh();
    const category=modal.querySelector('#bugCategory').value;
    const desc=modal.querySelector('#bugDescription').value.trim();
    const report='A.D.A. Web '+APP_VERSION+'\nCategoria: '+category+'\nDescrizione: '+(desc||'(non fornita)')+'\n\nDIAGNOSTICA\n'+modal.querySelector('#bugDiagnosticsPreview').textContent+'\n';
    const url=URL.createObjectURL(new Blob([report],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');
    a.href=url;
    a.download='ADA_bug_report_'+new Date().toISOString().slice(0,10)+'.txt';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  modal.querySelector('#bugIssueBtn').onclick=()=>{
    refresh();
    const category=modal.querySelector('#bugCategory').value;
    const desc=modal.querySelector('#bugDescription').value.trim();
    const diag=modal.querySelector('#bugDiagnosticsPreview').textContent;
    const title='[ADA BUG] '+category+' · '+APP_VERSION;
    const body='## Segnalazione utente\n\n**Categoria:** '+category+'\n\n**Descrizione:**\n'+(desc||'_Non fornita_')+'\n\n> Non inserire dati personali o contenuti del documento.\n\n## Diagnostica tecnica sanitizzata\n\n'+diag+'\n';
    window.open(BUG_REPO_URL+'?title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body),'_blank','noopener,noreferrer');
  };
}

window.addEventListener('error',e=>recordDiag('global_error','error',{stage:state.currentStage,code:safeErrorCode(state.currentStage,e.error||e)}));
window.addEventListener('unhandledrejection',e=>recordDiag('unhandled_rejection','error',{stage:state.currentStage,code:safeErrorCode(state.currentStage,e.reason)}));

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
    try { localStorage.setItem(POLICY_ACCEPT_KEY, JSON.stringify({ acceptedAt: new Date().toISOString(), version: '0.3.2-beta' })); } catch {}
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
          <div class="eyebrow">A.D.A. WEB • ${APP_VERSION}</div>
          <h1>A.D.A. <span>Anonimizzatore Documenti Autonomo</span></h1>
          <div class="institution-credit">Tool sviluppato dalla Soprintendenza ABAP per le Province di Salerno e Avellino, Ufficio Informatico.</div>
        </div>
      </div>
      <div class="local-badge">🔒 Elaborazione locale</div>
    </header>

    <main class="layout">
      <nav class="wizard-stepper" aria-label="Percorso guidato">
        <div data-wizard-step="1" class="wizard-step active"><span>1</span><b>Carica</b></div>
        <div data-wizard-step="2" class="wizard-step"><span>2</span><b>Configura</b></div>
        <div data-wizard-step="3" class="wizard-step"><span>3</span><b>Rileva</b></div>
        <div data-wizard-step="4" class="wizard-step"><span>4</span><b>Verifica</b></div>
        <div data-wizard-step="5" class="wizard-step"><span>5</span><b>Scarica</b></div>
      </nav>

      <section class="panel hero">
        <div class="section-kicker">1 · Carica</div>
        <div class="dropzone" id="dropzone">
          <div class="drop-icon">📄</div>
          <h2>Scegli i documenti da proteggere</h2>
          <p>I documenti restano sul dispositivo. Puoi selezionare uno o più PDF; da desktop puoi anche scegliere una cartella.</p>
          <input id="fileInput" type="file" accept="application/pdf" multiple hidden />
          <input id="folderInput" type="file" accept="application/pdf" webkitdirectory multiple hidden />
          <div class="upload-actions">
            <button class="primary" id="chooseBtn">Carica PDF</button>
            <button class="ghost" id="folderBtn">Carica cartella</button>
          </div>
        </div>

        <div class="privacy-note">
          <strong>Privacy by design:</strong> i file vengono elaborati nella memoria del browser. Alla chiusura o al reset della sessione, gli oggetti temporanei vengono rilasciati.
        </div>
      </section>

      <section class="panel settings">
        <div class="section-kicker">2 · Configura</div>
        <div class="panel-title">Scegli i dati da rilevare</div>
        <div class="profile-box">
          <label for="profileSelect">Profilo tecnico</label>
          <select id="profileSelect">
            <option value="standard">Standard</option>
            <option value="transparency">Trasparenza / Pubblicazione</option>
            <option value="ai">Dataset / AI / Ricerca</option>
            <option value="custom">Personalizzato</option>
          </select>
          <small>È un preset tecnico modificabile e non sostituisce la valutazione dell'operatore.</small>
        </div>
        <div class="chips" id="typeChips">
          ${chip('cf','Codice fiscale')}${chip('personalid','ID personale')}${chip('birthdate','Data di nascita')}${chip('protocol','Protocollo / ID')}${chip('iban','IBAN')}${chip('email','Email / PEC (anche istituzionali)')}${chip('phone','Telefono')}${chip('piva','P. IVA')}${chip('name','Nomi')}${chip('signature','Firme: suggerisci aree')}${chip('address','Indirizzi')}${chip('date','Altre date')}${chip('amount','Importi / valori')}
        </div>
        <div class="setting-row">
          <label><input type="checkbox" id="ocrToggle" ${state.ocrEnabled?'checked':''}> OCR e orientamento su tutte le pagine (più lento)</label>
        </div>
        <div class="setting-row">
          <label for="redactionMode">Stile oscuramento</label>
          <select id="redactionMode">
            <option value="black" ${state.redactionMode==='black'?'selected':''}>Nero compatto</option>
            <option value="omissis" ${state.redactionMode==='omissis'?'selected':''}>Nero + OMISSIS</option>
            <option value="white" ${state.redactionMode==='white'?'selected':''}>Bianco + OMISSIS</option>
          </select>
          <small class="setting-help">Consigliato: oscuramento pieno, semplice e ben leggibile in anteprima.</small>
        </div>
        <div class="setting-row">
          <label for="precisionMode">Margine oscuramento</label>
          <select id="precisionMode">
            <option value="precise" ${state.precisionMode==='precise'?'selected':''}>Minimo · preciso</option>
            <option value="normal" ${state.precisionMode==='normal'?'selected':''}>Standard</option>
            <option value="wide" ${state.precisionMode==='wide'?'selected':''}>Ampio</option>
          </select>
        </div>
      </section>

      <section class="panel workspace">
        <div class="workspace-head">
          <div>
            <div class="section-kicker">3 · Rileva</div>
            <div class="panel-title">Documenti pronti per l'analisi</div>
            <div class="muted" id="queueText" aria-live="polite">Nessun documento caricato</div>
            <label for="documentSelect">Documento da elaborare (uno alla volta)</label>
            <select id="documentSelect" disabled></select>
          </div>
          <div class="actions">
            <button id="analyzeBtn" class="primary" disabled>Rileva dati</button>
            <button id="cancelBtn" class="ghost" disabled>Annulla</button>
            <button id="resetBtn" class="ghost">Reset</button>
          </div>
        </div>
        <div id="analysisHint" class="analysis-hint" aria-live="polite"></div>
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
              <div class="section-kicker">4 · Verifica</div>
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
                <option value="name">Nomi</option><option value="signature">Firme</option>
                <option value="cf">Codici fiscali</option>
                <option value="personalid">ID personali</option>
                <option value="birthdate">Date di nascita</option>
                <option value="protocol">Protocolli / identificativi</option>
                <option value="email">Email / PEC</option>
                <option value="phone">Telefoni</option>
                <option value="iban">IBAN</option>
                <option value="piva">P. IVA</option>
                <option value="address">Indirizzi</option>
                <option value="date">Altre date</option>
                <option value="amount">Importi / valori</option>
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
              <div class="section-kicker">4 · Verifica</div>
              <div class="panel-title">Anteprima</div>
              <div class="muted" id="pageLabel"></div>
            </div>
            <div class="preview-controls">
              <button id="prevPageBtn" class="ghost compact" disabled>←</button>
              <button id="nextPageBtn" class="ghost compact" disabled>→</button>
              <button id="manualAreaBtn" class="ghost" disabled>＋ Area manuale</button>
              <button id="signatureAreaBtn" class="ghost" disabled>Oscura firma a mano</button>
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
          <div class="section-kicker">5 · Anonimizza e scarica</div>
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
      <button id="bugReportBtn" class="ghost bug-report-btn" type="button">🐞 Segnala un problema</button>
    </footer>
    ${renderFirstUseModal()}
    ${renderBugModal()}
  `;
  bind();
}

function chip(key,label){
  return `<label class="chip ${ENABLED_TYPES[key]?'on':''}"><input data-type="${key}" type="checkbox" ${ENABLED_TYPES[key]?'checked':''}>${label}</label>`;
}

function bind(){
  const fileInput = document.querySelector('#fileInput');
  const folderInput = document.querySelector('#folderInput');
  document.querySelector('#chooseBtn').onclick = () => fileInput.click();
  fileInput.onchange = e => addFiles([...e.target.files]);
  const folderBtn=document.querySelector('#folderBtn');
  if(folderBtn && folderInput){
    const supported='webkitdirectory' in folderInput;
    folderBtn.hidden=!supported;
    folderBtn.onclick=()=>folderInput.click();
    folderInput.onchange=e=>addFiles([...e.target.files].filter(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name)));
  }
  const dz = document.querySelector('#dropzone');
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('dragging')}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('dragging')}));
  dz.addEventListener('drop',e=>addFiles([...e.dataTransfer.files]));

  document.querySelectorAll('[data-type]').forEach(i=>i.onchange=e=>{
    ENABLED_TYPES[e.target.dataset.type]=e.target.checked;
    e.target.closest('.chip').classList.toggle('on',e.target.checked);
    const profile=document.querySelector('#profileSelect');
    if(profile) profile.value='custom';
    flagChangedSettings();
  });
  const profileSelect=document.querySelector('#profileSelect');
  if(profileSelect){
    profileSelect.onchange=e=>{ if(e.target.value!=='custom') applyProfile(e.target.value); flagChangedSettings(); };
  }
  document.querySelector('#ocrToggle').onchange=e=>{state.ocrEnabled=e.target.checked;flagChangedSettings();};
  document.querySelector('#redactionMode').onchange=e=>{state.redactionMode=e.target.value; if(state.pdfBytes) renderPreview(state.currentPage);};
  document.querySelector('#precisionMode').onchange=e=>{state.precisionMode=e.target.value; if(state.pdfBytes) renderPreview(state.currentPage);};
  document.querySelector('#documentSelect').onchange=e=>selectDocument(Number(e.target.value));
  document.querySelector('#analyzeBtn').onclick=analyzeCurrent;
  document.querySelector('#cancelBtn').onclick=async()=>{state.abort=true;recordDiag('operation_cancelled','warning',{stage:state.currentStage});updateAnalysisHint('Operazione annullata dall’utente. Nessun documento è stato inviato online.','warning');try{await state.ocrWorker?.terminate();}catch{}state.ocrWorker=null;};
  document.querySelector('#resetBtn').onclick=resetSession;
  document.querySelector('#exportBtn').onclick=exportRedacted;
  document.querySelector('#prevPageBtn').onclick=()=>goToPage(state.currentPage-1);
  document.querySelector('#nextPageBtn').onclick=()=>goToPage(state.currentPage+1);
  document.querySelector('#manualAreaBtn').onclick=toggleManualMode;
  document.querySelector('#signatureAreaBtn').onclick=()=>{
    if(!state.pdfBytes || state.busy) return;
    state.manualKind='signature';state.manualMode=true;state.adjustMode=false;
    updateAnalysisHint('Trascina un rettangolo che contenga tutta la firma, incluse le estremita dei tratti.','info');
    renderPreview(state.currentPage);
  };
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
  bindBugModal();
  updateQueue();
  updatePreviewControls();
  updateWizard(state.wizardStep||1);
}

const DOCUMENT_FIELDS=['findings','pages','pdfBytes','outputBytes','currentPage','totalPages','pdfType','currentStage','analysisWarnings','analysisSettings'];
function saveDocument(){
  const file=state.files[state.currentIndex];
  if(file) state.documents.set(file,Object.fromEntries(DOCUMENT_FIELDS.map(k=>[k,state[k]])));
}
function clearDocument(){
  Object.assign(state,{findings:[],pages:[],pdfBytes:null,outputBytes:null,currentPage:1,totalPages:0,pdfType:'unknown',currentStage:'loaded',analysisWarnings:[],analysisSettings:null});
}
async function selectDocument(index){
  if(state.busy || !state.files[index]) return;
  saveDocument();
  state.currentIndex=index;
  clearDocument();
  Object.assign(state,state.documents.get(state.files[index])||{});
  if(state.analysisSettings){
    const settings=JSON.parse(state.analysisSettings);
    Object.assign(ENABLED_TYPES,settings.types);state.ocrEnabled=settings.ocr;
    syncTypeChips();document.querySelector('#ocrToggle').checked=state.ocrEnabled;
    document.querySelector('#profileSelect').value='custom';
  }
  state.manualMode=false; state.adjustMode=false;
  state.filters={type:'all',status:'all',page:'all',search:''};
  document.querySelector('#preview').textContent='Avvia Rileva dati per questo documento.';
  document.querySelector('#thumbStrip').innerHTML='';
  renderFindings(); updateQueue(); updatePreviewControls();
  updateExportAvailability();
  updateWizard(state.pdfBytes?4:2);
  updateAnalysisHint(state.pdfBytes?'Risultati del documento selezionato. Controlla ogni pagina prima di esportare.':'Documento pronto: premi Rileva dati. Gli altri file restano nella lista.','info');
  if(state.pdfBytes){
    setBusy(true,'Apertura documento...');
    try{await renderPreview(state.currentPage);await renderThumbnailStrip();}finally{setBusy(false);}
  }
}
function addFiles(files){
  if(state.busy) return;
  saveDocument();
  files=files.filter(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name));
  if(!files.length) return;
  state.files.push(...files);
  state.currentIndex = state.files.length-files.length;
  clearDocument();
  state.filters={type:"all",status:"all",page:"all",search:""};
  renderFindings(); updatePreviewControls();
  document.querySelector("#preview").textContent="Premi Rileva dati per analizzare il documento selezionato.";
  document.querySelector("#thumbStrip").innerHTML="";
  document.querySelector("#exportBtn").disabled=true;
  state.currentStage='loaded';
  recordDiag('files_loaded','ok',{stage:'loaded',filesCount:state.files.length,fileSizeMb:Math.round((files[0].size/1024/1024)*2)/2});
  updateQueue();
  updateWizard(2);
  updateAnalysisHint('Documenti caricati. Scegli i dati da rilevare e avvia l’analisi quando sei pronto.','info');
}

function analysisIsCurrent(){
  return state.analysisSettings===JSON.stringify({types:ENABLED_TYPES,ocr:state.ocrEnabled});
}
function canExport(){
  return !state.busy && !!state.pdfBytes && state.findings.some(f=>f.enabled) && analysisIsCurrent() && !state.findings.some(f=>f.pendingReview);
}
function updateExportAvailability(){
  const button=document.querySelector('#exportBtn');
  if(button) button.disabled=!canExport();
}
function flagChangedSettings(){
  updateQueue();
  updateExportAvailability();
  if(state.pdfBytes && !analysisIsCurrent()) updateAnalysisHint('Impostazioni modificate: premi Rileva dati. I risultati visibili appartengono all’analisi precedente.','warning');
}
function updateQueue(){
  const q = document.querySelector('#queueText');
  const a = document.querySelector('#analyzeBtn');
  if(!q||!a) return;
  const selector=document.querySelector('#documentSelect');
  selector.innerHTML=state.files.map((file,i)=>'<option value="'+i+'">'+escapeHtml(file.name)+' - '+((i===state.currentIndex?state.pdfBytes:state.documents.get(file)?.pdfBytes)?'analizzato':'da analizzare')+'</option>').join('');
  selector.value=String(state.currentIndex);
  selector.disabled=state.busy || !state.files.length;
  a.classList.toggle('next-action',!!state.files.length && (!state.pdfBytes || !analysisIsCurrent()) && !state.busy);
  if(!state.files.length){ q.textContent='Nessun documento caricato'; a.disabled=true; return; }
  q.textContent = `${state.files.length} file • corrente: ${state.files[state.currentIndex].name}`;
  a.disabled=state.busy;
  a.textContent=state.pdfBytes?'Rileva di nuovo (sostituisce le modifiche)':'Rileva dati';
}

function setBusy(on,label=''){
  state.busy=on;
  document.querySelector('#reviewSplit').inert=on;
  document.querySelectorAll('[data-type], #profileSelect, #ocrToggle, #redactionMode, #precisionMode, #chooseBtn, #folderBtn, #fileInput, #folderInput, #resetBtn').forEach(el=>el.disabled=on);
  updateExportAvailability();
  updateQueue();
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
  if(state.busy || !state.files.length) return;
  state.abort=false; state.findings=[]; state.pages=[]; state.outputBytes=null; state.currentPage=1; state.totalPages=0; state.manualMode=false; state.adjustMode=false;
  state.analysisWarnings=[]; state.pdfType='unknown'; state.currentStage='analysis';
  state.analysisSettings=JSON.stringify({types:ENABLED_TYPES,ocr:state.ocrEnabled});
  updateWizard(3);
  recordDiag('analysis_start','ok',{stage:'analysis',ocrEnabled:state.ocrEnabled,filesCount:state.files.length});
  setBusy(true,'Lettura PDF…'); progress(2);
  try{
    if(state.ocrWorker){await state.ocrWorker.terminate();state.ocrWorker=null;}
    const file=state.files[state.currentIndex];
    state.pdfBytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask=pdfjsLib.getDocument({data:state.pdfBytes.slice()});
    const pdf=await loadingTask.promise;
    state.totalPages=pdf.numPages;
    recordDiag('pdf_opened','ok',{stage:'analysis',pages:pdf.numPages,fileSizeMb:Math.round((file.size/1024/1024)*2)/2,ocrEnabled:state.ocrEnabled});
    updatePreviewControls();
    for(let p=1;p<=pdf.numPages;p++){
      if(state.abort) throw new Error('Operazione annullata');
      const page=await pdf.getPage(p);
      const viewport=page.getViewport({scale:1.35});
      const textContent=await page.getTextContent();
      const items=textContent.items.filter(i=>i.str && i.str.trim());
      const text=items.map(i=>i.str).join(' ');
      const pageData={pageNumber:p,viewport,items,text,ocrText:'',ocrWords:[]};

      pageData.rotation=page.rotate;
      if(state.ocrEnabled){
        let finalCanvas=null;
        try{
          if(!state.ocrWorker){
            let expired=false;
            const pendingWorker=createWorker('ita',1,{}, {classify_enable_learning:'0'});
            pendingWorker.then(worker=>{if(expired || state.abort) return worker.terminate();}).catch(()=>{});
            try{state.ocrWorker=await withTimeout(pendingWorker,OCR_INIT_TIMEOUT,'OCR_INIT_TIMEOUT');}
            catch(error){expired=true;throw error;}
          }
          const result=await recognizeOrientedPage({
            worker:state.ocrWorker,
            rotation:page.rotate,
            checkCancelled:()=>{if(state.abort) throw new Error('Operazione annullata');},
            onProgress:label=>progress(((p-1)/pdf.numPages)*75+5,`Pagina ${p}/${pdf.numPages}: ${label}`),
            recognize:(worker,image,blocks)=>withTimeout(worker.recognize(image,{}, {text:true,blocks}),OCR_PAGE_TIMEOUT,'OCR_PAGE_TIMEOUT'),
            render:async(rotation,scale)=>{
              const vp=page.getViewport({scale,rotation});
              const canvas=document.createElement('canvas');
              canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
              await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
              if(scale===3) finalCanvas=canvas;
              return canvas;
            }
          });
          pageData.rotation=result.rotation;
          pageData.viewport=page.getViewport({scale:3,rotation:result.rotation});
          pageData.ocrText=result.data.text||'';
          pageData.ocrWords=extractOcrWords(result.data);
          pageData.ocrConfidence=result.data.confidence;
          if(ENABLED_TYPES.signature && finalCanvas){
            const {width,height}=finalCanvas;
            pageData.signatureCandidate=signatureSuggestion(pageData.ocrWords,width,height,finalCanvas.getContext('2d').getImageData(0,0,width,height).data);
            if(pageData.signatureCandidate) state.analysisWarnings.push(`Pagina ${p}: possibile firma, conferma o scarta l'area suggerita prima di esportare`);
          }
          if(result.uncertain) state.analysisWarnings.push(`Pagina ${p}: orientamento incerto, verificare manualmente`);
          if(!pageData.ocrWords.length) state.analysisWarnings.push(`Pagina ${p}: nessuna parola OCR, revisione manuale necessaria`);
          recordDiag('ocr_page','ok',{stage:'ocr',page:p,pages:pdf.numPages});
        }catch(ocrErr){
          if(state.abort) throw ocrErr;
          const code=safeErrorCode('ocr',ocrErr);
          state.analysisWarnings.push(`OCR pagina ${p}: ${code}. Revisione manuale necessaria`);
          try{await state.ocrWorker?.terminate();}catch{}state.ocrWorker=null;
        }
      }else if(text.trim().length<25){
        state.analysisWarnings.push(`Pagina ${p} senza testo: OCR disattivato`);
      }
      if(state.abort) throw new Error('Operazione annullata');
      state.pages.push(pageData);
      detectPage(pageData);
      progress(5+(p/pdf.numPages)*75,`Analisi pagina ${p}/${pdf.numPages}…`);
    }
    const textualPages=state.pages.filter(pg=>pg.text.trim().length>=25).length;
    state.pdfType=textualPages===0?'raster/scansionato':textualPages===state.pages.length?'testuale':'misto';
    recordDiag('pdf_classified','ok',{stage:'analysis',pages:pdf.numPages,pdfType:state.pdfType,ocrEnabled:state.ocrEnabled});
    dedupeFindings();
    renderFindings();
    await renderPreview(1);
    await renderThumbnailStrip();
  updateExportAvailability();
    updatePreviewControls();
    state.currentStage='review';
    updateWizard(4);
    const warningText=state.analysisWarnings.length?' '+state.analysisWarnings.join(' | '):'';
    updateAnalysisHint(`Analisi completata: PDF ${state.pdfType}. Controlla tutte le pagine: firme, targhe e fotografie richiedono revisione manuale.${warningText}`,state.analysisWarnings.length?'warning':'success');
    recordDiag('analysis_complete','ok',{stage:'review',pages:pdf.numPages,pdfType:state.pdfType,ocrEnabled:state.ocrEnabled,findings:state.findings.length});
    progress(100,`Completato • ${state.findings.length} rilevamenti`);
  }catch(err){
    state.currentStage='error';
    state.pdfBytes=null; state.findings=[]; state.pages=[]; renderFindings();
    document.querySelector('#preview').textContent='Analisi incompleta: ripeti il rilevamento.';
    const code=safeErrorCode('analysis',err);
    recordDiag('analysis_failed','error',{stage:'analysis',code,ocrEnabled:state.ocrEnabled,pages:state.totalPages||0});
    updateAnalysisHint('L’analisi non è stata completata. Puoi riprovare oppure usare “Segnala un problema” per condividere la diagnostica tecnica.','error');
    progress(100,err?.code==='OCR_PAGE_TIMEOUT'?'OCR oltre il tempo massimo':(err.message||'Errore'));
  }finally{
    if(state.ocrWorker){try{await state.ocrWorker.terminate();}catch{}state.ocrWorker=null;}
    saveDocument();
    setBusy(false);
  }
}

function extractOcrWords(data){
  const out=[];
  const blocks=data.blocks||[];
  let lineId=0;
  for(const b of blocks){
    for(const par of (b.paragraphs||[])){
      for(const line of (par.lines||[])){
        let indexInLine=0;
        for(const w of (line.words||[])){
          if(w.text?.trim() && w.bbox){
            out.push({text:w.text.trim(),bbox:w.bbox,lineId,indexInLine,confidence:w.confidence??null});
            indexInLine++;
          }
        }
        lineId++;
      }
    }
  }
  return out;
}

const CF_VALUE_RE=/^[A-Z]{6}[0-9]{2}[A-EHLMPRST][0-9]{2}[A-Z][0-9]{3}[A-Z]$/i;
const DATE_VALUE_RE=/^(?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[0-2])[\/.-](?:19|20)\d{2}$/;
const NAME_STOP_WORDS=new Set([
  'AGENZIA','ATTESTAZIONE','AVIS','BENE','CALCOLATO','CODICE','COGNOME','COMPONENTI','COOMBS','CORSI',
  'DICHIARANTE','DICHIARAZIONE','DIRETTORE','DIREZIONE','DONATORE','ECONOMICA','ENTRATE','ESAME','ESITO',
  'FAMILIARE','FAMILIARI','FATTORE','FISCALE','GRUPPO','IMMUNOEMATOLOGIA','INCLUSIONE','INDICATORE','INDIRETTO',
  'INPS','MINORENNI','MINISTERO','MODALITÀ','NOME','NUCLEO','ORDINARIO','PATRIMONIALE','PRESTAZIONI',
  'PRESIDENTE','PROTEINE','PROTOCOLLO','REDDITUALE','RIFERIMENTO','SANITARIE','SANGUIGNO','SITUAZIONE',
  'SOSTITUTIVA','SPECIFICHE','TUTELA','PAESAGGISTICA','GENERALE','TIMBRO','TOTALI','TRASFUSIONALE','UNICA','UFFICIO','VALORE','VALORI'
]);

function cleanNameCell(value=''){
  return value.replace(/\s+/g,' ').trim();
}

function foldToken(value=''){
  return value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}

function isPersonWord(value=''){
  const raw=cleanNameCell(value);
  const folded=foldToken(raw);
  if(!folded || folded.length<2 || /\d/.test(folded) || NAME_STOP_WORDS.has(folded)) return false;
  return /^[A-ZÀ-ÖØ-Ýa-zà-öø-ÿ'’. -]+$/u.test(raw);
}

function isUpperNameCell(value=''){
  const v=cleanNameCell(value);
  if(!v || !/^[A-ZÀ-ÖØ-Ý'’ -]+$/u.test(v)) return false;
  const tokens=v.split(/[\s-]+/).filter(Boolean);
  if(tokens.length<1 || tokens.length>4) return false;
  return tokens.every(isPersonWord);
}

function ocrLines(page){
  const map=new Map();
  for(const w of (page.ocrWords||[])){
    const id=Number.isFinite(w.lineId)?w.lineId:0;
    if(!map.has(id)) map.set(id,[]);
    map.get(id).push(w);
  }
  return [...map.values()].map(words=>words.sort((a,b)=>(a.indexInLine??0)-(b.indexInLine??0)));
}

function visualBandWords(page,anchor){
  if(!anchor?.bbox) return [];
  const ay=(anchor.bbox.y0+anchor.bbox.y1)/2;
  const ah=Math.max(1,anchor.bbox.y1-anchor.bbox.y0);
  return (page.ocrWords||[])
    .filter(w=>{
      const wy=(w.bbox.y0+w.bbox.y1)/2;
      const wh=Math.max(1,w.bbox.y1-w.bbox.y0);
      return Math.abs(wy-ay)<=Math.max(ah,wh)*1.35;
    })
    .sort((a,b)=>a.bbox.x0-b.bbox.x0);
}

function addOcrIdentityNames(page){
  if(!ENABLED_TYPES.name || !page.ocrWords?.length) return;
  const cfWords=page.ocrWords.filter(w=>CF_VALUE_RE.test(foldToken(w.text)));
  for(const cfWord of cfWords){
    const band=visualBandWords(page,cfWord);
    const sequences=[];
    let current=[];
    for(const w of band){
      if(w===cfWord || CF_VALUE_RE.test(foldToken(w.text)) || DATE_VALUE_RE.test(w.text)){
        if(current.length) sequences.push(current);
        current=[];
        continue;
      }
      if(isUpperNameCell(w.text)){
        current.push(w);
      }else{
        if(current.length) sequences.push(current);
        current=[];
      }
    }
    if(current.length) sequences.push(current);
    for(const seq of sequences){
      const tokens=seq.map(w=>cleanNameCell(w.text)).filter(isPersonWord);
      if(tokens.length<2 || tokens.length>4) continue;
      // Un nominativo associato al CF deve essere vicino allo stesso asse orizzontale.
      const boxLeft=Math.min(...seq.map(w=>w.bbox.x0));
      const boxRight=Math.max(...seq.map(w=>w.bbox.x1));
      const distance=Math.min(Math.abs(boxLeft-cfWord.bbox.x1),Math.abs(cfWord.bbox.x0-boxRight));
      if(distance > page.viewport.width*.45) continue;
      addFinding('Nome','name',tokens.join(' '),page.pageNumber);
    }
  }
}

function addStructuredNames(page){
  if(!ENABLED_TYPES.name || !page.items?.length) return;
  const cells=page.items.map(i=>cleanNameCell(i.str)).filter(Boolean);
  for(let i=0;i<cells.length;i++){
    if(!CF_VALUE_RE.test(foldToken(cells[i]))) continue;
    const candidates=[];
    for(let j=Math.max(0,i-6);j<=Math.min(cells.length-1,i+6);j++){
      if(j===i) continue;
      const candidate=cells[j];
      if(isUpperNameCell(candidate)) candidates.push({j,candidate});
    }
    const nearest=candidates.sort((a,b)=>Math.abs(a.j-i)-Math.abs(b.j-i))[0];
    if(nearest && nearest.candidate.split(/\s+/).length>=2) addFinding('Nome','name',nearest.candidate,page.pageNumber);
  }
}

function addContextNames(page,text){
  if(!ENABLED_TYPES.name) return;

  const declaredBy=/\bpresentata\s+da\s+([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’ -]{2,70}?)\s+in\s+data\b/giu;
  for(const m of text.matchAll(declaredBy)){
    const value=cleanNameCell(m[1]).replace(/\s+(?:Tel\.?|PEC|Fax|Email)\b.*$/i,'');
    const tokens=value.split(/\s+/).filter(Boolean);
    if(tokens.length>=2 && tokens.length<=4 && tokens.every(isPersonWord)) addFinding('Nome','name',value,page.pageNumber);
  }

  // Solo nomi introdotti da titoli/ruoli: evita di interpretare etichette cliniche come persone.
  const titled=/\b(?:[Ss]ig\.?ra?|[Dd]ott\.?ssa?|[Dd]ott\.?|[Dd]r\.?|[Aa]vv\.?|[Ii]ng\.?|[Aa]rch\.?)\s+((?:[A-ZÀ-ÖØ-Ý]\.?\s*)?[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]{2,}(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]{2,}){0,3})/gu;
  for(const m of text.matchAll(titled)){
    const value=cleanNameCell(m[1]).replace(/\s+(?:Tel\.?|PEC|Fax|Email)\b.*$/i,'');
    const tokens=value.split(/\s+/).filter(Boolean);
    if(tokens.length && tokens.length<=4 && tokens.every(t=>isPersonWord(t)||/^[A-Z]\.?$/i.test(t))) addFinding('Nome','name',value,page.pageNumber);
  }

}


function signatoryLines(page){
  const lines=[];
  if(page.ocrWords?.length){
    for(const words of ocrLines(page)){
      const line=words.map(w=>w.text).join(' ').replace(/\s+/g,' ').trim();
      if(line) lines.push(line);
    }
  }
  if(page.items?.length){
    for(const items of nativeLines(page)){
      const line=items.map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      if(line) lines.push(line);
    }
  }
  if(!lines.length && page.text) lines.push(page.text.replace(/\s+/g,' ').trim());
  return [...new Set(lines)];
}

function validPersonCandidate(value){
  const cleaned=cleanNameCell(value).replace(/^[,:;\-–]+|[,:;\-–]+$/g,'');
  if(!cleaned || cleaned.length>80) return null;
  const particles=new Set(['DE','DI','DA','DEL','DELLA','DELLO','LO','LA','VAN','VON']);
  const tokens=cleaned.split(/\s+/).filter(Boolean);
  if(tokens.length<1 || tokens.length>4) return null;
  for(const token of tokens){
    if(/^[A-ZÀ-ÖØ-Ý]\.?$/u.test(token)) continue;
    if(particles.has(foldToken(token))) continue;
    if(!isPersonWord(token)) return null;
  }
  return cleaned;
}

function addRoleBasedNames(page,text){
  if(!ENABLED_TYPES.name) return;

  for(const line of signatoryLines(page)){
    // Titoli professionali tipici dei referti, anche con iniziale puntata o cognome composto.
    const titled=/\b(?:[Dd]ott\.?ssa?|[Dd]ott\.?|[Dd]r\.?|[Pp]rof\.?ssa?|[Pp]rof\.?)\s*([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]*(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]*){0,3})\s*$/u.exec(line);
    if(titled){
      const value=validPersonCandidate(titled[1]);
      if(value) addFinding('Nome','name',value,page.pageNumber);
      continue;
    }

    // Ruoli senza titolo: "Il Dirigente Mario Rossi", "Responsabile Anna Verdi".
    const roleOnly=/\b(?:Il\s+)?(?:Direttore|Dirigente|Responsabile|Medico|Referente|Primario)\s*:?\s*([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]*(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]*){0,3})\s*$/u.exec(line);
    if(roleOnly){
      const value=validPersonCandidate(roleOnly[1]);
      if(value) addFinding('Nome','name',value,page.pageNumber);
    }
  }

  // Fallback sul testo ricomposto per OCR che spezza ruolo e firma su righe diverse.
  const compact=/\b(?:[Dd]ott\.?ssa?|[Dd]ott\.?|[Dd]r\.?|[Pp]rof\.?ssa?|[Pp]rof\.?)\s*((?:[A-ZÀ-ÖØ-Ý]\.?\s*){0,2}(?:(?:De|Di|Da|Del|Della|Dello|Lo|La|Van|Von)\s+)?[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]{2,}(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]{2,})?)/gu;
  for(const m of text.matchAll(compact)){
    const value=validPersonCandidate(m[1]);
    if(value) addFinding('Nome','name',value,page.pageNumber);
  }
}

function addContextualIdentifiers(page,text){
  if(ENABLED_TYPES.personalid){
    const idPatterns=[
      /\b(?:Cod(?:ice)?\s+Donatore|Cod(?:ice)?\s+Paziente|Cod(?:ice)?\s+Assistito|ID\s+(?:Donatore|Paziente|Assistito))\s*:?\s*([A-Z0-9][A-Z0-9./-]{3,24})\b/giu,
    ];
    for(const re of idPatterns) for(const m of text.matchAll(re)) addFinding('ID personale','personalid',m[1],page.pageNumber);
  }
  if(ENABLED_TYPES.birthdate){
    const birth=/\b(?:Nato|Nata)(?:\s+a\s+[^.;:]{1,60}?)?\s+(?:il\s+)?((?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[0-2])[\/.-](?:19|20)\d{2})\b/giu;
    for(const m of text.matchAll(birth)) addFinding('Data di nascita','birthdate',m[1],page.pageNumber);
  }
}


function nativeLines(page){
  const rows=[];
  for(const item of (page.items||[])){
    const y=Number(item.transform?.[5]||0);
    const h=Math.max(2,Math.abs(item.height||item.transform?.[3]||8));
    let row=rows.find(r=>Math.abs(r.y-y)<=Math.max(r.h,h)*.55);
    if(!row){
      row={y,h,items:[]};
      rows.push(row);
    }
    row.items.push(item);
    row.y=(row.y*(row.items.length-1)+y)/row.items.length;
    row.h=Math.max(row.h,h);
  }
  return rows
    .sort((a,b)=>b.y-a.y)
    .map(r=>r.items.sort((a,b)=>(a.transform?.[4]||0)-(b.transform?.[4]||0)));
}

function addAddressFromLine(line,pageNumber){
  if(!ENABLED_TYPES.address || !line) return;
  for(const value of completeAddresses(line)) addFinding('Indirizzo completo','address',value,pageNumber);
}

function addNativeAddresses(page){
  if(!ENABLED_TYPES.address || !page.items?.length) return;
  for(const items of nativeLines(page)){
    const line=items.map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
    addAddressFromLine(line,page.pageNumber);
  }
}

function addOcrAddresses(page){
  if(!ENABLED_TYPES.address || !page.ocrWords?.length) return;
  for(const words of ocrLines(page)){
    const line=words.map(w=>w.text).join(' ').replace(/\s+/g,' ').trim();
    if(!line) continue;

    addAddressFromLine(line,page.pageNumber);
  }
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
    for(const label of text.matchAll(/\b(?:richiedente|sottoscritto|sottoscritta|cognome e nome)\s*:?\s+/giu)){
      const value=text.slice(label.index+label[0].length).match(/^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]+){1,3}/u)?.[0];
      if(value && validPersonCandidate(value)) addFinding('Nome','name',value,page.pageNumber);
    }
  }
  addContextualIdentifiers(page,text);
  addStructuredNames(page);
  addOcrIdentityNames(page);
  addContextNames(page,text);
  addRoleBasedNames(page,text);
  addOcrAddresses(page);
  addNativeAddresses(page);
  if(ENABLED_TYPES.signature && page.signatureCandidate){
    state.findings.push({id:crypto.randomUUID(),type:"Possibile firma: da confermare",key:"signature",value:"",page:page.pageNumber,manual:true,coords:page.signatureCandidate,enabled:false,pendingReview:true});
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
  updateExportAvailability();
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
    <label class="switch"><input type="checkbox" data-fid="${f.id}" ${f.enabled?'checked':''} ${f.pendingReview?'disabled':''}><span></span></label>
    <div class="finding-main"><div class="finding-type">${escapeHtml(f.type)} • pag. ${f.page}</div>${f.manual
      ? `<div class="manual-label">${f.pendingReview?'Suggerimento da verificare, non riconoscimento della grafia.':f.key==='signature'?'Area firma: controlla che comprenda tutti i tratti.':'Area selezionata manualmente'}</div>`
      : `<input data-edit="${f.id}" value="${escapeHtml(f.value)}">`}</div>
    ${f.pendingReview?`<button class="primary" data-confirm-signature="${f.id}">Oscura firma</button><button class="ghost" data-ignore-signature="${f.id}">Non e una firma</button>`:''}
    ${f.manual && !f.pendingReview?`<button class="remove-finding" data-remove="${f.id}" title="Elimina area">×</button>`:''}
  </div>`).join('');
  el.querySelectorAll('[data-confirm-signature],[data-ignore-signature]').forEach(button=>button.onclick=()=>{
    const id=button.dataset.confirmSignature||button.dataset.ignoreSignature;
    const finding=state.findings.find(f=>f.id===id);
    if(!finding) return;
    if(button.dataset.confirmSignature){finding.enabled=true;finding.pendingReview=false;finding.type='Firma confermata';}
    else state.findings=state.findings.filter(f=>f.id!==id);
    renderFindings();renderPreview(finding.page);
  });
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
  updateExportAvailability();
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
  const viewport=page.getViewport({scale:1.35,rotation:state.pages.find(p=>p.pageNumber===pageNum)?.rotation??page.rotate});
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

  const pageFindings=state.findings.filter(f=>(f.enabled||f.pendingReview)&&f.page===pageNum);
  const tc=await page.getTextContent();
  const items=tc.items.filter(i=>i.str&&i.str.trim());
  for(const f of pageFindings){
    if((f.manual && f.coords) || f.overrideCoords){
      const box=appendManualBox(overlay,f.overrideCoords||f.coords,false);
      box.dataset.findingId=f.id;
      box.classList.add(f.manual?'manual-box':'adjusted-box');
      if(f.pendingReview){box.classList.add('signature-candidate');box.textContent='Possibile firma: conferma nei rilevamenti';}
      continue;
    }
    const pd=state.pages.find(x=>x.pageNumber===pageNum);
    const matches=resolveRectsForFinding(f,items,viewport,pd);
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

function nativePhraseItems(value,items){
  const selected=new Set();
  const needle=normalize(value);
  if(!needle) return selected;
  for(const line of nativeLines({items})){
    let text='';const spans=[];
    for(const item of line){
      const start=text.length;
      text+=normalize(item.str);
      spans.push({item,start,end:text.length});text+=' ';
    }
    let offset=0,index;
    while((index=text.indexOf(needle,offset))!==-1){
      for(const span of spans) if(span.start<index+needle.length && span.end>index) selected.add(span.item);
      offset=index+needle.length;
    }
  }
  return selected;
}

function findRectsForFinding(f,items,viewport){
  const needle=normalize(f.value);
  if(!needle) return [];
  const cfg=precisionConfig();
  const phraseItems=nativePhraseItems(f.value,items);
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
    }else if(phraseItems.has(item)){
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


function ocrRectsForFinding(f,pageData){
  if(!pageData?.ocrWords?.length || !f?.value) return [];
  const needleTokens=cleanNameCell(f.value).split(/\s+/).map(foldToken).filter(Boolean);
  const needleJoined=needleTokens.join('');
  if(!needleJoined) return [];
  const rects=[];
  for(const words of ocrLines(pageData)){
    const alignedWords=words.filter(w=>foldToken(w.text));
    const lineTokens=alignedWords.map(w=>foldToken(w.text));
    for(let i=0;i<lineTokens.length;i++){
      let joined='';
      let matchedCount=0;
      const maxTake=Math.min(Math.max(4,needleTokens.length+2),lineTokens.length-i);
      for(let take=1;take<=maxTake;take++){
        joined+=lineTokens[i+take-1];
        if(joined===needleJoined){ matchedCount=take; break; }
        if(!needleJoined.startsWith(joined) && !joined.startsWith(needleJoined)) break;
      }
      if(!matchedCount) continue;
      const matched=alignedWords.slice(i,i+matchedCount);
      const x0=Math.min(...matched.map(w=>w.bbox.x0));
      const y0=Math.min(...matched.map(w=>w.bbox.y0));
      const x1=Math.max(...matched.map(w=>w.bbox.x1));
      const y1=Math.max(...matched.map(w=>w.bbox.y1));
      const pad=state.precisionMode==='wide'?3:state.precisionMode==='normal'?2:1;
      rects.push({
        x:Math.max(0,x0-pad)/pageData.viewport.width,
        y:Math.max(0,y0-pad*.4)/pageData.viewport.height,
        w:Math.min(pageData.viewport.width,x1-x0+pad*2)/pageData.viewport.width,
        h:Math.min(pageData.viewport.height,y1-y0+pad*.8)/pageData.viewport.height,
      });
    }
  }
  return rects;
}

function resolveRectsForFinding(f,items,viewport,pageData){
  const ocrRects=ocrRectsForFinding(f,pageData);
  if(ocrRects.length) return ocrRects;
  const nativeRects=findRectsForFinding(f,items,viewport);
  if(nativeRects.length) return nativeRects;
  return ocrRectsForFinding(f,pageData);
}

function paintRedaction(ctx,coords,viewport){
  const x=coords.x*viewport.width;
  const y=coords.y*viewport.height;
  const w=coords.w*viewport.width;
  const h=coords.h*viewport.height;
  ctx.save();
  if(state.redactionMode==='white'){
    ctx.fillStyle='#fff';
    ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#111';
    ctx.lineWidth=Math.max(1,Math.min(2,h*.08));
    ctx.strokeRect(x,y,w,h);
    if(w>42 && h>11){
      ctx.fillStyle='#111';
      ctx.font=String(Math.max(8,Math.min(12,h*.52)))+'px Arial, sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText('OMISSIS',x+w/2,y+h/2,Math.max(20,w-6));
    }
  }else{
    ctx.fillStyle='#000';
    ctx.fillRect(x,y,w,h);
    if(state.redactionMode==='omissis' && w>42 && h>11){
      ctx.fillStyle='#fff';
      ctx.font=String(Math.max(8,Math.min(12,h*.52)))+'px Arial, sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText('OMISSIS',x+w/2,y+h/2,Math.max(20,w-6));
    }
  }
  ctx.restore();
}

function appendManualBox(overlay,coords,draft=false){
  const r=document.createElement('div');
  r.className=`redaction-box manual-box mode-${state.redactionMode}${draft?' draft':''}`;
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
  document.querySelector('#signatureAreaBtn').disabled=!hasPdf;
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
  state.manualKind='manual';
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
    state.findings.push({id:crypto.randomUUID(),type:state.manualKind==='signature'?'Firma manuale':'Area manuale',key:state.manualKind==='signature'?'signature':'manual',value:'',page:state.currentPage,enabled:true,manual:true,coords});
    renderFindings();
  updateExportAvailability();
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
    const page=await pdf.getPage(p); const vp=page.getViewport({scale:.18,rotation:state.pages.find(pg=>pg.pageNumber===p)?.rotation??page.rotate});
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
  if(!canExport()) return;
  state.abort=false;
  state.currentStage='export';
  recordDiag('export_start','ok',{stage:'export',pages:state.totalPages,pdfType:state.pdfType,findings:state.findings.filter(f=>f.enabled).length});
  setBusy(true,'Preparazione esportazione…'); progress(5);
  try{
    const src=await pdfjsLib.getDocument({data:state.pdfBytes.slice()}).promise;
    const out=await PDFDocument.create();
    for(let p=1;p<=src.numPages;p++){
      if(state.abort) throw new Error('Esportazione annullata');
      const page=await src.getPage(p);
      const vp=page.getViewport({scale:2,rotation:state.pages.find(pg=>pg.pageNumber===p)?.rotation??page.rotate});
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
      const ctx=canvas.getContext('2d');
      await page.render({canvasContext:ctx,viewport:vp}).promise;
      const t=await page.getTextContent();
      const items=t.items.filter(i=>i.str&&i.str.trim());
      const fs=state.findings.filter(f=>f.enabled&&f.page===p);
      const pd=state.pages.find(x=>x.pageNumber===p);
      for(const f of fs){
        if((f.manual&&f.coords)||f.overrideCoords){
          paintRedaction(ctx,f.overrideCoords||f.coords,vp);
          continue;
        }
        const rects=resolveRectsForFinding(f,items,vp,pd);
        if(!rects.length) throw new Error(`Pagina ${p}: un rilevamento attivo non ha un'area associata. Correggilo con un'area manuale prima di esportare.`);
        for(const c of rects) paintRedaction(ctx,c,vp);
      }
      const png=await new Promise(res=>canvas.toBlob(res,'image/png',0.92));
      const pngBytes=new Uint8Array(await png.arrayBuffer());
      const img=await out.embedPng(pngBytes);
      const width=vp.width/vp.scale,height=vp.height/vp.scale;
      const op=out.addPage([width,height]); op.drawImage(img,{x:0,y:0,width,height});
      progress(10+(p/src.numPages)*80,`Anonimizzazione pagina ${p}/${src.numPages}…`);
    }
    state.outputBytes=await out.save();
    const blob=new Blob([state.outputBytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a');
    const srcName=state.files[state.currentIndex].name.replace(/\.pdf$/i,'');
    a.href=url;a.download=`${srcName}_ANONIMIZZATO.pdf`;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    state.currentStage='complete';
    updateWizard(5);
    recordDiag('export_complete','ok',{stage:'complete',pages:src.numPages,pdfType:state.pdfType,findings:state.findings.filter(f=>f.enabled).length});
    progress(100,'Documento anonimizzato e scaricato');
  }catch(err){
    const code=safeErrorCode('export',err);
    recordDiag('export_failed','error',{stage:'export',code,pages:state.totalPages,pdfType:state.pdfType});
    updateAnalysisHint(err.message || 'Esportazione non completata. Controlla le aree prima di riprovare.','error');
    progress(100,err.message||'Errore esportazione');
  }
  finally{setBusy(false);}
}

async function resetSession(){
  if(state.busy) return;
  state.abort=true;
  if(state.ocrWorker){ try{await state.ocrWorker.terminate();}catch{} state.ocrWorker=null; }
  state.documents.clear();
  state.files=[];state.findings=[];state.pages=[];state.pdfBytes=null;state.outputBytes=null;state.currentIndex=0;state.currentPage=1;state.totalPages=0;state.manualMode=false; state.adjustMode=false;state.filters={type:'all',status:'all',page:'all',search:''};
  state.wizardStep=1;state.pdfType='unknown';state.currentStage='idle';state.analysisWarnings=[];state.diagEvents=[];
  Object.assign(ENABLED_TYPES,PROFILES.standard.types);
  render();
}

window.addEventListener('beforeunload',()=>{ state.pdfBytes=null;state.outputBytes=null;state.files=[];state.pages=[];state.findings=[]; });
render();
