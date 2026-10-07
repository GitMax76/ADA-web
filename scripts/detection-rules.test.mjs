import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectionHarness} from './detection-harness.mjs';

test('lowercase professional title does not hide a proper name',()=>{
  const findings=detectionHarness().detect({text:'dott. Mario Rossi, Consigliere Comunale',blocks:[]});
  assert.ok(findings.some(f=>f.key==='name' && f.value==='Mario Rossi'));
});
test('three-part name is complete and telephone label is not part of the name',()=>{
  const h=detectionHarness();
  assert.ok(h.detect({text:'Arch. Anna Maria Rossi, responsabile',blocks:[]}).some(f=>f.value==='Anna Maria Rossi'));
  const f=h.detect({text:'dott. Mario Rossi Tel. 3331234567',blocks:[]});
  assert.ok(f.some(f=>f.value==='Mario Rossi'));
  assert.ok(!f.some(f=>f.key==='name' && f.value.includes('Tel')));
});
test('birth date after birthplace and applicant field are recognized',()=>{
  const findings=detectionHarness().detect({text:'RICHIEDENTE: Anna Bianchi nata a Torino il 18/12/1944',blocks:[]});
  assert.ok(findings.some(f=>f.key==='birthdate' && f.value==='18/12/1944'));
  assert.ok(findings.some(f=>f.key==='name' && f.value==='Anna Bianchi'));
});
test('street word cannot match inside stradario or generically name protection prose',()=>{
  const h=detectionHarness();
  assert.equal(h.addresses('estratto stradario con indicazione precisa').length,0);
  assert.equal(h.addresses('localita protetta da simili').length,0);
  assert.ok(h.addresses('Via Roma n. 123').some(f=>f.value==='Via Roma n. 123'));
});
