// A.D.A. Web — Regole sperimentali Indicazioni 2026
// Branch di prova: rules-2026-test. Nessun deploy su main.
// Le regole restituiscono il VALORE da oscurare, non l'etichetta/sigla.

const normalizeSpace = (s='') => s.replace(/\s+/g,' ').trim();

const RULES_2026 = {
  title: 'Indicazioni 2026',
  version: '2026-test-1',
  categories: {
    person: ['CF','SIG','SIG.RA','SIGG','DOTT','DOTT.SSA','ING','ARCH','AVV','GEOM','P.I','NATO/A'],
    legal: ['P.IVA','REA','SRL','SRLS','SPA','SAS','SNC','ETS','APS','ODV'],
    contact: ['PEC','IPA'],
    finance: ['CF','P.IVA','IBAN','REA'],
    cadastral: ['FG','PLLA','SUB','NCEU','NCT'],
    admin: ['PROT','REP','RACC','R.G','CUP','CIG','SCIA'],
  }
};

const TITLE = String.raw`(?:SIG(?:\.?(?:RA|RE|G(?:\.?RI)?))?|DOTT(?:\.?SSA)?|ING\.?|ARCH\.?|AVV\.?|GEOM\.?|P\.?\s*I\.?)`;
const NAME_WORD = String.raw`(?:[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]{1,}|[A-ZÀ-ÖØ-Ý]\.?)`;
const NAME = `${NAME_WORD}(?:\\s+${NAME_WORD}){0,3}`;

function push(out, page, type, key, value, ruleId, confidence='high', origin='', strategy='label-value') {
  value = normalizeSpace(value || '').replace(/^[,;:\-–]+|[,;:\-–]+$/g,'');
  if (!value || (value.length < 2 && !/^\d$/.test(value))) return;
  out.push({page,type,key,value,ruleId,confidence,origin,strategy});
}

function detectPeople(text,page,out){
  // Titolo professionale/personale + nominativo. Oscura il nominativo, conserva il titolo.
  const titled = new RegExp(`\\b(${TITLE})\\s+(${NAME})`, 'giu');
  for(const m of text.matchAll(titled)) {
    const candidate=normalizeSpace(m[2]);
    if(!/^(DI|DE|DA|DEL|DELLA|IL|LA)$/i.test(candidate)) {
      push(out,page,'Nome (regola 2026)','name',candidate,'IND2026_PERSON_TITLE','medium',m[1],'label-value');
    }
  }

  // Nato/Nata + eventuale luogo + data: oscuriamo la data quando presente.
  const born = /\b(?:NATO|NATA)\b[^\n,;]{0,80}?\b((?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[0-2])[\/.-](?:19|20)\d{2})\b/giu;
  for(const m of text.matchAll(born)) push(out,page,'Data di nascita','birthdate',m[1],'IND2026_BIRTH_DATE','high','NATO/A','label-value');

  // CF con varianti etichetta + valore.
  const cf = /\b(?:CF|C\.?\s*F\.?|CODICE\s+FISCALE)\s*[:\-]?\s*([A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z])\b/giu;
  for(const m of text.matchAll(cf)) push(out,page,'Codice fiscale','cf',m[1],'IND2026_CF','high','CF','label-value');
}

function detectLegal(text,page,out){
  const piva=/\b(?:P\.?\s*IVA|PIVA|PARTITA\s+IVA)\s*[:\-]?\s*(IT\s*)?([0-9]{11})\b/giu;
  for(const m of text.matchAll(piva)) push(out,page,'P. IVA','piva',(m[1]||'')+m[2],'IND2026_PIVA','high','P.IVA','label-value');

  const rea=/\bREA\s*[:\-]?\s*([A-Z]{0,2}\s*[-/]?\s*[0-9]{3,10})\b/giu;
  for(const m of text.matchAll(rea)) push(out,page,'REA','rea',m[1],'IND2026_REA','high','REA','label-value');

  // Ragione sociale immediatamente associata a una forma societaria.
  // SNC minuscolo dopo via/civico non viene catturato: richiediamo denominazione precedente con almeno una lettera.
  const company=/\b([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý0-9'’&. -]{2,80}?)\s+(S\.?\s*R\.?\s*L\.?\s*S?\.?|S\.?\s*P\.?\s*A\.?|S\.?\s*A\.?\s*S\.?|S\.?\s*N\.?\s*C\.?|ETS|APS|ODV)\b/gu;
  const stop=/\b(?:COMUNE|MINISTERO|REGIONE|PROVINCIA|AMMINISTRAZIONE|CHIESA|VIA|PIAZZA|CORSO)\b/i;
  for(const m of text.matchAll(company)){
    const name=normalizeSpace(m[1]);
    if(!stop.test(name) && !/\b(?:VIA|VIALE|PIAZZA|CORSO)\b/i.test(name) && /[A-ZÀ-ÖØ-Ý]{2}/u.test(name)) {
      push(out,page,'Persona giuridica','legalentity',name+' '+normalizeSpace(m[2]),'IND2026_LEGAL_FORM','medium',m[2],'entity-with-suffix');
    }
  }
}

function detectContacts(text,page,out){
  // PEC: catturiamo solo indirizzi email associati o email con dominio pec.
  const pec=/\b(?:PEC\s*[:\-]?\s*)?([A-Z0-9._%+-]+@[A-Z0-9.-]*PEC[A-Z0-9.-]*\.[A-Z]{2,}|[A-Z0-9._%+-]+@PEC\.[A-Z0-9.-]+)\b/giu;
  for(const m of text.matchAll(pec)) push(out,page,'PEC','email',m[1],'IND2026_PEC','high','PEC','label-value');

  const ipa=/\bIPA\s*[:\-]?\s*([A-Z0-9._-]{4,30})\b/giu;
  for(const m of text.matchAll(ipa)) push(out,page,'IPA','ipa',m[1],'IND2026_IPA','medium','IPA','label-value');

  const iban=/\bIBAN\s*[:\-]?\s*((?:IT\s*)?[0-9]{2}\s*[A-Z]\s*[0-9]{10}\s*[A-Z0-9]{12})\b/giu;
  for(const m of text.matchAll(iban)) push(out,page,'IBAN','iban',m[1].replace(/\s+/g,''),'IND2026_IBAN','high','IBAN','label-value');
}

function detectCadastral(text,page,out){
  const patterns=[
    ['Foglio','cadastral','IND2026_FG',/\b(?:FG|FG\.|FGL|FOGLIO)\s*[:\-]?\s*(\d+(?:\s*(?:-|,|\be\b)\s*\d+)*)\b/giu],
    ['Particella','cadastral','IND2026_PLLA',/\b(?:PLLA|PLLA\.|PLLE|PART\.?|PARTICELLA|PARTICELLE|P\.?\s*LLA)\s*[:\-]?\s*(\d+(?:\s*(?:-|,|\be\b)\s*\d+)*)\b/giu],
    ['Subalterno','cadastral','IND2026_SUB',/\b(?:SUB|SUB\.|SUBB|SUBB\.|SUBALTERNO)\s*[:\-]?\s*(\d+(?:\s*(?:-|,|\be\b)\s*\d+)*)\b/giu],
  ];
  for(const [type,key,id,re] of patterns){
    for(const m of text.matchAll(re)) push(out,page,type,key,m[1],id,'high',id.split('_').pop(),'label-value');
  }
  // NCEU/NCT sono contesto catastale, non dati da oscurare da soli.
}

function detectAdmin(text,page,out){
  const defs=[
    ['Protocollo','protocol','IND2026_PROT',/(?:\bPROT(?:\.|OCOLLO)?|\bPROTOCOLLO)\s*(?:N\.?|NR\.?|NUMERO)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9|_./\-]{2,50})/giu,'high'],
    ['Repertorio','adminid','IND2026_REP',/\b(?:REP\.?|REPERTORIO)\s*(?:N\.?|NR\.?)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9./\-]{1,30})/giu,'medium'],
    ['Raccolta','adminid','IND2026_RACC',/\b(?:RACC\.?|RACCOLTA)\s*(?:N\.?|NR\.?)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9./\-]{1,30})/giu,'medium'],
    ['Registro generale','adminid','IND2026_RG',/\b(?:R\.?\s*G\.?)\s*(?:N\.?|NR\.?)?\s*[:.\-]?\s*([0-9][0-9./\-]{1,30})/giu,'medium'],
    ['CIG','cig','IND2026_CIG',/\bCIG\s*[:.\-]?\s*([A-Z0-9]{10})\b/giu,'high'],
    ['SCIA','adminid','IND2026_SCIA',/\b(?:SCIA|S\.?\s*C\.?\s*I\.?\s*A\.?)\s*(?:N\.?|NR\.?|PRATICA)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9_./\-]{2,40})\b/giu,'medium'],
  ];
  for(const [type,key,id,re,conf] of defs) for(const m of text.matchAll(re)) push(out,page,type,key,m[1],id,conf,type,'label-value');
}

export function detectIndicazioni2026({text='',pageNumber=1,lines=[]}={}){
  const out=[];
  const clean=normalizeSpace(text);
  const safeLines=(lines||[]).map(normalizeSpace).filter(Boolean);

  // Le regole che identificano entità possono usare il contesto complessivo della pagina.
  detectPeople(clean,pageNumber,out);
  detectLegal(clean,pageNumber,out);
  detectContacts(clean,pageNumber,out);

  // Dati catastali e identificativi amministrativi devono invece restare confinati
  // alla stessa riga: evita di catturare il numero della riga successiva in una tabella.
  if(safeLines.length){
    for(const line of safeLines){
      detectCadastral(line,pageNumber,out);
      detectAdmin(line,pageNumber,out);
    }
  }else{
    detectCadastral(clean,pageNumber,out);
    detectAdmin(clean,pageNumber,out);
  }
  return out;
}

export { RULES_2026 };
