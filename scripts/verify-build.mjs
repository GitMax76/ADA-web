import assert from 'node:assert/strict';
import fs from 'node:fs';
const html = fs.readFileSync('dist/index.html', 'utf8');
const manifest = JSON.parse(fs.readFileSync('dist/manifest.webmanifest', 'utf8'));
const sw = fs.readFileSync('dist/sw.js', 'utf8');
for (const key of ['id', 'start_url', 'scope']) assert.equal(manifest[key], '/ADA-web/');
for (const icon of manifest.icons) {
  assert(fs.existsSync('dist/' + icon.src));
  const data = fs.readFileSync('dist/' + icon.src);
  assert.equal(icon.sizes, data.readUInt32BE(16) + 'x' + data.readUInt32BE(20));
}
for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  assert(url.startsWith('/ADA-web/'), 'Incorrect asset path: ' + url);
  assert(fs.existsSync('dist/' + url.slice('/ADA-web/'.length)), 'Missing asset: ' + url);
}
assert(sw.includes('pdf.worker.min-') && sw.includes('.mjs'), 'PDF worker missing from precache');
assert(sw.includes('0.2.0-beta'), 'Missing cache version');
assert(!sw.includes('skipWaiting('), 'Must not interrupt active sessions');
assert(!fs.readdirSync('dist', { recursive: true }).some(f => /\.(pdf|docx?|odt|zip)$/i.test(f)));
console.log('Build verified: subpath, manifest, icon dimensions, PDF worker cache, safe updates, no documents.');
