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
