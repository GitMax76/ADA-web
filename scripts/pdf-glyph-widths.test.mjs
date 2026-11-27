import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfGlyphWidths, measurePdfGlyphs } from '../src/pdf-glyph-widths.js';

const ops={setFont:1,showText:2,save:3,restore:4};

test('PDF widths anchor a span in a longer text run even with a fallback font',()=>{
  const operators={fnArray:[1,2],argsArray:[['font'],[[
    {unicode:'I',width:200}, {unicode:' ',width:250}, {unicode:'M',width:800},
  ]]]};
  const widths=pdfGlyphWidths(operators,ops);
  assert.deepEqual(measurePdfGlyphs(widths,{fontName:'font',str:'I M'},125,10),[10,30,55,135]);
});

test('ambiguous and unsupported glyphs fall back to Canvas measurements',()=>{
  const operators={fnArray:[1,2,2],argsArray:[['font'],[[{unicode:'I',width:200}]],[[{unicode:'I',width:300}]]]};
  const widths=pdfGlyphWidths(operators,ops);
  assert.equal(measurePdfGlyphs(widths,{fontName:'font',str:'I'},10,0),null);
  assert.equal(measurePdfGlyphs(widths,{fontName:'font',str:'ñ'},10,0),null);
});

test('a PDF run retains collapsed space widths and kerning',()=>{
  const operators={fnArray:[1,2],argsArray:[['font'],[[
    {unicode:'A',width:600}, -40, {unicode:' ',width:250}, {unicode:' ',width:250}, {unicode:'B',width:600}, {unicode:' ',width:250},
  ]]]};
  const advances=measurePdfGlyphs(pdfGlyphWidths(operators,ops),{fontName:'font',str:'A B'},174,10);
  assert.deepEqual(advances.map(Math.round),[10,74,124,184]);
});
