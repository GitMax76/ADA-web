import { completeAddresses } from '../contact-regions.js';
// Occurrence-based rules. A finding is tied to one source line and character interval.
// This is a technical preset, not a legal decision. All processing is local.
export const TRANSPARENCY_TYPES = Object.freeze({cf:true,personalid:false,birthdate:true,protocol:false,iban:true,email:true,piva:true,phone:true,name:true,address:false,signature:true,date:false,amount:false,cadastral:true,legalentity:true,title:true,cig:false,cup:false,adminid:false,rea:false,ipa:false});
const letters = /[\p{L}\p{N}]/u;
const norm = s => s.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const names = new Set(('ABRAMO ACHILLE ADA AGOSTINO ALDO AMBRA AMERIGO AMOS ANDRIANO ANSELMO ARIANNA ARTURO ATTILIO ADELE ADRIANA ADRIANO AGATA AGNESE ALBERTO ALESSANDRA ALESSANDRO ALESSIA ALFONSO ALFREDO ALICE AMALIA AMEDEO ANDREA ANGELA ANGELO ANITA ANIELLO ANTONELLO ANNA ANNAMARIA ANTONELLA ANTONIO AURORA BARBARA BENEDETTA BENEDETTO BIAGIO BIANCA BRUNO CAMILLA CARLA CARLO CARMELA CARMELO CARMINE CATERINA CECILIA CESARE CHIARA CINZIA CLAUDIA CLAUDIO CLELIA CONCETTA CORRADO COSIMO CRISTINA DANIELA DANIELE DARIO DAVIDE DEBORA DINA DINO DIEGO DOMENICA DOMENICO DONATELLA DONATO EDUARDO ELENA ELEONORA ELISA ELISABETTA ELVIRA EMANUELA EMANUELE EMILIA EMILIO ENRICO ERICA ERNESTO ESTER ETTORE EVA FABIO FABRIZIO FEDERICA FEDERICO FERDINANDO FILIPPO FIORELLA FLAVIA FRANCESCO FRANCESCA FRANCO FRANCA GAETANO GABRIELE GABRIELLA GENNARO GIACOMO GIANLUCA GIANFRANCO GIANNA GIOACCHINO GIOVANNA GIOVANNI GIULIA GIULIANA GIULIANO GIULIO GIUSEPPE GIUSEPPINA GRAZIA GREGORIO GUIDO ILARIA IMMACOLATA IRENE ISABELLA JACOPO LAURA LEA LEONARDO LETIZIA LETINA LIDIA LORENZO LUCIA LUCIANO LUCIO LUCA LUIGI LUISA MANUELA MARCELLA MARCELLO MARCO MARGHERITA MARIA MARIANA MARIANNA MARIAROSA MARISA MARINA MARIO MARTA MARTINA MASSIMO MASSIMILIANO MATTEO MAURIZIO MICHELA MICHELE MILENA MIRKO MONICA NADIA NATALE NICOLA NICOLETTA NUNZIA NUNZIO ORNELLA PAOLA PAOLO PASQUALE PATRIZIO PATRIZIA PIETRO PINO RAFFAELLA RAFFAELE RAIMONDO REBECCA RENATA RENATO REZIERO RICCARDO RITA ROBERTA ROBERTO ROCCO ROMOLO ROMINA ROSA ROSARIA ROSARIO ROSSELLA SALVATORE SAMUELE SANDRA SARA SAVERIO SERENA SERGIO SILVANA SILVIA SILVIO SIMONA SIMONE SOFIA SONIA STEFANIA STEFANO SUSANNA TERESA TOMMASO UMBERTO VALENTINA VALERIA VALERIO VANESSA VERA VINCENZINA VINCENZO VIOLA IOLANDA FLORA INCORONATA CATIA VITTORIA VITTORIO WALTER').split(' '));
const particles = new Set('DE DI DA DEL DELLA DELLO DEI DEGLI LA LO LE DALLA DAL VAN VON'.split(' '));
const stop = new Set(('COMUNE COMUNI COMUNALE COMUNALI COMUNELA AMMINISTRAZIONE AMM AMMJ MINISTERO SOPRINTENDENZA FONDAZIONE UNINA REGIONE PROVINCIA DIREZIONE UFFICIO ENTE AGENZIA ISTITUTO SCUOLA PLESSO SERVIZIO SERVIZI CHIESA CAPPELLA CATTEDRALE DIOCESI PARROCCHIA SANT SANTA SANTO SAN MADONNA MUSEO PALAZZO BIBLIOTECA ARCHIVIO VIA VIALE PIAZZA CORSO LUNGOMARE LARGO VICOLO PIAZZALE TRAV TRAVERSA LOCALITA FRAZIONE CONTRADA LOC PONTE STRADA TITOLO OGGETTO RICHIESTA ISTANZA AUTORIZZAZIONE SOLLECITO TRASMISSIONE COMUNICAZIONE RISCONTRO NOTA INTERVENTO LAVORI RESTAURO REALIZZAZIONE PROGETTO PROCEDURA ORDINE ORDINANZA SENTENZA CONDONO EDILIZIO IMMOBILE IMMOBILI RICORSO AFFARE LEGALE RAPPORTO INFORMATIVO ACCESSO ATTI PREVENZIONE DEMOLIZIONE MANUTENZIONE SICUREZZA INTEGRAZIONI PROTOCOLLO PROT CODICE CATASTO CATASTALI FOGLIO PARTICELLA PARTICELLE SUB FG PLLA PLLE CUP CIG SCIA SUAP PEC EMAIL TEL FAX DATA NATO NATA DITTA IMPRESA SOCIETA RESPONSABILE DIRIGENTE DIRETTORE ARCIDIOCESI ARC DIOCESANO MEDICO REFERENTE PRIMARIO PROF DOTT DOT T DOTTSSA AVV ARCH ING GEOM VESC MONS GRUPPO SANGUIGNO COOMBS INDIRETTO PROTEINE TOTALI IMMUNOEMATOLOGIA TRASFUSIONALE FATTORE ESAME ESITO CONSIGLIERE PRESIDENTE ATTENZIONE RISCHIO PRATICA INPS ISEE REDDITO ECONOMICA GENERALI CONDIZIONI CLIENTI TELEFONICO FORNITORI FORNITORE REGOLARITA CERTIFICAZIONE CONSORZIO BONIFICA SEDE RICHIEDENTE DIPENDENTE ALBO CANTIERE ELETTRICA ELETTRICO GASDOTTO METANODOTTO DN DP BAR PER RITIRO AVVENUTO AUTOCARROZZERIA OLEIFICIO AUTOCARROZZERIE OFFICINA ENELTEL POD COD INTERFERENTE FOTOVOLTAICO IMPIANTO FUNZIONARIO CLIENTE TITOLARE CONIUGI AZ AZIENDA AGRICOLA PUBBLICA PUBBLICO SRL SRLS SPA SAS SNC ETS APS ODV ARCHEOLOGICO ARCHEOLOGICHE ARCHITETTONICHE SUPPORTICO ALLACCIAMENTO PROPONENTE PROPRIETARIA PARTE ACQUIRENTE ALIENANTE AGGIUDICATARIA PROT PRAT VERBALE PARCHEGGIO CESPITE').split(' '));
const titlePattern = String.raw`(?:[Dd][Oo][Tt][Tt](?:\.?[Ss][Ss][Aa])?|[Dd][Rr]|[Ss][Ii][Gg](?:\.?[Rr][AaEe]|[Gg](?:\.?[Rr][Ii])?)?|[Aa][Vv][Vv]|[Ii][Nn][Gg]|[Aa][Rr][Cc][Hh]|[Gg][Ee][Oo][Mm]|[Pp][Rr][Oo][Ff](?:\.?[Ss][Ss][Aa])?|[Vv][Ee][Ss][Cc]|[Mm][Oo][Nn][Ss]|[Pp]\.\s*[Ii])\.?`;
const tokenPattern = /[\p{L}]+(?:['’.-][\p{L}]+)*\.?/gu;
const leadingTitles = new RegExp('^(?:' + titlePattern + '\\s+)+', 'u');
const isCapital = s => /^[\p{Lu}]/u.test(s);
for(const name of ['ANGIOLA','ANNALISA','ANNUNZIATA','ANTONIETTA','ANTONINO','ARCANGELO','BRUNA','CRESCENZO','ERMINIA','FAUSTO','FORTUNATA','FORTUNATO','GIANPAOLO','GIUSEPPA','MARIANGELA','MARIANTONIA','MARIAGRAZIA','NICOLO','PIERFRANCESCO','TONIO']){
  names.add(name);
}
function personParts(s, start, max=6, {trade=false,lowercaseGiven=false}={}){
  const tokens=[]; let cursor=start;
  while(tokens.length<max){
    const gap=/^\s*/u.exec(s.slice(cursor))[0]; cursor+=gap.length;
    const m=/^[\p{L}]+(?:['’.-][\p{L}]+)*['’]?\.?/u.exec(s.slice(cursor));
    if(!m) break;
    const key=norm(m[0]);
    const knownLowercaseGiven=lowercaseGiven&&tokens.length>0&&names.has(key);
    if((stop.has(key)&&!(trade&&/^(?:SAN|SANT|SANTA|SANTO)$/u.test(key))) || (!isCapital(m[0])&&!particles.has(key)&&!knownLowercaseGiven) || /^(?:SA|AV|NA|BN|CE|RM)$/u.test(m[0])) break;
    if(key.length===1 && !m[0].endsWith('.')) break;
    tokens.push({value:m[0],start:cursor,end:cursor+m[0].length,key}); cursor+=m[0].length;
    if((m[0].endsWith('.')&&key.length>1)||s[cursor]==='.' || /[,;:!?]/u.test(s[cursor]||'')) break;
  }
  while(tokens.length && particles.has(tokens.at(-1).key)) tokens.pop();
  return tokens;
}
function plausible(tokens, requireGiven=false){return tokens.filter(t=>!particles.has(t.key)).length>=2 && (!requireGiven||tokens.some(t=>names.has(t.key)));}
function containsPublic(s){return /\b(?:comun[ei]|comunal[ei]|comunela|amministrazione|amm[j.]?\s*\.?ne|ministero|regione|provincia|soprintendenza|agenzia|diocesi|parrocchia|chiesa|cappella|cattedrale|istituto|scuola|consorzio|museo|archivio|biblioteca|fondazione|via|viale|piazza|corso|lungomare|localit[aà]|fraz(?:ione)?|contrada)\b/iu.test(s);}
const municipalityLead = /^\s*(?:(?:[\p{L}][\p{L}'’.-]*[ \t]+){1,6}(?:[A-Z]{2}|\([A-Za-z]{2}\))|[Cc][Oo][Mm][Uu][Nn][Ee]\s+[Dd][Ii]\s+[\p{L}][\p{L}'’. ]{1,60}?)[ \t]*[-–—][ \t]*/u;
const parenthesizedMunicipality = /^\s*(?:[\p{L}][\p{L}'’.-]*[ \t]+){1,6}\([A-Za-z]{2}\)[ \t]+(?=\p{Lu})/u;
const administrativeLabel = /^(?:(?:avvio|autorizzazion[ei]|comunicazion[ei]|domand[ae]|inoltro|integrazion[ei]|istanz[ae]|legale\s+rappresentante|parere|permesso|pratica|rappresentante\s+legale|ratifica|richiest[ae]|rinnovo|riscontro|sopralluogo|trasmissione|valutazion[ei]|verifica|verbale)\b|l\.\s*r\.(?=\s|$))/iu;
const subjectBreak = /\s+[-–—]\s*|[-–—]\s+|[,;|]/u;
const institutionOrBusiness = /\b(?:associazion[ei]|azienda|artigian[oi]|coop(?:erativa)?|ditta|f\.?\s*lli|gruppo|hotel|impresa|oleificio|autocarrozzeria|restauri|ristorante|servizi|societ[àa]|s\.?\s*r\.?\s*l\.?s?|s\.?\s*p\.?\s*a\.?|s\.?\s*n\.?\s*c\.?|s\.?\s*a\.?\s*s\.?)\b/iu;
const placeLead = /^(?:area|baia|basilica|borgo|casa|castello|centro|colle|giardino|marina\s+di\s+baia|monte|palazzo|parco|sede|valle|villa)\b/iu;
const documentaryLead = /^(?:documentazion[ei]|fotografi(?:[ae]|c[aoe]|che))\b/iu;
const nameListSeparator = /[,;]\s*|\s+(?:e|ed)\s+|\s*\(\s*ex\s+|\s+ex\s+/giu;
const roleAfterName = /^(?:n\.\s*q\.\s+di\b|l\.?\s*r\.?(?=\s|$)|rapp\.?\s*te\b|in\s+qualit[àa]\b|rifmail\b|[\p{L}\d._%+-]+@)/iu;
const roleBeforeName = /\b(?:(?:archeolog[oa]|notai[oa]|leg\.?\s*rapp(?:r|resentante)?\.?|nell['’]interesse\s+di|pratiche\s+edilizie)\s*:?\s+|(?=signor[ae]?\s+))/giu;
const honorific = /^(?:signor[ae]?|sigg?(?:\.?\s*(?:ra|re))?\.?)\s+/iu;
const titleInPlaceName = /\b(?:via|viale|piazza|piazzale|corso|largo|vicolo|lungomare|contrada)\s+(?:[\p{L}'’.-]+\s+){0,5}$/iu;

function tableFieldNames(field, offset, {explicit=false}={}){
  const found=[];
  const parts=[...field.matchAll(nameListSeparator)].map(match=>({end:match.index,next:match.index+match[0].length}));
  parts.push({end:field.length,next:field.length});
  let start=0;
  for(const {end,next} of parts){
    const raw=field.slice(start,end);
    const label=/^\s*(?:ditta\s*[:.]?\s+)?/iu.exec(raw)[0];
    const personalTitle=honorific.exec(raw.slice(label.length));
    const begin=start+label.length+(personalTitle?.[0].length||0);
    start=next;
    let subject=field.slice(begin,end).trimEnd();
    let roleFound=false, endsList=false;
    for(const gap of subject.matchAll(/\s+/gu)){
      const after=subject.slice(gap.index+gap[0].length);
      roleFound=roleAfterName.test(after);
      if(roleFound||administrativeLabel.test(after)){
        subject=subject.slice(0,gap.index);
        endsList=true;
        break;
      }
    }
    if(explicit)subject=subject.replace(/[+]\s*\d+.*$/u,'');
    subject=subject.replace(/\s*[).:]+$/u,'').trimEnd();
    if(!subject||containsPublic(subject)||placeLead.test(subject)||documentaryLead.test(subject)||institutionOrBusiness.test(subject)) break;
    const tokens=personParts(subject,0,6,{lowercaseGiven:roleFound||explicit});
    const main=tokens.filter(token=>!particles.has(token.key));
    if(!main.length||tokens.at(-1).end!==subject.length||main.length>4)break;
    const givenCount=main.filter(token=>names.has(token.key)).length;
    const hasGiven=givenCount>0;
    const listGiven=main.length===1&&hasGiven&&found.length>0;
    const singleSurname=main.length===1&&personalTitle&&main[0].key.length>=3&&!hasGiven;
    const role=explicit||roleFound||personalTitle||/^(?:don|fra|suor)\s+/iu.test(subject);
    if(main.length>2&&givenCount===1&&!role)break;
    if(!(main.length>=2&&hasGiven)&&!listGiven&&!singleSurname)break;
    found.push({start:offset+begin,end:offset+begin+subject.length});
    if(endsList)break;
  }
  return found;
}

function municipalSubject(line){
  const lead=municipalityLead.exec(line)||parenthesizedMunicipality.exec(line);
  if(!lead) return null;
  const start=lead[0].length;
  const rest=line.slice(start);
  if(administrativeLabel.test(rest)) return null;
  // Some records omit the second dash before the action (e.g. TRASMISSIONE).
  let boundary=rest.search(subjectBreak);
  if(boundary<0) boundary=rest.length;
  for(const gap of rest.slice(0,boundary).matchAll(/[ \t]+/g)){
    if(administrativeLabel.test(rest.slice(gap.index+gap[0].length))){
      boundary=gap.index;
      break;
    }
  }
  const subject=rest.slice(0,boundary).trimEnd();
  if(!subject || containsPublic(subject) || institutionOrBusiness.test(subject) || placeLead.test(subject) || documentaryLead.test(subject)) return null;
  const tokens=personParts(subject,0,6);
  if(!plausible(tokens) || subject.slice(tokens.at(-1).end).trim()) return null;
  const known=tokens.some(token=>names.has(token.key));
  const mainWords=tokens.filter(token=>!particles.has(token.key));
  if(mainWords.length>4 || (!known && (mainWords.length!==2 || boundary===rest.length || mainWords.some(t=>t.key.length<3)))) return null;
  return {start,end:start+tokens.at(-1).end,confidence:known?'high':'medium'};
}

function matchAll(s,re){return s.matchAll(new RegExp(re.source,re.flags.includes('d')?re.flags:re.flags+'d'));}
function overlap(a,b){return a.start<b.end && b.start<a.end;}
export function detectLine(s,types,{table=false,previous=''}={}){
  const found=[], protectedSpans=[];
  const protect=(re,group=0)=>{for(const m of matchAll(s,re)){const [start,end]=m.indices[group]; protectedSpans.push({start,end});}};
  // Public identifiers are protected as whole spans, not just as separate digits.
  const cup=/\b[A-Z]\d{2}[A-Z]\d{11}\b/giu;
  const cig=/\bCIG\s*[:.\-]?\s*([A-Z0-9]{10})\b/giu;
  if(!types.cup) protect(cup);
  if(!types.cig) {protect(cig); if(/\bCIG\s*[:.\-]?\s*$/i.test(previous)) protect(/^\s*[A-Z0-9]{10}\b/giu);}
  if(!types.protocol) {
    protect(/\b(?:prot(?:ocollo)?\.?|rep\.?|racc\.?|r\.?g\.?|scia|suap)\s*(?:pratica\s*)?(?:n[.°º]?\s*)?[:.\-]?\s*[A-Z0-9][A-Z0-9|_./-]*\d[A-Z0-9|_./-]*/giu);
    protect(/\b(?:prot[_-]n[_-]|ATENA[_ -]?|EDIS|POD\s+|SUAP\s+|codice\s+di\s+rintracciabilit[aà]\s+)[A-Z0-9][A-Z0-9_./-]*\d[A-Z0-9_./-]*/giu);
  }
  protect(/\b(?:MIC[|/]\S+|\d{2}\.\d{2}\.\d{2}\/\d+\/\d{4})\b/giu);
  protect(/\b(?:art(?:icolo)?\.?|comma|c\.|d\.?\s*lgs\.?|d\.?\s*l\.?|legge|l\.)\s*(?:n\.?\s*)?\d+(?:\s*[/.-]\s*\d+)*(?:\s*(?:bis|ter|quater))?\b/giu);
  if(!types.date) protect(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g);
  if(!types.amount) protect(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g);
  const add=(key,type,start,end,ruleId,confidence='high')=>{
    if(!types[key]||!Number.isInteger(start)||end<=start) return;
    while(start<end&&/\s/u.test(s[start]))start++;
    while(end>start&&/\s/u.test(s[end-1]))end--;
    if(key==='name'&&!types.title)start+=(leadingTitles.exec(s.slice(start,end))?.[0].length??0);
    if(key==='name'&&/\p{L}{2}\.$/u.test(s.slice(start,end)))end--;
    const candidate={key,type,start,end,value:s.slice(start,end),ruleId,confidence};
    if(!candidate.value || (key!=='birthdate'&&protectedSpans.some(p=>overlap(p,candidate)))) return;
    if(!found.some(f=>f.key===key&&f.start===start&&f.end===end)) found.push(candidate);
  };
  const scan=(key,type,re,rule,group=0)=>{if(!types[key])return; for(const m of matchAll(s,re)){if(m.indices[group])add(key,type,...m.indices[group],rule);}};
  scan('cf','Codice fiscale',/\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/giu,'CF');
  scan('iban','IBAN',/\bIT\s?\d{2}\s?[A-Z]\s?\d{5}\s?\d{5}\s?[A-Z0-9]{12}\b/giu,'IBAN');
  scan('email','Email / PEC',/\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9-]+(?:\s*\.\s*[A-Z0-9-]+)*\s*\.\s*[A-Z]{2,}\b/giu,'EMAIL');
  if(types.piva){
    for(const m of matchAll(s,/\b(?:IT\s*)?\d{11}\b/gu)){
      const digits=m[0].replace(/\D/g,'');
      const sum=[...digits.slice(0,10)].reduce((acc,d,i)=>{const n=Number(d)*(i%2?2:1);return acc+(n>9?n-9:n);},0);
      const labelled=/\b(?:P\.?\s*IVA|Partita\s+IVA)\s*[:.]?\s*$/iu.test(s.slice(0,m.index));
      if(labelled || (digits!== '00000000000' && (10-sum%10)%10===Number(digits[10]))) add('piva','P. IVA',...m.indices[0],'PIVA');
    }
  }
  if(table) scan('phone','Telefono',/\b(?:tel(?:efono)?\.?|cell(?:ulare)?\.?|fax)\s*[:.]?\s*((?:\+39\s*)?(?:0\d{1,4}[\s./-]?\d{5,8}|3\d{2}[\s./-]?\d{6,7}))\b/giu,'PHONE_CONTEXT',1);
  else scan('phone','Telefono',/(?<![\p{L}\p{N}/.-])(?:\+39\s?)?(?:0\d{1,4}[\s./-]?\d{5,8}|3\d{2}[\s./-]?\d{6,7})(?![\p{L}\p{N}/.-])/gu,'PHONE');
  scan('birthdate','Data di nascita',/\b(?:nat[oa]|data\s+di\s+nascita)\s*[: ]*(?:a\s+[^,;]{1,60}?\s+)?(?:il\s+)?(\d{1,2}[./-]\d{1,2}[./-]\d{4})\b/giu,'BIRTH',1);
  scan('personalid','ID personale',/\b(?:cod(?:ice)?|ID)\s+(?:donatore|paziente|assistito)\s*:?\s*([A-Z0-9][A-Z0-9./-]{3,24})\b/giu,'PERSONAL_ID',1);
  scan('date','Data',/\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b/gu,'DATE');
  scan('amount','Importo / valore',/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/gu,'AMOUNT');
  scan('cup','CUP',cup,'CUP'); scan('cig','CIG',cig,'CIG',1);
  scan('protocol','Protocollo',/\b(?:prot(?:ocollo)?\.?|INPS-ISEE-)\s*(?:n\.?\s*)?[:.\-]?\s*([A-Z0-9][A-Z0-9|_./-]*\d[A-Z0-9|_./-]*)\b/giu,'PROTOCOL',1);
  scan('adminid','Identificativo amministrativo',/\b(?:rep\.?|racc\.?|r\.?g\.?|scia|suap)\s*(?:n\.?\s*)?[:.\-]?\s*([A-Z0-9][A-Z0-9./_-]*\d[A-Z0-9./_-]*)\b/giu,'ADMIN',1);
  scan('rea','REA',/\bREA\s*[:.\-]?\s*([A-Z]{0,2}\s*[-/]?\s*\d{3,10})\b/giu,'REA',1);
  scan('ipa','IPA',/\bIPA\s*[:.\-]?\s*([A-Z0-9_-]{4,30})\b/giu,'IPA',1);
  if(types.cadastral){
    const cat=/\b(fg\.?|fgl\.?|foglio|f\.|p[./]?\s*ll[ae]\.?|part(?:icell[ae])?\.?|sub(?:b|altern[oi])?\.?)\s*(?:nn?[.°º]?\s*)?[:.]?\s*(\d+(?:\s*(?:[,;-]|\be\b)\s*\d+|\s+\d+(?![\p{L}\p{N}/.]))*)/giu;
    for(const m of matchAll(s,cat)){
      if(/^f\.$/i.test(m[1])&&!/catast|p[./]?lla|particell|sub\b/i.test(s))continue;
      if(/^part\.?$/i.test(m[1])&&!/catast|\bfg\b|\bfoglio\b|\bf\.\d/i.test(s))continue;
      const [a,b]=m.indices[2];
      // Each number is a separate occurrence: preserve separators and labels.
      for(const n of s.slice(a,b).matchAll(/\d+/g))add('cadastral','Dato catastale',a+n.index,a+n.index+n[0].length,'CADASTRAL');
    }
    if(/catast|\bfg\b|\bfoglio\b|N\.?C\.?E\.?U/i.test(s))scan('cadastral','Dato catastale',/\b(?:p[./]?\s*ll[ae]\.?|particell[ae]|sub(?:altern[oi])?\.?)\s*[:.]?\s*([A-Z])(?=\s*(?:[.,;\-–)]|$))/gu,'CADASTRAL_LETTER',1);
    // A wrapped value on the immediately following physical line can still belong to the label.
    if(/\b(?:p[./]?\s*ll[ae]\.?|particell[ae]|fg\.?|foglio|sub(?:altern[oi])?\.?)\s*$/iu.test(previous)){
      for(const m of matchAll(s,/^\s*(\d+(?:\s*(?:,|-|\be\b)\s*\d+)*)(?=\s*(?:$|[-–,;]|sub\b|subb\b|p[./]?lla\b|particell))/giu)){
        const [a,b]=m.indices[1];for(const n of s.slice(a,b).matchAll(/\d+/g))add('cadastral','Dato catastale',a+n.index,a+n.index+n[0].length,'CADASTRAL_CONTINUED');
      }
    }
  }
  // Titles and the adjacent name are separate selections but share a continuous span when both enabled.
  if(types.name||types.title){
    for(const m of s.matchAll(new RegExp('\\b'+titlePattern+'(?=\\s|$)(?:\\s+'+titlePattern+'(?=\\s|$))*\\s*','gu'))){
      const a=m.index, after=a+m[0].length;
      if(a>0&&letters.test(s[a-1]))continue;
      if(titleInPlaceName.test(s.slice(0,a))||(/^\s*$/u.test(s.slice(0,a))&&titleInPlaceName.test(previous+' ')))continue;
      const t=personParts(s,after,4);
      if(!t.length||!t.some(x=>!particles.has(x.key)&&x.key.length>1))continue;
      let end=t.at(-1).end;
      // Avoid swallowing unrelated uppercase prose following a name.
      const known=t.findIndex(x=>names.has(x.key));
      if(known>=1 && t.length>known+1 && !particles.has(t[known+1].key) && !particles.has(t[known-1]?.key) && !names.has(t[known+1].key)) end=t[known].end;
      if(types.title&&types.name)add('name','Titolo e nominativo',a,end,'TITLED');
      else if(types.name)add('name','Nome',t[0].start,end,'TITLED_NAME');
      else add('title','Titolo professionale',a,after,'TITLE');
    }
  }
  if(types.name){
    const context=/\b(?:richiedente|cliente|titolare|proprietari[oa]|funzionari[oa]|debitore\s+esecutato|parte\s+(?:alienante|acquirente|aggiudicataria)(?:\s+coniugi)?|allacciamento\s+(?:BT|MT)|sottoscritt[oa]|cognome\s+e\s+nome|dipendente|a\s+nome\s+di|per\s+conto\s+di|nei\s+confronti\s+di|presentata\s+da|direttore|dirigente|responsabile|medico|referente|primario|(?:az\.?\s+agricola))\s*:?\s+/giu;
    for(const m of s.matchAll(context)){
      const after=m.index+m[0].length;
      const quote=/^[\s"“‘«]+/u.exec(s.slice(after));
      const t=personParts(s,after+(quote?.[0].length||0),5);
      if(plausible(t)&&!containsPublic(t.map(x=>x.value).join(' '))) add('name','Nome',t[0].start,t.at(-1).end,'CONTEXT_NAME');
    }
    // Recover a transposed or split "di" only inside this explicit name field.
    for(const cue of s.matchAll(/\ba[ \t]+nome[ \t]+(?:id|d[ \t]+i)[ \t]*:?[ \t]+/giu)){
      const start=cue.index+cue[0].length;
      const t=personParts(s,start,4);
      if(!plausible(t,true)) continue;
      const end=t.at(-1).end;
      if(!/^\s*(?:$|[,;:.)|–—-]|(?:nat[oa]|residente|relativ[ao])\b)/iu.test(s.slice(end))) continue;
      const value=s.slice(start,end);
      if(!containsPublic(value)&&!institutionOrBusiness.test(value)){
        add('name','Nome',start,end,'CONTEXT_NAME_REVERSED_PREPOSITION');
      }
    }
    // Named co-owners after an explicit role, including non-Italian given names.
    for(const m of s.matchAll(/\b(?:coniugi|coeredi)\s+/giu)){
      const first=personParts(s,m.index+m[0].length,4);
      if(!plausible(first))continue;
      const rest=s.slice(first.at(-1).end), sep=/^\s+(?:e|ed)\s+/iu.exec(rest);
      if(!sep)continue;
      const second=personParts(s,first.at(-1).end+sep[0].length,4);
      if(plausible(second)&&!containsPublic(second.map(x=>x.value).join(' '))) add('name','Nome',second[0].start,second.at(-1).end,'CONTEXT_COOWNER');
    }
    if(table){
      const subject=municipalSubject(s);
      if(subject) add('name',subject.confidence==='high'?'Nome':'Possibile nominativo',
        subject.start,subject.end,'MUNICIPAL_SUBJECT',subject.confidence);
      // Only isolated subject segments, never the first location segment unless a given name is present.
      const cuts=[0,...[...s.matchAll(/(?:\s+[-–—]\s*|[-–—]\s+)/gu)].map(m=>m.index+m[0].length),s.length];
      for(let j=0;j<cuts.length-1;j++){
        const a=cuts[j], chunk=s.slice(a,cuts[j+1]).replace(/\s*[-–—]\s*$/u,'').trimEnd();
        if(j===0&&/\b(?:via|viale|piazza|corso|largo|vicolo)(?:\s+[A-Z]\.)?\s*$/iu.test(previous))continue;
        if(!titleInPlaceName.test(s.slice(0,a))){
          for(const span of tableFieldNames(chunk,a)){
            add('name','Nome',span.start,span.end,'TABULAR_PERSON');
          }
        }
        for(const m of chunk.matchAll(roleBeforeName)){
          if(titleInPlaceName.test(chunk.slice(0,m.index)))continue;
          const start=m.index+m[0].length;
          for(const span of tableFieldNames(chunk.slice(start),a+start,{explicit:true})){
            add('name','Nome',span.start,span.end,'TABULAR_PERSON_ROLE');
          }
        }
        if(!chunk.trim()||containsPublic(chunk)&&!/^\s*[\p{Lu}][\p{L}'’.-]+\s+[\p{Lu}][\p{L}'’.-]+\s+c\//u.test(chunk))continue;
        for(const sub of chunk.matchAll(/(?:^|\s+(?:e|ex)\s+)([^,;]+?)(?=\s+(?:e|ex)\s+|$)/gu)){
          const q=sub[1], b=a+sub.index+sub[0].indexOf(q);
          if(placeLead.test(q.trimStart())||documentaryLead.test(q.trimStart()))continue;
          const t=personParts(s,b,6).filter(x=>x.end<=b+q.length);
          if(!plausible(t))continue;
          const identified=t.some(x=>names.has(x.key)) || (t.length===2 && /^[A-Z]\.$/u.test(t[0].value));
          if(!identified){
            // A standalone two-word field between named entities is worth review, not automatic masking.
            const before=s.slice(0,b),after=s.slice(b+q.length);
            if(j>0 && t.length===2 && t.every(x=>x.key.length>=3&&x.value===x.value.toUpperCase()&&!particles.has(x.key)) && !s.slice(t.at(-1).end,b+q.length).trim() && /\b(?:s\.?\s*r\.?\s*l\.?s?|s\.?\s*p\.?\s*a\.?)\s*[-–—]\s*$/iu.test(before) && new RegExp('^\\s*[-–—]\\s*[\\p{Lu}][\\p{L}]+\\s+(?:'+[...names].join('|')+')\\b','iu').test(after)) add('name','Possibile nominativo',t[0].start,t.at(-1).end,'SUBJECT_REVIEW','medium');
            continue;
          }
          const tail=s.slice(t.at(-1).end,b+q.length).trim();
          if(tail&&!/^(?:\+\s*\d+|c\/.*|per\s+conto\s+di.*|UNINA|titolare\b.*|autocarrozzeria\s+.*)$/iu.test(tail))continue;
          add('name','Nome',t[0].start,t.at(-1).end,'SUBJECT_NAME');
        }
      }
    }
  }
  if(types.legalentity){
    // Recognizable company names without a suffix; extend the list only with verified public names.
    scan('legalentity','Ragione sociale',/\b(?:E[-–]Distribuzione|SNAM\s+(?:Rete|Ret)\s+Gas|Amalfitana\s+Gas)\b/giu,'COMPANY_KNOWN');
    // Business descriptors plus a proper denomination, including sole proprietorships.
    const trade=/\b(?:autocarrozzeri[ae]|carrozzeri[ae]|oleifici[oa]|frantoi[oa]|caseifici[oa]|panifici[oa]|pastifici[oa]|falegnameri[ae]|farmaci[ae]|ristorante|pizzeria|albergo|hotel|agriturismo|officina(?:\s+meccanica)?|(?:az\.?|azienda)\s+agricola|studio\s+professionale)\b\s+/giu;
    for(const m of s.matchAll(trade)){
      const a=m.index, after=a+m[0].length;
      const t=personParts(s,after,7,{trade:true});
      if(!t.length||!t.some(x=>!particles.has(x.key)&&x.key.length>1))continue;
      const label=m[0].trim(), lead=s.slice(0,a);
      const contextual=/(?:\b(?:ditta|impresa|cliente|titolare)\s*[:.]?\s*|(?:allacciamento|allaccio)(?:\s+\p{L}+){0,4}\s+)$/iu.test(lead);
      const end=t.at(-1).end, value=s.slice(a,end);
      if(containsPublic(value)||/\b(?:comunale|pubblico|pubblica|statale)\b/iu.test(value))continue;
      if(isCapital(label)||contextual) add('legalentity','Ragione sociale',a,end,'COMPANY_TRADE');
      else if(t.some(x=>names.has(x.key))) add('legalentity','Possibile ragione sociale',a,end,'COMPANY_TRADE_REVIEW','medium');
    }
    const suffix=/\b(?:s\.?\s*r\.?\s*l\.?\s*s?\.?|s\.?\s*p\.?\s*a\.?|s\.?\s*a\.?\s*s\.?|s\.?\s*n\.?\s*c\.?|ETS|APS|ODV)\b\.?/giu;
    for(const m of s.matchAll(suffix)){
      const before=s.slice(0,m.index), boundary=Math.max(before.lastIndexOf(' - '),before.lastIndexOf(' – '),before.lastIndexOf(';'),before.lastIndexOf(','));
      let segment=before.slice(boundary<0?0:boundary+1).replace(/^\s*[-–]\s*/,'').trim();
      segment=segment.replace(/^.*\b(?:allacciamento|proponente|ditta|impresa|societ[aà]|opere\s+di|richiedente|parte\s+alienante|parte\s+acquirente|proprietaria|ex|debitore\s+esecutato)\s*['’:]?\s+/iu,'').replace(/^.*\b(?:pervenut[ao]ci\s+dall[ae]|prot\.)\s+/iu,'').replace(/^.*\b\d{5,}\s+/u,'').replace(/^[\s"“‘«]+/u,'').trim();
      const a=before.lastIndexOf(segment);
      if(!segment||a<0||containsPublic(segment)||segment.split(/\s+/).length>12||!/[\p{Lu}]/u.test(segment)||segment.split(/\s+/).some(t=>stop.has(norm(t))&&!/^(?:COSTRUZIONI|GENERALI|OFFICINA|OFFICINE|AZIENDA|AGRICOLA|AUTOCARROZZERIA|OLEIFICIO|IMPRESA|SERVIZI)$/u.test(norm(t))))continue;
      if(/^s\.?\s*n\.?\s*c\.?$/iu.test(m[0])&&(!/\b(?:ditta|societ[aà]|impresa)\b/iu.test(before)&&m[0]===m[0].toLowerCase()&&!segment.split(/\s+/).some(t=>names.has(norm(t)))||/\b(?:via|civico|piazza)\b/iu.test(segment)||/\b(?:via|viale|piazza|corso)(?:\s+[A-Z]\.)?\s*$/iu.test(previous)))continue;
      let end=m.index+m[0].length;
      if(/^s\.?\s*n\.?\s*c\.?$/iu.test(m[0])){
        const continuation=/^\s+(?:di|DI)\s+([\p{Lu}][\p{L}'’.-]+(?:\s+[\p{Lu}][\p{L}'’.-]+){1,3})(?:\s*&\s*C\.?)/u.exec(s.slice(end));
        if(continuation&&!containsPublic(continuation[0]))end+=continuation[0].length;
      }
      add('legalentity','Ragione sociale',a,end,'COMPANY_SUFFIX');
    }
    for(const m of matchAll(s,/\b(?:ditta|impresa|az\.?\s+agricola)\s*:?\s+([^,;–—]+?)(?=\s+-\s*|[,;]|$)/giu)){
      const [a,b]=m.indices[1], v=s.slice(a,b).trim();
      if(v&&!found.some(f=>f.key==='legalentity'&&f.start<b&&a<f.end)&&v.length<=65&&!containsPublic(v)&&v.split(/\s+/).length<=6&&!v.split(/\s+/).some(t=>stop.has(norm(t))))add('legalentity','Ragione sociale',a,b,'COMPANY_CONTEXT');
    }
  }
  if(types.address){
    for(const value of completeAddresses(s)){
      const a=s.indexOf(value);if(a>=0)add('address','Indirizzo completo',a,a+value.length,'ADDRESS');
    }
  }
  // Avoid overlapping duplicate name/title hits; keep the most complete contextual interval.
  return found.filter((f,i)=>!found.some((g,j)=>i!==j&&g.key===f.key&&g.start<=f.start&&g.end>=f.end&&(g.start<f.start||g.end>f.end)));
}

// Matrix multiply compatible with PDF.js viewport.transform/item.transform.
function multiply(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function nativeAtoms(page,measure){
  const vp=page.viewport;
  return (page.items||[]).filter(i=>i.str?.trim()).map(i=>{
    const tx=multiply(vp.transform,i.transform), h=Math.hypot(tx[2],tx[3]), w=i.width*vp.scale;
    const style=page.styles?.[i.fontName]||{};
    const ascent=Number.isFinite(style.ascent)?style.ascent:.85;
    const descent=Number.isFinite(style.descent)?style.descent:-.22;
    const advances=measure?.(i,h,w,style,tx[4]);
    return {text:i.str,x0:tx[4],x1:tx[4]+w,y0:tx[5]-h*ascent,y1:tx[5]-h*descent,baseline:tx[5],advances,source:'native'};
  }).filter(a=>a.x1>a.x0&&a.y1>a.y0);
}
export function ocrAtoms(page){return (page.ocrWords||[]).filter(w=>w.text&&w.bbox).map(w=>({text:w.text,x0:w.bbox.x0,x1:w.bbox.x1,y0:w.bbox.y0,y1:w.bbox.y1,baseline:w.bbox.y1,source:'ocr'}));}
function charX(atom,index){return atom.advances?.[index]??(atom.x0+(atom.x1-atom.x0)*index/atom.text.length);}
function makeRows(atoms){
  const rows=[];
  for(const a of [...atoms].sort((a,b)=>a.baseline-b.baseline||a.x0-b.x0)){
    const h=a.y1-a.y0;
    let r=rows.findLast(r=>Math.abs(r.base-a.baseline)<=Math.max(1.5,h*.45));
    if(!r){r={base:a.baseline,atoms:[]};rows.push(r);}
    r.atoms.push(a);
  }
  return rows.map(r=>r.atoms.sort((a,b)=>a.x0-b.x0));
}
export function tableBounds(atoms,width){
  for(const row of makeRows(atoms)){
    const doc=row.find(a=>/^doc\.?$/i.test(a.text.trim()));
    const obj=row.find(a=>/^oggetto$/i.test(a.text.trim()));
    const fas=row.find(a=>/^cod\.?\s*(?:fascicol[io])?$/i.test(a.text.trim())||/^cod\.?\s*fascicol[io]/i.test(a.text.trim()));
    if(doc&&obj&&fas&&doc.x0<obj.x0&&obj.x0<fas.x0) return {left:obj.x0-1,right:fas.x0-1,headerY:Math.max(doc.y1,obj.y1,fas.y1),mode:'header'};
  }
  // Headerless export: only infer when repeated, separated document and fascicle fields are present.
  const docs=atoms.filter(a=>/^\d{4,7}$/.test(a.text.trim())&&a.x1<width*.15);
  const fasc=atoms.filter(a=>/^\d{2}\.\d{2}\.\d{2}\/\d+\/\d{4}/.test(a.text.trim())&&a.x0>width*.65);
  if(docs.length>=3&&fasc.length>=3){const left=Math.max(...docs.map(a=>a.x1))+1,right=Math.min(...fasc.map(a=>a.x0))-1;if(right-left>width*.4)return {left,right,headerY:0,mode:'inferred'};}
  return null;
}
function clipAtom(a,bounds){
  if(!bounds)return a;
  if(a.y0<bounds.headerY-1||a.x1<=bounds.left||a.x0>=bounds.right)return null;
  let start=0,end=a.text.length;
  while(start<end&&charX(a,start+1)<=bounds.left)start++;
  while(end>start&&charX(a,end-1)>=bounds.right)end--;
  if(start>=end)return null;
  if(start===0&&end===a.text.length)return a;
  return {...a,text:a.text.slice(start,end),x0:charX(a,start),x1:charX(a,end),advances:a.advances?.slice(start,end+1)};
}
export function sourceLines(atoms,bounds){
  return makeRows(atoms.map(a=>clipAtom(a,bounds)).filter(Boolean)).map(row=>{
    let text=''; const spans=[];
    for(const atom of row){if(text)text+=' ';const start=text.length;text+=atom.text;spans.push({start,end:text.length,atom});}
    return {text,spans};
  });
}
export function rectsForSpan(line,start,end,viewport,bounds=null,pad=0.6){
  const result=[];
  for(const sp of line.spans){
    const a=Math.max(start,sp.start),b=Math.min(end,sp.end);if(a>=b)continue;
    const atom=sp.atom; let x0=charX(atom,a-sp.start),x1=charX(atom,b-sp.start);
    // OCR provides word boxes, not reliable character positions. Avoid extrapolating past the word.
    if(atom.source==='ocr'){x0=atom.x0;x1=atom.x1;}
    x0=Math.max(0,bounds?.left??0,x0-pad);x1=Math.min(viewport.width,bounds?.right??viewport.width,x1+pad);
    const y0=Math.max(0,atom.y0-.3),y1=Math.min(viewport.height,atom.y1+.3);
    if(x1>x0&&y1>y0)result.push({x:x0/viewport.width,y:y0/viewport.height,w:(x1-x0)/viewport.width,h:(y1-y0)/viewport.height});
  }
  return result;
}
export function detectOccurrences(atoms,viewport,types,{bounds=tableBounds(atoms,viewport.width)}={}){
  const lines=sourceLines(atoms,bounds), findings=[];let previous=null;
  for(const line of lines){
    const y=line.spans[0]?.atom.y0??0,h=line.spans[0]?line.spans[0].atom.y1-line.spans[0].atom.y0:0;
    const newRecord=/^\s*(?:comun[ei]\b|[\p{Lu}][\p{L}'’ .-]{1,60}\s+\(?(?:SA|AV|NA|BN|CE|RM)\)?\s*(?:[-–—,]|$))/iu.test(line.text);
    const adjacent=previous && !newRecord && y-previous.y<Math.max(h,previous.h)*1.8?previous.text:'';
    if(adjacent&&types.name&&previous.lastTitle){
      const t=previous.lastTitle;
      const remainder=t.value.replace(new RegExp('^'+titlePattern+'\\s*','u'),'').trim();
      const next=/^\s*([\p{Lu}][\p{L}'’.-]{1,})(?=\s*[-–—,;]|\s*$)/u.exec(line.text);
      if(names.has(norm(remainder))&&next&&!stop.has(norm(next[1]))&&!containsPublic(next[1])){
        const start=next.index+next[0].indexOf(next[1]),end=start+next[1].length;
        t.value+=' '+next[1];t.rects.push(...rectsForSpan(line,start,end,viewport,bounds));
      }
    }
    // Join only explicit identity context across adjacent physical lines.
    // Coordinates remain separate for each line.
    if(adjacent && types.name && bounds && previous.line){
      const cue=/\b(?:cliente|richiedente|titolare|dipendente|proprietari[oa]|funzionari[oa]|nei\s+confronti\s+di|per\s+conto\s+di|allacciamento\s+(?:BT|MT))\s*:?\s*/giu;
      const last=[...adjacent.matchAll(cue)].at(-1);
      if(last){
        const a=last.index+last[0].length, fragment=adjacent.slice(a).trim();
        const tail=fragment?personParts(adjacent,a,5):[];
        // A trailing particle is intentionally kept here, even if personParts drops it.
        const isParticle=particles.has(norm(fragment));
        const cleanTail=fragment && (isParticle || (tail.length && norm(tail.map(x=>x.value).join(' '))===norm(fragment)));
        const canContinue=(!fragment || cleanTail) && (!fragment || isParticle || tail.length===1);
        if(canContinue){
          const next=personParts(line.text,0,4);
          const combined=[...tail,...next];
          if(plausible(combined,true)&&next.length && !containsPublic(next.map(x=>x.value).join(' '))){
            const nextEnd=next.at(-1).end;
            const prevStart=a, prevEnd=adjacent.trimEnd().length;
            const prevRects=fragment?rectsForSpan(previous.line,prevStart,prevEnd,viewport,bounds):[];
            const currRects=rectsForSpan(line,next[0].start,nextEnd,viewport,bounds);
            const partial=(previous.line.spans.some(sp=>sp.atom.source==='ocr'&&sp.start<prevEnd&&sp.end>prevStart&&(sp.start<prevStart||sp.end>prevEnd))||line.spans.some(sp=>sp.atom.source==='ocr'&&sp.start<nextEnd&&sp.end>next[0].start&&(sp.start<next[0].start||sp.end>nextEnd)));
            if(currRects.length){
              findings.push({key:'name',type:'Nome su più righe',start:prevStart,end:prevEnd,value:[fragment,line.text.slice(next[0].start,nextEnd)].filter(Boolean).join(' '),ruleId:'CONTEXT_NAME_WRAPPED',confidence:partial?'medium':'high',enabled:!partial,rects:[...prevRects,...currRects],sourceLine:adjacent});
            }
          }
        }
      }
    }
    if(adjacent && previous.line && (types.name||types.title)){
      const titleEnd=new RegExp('\\b'+titlePattern+'\\s*$','u').exec(adjacent);
      if(titleEnd&&!titleInPlaceName.test(adjacent.slice(0,titleEnd.index))){
        const next=personParts(line.text,0,4);
        if(next.length&&next.some(t=>!particles.has(t.key)&&t.key.length>1)&&!containsPublic(next.map(t=>t.value).join(' '))){
          const candidate=line.text.slice(next[0].start,next.at(-1).end);
          const key=types.name?'name':'title';
          const prevRects=types.title?rectsForSpan(previous.line,titleEnd.index,adjacent.trimEnd().length,viewport,bounds):[];
          const currRects=types.name?rectsForSpan(line,next[0].start,next.at(-1).end,viewport,bounds):[];
          // OCR word boxes may include surrounding text: keep these as review suggestions.
          const partial=[...previous.line.spans,...line.spans].some(sp=>sp.atom.source==='ocr');
          if(prevRects.length||currRects.length) findings.push({key,type:types.name?'Titolo e nominativo su più righe':'Titolo professionale',start:titleEnd.index,end:adjacent.trimEnd().length,value:[types.title?titleEnd[0].trim():'',types.name?candidate:''].filter(Boolean).join(' '),ruleId:'TITLE_WRAPPED',confidence:partial?'medium':'high',enabled:!partial,rects:[...prevRects,...currRects],sourceLine:adjacent});
        }
      }
    }
    let lastTitle=null;
    for(const f of detectLine(line.text,types,{table:!!bounds,previous:adjacent})){
      const rects=rectsForSpan(line,f.start,f.end,viewport,bounds);
      const partialOcr=line.spans.some(sp=>sp.atom.source==='ocr'&&sp.start<f.end&&sp.end>f.start&&(f.start>sp.start||f.end<sp.end)&&/[^\p{P}\s]/u.test(sp.atom.text.slice(0,Math.max(0,f.start-sp.start))+sp.atom.text.slice(Math.min(sp.atom.text.length,f.end-sp.start))));
      if(rects.length){const item={...f,rects,sourceLine:line.text,confidence:partialOcr?'medium':f.confidence,enabled:!partialOcr&&f.confidence!=='medium'};findings.push(item);if(f.ruleId==='TITLED'&&!line.text.slice(f.end).trim())lastTitle=item;}
    }
    previous={text:line.text,y,h,lastTitle,line};
  }
  const unique=findings.filter((f,i)=>!findings.some((g,j)=>i!==j&&g.key===f.key&&g.enabled===f.enabled&&g.rects.length>f.rects.length&&f.rects.every(a=>g.rects.some(b=>a.x>=b.x-1e-8&&a.y>=b.y-1e-8&&a.x+a.w<=b.x+b.w+1e-8&&a.y+a.h<=b.y+b.h+1e-8))));
  return {findings:unique,lines,bounds};
}
