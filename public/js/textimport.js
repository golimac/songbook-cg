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
  /* Cada línea: su texto con columnas y, por cada fragmento, dónde empieza en el texto y en la página */
  lines.forEach(function (l) {
    var str = '';
    l.segs = [];
    l.items.sort(function (a, b) { return a.x - b.x; }).forEach(function (it) {
      var col = Math.round((it.x - minX) / cw);
      if (col > str.length) str += new Array(col - str.length + 1).join(' ');
      else if (str.length && /\S$/.test(str) && /^\S/.test(it.str)) str += ' ';
      var t = it.str.replace(/^\s+/, function (m) { return col > str.length ? '' : m; });
      l.segs.push({ start: str.length, x0: it.x, w: it.w, len: it.str.length, lead: it.str.length - t.length });
      str += t;
    });
    l.text = str.replace(/\s+$/, '');
  });
  /* Con letra proporcional las columnas no coinciden con las de la letra: cada acorde se ubica sobre la letra que tiene debajo */
  lines.forEach(function (l, idx) {
    var nx = lines[idx + 1];
    if (!nx || !isChordLine(l.text) || isChordLine(nx.text) || l.y - nx.y > lh * 1.7) return;
    var placed = [];
    l.items.forEach(function (it) {
      var re = /\S+/g, m;
      while ((m = re.exec(it.str))) {
        var x = it.x + (m.index / it.str.length) * it.w, col = 0, best = null;
        nx.segs.forEach(function (sg) { if (x >= sg.x0 - 0.01 && x <= sg.x0 + sg.w + 0.01) best = sg; });
        if (!best) nx.segs.forEach(function (sg) { if (x >= sg.x0) best = sg; });
        if (best) col = best.start + Math.max(0, Math.round((x - best.x0) / (best.w || 1) * best.len) - best.lead);
        placed.push({ col: Math.min(col, nx.text.length), tk: m[0] });
      }
    });
    placed.sort(function (a, b) { return a.col - b.col; });
    var out = '';
    placed.forEach(function (pc) {
      var c = Math.max(pc.col, out.length ? out.length + 1 : 0);
      out += new Array(c - out.length + 1).join(' ') + pc.tk;
    });
    l.text = out;
  });
  var out = [];
  lines.forEach(function (l, idx) {
    if (idx > 0) {
      var blanks = Math.round((lines[idx - 1].y - l.y) / lh) - 1;
      for (var b = 0; b < Math.min(blanks, 2); b++) out.push('');
    }
    out.push(l.text);
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
  return pages.reduce(function (acc, pg, i) {
    if (!i) return pg;
    var lastLine = acc.split('\n').filter(function (x) { return /\S/.test(x); }).pop() || '';
    return acc + (isChordLine(lastLine) ? '\n' : '\n\n') + pg;
  }, '');
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
/* Tablatura en texto (e|---0---): cada grupo de líneas se envuelve en {sot} … {eot} para que se vea tal cual */
var TABLINE = /^\s*[eEBGDAa]\s*[|:]?\s*[-|][-\d|hpbrxs\/\\^~()<>.\s]*$/;
function isTabLine(l) { return TABLINE.test(l) && (l.match(/-/g) || []).length >= 4; }
export function wrapTabs(text) {
  var lines = String(text || '').split('\n'), out = [], i = 0;
  while (i < lines.length) {
    if (isTabLine(lines[i])) {
      var j = i;
      while (j < lines.length && isTabLine(lines[j])) j++;
      if (j - i >= 3) { out.push('{sot}'); for (var k = i; k < j; k++) out.push(lines[k].replace(/\s+$/, '')); out.push('{eot}'); i = j; continue; }
    }
    out.push(lines[i]); i++;
  }
  return out.join('\n');
}
/* Acordes sobre la letra → [Am], sin tocar las tablaturas */
export function convertBody(text) {
  var lines = wrapTabs(text).split('\n'), out = [], seg = [], n = 0, inTab = false;
  function flush() { if (seg.length) { var r = chordsAbove(seg.join('\n')); out.push(r.text); n += r.count; seg = []; } }
  lines.forEach(function (l) {
    if (/^\{sot\}$/.test(l.trim())) { flush(); inTab = true; out.push(l); }
    else if (/^\{eot\}$/.test(l.trim())) { inTab = false; out.push(l); }
    else if (inTab) out.push(l);
    else seg.push(l);
  });
  flush();
  return { text: out.join('\n'), count: n };
}
export function toSong(part, fileName) {
  var r = convertBody(part.text);
  return { title: part.title || baseName(fileName) || 'Sin título', body: r.text, chordLines: r.count, source: fileName || '' };
}
