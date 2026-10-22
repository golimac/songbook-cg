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

/* Líneas de acordes: acordes, figuras cuerda-traste (no se transponen; con o sin paréntesis: (52) o 62-63-63), separadores */
function tokenizeLine(str) {
  var out = [];
  var re = /(\([^)]*\)|[1-6]\d{1,2}(?:-[1-6]\d{1,2})+|[^\s\-·()]+|[\s\-·]+|[()])/g;
  var m;
  while ((m = re.exec(str))) {
    var t = m[0];
    if (t.charAt(0) === '(' && t.length >= 2 && t.charAt(t.length - 1) === ')') {
      var inner = t.slice(1, -1);
      if (/^[\dIVXivx?\s\-]*$/.test(inner)) out.push({ type: 'fig', text: t, incomplete: inner.indexOf('?') >= 0 });
      else out.push({ type: 'group', tokens: tokenizeLine(inner) });
    } else if (/^[1-6]\d{1,2}(?:-[1-6]\d{1,2})+$/.test(t)) {
      out.push({ type: 'fig', text: t, incomplete: false });
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
  walkTokens(toks, function (t) { if (t.type === 'chord' || t.type === 'fig') has = true; });
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

/* Fill: notas como cuerda+traste (30 = cuerda 3 al aire, 110 = cuerda 1 traste 10), separadas por comas.
   Lo que va entre paréntesis suena a la vez. Un "?" al final de una nota la marca como duda. */
function parseFill(str) {
  var steps = [], doubts = 0, re = /\(([^)]*)\)|[^,\s()]+/g, m;
  function note(tk) {
    var x = /^([1-6])(\d{1,2})(\?)?$/.exec(tk);
    if (!x || parseInt(x[2], 10) > 24) return { bad: true, text: tk };
    return { s: parseInt(x[1], 10), f: parseInt(x[2], 10), doubt: !!x[3], text: tk };
  }
  while ((m = re.exec(str))) {
    var notes = (m[1] != null ? m[1].split(/[\s,\-]+/).filter(Boolean) : [m[0]]).map(note);
    notes.forEach(function (n) { if (n.bad || n.doubt) doubts++; });
    if (notes.length) steps.push({ notes: notes, group: m[1] != null });
  }
  return { steps: steps, doubts: doubts };
}
/* Mini tablatura de un fill (cuerda 1 arriba) */
function fillTab(steps, mark) {
  var names = ['e', 'B', 'G', 'D', 'A', 'E'];
  var rows = names.map(function (n) { return n + '|-'; });
  steps.forEach(function (st) {
    var w = 1;
    st.notes.forEach(function (n) { if (!n.bad) w = Math.max(w, String(n.f).length); });
    for (var s = 1; s <= 6; s++) {
      var hit = st.notes.filter(function (n) { return !n.bad && n.s === s; })[0];
      var txt = hit ? String(hit.f) : '', pad = '';
      while (txt.length + pad.length < w) pad += '-';
      rows[s - 1] += (hit && mark ? mark(hit, txt) : txt) + pad + '-';
    }
  });
  return rows.map(function (r) { return r + '|'; }).join('\n');
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
    if ((m = /^\{(intro|outro|interludio)\s*:\s*(.*)\}$/i.exec(t))) {
      /* Varias líneas seguidas del mismo tipo forman una sola: la etiqueta va en la primera. */
      var kind = m[1].toLowerCase(), prev = blocks[blocks.length - 1];
      var cont = !!(prev && prev.type === 'chords' && prev.kind === kind);
      blocks.push({ type: 'chords', label: cont ? '' : cap(m[1]), kind: kind, cont: cont, tokens: tokenizeLine(m[2]) });
    }
    else if ((m = /^\{fill(?:\s+([^:}]*?))?\s*:\s*(.*)\}$/i.exec(t))) { var pf = parseFill(m[2]); blocks.push({ type: 'fill', label: (m[1] || '').trim() || 'Fill', text: m[2], steps: pf.steps, doubts: pf.doubts }); }
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
    if (b.type === 'fill') { n += b.doubts; return; }
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
    if (b.type === 'tab' || b.type === 'fill') f = true;
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
  if (q === 'M7' || q === '7M') return 'maj7';
  if (q === 'mM7' || q === 'm7M') return 'mmaj7';
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
/* Catálogo por familias (escueladeguitarristas): formas en cuerdas 6 a 1, "x" = muda. Cuando un acorde está aquí, estas formas
   son las únicas del catálogo para él, en este orden. Se agrega una raíz a la vez. */
var CAT = {
  C: ['x 3 2 0 1 0', 'x 3 5 5 5 3', '8 7 5 5 5 x', '8 10 10 9 8 8', 'x x 10 12 13 12'],
  Cm: ['x 3 1 0 1 x', 'x 3 5 5 4 3', 'x x 5 8 8 8', '8 10 10 8 8 8', '11 x 10 12 13 x'],
  Caug: ['x 3 2 1 1 0', 'x x 6 5 5 4', '8 7 6 5 5 x', 'x x 10 9 9 8'],
  Cdim: ['x 3 4 5 4 x', '8 9 10 8 x x'],
  Csus4: ['x 3 3 0 1 x', 'x 3 5 5 6 3', 'x x 5 5 6 8', '8 10 10 10 8 8', 'x x 10 12 13 13'],
  Csus2: ['x 3 5 5 3 3', 'x x 10 12 13 10'],
  Cmaj7: ['x 3 5 4 5 x', '8 x 9 9 8 x', 'x x 10 12 12 12', 'x 3 2 0 0 0'],
  C7: ['x 3 5 3 5 3', '8 x 8 9 8 x', 'x x 10 12 11 12'],
  Cm7: ['x 3 5 3 4 3', '8 x 8 8 8 x', 'x x 10 12 11 11'],
  Cm7b5: ['x 3 4 3 4 x', '8 x 8 8 7 x', 'x x 10 11 11 11'],
  Cdim7: ['x 3 4 2 4 x', '8 x 7 8 7 x', 'x x 10 11 10 11'],
  C7sus4: ['x 3 5 3 6 3', '8 x 8 10 8 x', 'x x 10 12 11 13']
};
/* Acordes con posiciones conocidas de fábrica */
function catalogNames() { return Object.keys(CAT).concat(Object.keys(OPEN), Object.keys(EXTRA), Object.keys(SLASH), Object.keys(RAW)); }
function catQual(q) {
  q = qualKey(q);
  return { '+': 'aug', '°': 'dim', '°7': 'dim7', sus: 'sus4', '7sus': '7sus4', sus7: '7sus4', 'Δ': 'maj7' }[q] || q;
}
/* Diagrama a partir de seis trastes: la base y la cejilla se deducen */
function fromFrets(str) {
  var f = str.split(/\s+/).map(function (x) { return x === 'x' ? -1 : parseInt(x, 10); });
  var pos = f.filter(function (x) { return x > 0; });
  var mn = Math.min.apply(null, pos), mx = Math.max.apply(null, pos);
  var base = mx <= 5 ? 1 : mn, barre = null;
  var at = []; f.forEach(function (x, i) { if (x === mn) at.push(i); });
  if (at.length >= 2 && at[at.length - 1] - at[0] >= 2) {
    var ok = true;
    for (var i = at[0]; i <= at[at.length - 1]; i++) if (f[i] < mn) ok = false;
    if (ok) barre = { fret: mn, from: at[0], to: at[at.length - 1] };
  }
  return { frets: f, base: base, barre: barre };
}
/* Posiciones guardadas en la biblioteca de acordes: { 'Am7': [{frets, base, barre}] }. Cuando un acorde las tiene, reemplazan a las del catálogo. */
var USER = {};
function setUserShapes(m) { USER = m || {}; }
function chordKey(c) { return c.root + c.acc + c.qual + (c.bass ? '/' + c.bass : ''); }
function userKeys(c) {
  var ks = [chordKey(c)];
  if (!c.bass) { var pc = chordPc(c); [SHARP[pc], FLAT[pc]].forEach(function (n) { if (ks.indexOf(n + c.qual) < 0) ks.push(n + c.qual); }); }
  return ks;
}
var RAW = { 'C4': ['033010'], 'G7/9': ['300201'] };
var MOV_D = { '': [-1, -1, 0, 2, 3, 2], m: [-1, -1, 0, 2, 3, 1], '7': [-1, -1, 0, 2, 1, 2], m7: [-1, -1, 0, 2, 1, 1], maj7: [-1, -1, 0, 2, 2, 2], sus4: [-1, -1, 0, 2, 3, 3] };

/* Todas las posiciones conocidas de un acorde, de la más baja a la más alta del mango */
function shapesFor(c, noUser) {
  if (!c || c.star) return [];
  var q = qualKey(c.qual);
  var pc = chordPc(c);
  var out = [], seen = {};
  function add(d) { var k = d.frets.join(','); if (seen[k]) return; seen[k] = 1; out.push(d); }
  if (!noUser) {
    userKeys(c).forEach(function (k) {
      (USER[k] || []).forEach(function (d) { add({ frets: d.frets.slice(), base: d.base || 1, barre: d.barre ? { fret: d.barre.fret, from: d.barre.from, to: d.barre.to } : null }); });
    });
    /* Si el acorde tiene lista guardada en la biblioteca, esa lista es la única */
    if (out.length) return out;
  }
  var raw = RAW[c.root + c.acc + c.qual + (c.bass ? '/' + c.bass : '')];
  if (raw) raw.forEach(function (x) { add(fromCode(x)); });
  if (c.bass) {
    var sl = SLASH[c.root + c.acc + q + '/' + c.bass];
    if (sl) sl.forEach(function (x) { add(fromCode(x)); });
    return out;
  }
  var cq = catQual(c.qual), cat = null;
  [c.root + c.acc + cq, SHARP[pc] + cq, FLAT[pc] + cq].forEach(function (n) { if (!cat && CAT[n]) cat = CAT[n]; });
  if (cat) { cat.forEach(function (x) { add(fromFrets(x)); }); return out; }
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
    else if (b.type === 'fill') out.push('{comment: ' + b.label + ': ' + b.text + '}');
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

/* Acordes sobre la letra: una línea solo de acordes seguida de una línea de letra pasa a [Acorde] dentro de la letra.
   Acepta solfeo (LAm, MI/SOL#). "E - Bdim7" o "E · Bdim7" se agrupan en un solo corchete. */
function chordLineInfo(line) {
  if (!/\S/.test(line) || line.charAt(0) === '>' || line.charAt(0) === '{') return null;
  var re = /\S+/g, m, groups = [], last = null;
  while ((m = re.exec(line))) {
    var tk = m[0];
    if (tk === '-' || tk === '·') { if (!last) return null; last.sep = tk; continue; }
    if (tk.length > 1 && tk.indexOf('-') > 0 && tk.charAt(tk.length - 1) !== '-') {
      /* Em-Em/Eb pegados con guion: un solo grupo */
      var ps = tk.split('-').map(solToLetter);
      if (ps.every(function (x) { return parseChord(x); })) {
        if (last && last.sep) { last.text += ' ' + last.sep + ' ' + ps.join(' - '); last.sep = ''; }
        else { last = { col: m.index, text: ps.join(' - '), sep: '' }; groups.push(last); }
        continue;
      }
    }
    var c = solToLetter(cleanTok(tk));
    if (!parseChord(c)) return null;
    if (last && last.sep) { last.text += ' ' + last.sep + ' ' + c; last.sep = ''; }
    else { last = { col: m.index, text: c, sep: '' }; groups.push(last); }
  }
  if (!groups.length || (last && last.sep)) return null;
  return groups;
}
/* Limpia lo que se cuela al pegar o escribir: caracteres invisibles, letras de otros alfabetos que se ven iguales y variantes del grado */
var HOMO = { 'А': 'A', 'В': 'B', 'Е': 'E', 'С': 'C', 'а': 'a', 'е': 'e', 'с': 'c', 'о': 'o', 'ѕ': 's', 'υ': 'u', 'ս': 'u' };
function cleanTok(t) {
  return String(t).replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF\u00AD]/g, '').replace(/[º˚∘]/g, '°').normalize('NFKC')
    .replace(/[АВЕСаесоѕυս]/g, function (c) { return HOMO[c]; }).replace(/[♯]/g, '#').replace(/[♭]/g, 'b');
}
/* Si ninguna línea se reconoce como de acordes, busca una que casi lo sea y dice qué símbolo no entendió */
function chordHint(text) {
  var lines = String(text || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i], nx = lines[i + 1];
    if (!/\S/.test(l) || l.charAt(0) === '>' || l.charAt(0) === '{' || nx == null || !/\S/.test(nx)) continue;
    var toks = l.split(/\s+/).filter(function (t) { return t && t !== '-' && t !== '·'; });
    var good = toks.filter(function (t) { return parseChord(solToLetter(cleanTok(t))); });
    if (good.length >= 2 && good.length < toks.length && toks.length - good.length <= 2) {
      var bad = toks.filter(function (t) { return good.indexOf(t) < 0; })[0];
      var odd = bad.split('').filter(function (ch) { return ch.charCodeAt(0) > 126; }).map(function (ch) { return 'U+' + ('0000' + ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4); });
      return { line: i + 1, token: bad, odd: odd };
    }
  }
  return null;
}
function chordsAbove(text) {
  var lines = String(text || '').split('\n'), out = [], n = 0;
  for (var i = 0; i < lines.length; i++) {
    var g = chordLineInfo(lines[i]);
    if (!g) { out.push(lines[i]); continue; }
    var next = lines[i + 1];
    if (next == null || !/\S/.test(next) || chordLineInfo(next) || /^[>{]/.test(next)) {
      out.push('> ' + g.map(function (x) { return x.text; }).join(' ')); n++; continue;
    }
    var lyric = next;
    for (var k = g.length - 1; k >= 0; k--) {
      var col = g[k].col;
      if (col > lyric.length) lyric += new Array(col - lyric.length + 1).join(' ');
      lyric = lyric.slice(0, col) + '[' + g[k].text + ']' + lyric.slice(col);
    }
    out.push(lyric.replace(/\s+$/, '')); n++; i++;
  }
  return { text: out.join('\n'), count: n };
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
      else if ((m = /^(\{fill(?:\s+[^:}]*?)?\s*:\s*)(.*?)(\}\s*)$/i.exec(raw.slice(lead)))) {
        var fb = off + lead + m[1].length, pf2 = parseFill(m[2]), fre = /[1-6]\d{1,2}\??|[^,\s()\-]+/g, fm;
        void pf2;
        while ((fm = fre.exec(m[2]))) {
          var fx = /^([1-6])(\d{1,2})(\?)?$/.exec(fm[0]);
          var bad = !fx || parseInt(fx[2], 10) > 24;
          if (bad || fx[3]) out.push({ text: fm[0], kind: bad ? 'ilegible' : 'incierto', line: i, start: fb + fm.index, end: fb + fm.index + fm[0].length });
        }
      }
      else if (t.charAt(0) === '{' || t.charAt(0) === '#') { /* nota, alternativa o comentario */ }
      else if (t.charAt(0) === '>') scanChords(raw.slice(lead + 1), off + lead + 1, i);
      else {
        var re2 = /\[([^\]]*)\]/g, mm;
        while ((mm = re2.exec(raw))) {
          if (segTokens(mm[1])) { scanChords(mm[1], off + mm.index + 1, i); continue; }
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

/* ---------- Nombres posibles de un diagrama (afinación estándar, cuerdas 6 a 1) ---------- */
var OPEN_PC = [4, 9, 2, 7, 11, 4];
var NAME_Q = [
  ['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]], ['m7', [0, 3, 7, 10]],
  ['6', [0, 4, 7, 9]], ['m6', [0, 3, 7, 9]], ['sus4', [0, 5, 7]], ['sus2', [0, 2, 7]], ['4', [0, 4, 5, 7]],
  ['aug', [0, 4, 8]], ['dim', [0, 3, 6]], ['m7b5', [0, 3, 6, 10]], ['dim7', [0, 3, 6, 9]],
  ['7sus4', [0, 5, 7, 10]], ['add9', [0, 2, 4, 7]], ['madd9', [0, 2, 3, 7]], ['9', [0, 2, 4, 7, 10]],
  ['maj9', [0, 2, 4, 7, 11]], ['m9', [0, 2, 3, 7, 10]], ['mmaj7', [0, 3, 7, 11]], ['7#5', [0, 4, 8, 10]],
  ['7b5', [0, 4, 6, 10]], ['7b9', [0, 1, 4, 7, 10]], ['7#9', [0, 3, 4, 7, 10]], ['69', [0, 2, 4, 7, 9]], ['5', [0, 7]]
];
var LETTERS7 = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], NATPC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
var STEPS = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6 };
function rootSpell(pc, minor) {
  return ['C', 'C#', 'D', minor ? 'Eb' : 'Eb', 'E', 'F', 'F#', 'G', minor ? 'G#' : 'Ab', 'A', 'Bb', 'B'][pc];
}
/* Escribe la nota que está a "interval" semitonos de la raíz, con la letra que le toca por su grado */
function spellAbove(rootName, interval, steps) {
  var li = LETTERS7.indexOf(rootName.charAt(0));
  var rpc = mod12(NATPC[rootName.charAt(0)] + (rootName.charAt(1) === '#' ? 1 : rootName.charAt(1) === 'b' ? -1 : 0));
  var target = mod12(rpc + interval), letter = LETTERS7[(li + steps) % 7];
  var d = mod12(target - NATPC[letter] + 6) - 6;
  return d === 0 ? letter : d === 1 ? letter + '#' : d === -1 ? letter + 'b' : (SHARP[target]);
}
function nameShape(frets) {
  var pcs = [], bass = -1, seen = {};
  for (var s = 0; s < 6; s++) {
    var f = frets[s];
    if (f == null || f < 0) continue;
    var pc = (OPEN_PC[s] + f) % 12;
    if (bass < 0) bass = pc;
    if (!seen[pc]) { seen[pc] = 1; pcs.push(pc); }
  }
  if (pcs.length < 2) return [];
  var out = [], names = {};
  function put(name, rank, ord, omit) {
    if (names[name] != null || !parseChord(name)) return;
    names[name] = out.length; out.push({ name: name, rank: rank, ord: ord, omit: omit });
  }
  /* 0 = no cabe, 1 = cabe completo, 2 = cabe sin la quinta */
  function fits(set, F) {
    for (var k = 0; k < set.length; k++) if (F.indexOf(set[k]) < 0) return 0;
    var omitted = false;
    for (var j = 0; j < F.length; j++) if (set.indexOf(F[j]) < 0) { if (F[j] === 7 && F.length > 2 && set.length >= 3) omitted = true; else return 0; }
    return omitted ? 2 : 1;
  }
  function stepsFor(F, iv) { return iv === 6 && F.indexOf(7) < 0 ? 4 : STEPS[iv]; }
  function build(set, r, q, F, bassPc, foreign) {
    var minor = /^(m(?!aj)|dim)/.test(q), rn = rootSpell(r, minor), base = rn + q;
    var bi = mod12(bassPc - r);
    if (bi === 0) return q === '9' ? [[base, 0], [rn + '7/9', 0.5]] : [[base, 0]];
    var bn = spellAbove(rn, bi, foreign ? STEPS[bi] : stepsFor(F, bi));
    var res = [[base + '/' + bn, foreign ? 2 : 1]];
    if (foreign && bi === 11 && /^m(?!aj)/.test(q) && /[#b]/.test(bn)) { /* el bajo cromático Em - Em/D# - Em/D se escribe también con bemol: Em/Eb */
      var alt = bn.charAt(1) === '#' ? FLAT[bassPc] : SHARP[bassPc];
      if (alt !== bn) res.push([base + '/' + alt, 2.5]);
    }
    return res;
  }
  pcs.forEach(function (r, ri) {
    var set = pcs.map(function (p) { return mod12(p - r); });
    NAME_Q.forEach(function (nq, qi) {
      var f = fits(set, nq[1]);
      if (!f) return;
      if (nq[0] === '5' && pcs.length !== 2) return;
      if (pcs.length === 2 && nq[0] !== '5') return;
      build(set, r, nq[0], nq[1], bass, false).forEach(function (x) { put(x[0], x[1], qi * 12 + ri, f === 2); });
    });
  });
  /* el bajo es una nota ajena al resto: D/C#, C/B, Am/F# */
  var rest = pcs.filter(function (p) { return p !== bass; });
  if (rest.length >= 3 && rest.indexOf(bass) < 0) {
    rest.forEach(function (r, ri) {
      var set = rest.map(function (p) { return mod12(p - r); });
      NAME_Q.forEach(function (nq, qi) {
        var f = fits(set, nq[1]);
        if (!f || nq[0] === '5' || nq[1].length > 4) return;
        build(set, r, nq[0], nq[1], bass, true).forEach(function (x) { put(x[0], x[1], qi * 12 + ri, f === 2); });
      });
    });
  }
  /* un nombre que solo cabe quitando la quinta se muestra únicamente si no hay otro */
  if (out.some(function (x) { return !x.omit; })) out = out.filter(function (x) { return !x.omit; });
  out.sort(function (a, b) { return a.rank - b.rank || a.ord - b.ord; });
  return out.slice(0, 8).map(function (x) { return x.name; });
}

export {
  parseChord, chordToString, chordPc, transposeChord, parseKey, flatsFor, keyName,
  tokenizeLine, segTokens, parseBody, collectChords, countDoubts, hasUntransposable, inferKey,
  shapesFor, shapeFor, shiftDiagram, diagramFor, toChordPro, convertSolfege, listDoubts, chordsAbove, chordHint, setUserShapes, chordKey, parseFill, fillTab, catalogNames, catQual, nameShape
};
