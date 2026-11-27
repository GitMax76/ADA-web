import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TRANSPARENCY_TYPES as profile, detectLine, detectOccurrences, nativeAtoms, rectsForSpan} from '../src/rules/transparency.js';
import {detectionHarness} from './detection-harness.mjs';
const vp={width:840,height:600};
const atom=(text,x,y,unit=4)=>({text,x0:x,x1:x+text.length*unit,y0:y,y1:y+10,baseline:y+8,advances:Array.from({length:text.length+1},(_,i)=>x+i*unit),source:'native'});
const header=[atom('Doc',15,30),atom('Oggetto',75,30),atom('Cod. Fascicoli',680,30)];
const makeTable=()=>[...header,atom('28085',15,60),atom('Comune di Alfa - Mario Rossi - Fg 8 plla 205',75,60),atom('34.43.08/205/2019',680,60),atom('28086',15,88),atom('CUP A12B25000080005 CIG A00ACE9185 - Art. 8 legge 42/2004',75,88),atom('34.43.08/8/2019',680,88),atom('28087',15,116),atom('Dott.ssa Anna Verdi - Prot. 205 - 08/01/2026 - euro 205,00',75,116),atom('34.43.08/205/2026',680,116)];
const findings=(text,opts={})=>detectLine(text,{...profile,...opts},{table:true});
test('confirmed transparency preset retains public references and turns on specific categories',()=>{
 for(const k of ['cf','birthdate','iban','email','piva','phone','name','cadastral','legalentity','title'])assert.equal(profile[k],true,k);
 for(const k of ['personalid','protocol','address','date','amount','cig','cup','adminid','rea','ipa'])assert.equal(profile[k],false,k);
});
test('per-occurrence geometry masks only the intended digits and never protected columns',()=>{
 const result=detectOccurrences(makeTable(),vp,profile);
 assert.equal(result.bounds.mode,'header');
 const cat=result.findings.filter(f=>f.key==='cadastral');
 assert.deepEqual(cat.map(f=>f.value),['8','205']);
 for(const f of cat)for(const r of f.rects){assert.ok(r.y*vp.height>=59 && (r.y+r.h)*vp.height<=71);}
 assert.ok(result.findings.some(f=>f.value==='Mario Rossi'));
 assert.ok(result.findings.some(f=>f.value==='Dott.ssa Anna Verdi'));
 for(const f of result.findings)for(const r of f.rects){assert.ok(r.x*vp.width>=result.bounds.left-1e-8);assert.ok((r.x+r.w)*vp.width<=result.bounds.right+1e-8);}
 assert.equal(result.findings.some(f=>f.rects.some(r=>r.y*vp.height>=87&&r.y*vp.height<=99)),false);
});
test('disabling each category prevents that category from producing any rectangle',()=>{
 const s='Dott. Mario Rossi - Fg 8 plla 205 - Alfa S.R.L. - CUP A12B25000080005 - CIG A00ACE9185 - Prot. 205 - CF RSSMRA80A01H501U - P. IVA 12345678901 - Tel. 3331234567 - info@example.com - Nato il 02/01/1980';
 for(const k of ['name','title','cadastral','legalentity','cf','piva','phone','email','birthdate','cup','cig','protocol']){
  const result=findings(s,{[k]:false});assert.ok(result.every(f=>f.key!==k),k);
  if(k==='title')assert.ok(result.every(f=>!/^Dott\./.test(f.value)),k);
  if(k==='name')assert.ok(result.every(f=>!f.value.includes('Mario Rossi')),k);
 }
 assert.equal(findings(s,{name:false,title:false,cadastral:false,legalentity:false,cf:false,piva:false,phone:false,email:false,birthdate:false}).length,0);
});
test('title is a full token, not a prefix of architectural or ordinary words',()=>{
 for(const s of ['ARCHITETTONICHE AL FABBRICATO SITO','AVVENUTO RITIRO','Amm.ne comunale','Gruppo Sanguigno','Chiesa di Santa Maria','Via Mario Rossi'])assert.equal(findings(s).length,0,s);
 for(const s of ['Dr L.Rinaldi','Dott.ssa Anna Verdi','Arch. Mario De Luca','Avv. I. Rossi'])assert.ok(findings(s).some(f=>f.value===s),s);
});
test('unlabelled names in subjects, co-applicants and contextual employees',()=>{
 for(const [s,v] of [['Comune di Alfa - ROSSI MARIO - Lavori','ROSSI MARIO'],['Comune di Alfa - De Luca Anna e Bianchi Paolo - Lavori','Bianchi Paolo'],['Autorizzazione missione della dipendente Anna Di Gregorio','Anna Di Gregorio'],['Ordinanza nei confronti di ROSSI Mario','ROSSI Mario']])assert.ok(findings(s).some(f=>f.value===v),s);
});
test('public protocol composite containing a tax number is distinct from the separate tax number',()=>{
 const id='12345678901'; const s=`SUAP pratica n.${id}-20260101-1234 - P. IVA ${id}`;
 const f=findings(s); assert.equal(f.filter(x=>x.key==='piva').length,1); assert.equal(f.find(x=>x.key==='piva').start,s.lastIndexOf(id));
});
test('cadastral lists and wrapped numbers preserve labels and intervening characters',()=>{
 const f=findings('Fg. 8 PLLE 528 529 522 sub 5');assert.deepEqual(f.map(x=>x.value),['8','528','529','522','5']);
 const res=detectOccurrences([...header,atom('Foglio 7 plla',75,60),atom('205 sub 2',75,72)],vp,profile);
 assert.ok(res.findings.some(x=>x.value==='205'&&x.ruleId==='CADASTRAL_CONTINUED'));
});
test('wrapped street continuations and lowercase snc are protected',()=>{
 const res=detectOccurrences([...header,atom('Intervento in Corso',75,60),atom('MARIO ROSSI - Trasmissione',75,72),atom('via S.',75,90),atom('Allende snc, Comune di Alfa.',75,102)],vp,profile);
 assert.equal(res.findings.length,0);
});
test('OCR partial-token matches are not enabled automatically',()=>{
 const a={...atom('Fg.8',75,60),source:'ocr'};
 const f=detectOccurrences([a],vp,profile,{bounds:null}).findings[0];assert.equal(f.value,'8');assert.equal(f.enabled,false);assert.equal(f.confidence,'medium');
});
test('native text transforms retain source character positions',()=>{
 const item={str:'Fg 8',width:16,transform:[10,0,0,10,75,540],fontName:'f'};
 const p={viewport:{...vp,scale:1,transform:[1,0,0,-1,0,600]},items:[item],styles:{f:{ascent:.8,descent:-.2}}};
 const atoms=nativeAtoms(p,(i,h,w,style,x)=>[x,x+5,x+9,x+12,x+16]);
 const result=detectOccurrences(atoms,vp,profile,{bounds:null}); const r=result.findings[0].rects[0];
 assert.ok(Math.abs(r.x*vp.width-(75+12-.6))<1e-8);assert.ok(r.w*vp.width<6);
});
test('actual export painting on synthetic pixel surface preserves public areas',()=>{
 const result=detectOccurrences(makeTable(),vp,profile);const pixels=new Uint8Array(vp.width*vp.height).fill(255);
 const ctx={save(){},restore(){},fillStyle:'#000',fillRect(x,y,w,h){for(let yy=Math.max(0,Math.floor(y));yy<Math.min(vp.height,Math.ceil(y+h));yy++)for(let xx=Math.max(0,Math.floor(x));xx<Math.min(vp.width,Math.ceil(x+w));xx++)pixels[yy*vp.width+xx]=0;}};
 const paint=detectionHarness().paint;
 for(const f of result.findings)for(const r of f.rects)paint(ctx,r,vp);
 const count=(x0,y0,x1,y1)=>{let n=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(pixels[y*vp.width+x]===0)n++;return n;};
 assert.equal(count(0,0,65,600),0);assert.equal(count(680,0,840,600),0);assert.equal(count(0,84,840,103),0);
 assert.ok(count(75,58,650,72)>0);assert.ok(count(75,114,650,128)>0);
});

test('apostrophes, customer names embedded in utility subjects and quoted names',()=>{
 for(const [text,value] of [
  ["Comune di Alfa - NICOLA' Franco - Sollecito al Comune di Beta", "NICOLA' Franco"],
  ['Lavori di linea elettrica. Allacciamento BT MARIO BIANCHI Cod. POD IT001E12345678','MARIO BIANCHI'],
  ['Richiesta del cliente “Anna Verdi” - CUP A12B25000080005','Anna Verdi'],
  ['Comune di Alfa - G. ROSSI - Pratica','G. ROSSI'],
  ['Comune di Alfa - BIANCHI Anna titolare Az Agricola San Michele - Lavori','BIANCHI Anna']]) {
   const f=findings(text); assert.ok(f.some(x=>x.key==='name'&&x.value===value),JSON.stringify(f));
 }
});
test('trade names without legal suffix and public offices remain distinct',()=>{
 for(const [text,value] of [
  ['Comune di Alfa - ROSSI MARIO Autocarrozzeria Aurora - PdC','Autocarrozzeria Aurora'],
  ['Richiesta di allacciamento impianto fotovoltaico OLEIFICIO DEL SOLE DI BIANCHI ANNA Eneltel 123456789','OLEIFICIO DEL SOLE DI BIANCHI ANNA'],
  ['Comune di Alfa - Az Agricola San Michele - Lavori','Az Agricola San Michele'],
  ['Comune di Alfa - SOCIETA\' TRASPORTI DEL SOLE SRLS c/ MINISTERO DELLA CULTURA','TRASPORTI DEL SOLE SRLS'],
  ['Comune di Alfa - ALFA spa ex BETA VERDE srl - Lavori','BETA VERDE srl']]) {
   assert.ok(findings(text).some(f=>f.key==='legalentity'&&f.value===value),text);
   assert.ok(!findings(text,{legalentity:false}).some(f=>f.key==='legalentity'),text);
 }
 for(const text of ['Comune di Alfa - OFFICINA MECCANICA COMUNALE - LAVORI','Ditta proprietaria AZIENDA PUBBLICA DI SERVIZI ALLA PERSONA','Via Roma snc - Lavori per officina meccanica','Chiesa di Santa Maria']) assert.equal(findings(text).length,0,text);
});
test('wrapped identity and title preserve separate source coordinates and toggle selection',()=>{
 const atoms=[...header,atom('28088',15,60),atom('Su richiesta del cliente DE',75,60),atom('LUCA ANNA Eneltel 123456789',75,72),atom('34.43.08/205/2019',680,72),atom('28089',15,105),atom('Nomina Dott.ssa',75,105),atom('Maria Rossi - Comune di Alfa',75,117),atom('34.43.08/205/2019',680,117)];
 const r=detectOccurrences(atoms,vp,profile);
 const wrapped=r.findings.find(f=>f.value==='DE LUCA ANNA');assert.ok(wrapped);assert.equal(wrapped.rects.length,2);
 const t=r.findings.find(f=>f.value==='Dott.ssa Maria Rossi');assert.ok(t);assert.equal(t.rects.length,2);
 assert.ok(wrapped.rects[0].y<wrapped.rects[1].y);assert.ok(t.rects[0].y<t.rects[1].y);
 assert.equal(detectOccurrences(atoms,vp,{...profile,name:false,title:false}).findings.length,0);
 const without=detectOccurrences(atoms,vp,{...profile,title:false});assert.ok(without.findings.some(f=>f.value==='Maria Rossi'));assert.ok(!without.findings.some(f=>f.value.includes('Dott.ssa')));
});
test('co-owners need not have an Italian dictionary given name',()=>{
 const result=findings('Parte acquirente coniugi KOVAL OLEH e KOVAL IRYNA - Fg 8');
 assert.ok(result.some(f=>f.value==='KOVAL OLEH'));assert.ok(result.some(f=>f.value==='KOVAL IRYNA'));
});

test('ambiguous unlabelled field is suggested rather than silently redacted',()=>{
 const f=findings('Comune di Alfa - ALFA SRL - ZORAN BIANCO - ROSSI MARIO - Lavori');
 const ambiguous=f.find(x=>x.value==='ZORAN BIANCO');assert.ok(ambiguous);assert.equal(ambiguous.confidence,'medium');
 const a=[...header,atom('Comune di Alfa - ALFA SRL - ZORAN BIANCO - ROSSI MARIO - Lavori',75,60)];
 assert.equal(detectOccurrences(a,vp,profile).findings.find(x=>x.value==='ZORAN BIANCO').enabled,false);
});
test('a following municipal record is not a continuation of a previous title or customer',()=>{
 const a=[...header,atom('Richiesta cliente DE',75,60),atom('Mario Rossi SA - Lavori',75,72),atom('Nomina Dott.ssa',75,100),atom('Comune di Alfa - Lavori',75,112)];
 assert.equal(detectOccurrences(a,vp,profile).findings.filter(x=>['CONTEXT_NAME_WRAPPED','TITLE_WRAPPED'].includes(x.ruleId)).length,0);
});
