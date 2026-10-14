// Importar archivos de texto: .txt, .pdf (con texto) y .docx. El texto se lee en el navegador, sin modelo,
// y pasa por el conversor de "acordes sobre la letra" antes de llegar a la pantalla de revisión.
import { chordsAbove } from './core.js';

var PDFJS = '../vendor/pdfjs/pdf.min.mjs';
var PDFJS_WORKER = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

export function extOf(name) {
  var m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}
export function baseName(name) { return String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim(); }

/* ---------- .txt ---------- */
export function decodeText(buf) {
  var u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('windows-1252').decode(u8); }
}
export function expandTabs(line, size) {
  size = size || 8;
  var out = '';
  for (var i = 0; i < line.length; i++) {
    if (line.charAt(i) === '\t') out += new Array(size - (out.length % size) + 1).join(' ');
    else out += line.charAt(i);
  }
  return out;
}
export function cleanText(t) {
  return String(t || '').replace(/\r\n?/g, '\n').replace(/\f/g, '\n\n').split('\n').map(function (l) { return expandTabs(l.replace(/ /g, ' ')).replace(/\s+$/, ''); }).join('\n');
}

/* ---------- .docx (un zip con word/document.xml) ---------- */
function u16(v, o) { return v[o] | (v[o + 1] << 8); }
function u32(v, o) { return (v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24)) >>> 0; }
export async function readZipEntry(buf, name) {
  var v = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  var e = -1;
  for (var i = v.length - 22; i >= Math.max(0, v.length - 65557); i--) if (u32(v, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('El archivo no parece un .docx válido.');
  var n = u16(v, e + 10), p = u32(v, e + 16);
  for (var k = 0; k < n; k++) {
    if (u32(v, p) !== 0x02014b50) break;
    var method = u16(v, p + 10), csize = u32(v, p + 20), nl = u16(v, p + 28), xl = u16(v, p + 30), cl = u16(v, p + 32), off = u32(v, p + 42);
    var nm = new TextDecoder().decode(v.subarray(p + 46, p + 46 + nl));
    if (nm === name) {
      var lnl = u16(v, off + 26), lxl = u16(v, off + 28), start = off + 30 + lnl + lxl;
      var data = v.subarray(start, start + csize);
      if (method === 0) return data;
      if (method !== 8) throw new Error('El .docx usa una compresión que no se puede leer.');
      var ds = new DecompressionStream('deflate-raw');
      var w = ds.writable.getWriter(); w.write(data); w.close();
      return new Uint8Array(await new Response(ds.readable).arrayBuffer());
    }
    p += 46 + nl + xl + cl;
  }
  return null;
}
function xmlText(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }).replace(/&amp;/g, '&');
}
export function docxToText(xml) {
  var body = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g, function (para) {
    var out = '', re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g, m;
    while ((m = re.exec(para))) out += m[0] === '<w:tab/>' ? '\t' : m[0] === '<w:br/>' || m[0] === '<w:cr/>' ? '\n' : xmlText(m[1]);
    return out + '\n';
  });
  return body.replace(/<[^>]+>/g, '');
}
async function docxToTextFile(buf) {
  var xml = await readZipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('El archivo no parece un .docx válido.');
  return docxToText(new TextDecoder().decode(xml));
}

/* ---------- .pdf (con texto) ---------- */
/* items: [{ str, x, y, w, h }] de una página, con y creciente hacia arriba. Devuelve las líneas con los acordes en su columna. */
export function pdfItemsToText(items) {
  items = items.filter(function (it) { return it.str && /\S/.test(it.str); });
  if (!items.length) return '';
  var widths = items.filter(function (it) { return it.str.length >= 3 && it.w > 0; }).map(function (it) { return it.w / it.str.length; }).sort(function (a, b) { return a - b; });
  var cw = widths.length ? widths[Math.floor(widths.length / 2)] : 5;
  if (!(cw > 0)) cw = 5;
  var hs = items.map(function (it) { return it.h || 0; }).filter(Boolean).sort(function (a, b) { return a - b; });
  var fh = hs.length ? hs[Math.floor(hs.length / 2)] : cw * 2;
  var sorted = items.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
  var lines = [];
  sorted.forEach(function (it) {
    var l = lines[lines.length - 1];
    if (l && Math.abs(l.y - it.y) <= fh * 0.45) l.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  });
  var minX = Math.min.apply(null, items.map(function (it) { return it.x; }));
  var gaps = [];
  for (var i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
  gaps.sort(function (a, b) { return a - b; });
  var lh = gaps.length ? gaps[Math.floor(gaps.length / 4)] : fh * 1.2;
  if (!(lh > 0)) lh = fh * 1.2;
  var out = [];
  lines.forEach(function (l, idx) {
    if (idx > 0) {
      var blanks = Math.round((lines[idx - 1].y - l.y) / lh) - 1;
      for (var b = 0; b < Math.min(blanks, 2); b++) out.push('');
    }
    var s = '';
    l.items.sort(function (a, b) { return a.x - b.x; }).forEach(function (it) {
      var col = Math.round((it.x - minX) / cw);
      if (col > s.length) s += new Array(col - s.length + 1).join(' ');
      else if (s.length && /\S$/.test(s) && /^\S/.test(it.str)) s += ' ';
      s += it.str.replace(/^\s+/, function (m) { return col > s.length ? '' : m; });
    });
    out.push(s.replace(/\s+$/, ''));
  });
  return out.join('\n');
}
async function pdfToText(buf) {
  var lib = await import(PDFJS);
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  var doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  var pages = [];
  for (var n = 1; n <= doc.numPages; n++) {
    var pg = await doc.getPage(n);
    var tc = await pg.getTextContent();
    pages.push(pdfItemsToText(tc.items.map(function (it) {
      return { str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height };
    })));
  }
  return pages.join('\n\n');
}

/* ---------- Un archivo → texto ---------- */
export async function extractText(file) {
  var ext = extOf(file.name);
  if (ext === 'doc') throw new Error('Los .doc antiguos no se pueden leer aquí. Ábrelo en Word y guárdalo como .docx o PDF.');
  var buf = await file.arrayBuffer();
  var t;
  if (ext === 'pdf') t = await pdfToText(buf);
  else if (ext === 'docx') t = await docxToTextFile(buf);
  else if (ext === 'txt' || ext === 'text' || ext === '' || (file.type || '').indexOf('text/') === 0) t = decodeText(buf);
  else throw new Error('Este tipo de archivo no se puede leer (' + (ext || 'sin extensión') + ').');
  t = cleanText(t);
  if (!/[A-Za-zÁÉÍÓÚáéíóúñÑ]{3}/.test(t)) throw new Error(ext === 'pdf' ? 'Este PDF no tiene texto (parece una imagen escaneada). Súbelo como fotos.' : 'El archivo no tiene texto.');
  return t;
}

/* ---------- Separar canciones y armar la ficha ---------- */
var SECTION = /^\s*[\[(]?\s*(coro|estribillo|intro|introducción|verso|estrofa|puente|solo|pre-?coro|final|outro|interludio|chorus|verse|bridge|repite|x\d)\b/i;
function isChordLine(line) { return /\S/.test(line) && chordsAbove(line).count > 0; }
function titleLike(line) {
  var t = line.trim();
  return t.length >= 2 && t.length <= 60 && !/^[\[{>#(]/.test(t) && !/[:;,]$/.test(t) && !SECTION.test(t) && !isChordLine(line) && /[A-Za-zÁÉÍÓÚáéíóúñÑ]{2}/.test(t);
}
export function splitSongs(text) {
  var lines = cleanText(text).split('\n'), parts = [], cur = [];
  function flush() { parts.push(cur); cur = []; }
  var blank = 0;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^\s*([-=_*#~]{4,})\s*$/.test(l)) { flush(); blank = 0; continue; }
    if (!/\S/.test(l)) { blank++; cur.push(l); continue; }
    var firstNonBlank = !cur.some(function (x) { return /\S/.test(x); });
    if (!firstNonBlank && blank >= 2 && titleLike(l) && (/\S/.test(lines[i + 1] || '') || /\S/.test(lines[i + 2] || ''))) { flush(); }
    blank = 0; cur.push(l);
  }
  flush();
  var songs = [];
  parts.forEach(function (p) {
    while (p.length && !/\S/.test(p[0])) p.shift();
    while (p.length && !/\S/.test(p[p.length - 1])) p.pop();
    if (!p.length || !/[A-Za-zÁÉÍÓÚáéíóúñÑ]{3}/.test(p.join(' '))) return;
    var title = '';
    if (titleLike(p[0]) && p.length > 1) { title = p[0].trim(); p = p.slice(1); while (p.length && !/\S/.test(p[0])) p.shift(); }
    songs.push({ title: title, text: p.join('\n') });
  });
  return songs;
}
export function toSong(part, fileName) {
  var r = chordsAbove(part.text);
  return { title: part.title || baseName(fileName) || 'Sin título', body: r.text, chordLines: r.count, source: fileName || '' };
}
