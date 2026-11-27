// Prefer PDF text positioning when a complete text run matches the extracted item.
// Fall back to the font's per-glyph widths when PDF.js has joined or split runs.
export function pdfGlyphWidths(operators, ops) {
  const fonts = new Map();
  const savedFonts = [];
  let font;
  for (const [index, operator] of operators.fnArray.entries()) {
    if (operator === ops.save) savedFonts.push(font);
    if (operator === ops.restore) font = savedFonts.pop();
    if (operator === ops.setFont) {
      const [fontName] = operators.argsArray[index];
      if (!fonts.has(fontName)) fonts.set(fontName, { widths: new Map(), runs: new Map() });
      font = fonts.get(fontName);
    }
    if (!font || (operator !== ops.showText && operator !== ops.showSpacedText)) continue;
    const glyphs = operators.argsArray[index][0];
    for (const glyph of glyphs) {
      if (glyph?.unicode?.length !== 1 || !Number.isFinite(glyph.width) || glyph.width <= 0) continue;
      const char = glyph.unicode;
      if (!font.widths.has(char)) font.widths.set(char, glyph.width);
      else if (font.widths.get(char) !== glyph.width) font.widths.set(char, null);
    }
    const run = textRun(glyphs);
    if (run) {
      const previous = font.runs.get(run.text);
      if (previous === undefined) font.runs.set(run.text, run.positions);
      else if (previous && previous.some((advance, i) => Math.abs(advance - run.positions[i]) > 1e-6)) {
        font.runs.set(run.text, null);
      }
    }
  }
  return fonts;
}

function textRun(glyphs) {
  let text = '', position = 0;
  const starts = [];
  for (const glyph of glyphs) {
    if (typeof glyph === 'number') {
      if (!Number.isFinite(glyph)) return null;
      position -= glyph;
      continue;
    }
    if (glyph?.unicode?.length !== 1 || !Number.isFinite(glyph.width) || glyph.width <= 0) return null;
    const char = /\s/u.test(glyph.unicode) ? ' ' : glyph.unicode;
    if (char !== ' ' || !text.endsWith(' ')) {
      starts.push(position);
      text += char;
    }
    // Keep the advance of every space even when PDF.js collapses consecutive ones.
    position += glyph.width;
  }
  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    position = starts.pop();
  }
  const first = starts[0], total = position - first;
  if (text.length < 2 || total <= 0 || [...starts, position].some((start, i, offsets) => i > 0 && start <= offsets[i - 1])) return null;
  const positions = [...starts, position].map(start => (start - first) / total);
  return { text, positions };
}

export function measurePdfGlyphs(fonts, item, width, left, {onlyExact = false} = {}) {
  const font = fonts?.get(item.fontName);
  if (!font || !item.str.length) return null;
  const run = font.runs.get(item.str);
  if (run) return run.map(position => left + width * position);
  if (onlyExact) return null;
  const advances = [0];
  for (const char of item.str.split('')) {
    const advance = font.widths.get(char);
    if (!advance) return null;
    advances.push(advances.at(-1) + advance);
  }
  const total = advances.at(-1);
  return advances.map(position => left + width * position / total);
}
