/* Songbook CG · núcleo: acordes, transposición, formato de canción, formas de acorde */
var SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
var FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
var NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/* Grafía preferida según la tonalidad de llegada (por clase de nota, true = bemoles) */
var FLAT_MAJ = [false, true, false, true, false, true, false, false, true, false, true, false];
var FLAT_MIN = [true, false, true, true, false, true, false, true, false, false, true, false];
var QUAL_OK = /^(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø|b\d+|#\d+|\d+)*$/;

function mod12(n) { return ((n % 12) + 12) % 12; }
function accVal(a) { return a === '#' ? 1 : a === 'b' ? -1 : 0; }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

function parseChord(s) {
  s = String(s).trim();
  var m = /^([A-G])([#b]?)([^\/*?]*?)(?:\/([A-G][#b]?|\d+))?(\*)?(\?)?$/.exec(s);
  if (!m) return null;
  var qual = m[3].replace(/^d(?!im)/, 'dim');
  if (!QUAL_OK.test(qual)) return null;
  return { root: m[1], acc: m[2], qual: qual, bass: m[4] || '', star: !!m[5], doubt: !!m[6] };
}
function chordPc(c) { return mod12(NAT[c.root] + accVal(c.acc)); }
function isMinorQual(q) { return /^(m(?!aj)|min)/.test(q); }
function chordToString(c) {
  return c.root + c.acc + c.qual + (c.bass ? '/' + c.bass : '') + (c.star ? '*' : '') + (c.doubt ? '?' : '');
}
function fmtNote(root, acc, semis, flats) {
  var p = mod12(NAT[root] + accVal(acc) + semis);
  return (flats ? FLAT : SHARP)[p];
}
function transposeChord(c, semis, flats) {
  if (!semis) return chordToString(c);
  var out = fmtNote(c.root, c.acc, semis, flats) + c.qual;
  if (c.bass) {
    if (/^[A-G]/.test(c.bass)) out += '/' + fmtNote(c.bass.charAt(0), c.bass.charAt(1) || '', semis, flats);
    else out += '/' + c.bass;
  }
  return out + (c.star ? '*' : '') + (c.doubt ? '?' : '');
}

/* Tonalidad */
function parseKey(s) {
  if (!s) return null;
  var c = parseChord(String(s).trim());
  if (!c || c.bass || c.star) return null;
  return { pc: chordPc(c), minor: isMinorQual(c.qual) };
}
function flatsFor(key, shift) {
  if (!key) return false;
  var pc = mod12(key.pc + shift);
  return (key.minor ? FLAT_MIN : FLAT_MAJ)[pc];
}
function keyName(key, shift) {
  if (!key) return '';
  var pc = mod12(key.pc + shift);
  var fl = (key.minor ? FLAT_MIN : FLAT_MAJ)[pc];
  return (fl ? FLAT : SHARP)[pc] + (key.minor ? 'm' : '');
}

/* Líneas de acordes: acordes, figuras cuerda-traste (no se transponen), separadores */
function tokenizeLine(str) {
  var out = [];
  var re = /(\([^)]*\)|[^\s\-·()]+|[\s\-·]+|[()])/g;
  var m;
  while ((m = re.exec(str))) {
    var t = m[0];
    if (t.charAt(0) === '(' && t.length >= 2 && t.charAt(t.length - 1) === ')') {
      var inner = t.slice(1, -1);
      if (/^[\dIVXivx?\s\-]*$/.test(inner)) out.push({ type: 'fig', text: t, incomplete: inner.indexOf('?') >= 0 });
      else out.push({ type: 'group', tokens: tokenizeLine(inner) });
    } else if (/^[\s\-·]+$/.test(t) || t === '(' || t === ')') {
      out.push({ type: 'sep', text: t });
    } else {
      var c = parseChord(t);
      out.push(c ? { type: 'chord', chord: c, text: t } : { type: 'doubt', text: t });
    }
  }
  return out;
}

/* Un acorde de letra puede traer varios acordes seguidos: [C-F-C] o con una sucesión entre paréntesis: [C (C4-C-G7-C)]. Devuelve sus fichas, o null si es un acorde común. */
function segTokens(str) {
  if (str == null || !/[()\-\s·]/.test(str) || parseChord(str)) return null;
  var toks = tokenizeLine(str), has = false;
  walkTokens(toks, function (t) { if (t.type === 'chord') has = true; });
  return has ? toks : null;
}
function parseLyricLine(line) {
  var parts = line.split(/\[([^\]]*)\]/);
  var segs = [];
  if (parts[0]) segs.push({ chord: null, text: parts[0] });
  for (var i = 1; i < parts.length; i += 2) segs.push({ chord: parts[i], text: parts[i + 1] || '' });
  if (!segs.length) segs.push({ chord: null, text: '' });
  return segs;
}

function parseBody(text) {
  var lines = String(text || '').replace(/\r/g, '').split('\n');
  var blocks = [];
  var i = 0;
  while (i < lines.length) {
    var l = lines[i].replace(/\s+$/, '');
    var t = l.trim();
    var m;
    if (/^\{(sot|start_of_tab)\}$/i.test(t)) {
      var tab = [];
      i++;
      while (i < lines.length && !/^\{(eot|end_of_tab)\}$/i.test(lines[i].trim())) { tab.push(lines[i].replace(/\s+$/, '')); i++; }
      i++;
      blocks.push({ type: 'tab', lines: tab });
      continue;
    }
    if ((m = /^\{(intro|outro|interludio)\s*:\s*(.*)\}$/i.exec(t))) blocks.push({ type: 'chords', label: cap(m[1]), tokens: tokenizeLine(m[2]) });
    else if ((m = /^\{(?:c|comment|nota)\s*:\s*(.*)\}$/i.exec(t))) blocks.push({ type: 'note', text: m[1] });
    else if ((m = /^\{alt\s*:\s*(.*)\}$/i.exec(t))) blocks.push({ type: 'alt', text: m[1] });
    else if (t.charAt(0) === '#') { /* comentario del archivo */ }
    else if (t === '') blocks.push({ type: 'gap' });
    else if (t.charAt(0) === '>') blocks.push({ type: 'chords', label: '', tokens: tokenizeLine(t.slice(1).trim()) });
    else blocks.push({ type: 'lyric', segs: parseLyricLine(l) });
    i++;
  }
  var res = [];
  for (var k = 0; k < blocks.length; k++) {
    if (blocks[k].type === 'gap' && (!res.length || res[res.length - 1].type === 'gap')) continue;
    res.push(blocks[k]);
  }
  while (res.length && res[res.length - 1].type === 'gap') res.pop();
  return res;
}

function walkTokens(tokens, fn) {
  tokens.forEach(function (t) {
    if (t.type === 'group') walkTokens(t.tokens, fn);
    else fn(t);
  });
}
/* Acordes en orden de aparición, sin repetir (clave = escritura original) */
function collectChords(blocks) {
  var seen = {};
  var list = [];
  function add(c) {
    var k = chordToString(Object.assign({}, c, { doubt: false }));
    if (!seen[k]) { seen[k] = 1; list.push({ orig: k, chord: Object.assign({}, c, { doubt: false }) }); }
  }
  blocks.forEach(function (b) {
    if (b.type === 'lyric') b.segs.forEach(function (s) {
      if (s.chord == null) return;
      var st = segTokens(s.chord);
      if (st) walkTokens(st, function (t) { if (t.type === 'chord') add(t.chord); });
      else { var c = parseChord(s.chord); if (c) add(c); }
    });
    else if (b.type === 'chords') walkTokens(b.tokens, function (t) { if (t.type === 'chord') add(t.chord); });
  });
  return list;
}
function countDoubts(blocks) {
  var n = 0;
  blocks.forEach(function (b) {
    if (b.type === 'lyric') b.segs.forEach(function (s) {
      if (s.chord == null) return;
      var st = segTokens(s.chord);
      if (st) walkTokens(st, function (t) { if (t.type === 'doubt' || (t.type === 'chord' && t.chord.doubt) || (t.type === 'fig' && t.incomplete)) n++; });
      else { var c = parseChord(s.chord); if (!c || c.doubt) n++; }
    });
    else if (b.type === 'chords') walkTokens(b.tokens, function (t) {
      if (t.type === 'doubt' || (t.type === 'chord' && t.chord.doubt) || (t.type === 'fig' && t.incomplete)) n++;
    });
  });
  return n;
}
function hasUntransposable(blocks) {
  var f = false;
  blocks.forEach(function (b) {
    if (b.type === 'tab') f = true;
    else if (b.type === 'lyric') b.segs.forEach(function (s) { var st = s.chord != null && segTokens(s.chord); if (st) walkTokens(st, function (t) { if (t.type === 'fig') f = true; }); });
    else if (b.type === 'chords') walkTokens(b.tokens, function (t) { if (t.type === 'fig') f = true; });
  });
  return f;
}
function inferKey(blocks) {
  var l = collectChords(blocks);
  if (!l.length) return null;
  var c = l[0].chord;
  return { pc: chordPc(c), minor: isMinorQual(c.qual) };
}

/* Formas de acorde: cuerdas de la 6 (grave) a la 1. -1 = muda, 0 = al aire, n = traste */
var OPEN = {
  C: ['x32010'], D: ['xx0232'], E: ['022100'], G: ['320003'], A: ['x02220'],
  F: ['133211', [1, 0, 5]], Am: ['x02210'], Dm: ['xx0231'], Em: ['022000'], Bm: ['x24432', [2, 1, 5]],
  A7: ['x02020'], B7: ['x21202'], C7: ['x32310'], D7: ['xx0212'], E7: ['020100'], G7: ['320001'],
  Cmaj7: ['x32000'], Fmaj7: ['xx3210'], Gmaj7: ['320002'], Amaj7: ['x02120'], Dmaj7: ['xx0222'], Emaj7: ['021100'],
  Am7: ['x02010'], Dm7: ['xx0211'], Em7: ['022030'], Bm7: ['x20202'],
  Dsus4: ['xx0233'], Dsus2: ['xx0230'], Asus4: ['x02230'], Asus2: ['x02200'], Esus4: ['022200'],
  Csus4: ['x33011'], Gsus4: ['330013']
};
var MOV_E = { '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], maj7: [0, 2, 1, 1, 0, 0], sus4: [0, 2, 2, 2, 0, 0] };
var MOV_A = { '': [-1, 0, 2, 2, 2, 0], m: [-1, 0, 2, 2, 1, 0], '7': [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0], maj7: [-1, 0, 2, 1, 2, 0], sus4: [-1, 0, 2, 2, 3, 0] };

function fromCode(code, barre) {
  var frets = code.split('').map(function (ch) { return ch === 'x' ? -1 : parseInt(ch, 10); });
  return { frets: frets, base: 1, barre: barre ? { fret: barre[0], from: barre[1], to: barre[2] } : null };
}
function qualKey(q) {
  if (q === '4') return 'sus4';
  if (q === '2') return 'sus2';
  if (q === 'M7') return 'maj7';
  if (q === 'min') return 'm';
  if (q === 'min7') return 'm7';
  if (q === 'ø' || q === 'ø7' || q === 'm7b5') return 'm7b5';
  return q;
}
/* Más formas abiertas, formas con bajo distinto y la forma de cejilla con raíz en la cuerda 4 */
OPEN.A7sus4 = ['x02030']; OPEN.D7sus4 = ['xx0213']; OPEN.E7sus4 = ['020200'];
var EXTRA = { Em7: ['020000'] };
var SLASH = {
  'D/F#': ['2x0232'], 'G/B': ['x20003'], 'C/G': ['332010'], 'C/E': ['032010'], 'Am/G': ['302210'], 'Am/E': ['002210'],
  'F/A': ['x03211'], 'Dm/F': ['1x0231'], 'E/G#': ['4x2100'], 'G/F#': ['2x0003'], 'D/A': ['x00232'],
  'A/C#': ['x42220'], 'A/E': ['002220'], 'Em/G': ['320000']
};
/* Formas del impreso con nombre propio (cuerdas 6 a 1). Van primero; C4 del cancionero no es C sus4: lleva el mi grave y el mi agudo al aire. */
var RAW = { 'C4': ['033010'], 'G7/9': ['300201'] };
var MOV_D = { '': [-1, -1, 0, 2, 3, 2], m: [-1, -1, 0, 2, 3, 1], '7': [-1, -1, 0, 2, 1, 2], m7: [-1, -1, 0, 2, 1, 1], maj7: [-1, -1, 0, 2, 2, 2], sus4: [-1, -1, 0, 2, 3, 3] };

/* Todas las posiciones conocidas de un acorde, de la más baja a la más alta del mango */
function shapesFor(c) {
  if (!c || c.star) return [];
  var q = qualKey(c.qual);
  var pc = chordPc(c);
  var out = [], seen = {};
  function add(d) { var k = d.frets.join(','); if (seen[k]) return; seen[k] = 1; out.push(d); }
  var raw = RAW[c.root + c.acc + c.qual + (c.bass ? '/' + c.bass : '')];
  if (raw) raw.forEach(function (x) { add(fromCode(x)); });
  if (c.bass) {
    var sl = SLASH[c.root + c.acc + q + '/' + c.bass];
    if (sl) sl.forEach(function (x) { add(fromCode(x)); });
    return out;
  }
  var done = {};
  [c.root + c.acc + q, SHARP[pc] + q, FLAT[pc] + q].forEach(function (n) {
    if (done[n]) return;
    done[n] = 1;
    if (OPEN[n]) add(fromCode(OPEN[n][0], OPEN[n][1]));
    if (EXTRA[n]) EXTRA[n].forEach(function (x) { add(fromCode(x)); });
  });
  var mov = [];
  function push(tab, f0, kind) {
    (f0 === 0 ? [12] : [f0, f0 + 12]).forEach(function (f) {
      var frets = tab.map(function (v) { return v < 0 ? -1 : v + f; });
      if (Math.max.apply(null, frets) > 15) return;
      mov.push({ frets: frets, base: f > 1 ? f : 1, barre: kind === 'D' ? null : { fret: f, from: kind === 'E' ? 0 : 1, to: 5 } });
    });
  }
  if (q === 'dim7' || q === '°7' || q === 'm7b5') {
    /* Una posición por familia (raíz en cuerda 6, 5 o 4), la más cercana a trastes 2, 6 y 9.
       null = cuerda muda; el resto es traste relativo a la raíz. */
    var fam = q === 'm7b5'
      ? [[9, 2, [null, 0, 1, 0, 1, null]], [4, 6, [0, null, 0, 0, -1, null]], [2, 9, [null, null, 0, 1, 1, 1]]]
      : [[9, 2, [null, 0, 1, -1, 1, null]], [4, 6, [0, null, -1, 0, -1, null]], [2, 9, [null, null, 0, 1, 0, 1]]];
    var step = q === 'm7b5' ? 12 : 3;
    fam.forEach(function (f) {
      var best = null;
      for (var r = mod12(pc - f[0]) % step; r <= 26; r += step) {
        if (f[2].some(function (o) { return o !== null && r + o < 0; })) continue;
        var fr = f[2].map(function (o) { return o === null ? -1 : r + o; });
        if (Math.max.apply(null, fr) > 15) continue;
        var pl = fr.filter(function (x) { return x > 0; });
        var mn = Math.min.apply(null, pl);
        if (!best || Math.abs(mn - f[1]) < Math.abs(best.mn - f[1])) best = { frets: fr, mn: mn };
      }
      if (best) mov.push({ frets: best.frets, base: best.mn > 1 ? best.mn : 1, barre: null });
    });
  } else {
    if (MOV_E[q]) push(MOV_E[q], mod12(pc - 4), 'E');
    if (MOV_A[q]) push(MOV_A[q], mod12(pc - 9), 'A');
    if (MOV_D[q]) push(MOV_D[q], mod12(pc - 2), 'D');
  }
  mov.sort(function (a, b) { return a.base - b.base; }).forEach(add);
  return out;
}
function shapeFor(c) { var l = shapesFor(c); return l.length ? l[0] : null; }
/* Mueve un diagrama de cejilla n trastes; devuelve null si tiene cuerdas al aire */
function shiftDiagram(d, n) {
  if (!d.barre) return null;
  for (var i = 0; i < d.frets.length; i++) if (d.frets[i] === 0) return null;
  var f = d.frets.map(function (v) { return v > 0 ? v + n : v; });
  var bf = d.barre.fret + n;
  var lo = bf;
  while (lo < 1) { lo += 12; bf += 12; f = f.map(function (v) { return v > 0 ? v + 12 : v; }); }
  while (lo > 12) { lo -= 12; bf -= 12; f = f.map(function (v) { return v > 0 ? v - 12 : v; }); }
  return { frets: f, base: bf > 1 ? bf : 1, barre: { fret: bf, from: d.barre.from, to: d.barre.to } };
}
/* Diagrama a mostrar para un acorde: personalizado de la canción o forma de la biblioteca */
function diagramFor(custom, orig, chord, shift, shapeShift, flats) {
  var cd = custom && custom[orig];
  if (cd) {
    if (!shapeShift) return { d: cd, custom: true };
    var s = shiftDiagram(cd, shapeShift);
    if (s) return { d: s, custom: true };
  }
  if (!shapeShift) return cd ? { d: cd, custom: true } : { d: shapeFor(chord), custom: false };
  var moved = Object.assign({}, chord);
  return { d: shapeFor(parseChord(transposeChord(moved, shapeShift, flats))), custom: false };
}

/* Exportar a ChordPro */
function toChordPro(song) {
  var out = [];
  out.push('{title: ' + song.title + '}');
  if (song.artist) out.push('{artist: ' + song.artist + '}');
  if (song.album) out.push('{album: ' + song.album + '}');
  if (song.year) out.push('{year: ' + song.year + '}');
  if (song.key) out.push('{key: ' + song.key + '}');
  if (song.tuning) out.push('{comment: ' + song.tuning + '}');
  if (song.source) out.push('{comment: Fuente: ' + song.source + '}');
  out.push('');
  parseBody(song.body).forEach(function (b) {
    if (b.type === 'gap') out.push('');
    else if (b.type === 'note') out.push('{comment: ' + b.text + '}');
    else if (b.type === 'alt') out.push('# alternativa: ' + b.text);
    else if (b.type === 'tab') { out.push('{start_of_tab}'); b.lines.forEach(function (x) { out.push(x); }); out.push('{end_of_tab}'); }
    else if (b.type === 'chords') {
      var s = '';
      (function w(tokens) {
        tokens.forEach(function (t) {
          if (t.type === 'chord') s += '[' + t.text + ']';
          else if (t.type === 'doubt') s += '[' + t.text + ']';
          else if (t.type === 'fig') s += t.text;
          else if (t.type === 'group') { s += '('; w(t.tokens); s += ')'; }
          else s += t.text.indexOf('-') >= 0 ? ' ' : t.text;
        });
      })(b.tokens);
      out.push((b.label ? '{comment: ' + b.label + '}\n' : '') + s.replace(/\]\[/g, '] [').trim());
    } else out.push(b.segs.map(function (g) { return (g.chord != null ? '[' + g.chord + ']' : '') + g.text; }).join(''));
  });
  return out.join('\n');
}

/* Cifrado en solfeo (DO RE MI FA SOL LA SI) a letras inglesas. Solo toca acordes: dentro de [..] y en líneas de acordes (> e intro). */
var SOLFEGE = { DO: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };
function solToLetter(text) {
  return text.replace(/(^|[^A-Za-z#])(DO|RE|MI|FA|SOL|LA|SI)(#|b)?([a-z]*)/g, function (all, pre, note, acc, q) {
    if (q.indexOf('dim') !== 0 && q.charAt(0) === 'd') q = 'dim' + q.slice(1);
    return pre + SOLFEGE[note] + (acc || '') + q;
  });
}
function convertSolfege(body) {
  var inTab = false;
  return String(body || '').split('\n').map(function (line) {
    var t = line.trim();
    if (/^\{(sot|start_of_tab)\}$/i.test(t)) { inTab = true; return line; }
    if (/^\{(eot|end_of_tab)\}$/i.test(t)) { inTab = false; return line; }
    if (inTab) return line;
    if (/^\{(intro|outro|interludio)\s*:/i.test(t)) return line.replace(/^(\s*\{[^:]*:)(.*)(\}\s*)$/, function (a, h, c, e) { return h + solToLetter(c) + e; });
    if (/^\{/.test(t) || t.charAt(0) === '#') return line;
    if (t.charAt(0) === '>') return line.replace(/^(\s*>)(.*)$/, function (a, h, c) { return h + solToLetter(c); });
    return line.replace(/\[([^\]]*)\]/g, function (a, c) { return '[' + solToLetter(c) + ']'; });
  }).join('\n');
}

/* Dudas del texto con su posición (índices de carácter dentro del cuerpo) para saltar a ellas en el editor */
function listDoubts(body) {
  var out = [], lines = String(body || '').split('\n'), off = 0, inTab = false;
  function scanChords(str, base, line) {
    var re = /\([^)]*\)|[^\s\-·()]+/g, m;
    while ((m = re.exec(str))) {
      var tk = m[0], at = base + m.index;
      if (tk.charAt(0) === '(' && tk.charAt(tk.length - 1) === ')') {
        var inner = tk.slice(1, -1);
        if (/^[\dIVXivx?\s\-]*$/.test(inner)) { if (inner.indexOf('?') >= 0) out.push({ text: tk, kind: 'figura', line: line, start: at, end: at + tk.length }); }
        else scanChords(inner, at + 1, line);
      } else {
        var c = parseChord(tk);
        if (!c) out.push({ text: tk, kind: 'ilegible', line: line, start: at, end: at + tk.length });
        else if (c.doubt) out.push({ text: tk, kind: 'incierto', line: line, start: at, end: at + tk.length });
      }
    }
  }
  lines.forEach(function (raw, i) {
    var t = raw.trim(), lead = raw.length - raw.replace(/^\s+/, '').length;
    if (/^\{(sot|start_of_tab)\}$/i.test(t)) inTab = true;
    else if (/^\{(eot|end_of_tab)\}$/i.test(t)) inTab = false;
    else if (!inTab) {
      var m;
      if ((m = /^(\{(?:intro|outro|interludio)\s*:\s*)(.*?)(\}\s*)$/i.exec(raw.slice(lead)))) scanChords(m[2], off + lead + m[1].length, i);
      else if (t.charAt(0) === '{' || t.charAt(0) === '#') { /* nota, alternativa o comentario */ }
      else if (t.charAt(0) === '>') scanChords(raw.slice(lead + 1), off + lead + 1, i);
      else {
        var re2 = /\[([^\]]*)\]/g, mm;
        while ((mm = re2.exec(raw))) {
          var c2 = parseChord(mm[1]);
          if (!c2) out.push({ text: mm[1], kind: 'ilegible', line: i, start: off + mm.index + 1, end: off + mm.index + 1 + mm[1].length });
          else if (c2.doubt) out.push({ text: mm[1], kind: 'incierto', line: i, start: off + mm.index + 1, end: off + mm.index + 1 + mm[1].length });
        }
      }
    }
    off += raw.length + 1;
  });
  return out;
}

export {
  parseChord, chordToString, chordPc, transposeChord, parseKey, flatsFor, keyName,
  tokenizeLine, segTokens, parseBody, collectChords, countDoubts, hasUntransposable, inferKey,
  shapesFor, shapeFor, shiftDiagram, diagramFor, toChordPro, convertSolfege, listDoubts
};
