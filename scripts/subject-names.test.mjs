import test from 'node:test';
import assert from 'node:assert/strict';
import { detectLine, TRANSPARENCY_TYPES } from '../src/rules/transparency.js';

const namesIn = (text, types=TRANSPARENCY_TYPES, table=true) =>
  detectLine(text,types,{table}).filter(finding=>finding.key==='name');

test('tabular subject supports uncommon first names, upper case and apostrophes',()=>{
  for(const [text, name] of [
    ['Marina Nuova SA - Neri Fortunata - Autorizzazione paesaggistica', 'Neri Fortunata'],
    ['BORGO NUOVO SA -RIVA MARIANGELA TRASMISSIONE AUTORIZZAZIONE N. 11', 'RIVA MARIANGELA'],
    ["Comune di Alfa - D'Arco Antonietta - Domanda di rilascio", "D'Arco Antonietta"],
    ['Marina Nuova (Sa) FERRI GIOVANNA - Richiesta parere', 'FERRI GIOVANNA'],
    ['Marina Nuova SA - Costa Vincenzo l.r. “ALFA SRL” - Osservazioni', 'Costa Vincenzo'],
  ]){
    const matches=namesIn(text);
    assert.deepEqual(matches.map(({value,confidence})=>[value,confidence]), [[name,'high']]);
    assert.equal(text.slice(matches[0].start,matches[0].end),name);
  }
});

test('unfamiliar bounded subject is offered for manual review',()=>{
  const found=namesIn('Borgo Nuovo (SA) - Serravia Olivetta - Richiesta parere');
  assert.deepEqual(found.map(({value,confidence})=>[value,confidence]), [['Serravia Olivetta','medium']]);
  assert.deepEqual(namesIn('Borgo Nuovo (SA) - Serravia Olivetta - Richiesta parere',TRANSPARENCY_TYPES,false),[]);
});

test('no new name candidates for offices, places, companies or administrative headings',()=>{
  for(const text of [
    'Borgo Nuovo SA - VALUTAZIONI AMBIENTALI - Richiesta',
    'Borgo Nuovo SA - COMUNE DI ALFA - Trasmissione atti',
    'Borgo Nuovo SA - AUTORIZZAZIONE PAESAGGISTICA - Progetto',
    'Borgo Nuovo SA - F.lli Rossi S.r.l. - Richiesta',
    'Borgo Nuovo SA - Monte Mario - Rinnovo',
  ]){
    assert.equal(namesIn(text).some(f=>f.ruleId==='MUNICIPAL_SUBJECT'),false,text);
  }
  assert.deepEqual(namesIn('Borgo Nuovo SA - Riva Mariangela - Rinnovo',{...TRANSPARENCY_TYPES,name:false}),[]);
});

test('explicit applicant context can appear later in an unrelated subject',()=>{
  const found=namesIn('Domanda di rinnovo a nome di Costa Raffaele, relativa ai lavori');
  assert.deepEqual(found.map(f=>f.value),['Costa Raffaele']);
});

test('one garbled introducer still selects the name, and keeps adjacent text intact',()=>{
  for(const cue of ['a nome id','a nome d i']){
    const text='Pratica di condono '+cue+' Costa Raffaele, relativa ai lavori';
    const found=namesIn(text);
    assert.deepEqual(found.map(({value,confidence})=>[value,confidence]), [['Costa Raffaele','high']]);
    assert.equal(text.slice(found[0].end),', relativa ai lavori');
  }
  for(const text of [
    'Pratica a nome ID personale 12345',
    'Trasmissione a nome ID Comune di Alfa',
    'Pratica a nome ID Sartivia Uvelta, relativa ai lavori',
    'Richiesta a nome ID Alfa Raffaele S.r.l. - Rinnovo',
  ]) assert.equal(namesIn(text).some(f=>f.ruleId==='CONTEXT_NAME_REVERSED_PREPOSITION'),false);
  assert.deepEqual(namesIn('Documento a nome id Costa Raffaele, allegato',{...TRANSPARENCY_TYPES,name:false}),[]);
});

test('tabular lists keep each applicant in a separate selection',()=>{
  for(const [text, expected] of [
    ['FERRI Tonio - Dichiarazione di rettifica', ['FERRI Tonio']],
    ['Ditta FERRI Marco, RIVA Roberto e VITALI Annunziata.', ['FERRI Marco','RIVA Roberto','VITALI Annunziata']],
    ["Marina Nuova SA - RIVA PAOLO E COSTA BRUNA (ex Sig. D'Arco Luca) - Richiesta", ['RIVA PAOLO','COSTA BRUNA',"Sig. D'Arco Luca"]],
    ['Borgo Nuovo SA - Ferri Gianpaolo, Laura e Ornella - Ricevuta', ['Ferri Gianpaolo','Laura','Ornella']],
    ['Borgo Nuovo SA - FERRI paolo lr SOCIETA ALFA - Nota', ['FERRI paolo']],
  ]){
    const matches=namesIn(text).sort((a,b)=>a.start-b.start);
    assert.deepEqual(matches.map(f=>text.slice(f.start,f.end)),expected);
    assert.ok(matches.every(f=>f.confidence==='high'));
  }
  const withoutTitle=namesIn("RIVA PAOLO (ex Sig. D'Arco Luca) - Richiesta",{...TRANSPARENCY_TYPES,title:false});
  assert.deepEqual(withoutTitle.map(f=>f.value).sort(),["D'Arco Luca",'RIVA PAOLO']);
});

test('tabular professional and procedural labels locate names inside prose',()=>{
  for(const [text, expected] of [
    ['Consultazione archivi Archeologo Carlo DE FERRI', 'Carlo DE FERRI'],
    ['Atto di compravendita a rogito Notaio Luca Riva, rep. N. 12345', 'Luca Riva'],
    ["Nell'interesse di: DI FERRO Pietro+2 - Documento", 'DI FERRO Pietro'],
    ['ALFA Spa C.a. Leg. Rappr. Ferri Andrea a@alfa.it', 'Ferri Andrea'],
    ['Atto stipulato con la Signora Riva', 'Riva'],
  ]){
    assert.deepEqual(namesIn(text).map(f=>text.slice(f.start,f.end)),[expected],text);
  }
});

test('toponyms and organizations after a role are kept out of the list of people',()=>{
  assert.deepEqual(namesIn('Toponomastica - Intitolazione Piazza Prof Guido Ferro - Frazione Alfa'),[]);
  assert.deepEqual(namesIn('Comune di Alfa - Piazza Guido Ferro e Nicola'),[]);
  assert.deepEqual(namesIn('Marina di Baia Azzurra - Avviso'),[]);
  assert.deepEqual(namesIn('FOTOGRAFIA FINALE IMMACOLATA'),[]);
  const text='Don Marco Costa rappresentante legale Parrocchia SS Eustachio e Nicola';
  assert.deepEqual(namesIn(text).map(f=>f.value),['Don Marco Costa']);
  assert.deepEqual(namesIn('Prima indicazione: Piazza Prof Guido Ferro',TRANSPARENCY_TYPES,false),[]);
});

test('a context rule preserves a professional title when titles are disabled',()=>{
  const text='Medico Dr Bianchi';
  const selected=namesIn(text,{...TRANSPARENCY_TYPES,title:false},false);
  assert.deepEqual(selected.map(f=>text.slice(f.start,f.end)),['Bianchi']);
  assert.deepEqual(namesIn(text,TRANSPARENCY_TYPES,false).map(f=>f.value),['Dr Bianchi']);
});
