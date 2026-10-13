import * as C from '../public/js/core.js';
let fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { fail++; console.log('FALLA', name, '\n  obtuvo ', g, '\n  esperaba', w); }
  else console.log('ok   ', name);
}
const t = (sym, n, key) => {
  const k = C.parseKey(key);
  return C.transposeChord(C.parseChord(sym), n, C.flatsFor(k, n));
};

// lectura de acordes
eq('G7/9 extensión', C.parseChord('G7/9').bass, '9');
eq('D/F# bajo', C.parseChord('D/F#').bass, 'F#');
eq('Bd7 se lee como disminuido', C.parseChord('Bd7').qual, 'dim7');
eq('Bdim7 sigue igual', C.parseChord('Bdim7').qual, 'dim7');
eq('Bd7 tiene diagrama', C.shapesFor(C.parseChord('Bd7')).length > 0, true);
eq('Bdim7: las tres posiciones de la escuela', ['-1,2,3,1,3,-1','7,-1,6,7,6,-1','-1,-1,9,10,9,10'].every(function (k) { return C.shapesFor(C.parseChord('Bdim7')).some(function (d) { return d.frets.join(',') === k; }); }), true);
eq('Bm7b5: las tres posiciones de la escuela', ['-1,2,3,2,3,-1','7,-1,7,7,6,-1','-1,-1,9,10,10,10'].every(function (k) { return C.shapesFor(C.parseChord('Bm7b5')).some(function (d) { return d.frets.join(',') === k; }); }), true);
eq('Bø7 y Bm7b5 comparten diagramas', C.shapesFor(C.parseChord('Bø7')).length, C.shapesFor(C.parseChord('Bm7b5')).length);
eq('Sld7 no es acorde', C.parseChord('Sld7'), null);
eq('A* variante', C.parseChord('A*').star, true);
eq('Bdim7', C.parseChord('Bdim7').qual, 'dim7');
eq('Am7? duda', C.parseChord('Am7?').doubt, true);
eq('Cmaj7', C.parseChord('Cmaj7').qual, 'maj7');

// transposición con grafía por tonalidad
eq('Am +1 en Am -> Bbm', t('Am', 1, 'Am'), 'Bbm');
eq('A +1 en A -> Bb', t('A', 1, 'A'), 'Bb');
eq('G +1 en G -> Ab', t('G', 1, 'G'), 'Ab');
eq('D/F# +1 en G -> Eb/G', t('D/F#', 1, 'G'), 'Eb/G');
eq('Em7 +2 en E -> F#m7', t('Em7', 2, 'E'), 'F#m7');
eq('G7/9 +2 en G -> A7/9', t('G7/9', 2, 'G'), 'A7/9');
eq('C4 +2 en C -> D4', t('C4', 2, 'C'), 'D4');
eq('C +3 en C -> Eb', t('C', 3, 'C'), 'Eb');
eq('Em -3 en Em -> C#m', t('Em', -3, 'Em'), 'C#m');
eq('Bdim7 +1 en C -> Db', t('Bdim7', 1, 'C'), 'Cdim7');
eq('F +0 conserva', t('F', 0, 'F'), 'F');
eq('A* +2 conserva marca', t('A*', 2, 'A'), 'B*');

// líneas de acordes
const tk = C.tokenizeLine('G - D - Em - C (50-60-62-64)');
eq('tokens tipos', tk.map(x => x.type).join(','), 'chord,sep,chord,sep,chord,sep,chord,sep,fig');
const tk2 = C.tokenizeLine('DO(DO4-DO-SOL7)');
eq('grupo con acordes', tk2.map(x => x.type).join(','), 'doubt,group');
const tk3 = C.tokenizeLine('D4 (62-5?-64) Sld7');
eq('figura incompleta y duda', [tk3[2].incomplete, tk3[4].type], [true, 'doubt']);

// cuerpo
const body = `{intro: Am - F - C - G (50-5?-52)}

> Am F C G
[Am]La luz de enero [F]entra
[Sld7]texto [E7?]fin
{c: nota}
{alt: otra frase}
{sot}
e|--3--|
{eot}
`;
const bl = C.parseBody(body);
eq('bloques', bl.map(b => b.type).join(','), 'chords,gap,chords,lyric,lyric,note,alt,tab');
eq('dudas', C.countDoubts(bl), 3);
eq('acordes únicos', C.collectChords(bl).map(x => x.orig).join(' '), 'Am F C G E7');
eq('tonalidad inferida', C.inferKey(bl), { pc: 9, minor: true });
eq('hay tab/figuras', C.hasUntransposable(bl), true);

// formas
const sh = (s) => C.shapeFor(C.parseChord(s));
eq('C abierto', sh('C').frets, [-1, 3, 2, 0, 1, 0]);
eq('F#m cejilla', [sh('F#m').frets, sh('F#m').base], [[2, 4, 4, 2, 2, 2], 2]);
eq('Bb cejilla', [sh('Bb').frets, sh('Bb').base], [[-1, 1, 3, 3, 3, 1], 1]);
eq('Ab (forma E o A)', sh('Ab').barre.fret, 4);
eq('C4 -> la forma del cancionero', sh('C4').frets, [0, 3, 3, 0, 1, 0]);
eq('C4 ofrece también Csus4', C.shapesFor(C.parseChord('C4'))[1].frets, [-1, 3, 3, 0, 1, -1]);
eq('G7/9 -> la forma del cancionero', sh('G7/9').frets, [3, 0, 0, 2, 0, 1]);
const shifted = C.shiftDiagram(sh('F'), 2);
eq('F +2 cejilla', [shifted.frets, shifted.base], [[3, 5, 5, 4, 3, 3], 3]);
eq('C abierto no se desplaza', C.shiftDiagram(sh('C'), 2), null);

// posiciones múltiples: cada forma debe sonar solo notas del acorde y empezar en la raíz (o en el bajo)
const OPENPC = [4, 9, 2, 7, 11, 4];
const TONES = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus4: [0, 5, 7], dim7: [0, 3, 6, 9] };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
let total = 0, bad = 0;
for (const [q, tones] of Object.entries(TONES)) {
  for (let pc = 0; pc < 12; pc++) {
    const c = C.parseChord(NAMES[pc] + q);
    const list = C.shapesFor(c);
    if (!list.length) { bad++; console.log('sin formas', NAMES[pc] + q); continue; }
    list.forEach(d => {
      total++;
      const pcs = d.frets.map((f, i) => f < 0 ? null : (OPENPC[i] + f) % 12);
      const sounded = pcs.filter(x => x !== null);
      const okTones = sounded.every(p => tones.includes(((p - pc) % 12 + 12) % 12));
      const okRoot = q === 'dim7' || pc === 0 /* Do: catálogo de la escuela, con inversiones */ || sounded[0] === pc;
      const okAll = tones.every(t => sounded.includes((pc + t) % 12)) || q === 'sus4' || q.includes('7');
      if (!okTones || !okRoot || !okAll || Math.max(...d.frets) > 15) { bad++; console.log('forma incorrecta', NAMES[pc] + q, d.frets.join(','), { okTones, okRoot, okAll }); }
    });
  }
}
eq('todas las formas generadas son correctas (' + total + ' formas)', bad, 0);
const slashOk = Object.keys(C.shapesFor(C.parseChord('D/F#')).length ? { x: 1 } : {}).length;
for (const s of ['D/F#', 'G/B', 'C/G', 'C/E', 'Am/G', 'Am/E', 'F/A', 'Dm/F', 'E/G#', 'G/F#', 'D/A', 'A/C#', 'A/E', 'Em/G']) {
  const c = C.parseChord(s);
  const d = C.shapesFor(c)[0];
  const pcs = d.frets.map((f, i) => f < 0 ? null : (OPENPC[i] + f) % 12).filter(x => x !== null);
  const bassPc = NAMES.indexOf(c.bass.length > 1 ? c.bass : c.bass);
  eq('bajo de ' + s, NAMES[pcs[0]], c.bass);
}
const opens = ['C', 'D', 'E', 'G', 'A', 'F', 'Am', 'Dm', 'Em', 'Bm', 'A7', 'B7', 'C7', 'D7', 'E7', 'G7', 'Cmaj7', 'Fmaj7', 'Gmaj7', 'Amaj7', 'Dmaj7', 'Emaj7', 'Am7', 'Dm7', 'Em7', 'Bm7', 'Dsus4', 'Dsus2', 'Asus4', 'Asus2', 'Esus4', 'Csus4', 'Gsus4', 'A7sus4', 'D7sus4', 'E7sus4'];
const ext = { Dsus2: [0, 2, 7], Asus2: [0, 2, 7], A7sus4: [0, 5, 7, 10], D7sus4: [0, 5, 7, 10], E7sus4: [0, 5, 7, 10] };
let badOpen = 0;
opens.forEach(n => {
  const c = C.parseChord(n);
  const d = C.shapesFor(c)[0];
  const pc = NAMES.indexOf(n.match(/^[A-G]#?/)[0]);
  const q = n.replace(/^[A-G]#?/, '');
  const tones = ext[n] || TONES[q === 'sus4' ? 'sus4' : q];
  const pcs = d.frets.map((f, i) => f < 0 ? null : (OPENPC[i] + f) % 12).filter(x => x !== null);
  if (!pcs.every(p => tones.includes(((p - pc) % 12 + 12) % 12)) || pcs[0] !== pc) { badOpen++; console.log('forma abierta incorrecta', n, d.frets.join(',')); }
});
eq('formas abiertas de la biblioteca correctas (' + opens.length + ')', badOpen, 0);
eq('C tiene varias posiciones', C.shapesFor(C.parseChord('C')).length >= 4, true);
eq('C empieza en la forma abierta', C.shapesFor(C.parseChord('C'))[0].frets, [-1, 3, 2, 0, 1, 0]);
eq('Bdim7 tiene tres posiciones', C.shapesFor(C.parseChord('Bdim7')).length, 3);
eq('Bm7b5 tiene tres posiciones', C.shapesFor(C.parseChord('Bm7b5')).length, 3);
eq('G7/9 tiene una sola forma', C.shapesFor(C.parseChord('G7/9')).length, 1);
eq('A* sin formas de biblioteca', C.shapesFor(C.parseChord('A*')).length, 0);


// solfeo a letras
const cv = (x) => C.convertSolfege(x);
eq('solfeo: acordes entre corchetes', cv('[LAm]El [DO]sol [SOL7]va'), '[Am]El [C]sol [G7]va');
eq('solfeo: no toca la letra', cv('Si el sol se va'), 'Si el sol se va');
eq('solfeo: línea de acordes con bajo y grupo', cv('> REm-SOL7-(SOL7/9) DO(DO4-DO-SOL7-DO) RE/FA'), '> Dm-G7-(G7/9) C(C4-C-G7-C) D/F');
eq('solfeo: sostenidos, bemoles, disminuido', cv('[FA#7] [SIbm] [SId7] [LAd] [SOL#m]'), '[F#7] [Bbm] [Bdim7] [Adim] [G#m]');
eq('solfeo: intro con figuras sin tocar', cv('{intro: SOL - LAd - MIm (50-60-62)}'), '{intro: G - Adim - Em (50-60-62)}');
eq('solfeo: estrella y 4/9', cv('[LA*] [SOL4/9] [FA7+]'), '[A*] [G4/9] [F7+]');
eq('solfeo: tablatura intacta', cv('{sot}\nSOL|--0--|\n{eot}'), '{sot}\nSOL|--0--|\n{eot}');
eq('solfeo: ilegible queda para revisar', cv('[Sld7]'), '[Sld7]');

// lista de dudas con posición
const bd = '[Am]hola [Sld7]mundo [E7?]fin\n> G D? Zz\n{intro: Am - F (50-5?-52)}\n{c: [no es acorde]}\n{sot}\n[Zz]\n{eot}';
const dl = C.listDoubts(bd);
eq('dudas: cantidad y tipos', dl.map((x) => x.kind + ':' + x.text), ['ilegible:Sld7', 'incierto:E7?', 'incierto:D?', 'ilegible:Zz', 'figura:(50-5?-52)']);
eq('dudas: posiciones apuntan al texto', dl.every((x) => bd.slice(x.start, x.end) === x.text), true);
eq('dudas: coincide con el contador', dl.length, C.countDoubts(C.parseBody(bd)));

// Sucesión rápida dentro de un acorde de letra
const sq = C.parseBody('[C (C4-C-G7-C)]hola');
eq('sucesión rápida: acordes para diagramas', C.collectChords(sq).map((x) => x.orig).join(), 'C,C4,G7');
eq('sucesión rápida: sin dudas', C.countDoubts(sq), 0);
eq('sucesión rápida con un acorde ilegible cuenta una duda', C.countDoubts(C.parseBody('[C (Zz-C)]hola')), 1);
eq('un acorde común no se toma por sucesión', C.segTokens('Am'), null);

// Varios acordes seguidos sobre una sílaba: [C-F-C]
const sq2 = C.parseBody('[C-F-C]hola [Am D]mundo');
eq('[C-F-C]: acordes para diagramas', C.collectChords(sq2).map((x) => x.orig).join(), 'C,F,Am,D');
eq('[C-F-C]: sin dudas', C.countDoubts(sq2), 0);
eq('[Zz-Yy] sigue siendo una duda', C.countDoubts(C.parseBody('[Zz-Yy]hola')), 1);

// Figuras cuerda-traste sin paréntesis dentro de una línea de acordes: A (G - D/F# 62-63-63 A - G)
const fg = C.parseBody('> A (G - D/F# 62-63-63 A - G)');
const flat = []; (function w(ts) { ts.forEach((x) => { if (x.type === 'group') w(x.tokens); else flat.push(x); }); })(fg[0].tokens);
eq('62-63-63 es una figura, no una duda', flat.filter((x) => x.type === 'fig').map((x) => x.text).join(), '62-63-63');
eq('los acordes del grupo se leen', flat.filter((x) => x.type === 'chord').map((x) => x.text).join(), 'A,G,D/F#,A,G');
eq('sin dudas', C.countDoubts(fg), 0);
eq('en la letra también', C.countDoubts(C.parseBody('[A (G - D/F# 62-63-63 A - G)]hola')), 0);
eq('un solo par suelto sigue siendo duda', C.countDoubts(C.parseBody('> A 62')), 1);

// Acordes del impreso con forma propia
eq('C4 del cancionero: 0 3 3 0 1 0', C.shapesFor(C.parseChord('C4'))[0].frets.join(' '), '0 3 3 0 1 0');
eq('G7/9: 3 0 0 2 0 1', C.shapesFor(C.parseChord('G7/9'))[0].frets.join(' '), '3 0 0 2 0 1');
eq('G7/9 no es dudoso', C.parseChord('G7/9').doubt, false);
eq('D4 sigue siendo sus4', C.shapesFor(C.parseChord('D4'))[0].frets.join(' '), '-1 -1 0 2 3 3');

// ChordPro
const cp = C.toChordPro({ title: 'Prueba', artist: 'X', key: 'Am', body: '{intro: Am - F}\n[Am]hola [F]mundo\n> G D' });
const cp2 = C.toChordPro({ title: 'T', album: 'Disco', year: '1975', body: '' });
eq('ChordPro lleva álbum y año', /\{album: Disco\}/.test(cp2) && /\{year: 1975\}/.test(cp2), true);
console.log('--- ChordPro ---\n' + cp);
/* acordes sobre la letra (texto inventado) */
{
  const r = C.chordsAbove('Am         E\nLuna sobre el río\n\nLAm   MI - SId7\nVa la nave\n\nG D\n\nFin');
  const L = r.text.split('\n');
  eq('acordes sobre la letra', L[0], '[Am]Luna sobre [E]el río');
  eq('solfeo y grupo con guion', L[2], '[Am]Va la [E - Bdim7]nave');
  eq('línea sola de acordes', L[4], '> G D');
  eq('cuenta', r.count, 3);
  eq('sin acordes no cambia', C.chordsAbove('Hola mundo\notra línea').count, 0);
}

/* formas de la biblioteca de acordes */
{
  const mine = { frets: [-1, 0, 2, 2, 1, 0], base: 1, barre: null };
  C.setUserShapes({ 'Am': [mine], 'C#m7': [{ frets: [-1, 4, 6, 4, 5, 4], base: 4, barre: null }] });
  eq('la forma propia va primero', C.shapesFor(C.parseChord('Am'))[0].frets, mine.frets);
  eq('sin duplicar la del catálogo', C.shapesFor(C.parseChord('Am')).filter((d) => d.frets.join() === mine.frets.join()).length, 1);
  eq('vale con el nombre enarmónico', C.shapesFor(C.parseChord('Dbm7'))[0].frets, [-1, 4, 6, 4, 5, 4]);
  eq('clave de acorde con bajo', C.chordKey(C.parseChord('C/G')), 'C/G');
  C.setUserShapes({});
  eq('vacía vuelve al catálogo', C.shapesFor(C.parseChord('Am'))[0].frets, [-1, 0, 2, 2, 1, 0]);
}

/* familia de Do del catálogo */
{
  const f = (n) => C.shapesFor(C.parseChord(n)).map((d) => d.frets.join(' '));
  eq('C: primera forma y total', [f('C')[0], f('C').length], ['-1 3 2 0 1 0', 5]);
  eq('Cm: cinco formas en orden', f('Cm'), ['-1 3 1 0 1 -1', '-1 3 5 5 4 3', '-1 -1 5 8 8 8', '8 10 10 8 8 8', '11 -1 10 12 13 -1']);
  eq('Csus y C4 comparten Csus4', f('Csus')[0], '-1 3 3 0 1 -1');
  eq('B# vale como C', f('B#m7'), f('Cm7'));
  eq('C+ es Caug', f('C+').length, 4);
  eq('Csus7 es C7sus4', f('Csus7')[0], '-1 3 5 3 6 3');
  eq('Cdim7 tiene tres formas', f('Cdim7').length, 3);
  const d = C.shapesFor(C.parseChord('C'))[3];
  eq('cejilla deducida', [d.base, d.barre], [8, { fret: 8, from: 0, to: 5 }]);
  eq('sin cejilla si no hay', C.shapesFor(C.parseChord('C'))[0].barre, null);
  eq('otras raíces siguen igual', f('D').length > 0 && f('Dm').length > 0, true);
}

/* fills */
{
  const F = '30,32,(63,20),21,23,30,(53,11),23,10';
  const b = C.parseBody('{fill: ' + F + '}');
  eq('el fill es un bloque propio', [b.length, b[0].type, b[0].label, b[0].steps.length, b[0].doubts], [1, 'fill', 'Fill', 9, 0]);
  eq('lo que va entre paréntesis suena a la vez', b[0].steps[2].notes.map((n) => [n.s, n.f]), [[6, 3], [2, 0]]);
  eq('un fill con nombre', C.parseBody('{fill Puente: 30,32}')[0].label, 'Puente');
  eq('traste de dos cifras', C.parseBody('{fill: 110,212}')[0].steps.map((x) => [x.notes[0].s, x.notes[0].f]), [[1, 10], [2, 12]]);
  eq('mini tablatura', C.fillTab(b[0].steps).split('\n'), ['e|-------------1---0-|', 'B|-----0-1-3-----3---|', 'G|-0-2-------0-------|', 'D|-------------------|', 'A|-------------3-----|'.replace('-------------3-----', '-------------3-----') , 'E|-----3-------------|']);
  eq('seis cuerdas en la tablatura', C.fillTab(b[0].steps).split('\n').length, 6);
  eq('la 6ª cuerda lleva el 3 del acorde simultáneo', C.fillTab(C.parseBody('{fill: (63,20)}')[0].steps).split('\n').map((r) => r.replace(/[^0-9]/g, '')), ['', '0', '', '', '', '3']);
  eq('una nota ilegible o con ?', [C.countDoubts(C.parseBody('{fill: 30,77,32?,15}')), C.countDoubts(b)], [2, 0]);
  eq('no se transpone', C.hasUntransposable(b), true);
  const ds = C.listDoubts('[C]Hola\n{fill: 30,77,32?}');
  eq('listDoubts señala las notas dudosas', ds.map((d) => [d.text, d.kind, d.line]), [['77', 'ilegible', 1], ['32?', 'incierto', 1]]);
  eq('ChordPro lo exporta como comentario', /\{comment: Fill: 30,32\}/.test(C.toChordPro({ title: 'x', artist: '', body: '{fill: 30,32}' })), true);
  eq('convertSolfege no toca el fill', C.convertSolfege('{fill: 30,32}'), '{fill: 30,32}');
}

console.log(fail ? '\n' + fail + ' pruebas fallaron' : '\ntodas las pruebas pasan');
process.exitCode = fail ? 1 : 0;
