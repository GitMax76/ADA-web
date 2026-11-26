import test from 'node:test';
import assert from 'node:assert/strict';
import { detectIndicazioni2026 } from '../src/rules/indicazioni-2026.js';

test('CUP remains visible and is not reported', () => {
  const findings=detectIndicazioni2026({
    pageNumber:1,
    text:'Realizzazione opera pubblica - CUP D67J25000090005 - CIG BD83A6DC73',
    lines:['Realizzazione opera pubblica - CUP D67J25000090005 - CIG BD83A6DC73']
  });
  assert.equal(findings.some(f=>f.key==='cup'),false);
  assert.equal(findings.some(f=>f.key==='cig' && f.value==='BD83A6DC73'),true);
});

test('table row number is not captured as protocol from another line', () => {
  const findings=detectIndicazioni2026({
    pageNumber:1,
    text:'Richiesta autorizzazione - PROT. 25919 27832 Sala Consilina - Affare legale',
    lines:[
      'Richiesta autorizzazione - PROT. 25919',
      '27832 Sala Consilina - Affare legale'
    ]
  });
  const protocols=findings.filter(f=>f.key==='protocol').map(f=>f.value);
  assert.deepEqual(protocols,['25919']);
  assert.equal(findings.some(f=>f.value==='27832'),false);
});

test('cadastral labels redact only associated values', () => {
  const findings=detectIndicazioni2026({
    pageNumber:1,
    text:'CT Fg 5 plla 1820 - altra pratica - Fg 1 plle 291 e 293',
    lines:['CT Fg 5 plla 1820','altra pratica - Fg 1 plle 291 e 293']
  });
  assert.equal(findings.some(f=>f.ruleId==='IND2026_FG' && f.value==='5'),true);
  assert.equal(findings.some(f=>f.ruleId==='IND2026_PLLA' && f.value==='1820'),true);
  assert.equal(findings.some(f=>f.ruleId==='IND2026_FG' && f.value==='1'),true);
  assert.equal(findings.some(f=>f.ruleId==='IND2026_PLLA' && /291/.test(f.value)),true);
  assert.equal(findings.some(f=>/FG|PLLA/i.test(f.value)),false);
});

test('snc used as senza numero civico is not treated as a company', () => {
  const findings=detectIndicazioni2026({
    pageNumber:1,
    text:'Via Roma snc - Salerno',
    lines:['Via Roma snc - Salerno']
  });
  assert.equal(findings.some(f=>f.key==='legalentity'),false);
});
