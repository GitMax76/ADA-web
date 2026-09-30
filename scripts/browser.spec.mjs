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
  await page.locator('#resetFiltersBtn').click();
  await expect(page.locator('.finding')).toHaveCount(24);

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
  expect(values).toContain('GELSO');
  expect(values).toContain('12/A');
  expect(values).toContain('84100');

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
