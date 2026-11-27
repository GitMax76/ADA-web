import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';

test('guided flow, Pages subpath, diagnostics, raster re-open, responsive review and offline shell', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/ADA-web/');
  for (const section of await page.locator('[data-policy-section] summary').all()) await section.click();
  await page.locator('#policyConfirm').check();
  await page.locator('#policyAcceptBtn').click();
  await expect(page.locator('.wizard-step.active')).toContainText('Carica');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let n = 0; n < 2; n++) {
    const p = pdf.addPage([595, 842]);
    for (let i = 0; i < 12; i++) p.drawText('test'+n+'-'+i+'@example.com', { x: 50, y: 780 - i * 40, font, size: 14 });
  }
  await page.locator('#ocrToggle').uncheck();
  await page.locator('#fileInput').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await expect(page.locator('.wizard-step.active')).toContainText('Configura');
  await page.locator('#profileSelect').selectOption('standard');
  await page.locator('#analyzeBtn').click();
  await expect(page.locator('#progressLabel')).toContainText('Completato', { timeout: 30000 });
  await expect(page.locator('.wizard-step.active')).toContainText('Verifica');
  await expect(page.locator('#findingsCount')).toContainText('24');

  await page.locator('#bugReportBtn').click();
  await expect(page.locator('#bugModal')).toBeVisible();
  const diag = await page.locator('#bugDiagnosticsPreview').textContent();
  expect(diag).not.toContain('synthetic.pdf');
  await page.locator('#bugCloseBtn').click();

  for (const width of [1440, 754, 390]) {
    await page.setViewportSize({ width, height: 900 });
    if (await page.locator('#mobileFindingsTab').isVisible()) await page.locator('#mobileFindingsTab').click();
    await expect(page.locator('#findings')).toBeVisible();
    const css = await page.locator('#findings').evaluate(el => ({ maxHeight: getComputedStyle(el).maxHeight, overflowY: getComputedStyle(el).overflowY }));
    expect(css).toEqual({ maxHeight: 'none', overflowY: 'visible' });
    if (width < 1100) await expect(page.locator('#mobileFindingsTab')).toBeVisible();
  }
  await page.locator('#filterSearch').fill('test0-1@');
  await expect(page.locator('.finding')).toHaveCount(1);
  await page.locator('#clearAllFindings').click();
  await expect(page.locator('#findingsCount')).toContainText('23 selezionati');
  await expect(page.locator('#findingSelectionScope')).toBeVisible();
  await page.locator('#selectAllFindings').click();
  await expect(page.locator('#findingsCount')).toContainText('24 selezionati');
  await page.locator('#resetFiltersBtn').click();
  await expect(page.locator('.finding')).toHaveCount(24);
  await page.locator('#clearAllFindings').click();
  await expect(page.locator('#exportBtn')).toBeDisabled();
  await page.locator('#selectAllFindings').click();
  await expect(page.locator('[data-fid]:checked')).toHaveCount(24);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('synthetic_ANONIMIZZATO.pdf');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const anonymizedBuffer = Buffer.concat(chunks);
  const output = await PDFDocument.load(anonymizedBuffer);
  expect(output.getPageCount()).toBe(2);
  await expect(page.locator('.wizard-step.active')).toContainText('Scarica');

  // Re-open the rasterized A.D.A. output. With OCR disabled it must complete, classify it and never hang.
  await page.locator('#fileInput').setInputFiles({ name: 'already-anonymized.pdf', mimeType: 'application/pdf', buffer: anonymizedBuffer });
  await page.locator('#ocrToggle').uncheck();
  await page.locator('#analyzeBtn').click();
  await expect(page.locator('#progressLabel')).toContainText('Completato', { timeout: 30000 });
  await expect(page.locator('#analysisHint')).toContainText('raster/scansionato');

  await page.locator('#bugReportBtn').click();
  const safeDiag = await page.locator('#bugDiagnosticsPreview').textContent();
  expect(safeDiag).not.toContain('already-anonymized.pdf');
  expect(safeDiag).not.toContain('synthetic.pdf');
  expect(safeDiag).toContain('raster/scansionato');
  await page.locator('#bugCloseBtn').click();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#chooseBtn')).toBeVisible();
  await page.locator('#ocrToggle').uncheck();
  await page.locator('#fileInput').setInputFiles({ name: 'offline-synthetic.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await page.locator('#analyzeBtn').click();
  await expect(page.locator('#progressLabel')).toContainText('Completato', { timeout: 30000 });
  expect(errors).toEqual([]);
});


test('medical-style identity fields are detected without treating clinical labels as names', async ({ page }) => {
  await page.goto('/ADA-web/');
  for (const section of await page.locator('[data-policy-section] summary').all()) await section.click();
  await page.locator('#policyConfirm').check();
  await page.locator('#policyAcceptBtn').click();

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const p = pdf.addPage([595, 842]);
  const rows = [
    ['Cod Donatore: 220335', 790, font],
    ['Nato il 14/02/1976', 765, font],
    ['RSSMRA76B14H703X', 740, font],
    ['ROSSI MARIO', 715, bold],
    ['Via: GELSO n 12/A', 690, font],
    ['84100 - SALERNO (SA)', 665, bold],
    ['Immunoematologia Trasfusionale', 610, font],
    ['Cod Donatore', 585, font],
    ['Esame Esito', 560, font],
    ['Gruppo Sanguigno', 535, font],
    ['Coombs Indiretto', 510, font],
    ['Proteine Totali', 485, font],
  ];
  for (const [txt,y,usedFont] of rows) p.drawText(txt,{x:55,y,font:usedFont,size:13});

  await page.locator('#ocrToggle').uncheck();
  await page.locator('#fileInput').setInputFiles({
    name:'synthetic-medical.pdf',
    mimeType:'application/pdf',
    buffer:Buffer.from(await pdf.save())
  });
  await page.locator('#profileSelect').selectOption('standard');
  await page.locator('#analyzeBtn').click();
  await expect(page.locator('#progressLabel')).toContainText('Completato',{timeout:30000});

  const values = await page.locator('[data-edit]').evaluateAll(nodes => nodes.map(n => n.value));
  expect(values).toContain('220335');
  expect(values).toContain('14/02/1976');
  expect(values).toContain('RSSMRA76B14H703X');
  expect(values).toContain('ROSSI MARIO');
  expect(values).toContain('Via: GELSO n 12/A');
  expect(values).toContain('84100 - SALERNO (SA)');

  for (const falsePositive of [
    'Immunoematologia Trasfusionale',
    'Cod Donatore',
    'Esame Esito',
    'Gruppo Sanguigno',
    'Coombs Indiretto',
    'Proteine Totali',
  ]) expect(values).not.toContain(falsePositive);

  await expect(page.locator('.preview .redaction-box').first()).toBeVisible();
  await page.locator('#redactionMode').selectOption('white');
  await expect(page.locator('.preview .redaction-box.mode-white').first()).toBeVisible();
});


test('medical footer signatories and redaction selector remain robust and readable', async ({ page }) => {
  await page.goto('/ADA-web/');
  for (const section of await page.locator('[data-policy-section] summary').all()) await section.click();
  await page.locator('#policyConfirm').check();
  await page.locator('#policyAcceptBtn').click();

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const p = pdf.addPage([595, 842]);

  const lines = [
    ['A.O.U. SERVIZIO IMMUNOEMATOLOGIA TRASFUSIONALE', 790, bold],
    ['Direttore Dott. Francesco Annarumma', 760, font],
    ['Cod Donatore: 220335', 720, font],
    ['Nato il 14/02/1976', 695, font],
    ['RSSMRA76B14H703X', 670, font],
    ['ROSSI MARIO', 645, bold],
    ['Via: GELSO n 12/A', 620, font],
    ['84100 - SALERNO (SA)', 595, bold],
    ['Gruppo Sanguigno', 530, font],
    ['Fattore Rh', 505, font],
    ['Test di Coombs Indiretto', 480, font],
    ['Proteine Totali', 455, font],
    ['Il Dirigente', 132, font],
    ['Dr L.Rinaldi', 112, bold],
    ['Responsabile Dott.ssa Anna Verdi', 92, font],
    ['Medico Dr Bianchi', 72, bold],
    ['Referente Prof. A. De Luca', 52, font],
  ];
  for (const [txt,y,usedFont] of lines) p.drawText(txt,{x:48,y,font:usedFont,size:12});

  await page.locator('#ocrToggle').uncheck();
  await page.locator('#fileInput').setInputFiles({
    name:'footer-medical.pdf',
    mimeType:'application/pdf',
    buffer:Buffer.from(await pdf.save())
  });
  await page.locator('#profileSelect').selectOption('standard');
  await page.locator('#analyzeBtn').click();
  await expect(page.locator('#progressLabel')).toContainText('Completato',{timeout:30000});

  const values = await page.locator('[data-edit]').evaluateAll(nodes => nodes.map(n => n.value));
  expect(values.some(v => /Francesco\s+Annarumma/i.test(v))).toBeTruthy();
  expect(values.some(v => /L\.?\s*Rinaldi/i.test(v))).toBeTruthy();
  expect(values.some(v => /Anna\s+Verdi/i.test(v))).toBeTruthy();
  expect(values.some(v => /^Bianchi$/i.test(v))).toBeTruthy();
  expect(values.some(v => /A\.?\s*De\s+Luca/i.test(v))).toBeTruthy();

  for (const falsePositive of [
    'Gruppo Sanguigno',
    'Fattore Rh',
    'Test di Coombs Indiretto',
    'Proteine Totali',
    'Il Dirigente',
  ]) expect(values).not.toContain(falsePositive);

  await expect(page.locator('.preview .redaction-box').first()).toBeVisible();

  const selector = page.locator('#redactionMode');
  await expect(selector).toBeVisible();
  const metrics = await selector.evaluate(el => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    value: el.value,
    text: el.selectedOptions[0]?.textContent?.trim()
  }));
  expect(metrics.value).toBe('black');
  expect(metrics.text).toBe('Nero compatto');
  expect(metrics.clientWidth).toBeGreaterThanOrEqual(220);

  await page.setViewportSize({width:390,height:850});
  const mobileBox = await selector.boundingBox();
  expect(mobileBox.width).toBeGreaterThan(250);
  expect(mobileBox.width).toBeLessThanOrEqual(390);
});


test('13-page native-text table stays fast, keeps row ids visible and exports', async ({ page }) => {
  await page.goto('/ADA-web/');
  if (await page.locator('#policyModal').isVisible().catch(()=>false)) {
    for (const section of await page.locator('[data-policy-section] summary').all()) await section.click();
    await page.locator('#policyConfirm').check();
    await page.locator('#policyAcceptBtn').click();
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let pno=1; pno<=13; pno++) {
    const p=pdf.addPage([842,595]);
    const rows=[
      ['27832','Richiesta autorizzazione - PROT. 25919'],
      ['27826','Amalfi SA - pratica catastale Fg 5 plla 1820'],
      ['27825','Opera pubblica - CUP D67J25000090005 - CIG BD83A6DC73'],
    ];
    let y=540;
    for(const [id,desc] of rows){
      p.drawText(id,{x:30,y,font,size:10});
      p.drawText(desc,{x:110,y,font,size:10});
      y-=32;
    }
  }
  const started=Date.now();
  await page.locator('#fileInput').setInputFiles({
    name:'table-13-pages.pdf',
    mimeType:'application/pdf',
    buffer:Buffer.from(await pdf.save())
  });
  // OCR remains enabled: native text pages must skip it automatically.
  await expect(page.locator('#ocrToggle')).toBeChecked();
  await page.locator('#analyzeBtn').click();
  await expect(page.locator('#progressLabel')).toContainText('Completato',{timeout:20000});
  expect(Date.now()-started).toBeLessThan(20000);

  const values=await page.locator('[data-edit]').evaluateAll(nodes=>nodes.map(n=>n.value));
  expect(values).toContain('25919');
  expect(values).toContain('5');
  expect(values).toContain('1820');
  expect(values).toContain('BD83A6DC73');
  expect(values).not.toContain('D67J25000090005');
  expect(values).not.toContain('27832');
  expect(values).not.toContain('27826');
  expect(values).not.toContain('27825');

  await expect(page.locator('#exportBtn')).toBeEnabled();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('table-13-pages_ANONIMIZZATO.pdf');
});

// A full app/export regression. This checks pixels of the re-opened PDF, not only finding labels.
test('transparency: public columns, CUP/CIG and dates survive the actual exported PDF', async ({page})=>{
  await page.goto('/ADA-web/');
  for(const section of await page.locator('[data-policy-section] summary').all()) await section.click();
  await page.locator('#policyConfirm').check();await page.locator('#policyAcceptBtn').click();
  const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
  for(let n=0;n<6;n++){
    const p=pdf.addPage([842,595]);
    const draw=(text,x,y)=>p.drawText(text,{x,y,font,size:10});
    draw('Doc',20,550);draw('Oggetto',100,550);draw('Cod. Fascicoli',685,550);
    draw('28085',20,510);draw('Comune di Alfa - Mario Rossi - Fg 8 plla 205',100,510);draw('34.43.08/205/2019',685,510);
    draw('28086',20,470);draw('CUP A12B25000080005 CIG A00ACE9185 - Art. 8 legge 42/2004',100,470);draw('34.43.08/8/2019',685,470);
    draw('28087',20,430);draw('Dott.ssa Anna Verdi - Prot. 205 - 08/01/2026 - euro 205,00',100,430);draw('34.43.08/205/2026',685,430);
    draw('Su richiesta del cliente DE',100,390);draw('LUCA ANNA Eneltel 123456789',100,378);draw('28088',20,378);draw('34.43.08/205/2026',685,378);
    draw('28089',20,340);draw('Comune di Alfa - ROSSI MARIO Autocarrozzeria Aurora - PdC',100,340);draw('34.43.08/205/2026',685,340);
    draw('28090',20,300);draw('Allacciamento impianto fotovoltaico OLEIFICIO DEL SOLE DI BIANCHI ANNA Eneltel 123456789',100,300);draw('34.43.08/205/2026',685,300);
  }
  const bytes=Buffer.from(await pdf.save());
  await page.locator('#fileInput').setInputFiles({name:'synthetic-transparency.pdf',mimeType:'application/pdf',buffer:bytes});
  await page.locator('#profileSelect').selectOption('transparency');
  await expect(page.locator('[data-type="cadastral"]')).toBeChecked();
  for(const key of ['protocol','address','date','amount','cup','cig'])await expect(page.locator(`[data-type="${key}"]`)).not.toBeChecked();
  await page.locator('#analyzeBtn').click();await expect(page.locator('#progressLabel')).toContainText('Completato',{timeout:30000});
  const values=await page.locator('[data-edit]').evaluateAll(nodes=>nodes.map(n=>n.value));
  for(const value of ['8','205','Mario Rossi','Dott.ssa Anna Verdi','DE LUCA ANNA','Autocarrozzeria Aurora','OLEIFICIO DEL SOLE DI BIANCHI ANNA'])expect(values).toContain(value);
  for(const value of ['A12B25000080005','A00ACE9185','28085','28086','28087','08/01/2026','34.43.08/205/2019'])expect(values).not.toContain(value);
  // Public text regions are expressed in PDF points, so they remain comparable at different canvas sizes.
  const regions=[[12,76,80,310],[680,76,830,310],[98,113,660,134]];
  const capture=async()=>page.locator('.preview canvas').first().evaluate((canvas,regions)=>{
    const ctx=canvas.getContext('2d');const {width,height}=canvas;
    return regions.map(([x0,y0,x1,y1])=>{
      const x=Math.floor(x0/842*width),y=Math.floor(y0/595*height),w=Math.ceil((x1-x0)/842*width),h=Math.ceil((y1-y0)/595*height);
      const pixels=ctx.getImageData(x,y,w,h).data;let dark=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i]<100&&pixels[i+1]<100&&pixels[i+2]<100)dark++;
      return dark/(w*h);
    });
  },regions);
  const before=await capture();
  const geometry=await page.locator('.preview .auto-box').evaluateAll(nodes=>nodes.map(n=>[parseFloat(n.style.left),parseFloat(n.style.top),parseFloat(n.style.width)]));
  expect(geometry.length).toBeGreaterThan(0);
  for(const [x,y,w] of geometry){expect(x).toBeGreaterThanOrEqual(99/842*100-0.1);expect(x+w).toBeLessThanOrEqual(685/842*100+0.1);expect(y).not.toBeGreaterThan(100);}
  // Check that toggles invalidate stale analysis and remove the entire category on re-analysis.
  await page.locator('[data-type="cadastral"]').uncheck();await expect(page.locator('#exportBtn')).toBeDisabled();
  await page.locator('#analyzeBtn').click();await expect(page.locator('#progressLabel')).toContainText('Completato',{timeout:30000});
  expect(await page.locator('[data-edit]').evaluateAll(nodes=>nodes.map(n=>n.value))).not.toContain('8');
  await page.locator('#profileSelect').selectOption('transparency');await page.locator('#analyzeBtn').click();await expect(page.locator('#progressLabel')).toContainText('Completato',{timeout:30000});
  const promise=page.waitForEvent('download');await page.locator('#exportBtn').click();const download=await promise;
  const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);const exported=Buffer.concat(chunks);
  expect((await PDFDocument.load(exported)).getPageCount()).toBe(6);
  await page.locator('#fileInput').setInputFiles({name:'reopen-synthetic.pdf',mimeType:'application/pdf',buffer:exported});
  await page.locator('#ocrToggle').uncheck();await page.locator('#analyzeBtn').click();await expect(page.locator('#progressLabel')).toContainText('Completato',{timeout:30000});
  const after=await capture();
  for(let i=0;i<before.length;i++){expect(before[i]).toBeGreaterThan(0);expect(Math.abs(after[i]-before[i])).toBeLessThan(0.018);}
});
