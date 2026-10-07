const streetPrefix = String.raw`\b(?:Via|Viale|Piazza|Piazzale|Corso|Largo|Vicolo|Strada|Localit\u00e0)(?=\s|:)\s*:?\s+`;
const city = String.raw`[A-Z\u00c0-\u00dd][\p{L}'\u2019.-]*(?:\s+(?:(?:di|del|della|de|in|sul|sulla)\s+)?[A-Z\u00c0-\u00dd][\p{L}'\u2019.-]*){0,5}`;
const postalTail = String.raw`\d{5}\s*[,\-\u2013]?\s*${city}(?:\s*\([A-Z]{2}\))?`;

export function completeAddresses(line) {
  const values = [];
  const prefix = new RegExp(streetPrefix, 'giu').exec(line);
  if (prefix) {
    const tail = line.slice(prefix.index + prefix[0].length);
    // A civic number provides a boundary before unrelated prose on the same line.
    const civic = /^([\p{L}\d'\u2019. -]{2,70}?)(?:\s*,\s*|\s+)(?:(?:n\.?|civ(?:ico)?\.?)\s*)?(\d{1,4}(?:[/\-][A-Za-z\d]{1,3})?[A-Za-z]?)(?!\d)/iu.exec(tail);
    if (civic && !/^(?:protetta|con\b|le\b|di\b)/iu.test(civic[1])) {
      let value = prefix[0] + civic[0];
      const remainder = tail.slice(civic[0].length);
      const postal = new RegExp(String.raw`^\s*[,;\-]?\s*${postalTail}`, 'u').exec(remainder);
      if (postal) value += postal[0];
      values.push(value.trim());
    } else {
      const name = new RegExp(String.raw`^${city}(?=\s*(?:[,;]|$))`, 'u').exec(tail);
      if (name) values.push((prefix[0] + name[0]).trim());
    }
  }
  for (const match of line.matchAll(new RegExp(String.raw`\b${postalTail}`, 'gu'))) {
    if (!values.some(value => value.includes(match[0]))) values.push(match[0]);
  }
  return values;
}

// This is a review suggestion, not handwriting recognition or identity inference.
export function signatureSuggestion(words, width, height, pixels) {
  const lines = new Map();
  for (const word of words) {
    if (!lines.has(word.lineId)) lines.set(word.lineId, []);
    lines.get(word.lineId).push(word);
  }
  const meaningful = [...lines.values()].filter(line => line.some(w => /\p{L}{2}/u.test(w.text)));
  const line = meaningful.at(-1);
  if (!line) return null;
  const text = line.map(w => w.text).join(' ');
  if (!/\b(?:dott\.?|avv\.?|ing\.?|arch\.?|firma|firmato)\b/i.test(text)) return null;
  const left = Math.min(...line.map(w => w.bbox.x0));
  const bottom = Math.max(...line.map(w => w.bbox.y1));
  const top = Math.min(...line.map(w => w.bbox.y0));
  if (left < width * .38 || bottom < height * .08 || bottom > height * .88) return null;
  const x0 = Math.max(0, Math.floor(left - width * .06));
  const x1 = Math.min(width, Math.ceil(Math.max(...line.map(w => w.bbox.x1)) + width * .04));
  const y0 = Math.ceil(bottom + 4);
  const y1 = Math.min(height, Math.ceil(bottom + Math.max((bottom - top) * 6, height * .075)));
  let minX = x1, minY = y1, maxX = x0, maxY = y0, count = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] > 200 && (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 < 160) {
        count++; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  if (count < 30 || maxX - minX < width * .08 || maxY - minY < 10) return null;
  // Faint flourishes can fall below the ink threshold: keep a generous side margin.
  const padX = Math.max(12, width * .03), padY = 12;
  const x = Math.max(0, minX - padX), y = Math.max(0, minY - padY);
  return { x: x / width, y: y / height, w: (Math.min(width, maxX + padX) - x) / width, h: (Math.min(height, maxY + padY) - y) / height };
}
