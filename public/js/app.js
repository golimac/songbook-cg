import {
  parseChord, chordToString, transposeChord, parseKey, flatsFor, keyName, parseBody, collectChords,
  countDoubts, hasUntransposable, inferKey, shapesFor, shapeFor, diagramFor, toChordPro, listDoubts
} from './core.js';
import { imaging as realImaging } from './photo.js';
import { createImporter } from './import.js';

/* Songbook CG · aplicación. Recibe la capa de datos (Firebase en producción, una simulada en las pruebas). */
export function start(api, options) {
var cfg = options || {};
var $ = function (s, r) { return (r || document).querySelector(s); };
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function uid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function toast(msg, err) {
  var t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.setAttribute('role', err ? 'alert' : 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, err ? 7000 : 3000);
}


var SAMPLES = [
  { id: 'ej1', title: 'Camino a casa', artist: 'Canción de ejemplo', key: 'G', tuning: 'Afinación estándar', source: 'Ejemplo 1', status: 'revisada', page: '', diagrams: {},
    body: '{intro: G - D - Em - C (50-60-62-64)}\n\n[G]Cuando la tarde se [D]apaga en el camino\n[Em]y las luces del pueblo [C]empiezan a hablar\n[G]yo cuento los pasos [D]que me faltan por dar\n[C]y el viento me [D]sopla [G]el nombre de mi hogar\n\n{c: Puente suave, sin púa}\n[Am]Una casa, un [D7]patio, un [G]farol\n[Am]y alguien que espera [D7]con el [G]sol\n\n{sot}\ne|--------------------|\nB|-----------3--1-----|\nG|------0-------------|\nD|--0--------------0--|\nA|--------------------|\nE|-3------------------|\n{eot}\n\n[G]Ya voy, ya voy, [D]ya casi estoy\n[Em]ya veo el humo [C]de la chimenea\n{alt: ya siento el humo de la chimenea}' },
  { id: 'ej2', title: 'Luz de enero', artist: 'Canción de ejemplo', key: 'Am', tuning: 'Afinar un tono más bajo', source: 'Ejemplo 2', page: '', status: 'dudas',
    diagrams: { 'A*': { frets: [5, 7, 7, 6, 5, 5], base: 5, barre: { fret: 5, from: 0, to: 5 } } },
    body: '{intro: Am - F - C - G (50-5?-52)}\n\n> Am F C G\n[Am]La luz de enero entra [F]por la ventana\n[C]y despierta el polvo [G]que dormía en la mesa\n[Am]Pongo agua al fuego, [F]busco una canción\n[C]y el día se acomoda [E7?]sobre mi voz\n\n{c: Estribillo, con el acorde alto en el quinto traste}\n[A*]Cada mañana [Dm]vuelve la luz\n[Sld7]sin pedir permiso [E7]ni explicación\n[A*]Cada mañana [Dm]me encuentra igual\n[F]con las manos tibias [E7]y la voz sin afinar' },
  { id: 'ej3', title: 'Marea baja', artist: 'Canción de ejemplo', key: 'F', tuning: '', source: 'Ejemplo 3', status: 'pendiente', page: '', diagrams: {},
    body: '{intro: F - Bb - C4 - C}\n\n[F]Marea baja, [Bb]barcos sin prisa\n[Gm7]el muelle cuenta [C4]lo que el agua [C]dejó\n[F]Una gaviota [F/A]cruza la bahía\n[Bb]y el faro se queda [Bdim7]solo con su luz [C]\n\n{c: Final, con el acorde de novena}\n[Dm]Vuelve la sal, [G7/9]vuelve el color\n[Bb]y la tarde se [C]aquieta [F]' }
];

/* ---------- Estado ---------- */
var songs = [];            // datos livianos de la lista, en vivo desde Firestore
var listLoaded = false;
var user = null, unsub = null, denied = false;
var S = { view: 'library', id: null, song: null, shift: 0, capo: 0, fs: 13, dg: true, auto: false, dur: 150, q: '', draft: null, isNew: false, pos: {}, review: null, revI: 0 };
var view = $('#view');
function editable() { return !!user; }
function cur() { return S.view === 'edit' ? S.draft : S.song; }
function failSave(e) { toast((e && e.code === 'permission-denied') ? 'Esta cuenta no tiene permiso para editar.' : 'No se pudo guardar: ' + ((e && e.message) || 'error desconocido'), true); }
var imp = createImporter({
  view: view, esc: esc, toast: toast, api: api, imaging: cfg.imaging || realImaging, uid: uid,
  openReview: function (rv) { openEditor(null, rv); },
  finish: function (n, cancelled) {
    renderLibrary();
    if (!cancelled) toast(n ? n + (n === 1 ? ' canción guardada.' : ' canciones guardadas.') : 'No se guardó ninguna canción.');
  }
});


/* ---------- Contexto de una canción ---------- */
function ctxFor(song, shift, capo) {
  var blocks = parseBody(song.body);
  var key = parseKey(song.key), inferred = false;
  if (!key) { key = inferKey(blocks); inferred = !!key; }
  var ss = shift - capo;
  return { blocks: blocks, key: key, inferred: inferred, shift: shift, capo: capo, ss: ss, flats: flatsFor(key, ss) };
}
function dc(c, ctx) { return transposeChord(c, ctx.ss, ctx.flats); }
function chAttr(c) { return ' data-ch="' + esc(chordToString(Object.assign({}, c, { doubt: false }))) + '" tabindex="0"'; }

/* ---------- Dibujo de la canción ---------- */
function tokHTML(tokens, ctx) {
  return tokens.map(function (t) {
    if (t.type === 'chord') return '<span class="ch' + (t.chord.doubt ? ' doubt' : '') + '"' + chAttr(t.chord) + '>' + esc(dc(t.chord, ctx)) + '</span>';
    if (t.type === 'doubt') return '<span class="ch doubt" title="Lectura dudosa">' + esc(t.text) + '</span>';
    if (t.type === 'fig') return '<span class="fig' + (t.incomplete ? ' doubt' : '') + '" title="Figura cuerda-traste, no se transpone">' + esc(t.text) + '</span>';
    if (t.type === 'group') return '<span class="sp">(</span>' + tokHTML(t.tokens, ctx) + '<span class="sp">)</span>';
    return '<span class="sp">' + esc(t.text) + '</span>';
  }).join('');
}
function lyricHTML(b, ctx) {
  var has = b.segs.some(function (s) { return s.chord != null; });
  if (!has) return '<div class="ln"><span class="t">' + (esc(b.segs[0].text) || '&nbsp;') + '</span></div>';
  return '<div class="ln">' + b.segs.map(function (s) {
    var c;
    if (s.chord != null) {
      var p = parseChord(s.chord);
      c = p ? '<span class="c' + (p.doubt ? ' doubt' : '') + '"' + chAttr(p) + '>' + esc(dc(p, ctx)) + '</span>'
            : '<span class="c doubt" title="Lectura dudosa">' + esc(s.chord) + '</span>';
    } else c = '<span class="c"> </span>';
    return '<span class="seg">' + c + '<span class="t">' + esc(s.text) + '</span></span>';
  }).join('') + '</div>';
}
function blocksHTML(blocks, ctx, mode) {
  return blocks.map(function (b) {
    switch (b.type) {
      case 'gap': return '<div class="gap"></div>';
      case 'note': return '<div class="note">' + esc(b.text) + '</div>';
      case 'alt': return mode === 'edit' ? '<div class="alt">alternativa · ' + esc(b.text) + '</div>' : '';
      case 'tab': return '<pre class="tab">' + esc(b.lines.join('\n')) + '</pre>';
      case 'chords': return '<div class="cl">' + (b.label ? '<span class="lab sp">' + esc(b.label) + '</span>' : '') + tokHTML(b.tokens, ctx) + '</div>';
      case 'lyric': return lyricHTML(b, ctx);
    }
    return '';
  }).join('');
}

/* ---------- Diagramas ---------- */
function sx(i) { return 20 + i * 11; }
function ry(r) { return 22 + r * 14; }
function dgInner(d) {
  var s = '', i, f, r;
  for (r = 0; r <= 5; r++) s += '<line class="' + (r === 0 && d.base === 1 ? 'nut' : 'sg') + '" x1="' + sx(0) + '" x2="' + sx(5) + '" y1="' + ry(r) + '" y2="' + ry(r) + '"/>';
  for (i = 0; i < 6; i++) s += '<line class="sg" x1="' + sx(i) + '" x2="' + sx(i) + '" y1="' + ry(0) + '" y2="' + ry(5) + '"/>';
  if (d.base > 1) s += '<text class="mk" x="8" y="' + (ry(0) + 10) + '">' + d.base + '</text>';
  for (i = 0; i < 6; i++) {
    f = d.frets[i];
    if (f === -1) s += '<text class="mk" x="' + sx(i) + '" y="15">×</text>';
    else if (f === 0) s += '<circle class="op" cx="' + sx(i) + '" cy="11" r="3"/>';
  }
  if (d.barre) {
    r = d.barre.fret - d.base;
    if (r >= 0 && r < 5) s += '<rect class="dot" x="' + (sx(d.barre.from) - 5) + '" y="' + (ry(r) + 2.5) + '" width="' + (sx(d.barre.to) - sx(d.barre.from) + 10) + '" height="9" rx="4.5"/>';
  }
  for (i = 0; i < 6; i++) {
    f = d.frets[i];
    if (f > 0) { r = f - d.base; if (r >= 0 && r < 5) s += '<circle class="dot" cx="' + sx(i) + '" cy="' + (ry(r) + 7) + '" r="4.4"/>'; }
  }
  return s;
}
function dgSVG(d, w, edit) {
  var hit = '';
  if (edit) {
    for (var i = 0; i < 6; i++) {
      hit += '<rect class="cell" data-top="' + i + '" x="' + (sx(i) - 5.5) + '" y="4" width="11" height="15"/>';
      for (var r = 0; r < 5; r++) hit += '<rect class="cell" data-i="' + i + '" data-r="' + r + '" x="' + (sx(i) - 5.5) + '" y="' + ry(r) + '" width="11" height="14"/>';
    }
  }
  return '<svg viewBox="0 0 84 100" width="' + (w || 84) + '" role="img" aria-label="Diagrama de acorde">' + dgInner(d) + hit + '</svg>';
}
/* Posiciones de un acorde: primero el diagrama propio de la canción, luego las de la biblioteca */
function positionsFor(song, ctx, orig) {
  var chord = parseChord(orig);
  var disp = transposeChord(chord, ctx.ss, ctx.flats);
  var list = [];
  var r = diagramFor(song.diagrams, orig, chord, ctx.shift, ctx.ss, ctx.flats);
  if (r.custom && r.d) list.push({ d: r.d, custom: true });
  shapesFor(parseChord(disp)).forEach(function (d) {
    if (!list.some(function (x) { return x.d.frets.join() === d.frets.join(); })) list.push({ d: d, custom: false });
  });
  return { disp: disp, list: list };
}
function posIndex(P) {
  var n = P.list.length;
  return n ? (((S.pos[P.disp] || 0) % n) + n) % n : 0;
}
function stripHTML(song, ctx) {
  var can = ctx.ss === 0 && editable();
  return collectChords(ctx.blocks).map(function (it) {
    var P = positionsFor(song, ctx, it.orig);
    var tag = can ? 'button' : 'div';
    var attr = can ? ' data-edit="' + esc(it.orig) + '" type="button"' : '';
    if (P.list.length) {
      var cur = P.list[posIndex(P)];
      return '<' + tag + ' class="dg"' + attr + '>' + dgSVG(cur.d) + '<b>' + esc(P.disp) + '</b>' + (cur.custom ? '<i>propio</i>' : '<i>&nbsp;</i>') + '</' + tag + '>';
    }
    return '<' + tag + ' class="dg none"' + attr + '><div class="blank">?</div><b>' + esc(P.disp) + '</b><i>' + (can ? 'dibujar' : 'sin forma') + '</i></' + tag + '>';
  }).join('');
}

/* ---------- Biblioteca ---------- */
var STATUS = { pendiente: ['Pendiente', ''], dudas: ['Con dudas', 'warn'], revisada: ['Revisada', 'ok'] };
function renderLibrary() {
  imp.cancel(); stopAuto(); hidePop();
  S.review = null;
  S.view = 'library'; S.song = null;
  view.innerHTML = '<div class="libhead"><h1>Biblioteca</h1></div>' +
    '<input id="q" type="search" placeholder="Buscar por título, artista o fuente" autocomplete="off" aria-label="Buscar canciones">' +
    '<p class="count" id="count"></p><div class="list" id="list"></div>';
  $('#q').value = S.q;
  fillList();
}
function fillList() {
  if (S.view !== 'library') return;
  if (!listLoaded) { $('#count').textContent = ''; $('#list').innerHTML = '<p class="hint">Cargando biblioteca…</p>'; return; }
  if (!songs.length) {
    $('#count').textContent = '';
    $('#list').innerHTML = editable()
      ? '<div class="empty"><p>La biblioteca está vacía. Agrega una canción con el botón de arriba, o carga tres canciones de ejemplo para probar la aplicación.</p>' +
        '<button class="btn" id="seed">Cargar canciones de ejemplo</button></div>'
      : '<div class="empty"><p>La biblioteca está vacía.</p></div>';
    return;
  }
  var q = norm(S.q);
  var items = songs.filter(function (s) { return !q || norm(s.title + ' ' + s.artist + ' ' + s.source).indexOf(q) >= 0; })
    .sort(function (a, b) { return String(a.title).localeCompare(String(b.title), 'es'); });
  $('#count').textContent = items.length + (items.length === 1 ? ' canción' : ' canciones');
  $('#list').innerHTML = items.length ? items.map(function (s) {
    var n = s.doubts || 0;
    var st = STATUS[s.status] || STATUS.pendiente;
    var k = parseKey(s.key);
    return '<button class="item" data-open="' + esc(s.id) + '"><span class="it-title">' + esc(s.title) + '</span>' +
      '<span class="it-chips">' + (k ? '<span class="chip">' + esc(s.key) + '</span>' : '') +
      (n ? '<span class="chip warn">' + n + (n === 1 ? ' duda' : ' dudas') + '</span>' : '') +
      '<span class="chip ' + st[1] + '">' + st[0] + '</span></span>' +
      '<span class="it-sub">' + esc([s.artist].filter(Boolean).join(' · ')) + '</span></button>';
  }).join('') : '<p class="hint">No hay canciones que coincidan.</p>';
}

/* ---------- Acceso ---------- */
function renderLogin() {
  imp.cancel(); stopAuto(); hidePop();
  S.view = 'login';
  view.innerHTML = '<div class="login"><h1>Songbook CG</h1><p class="hint">Esta biblioteca pide una cuenta para leerse. Entra con Google.</p>' +
    '<button class="btn primary" id="signIn">Entrar con Google</button></div>';
}
function renderDenied() {
  S.view = 'login';
  view.innerHTML = '<div class="login"><h1>Sin acceso</h1><p class="hint">La cuenta ' + esc(user ? user.email : '') + ' no tiene permiso para leer este cancionero.</p>' +
    '<button class="btn" id="signOut2">Salir y usar otra cuenta</button></div>';
}
function applyAuth(u) {
  user = u; denied = false;
  if (unsub) { unsub(); unsub = null; }
  songs = []; listLoaded = false;
  var on = !!u;
  $('#who').hidden = !on; $('#who').textContent = on ? u.email : '';
  $('#signOut').hidden = !on; $('#newSong').hidden = !on; $('#importBtn').hidden = !on; $('#signInTop').hidden = on;
  renderLibrary();
  unsub = api.subscribeSongs(function (list) {
    songs = list; listLoaded = true;
    fillList();
  }, function (e) {
    denied = true; songs = []; listLoaded = true;
    if (e && e.code === 'permission-denied') { if (user) renderDenied(); else renderLogin(); }
    else toast('No se pudo leer la biblioteca: ' + ((e && e.message) || 'error'), true);
  });
}

/* ---------- Vista de canción ---------- */
function openSong(id) {
  var meta = songs.filter(function (s) { return s.id === id; })[0];
  if (!meta) return;
  view.innerHTML = '<p class="hint">Abriendo canción…</p>';
  api.getBody(id).then(function (b) {
    if (S.view === 'song' && S.id !== id) return;
    showSong(Object.assign({ diagrams: {} }, meta, { body: b.body || '', diagrams: b.diagrams || {} }));
  }, function (e) {
    toast('No se pudo abrir la canción: ' + ((e && e.message) || 'sin conexión y sin copia local'), true);
    renderLibrary();
  });
}
function showSong(song) {
  imp.cancel(); S.review = null; stopAuto(); hidePop();
  S.view = 'song'; S.id = song.id; S.song = song; S.shift = 0; S.capo = 0; S.pos = {};
  var capoOpts = '<option value="0">Sin cejilla</option>';
  for (var i = 1; i <= 9; i++) capoOpts += '<option value="' + i + '">Traste ' + i + '</option>';
  view.innerHTML =
    '<div class="shead"><div><h1>' + esc(song.title) + '</h1><p class="meta">' + esc([song.artist, song.tuning].filter(Boolean).join(' · ')) + '</p></div>' +
    '<div class="actions"><button class="btn" data-act="back">Biblioteca</button><button class="btn" data-act="export">Exportar</button>' + (editable() ? '<button class="btn primary" data-act="edit">Editar</button>' : '') + '</div></div>' +
    '<div class="controls" id="controls">' +
      '<div class="grp"><span class="lab">Transponer</span><button class="btn sq" data-act="tm" aria-label="Bajar un semitono">−</button><output id="tval">0</output><button class="btn sq" data-act="tp" aria-label="Subir un semitono">+</button><button class="btn" data-act="t0">Original</button></div>' +
      '<div class="grp"><label class="lab" for="capo">Cejilla</label><select id="capo">' + capoOpts + '</select></div>' +
      '<div class="grp"><span class="lab">Letra</span><button class="btn sq" data-act="fm" aria-label="Letra más pequeña">A−</button><button class="btn sq" data-act="fp" aria-label="Letra más grande">A+</button></div>' +
      '<div class="grp"><label class="chk"><input type="checkbox" id="dgToggle"' + (S.dg ? ' checked' : '') + '> Diagramas</label></div>' +
      '<div class="grp"><button class="btn" data-act="auto" id="autoBtn">Iniciar autoscroll</button><input type="range" id="dur" min="30" max="420" step="10" value="' + S.dur + '" aria-label="Duración del autoscroll"><output id="durv"></output></div>' +
    '</div>' +
    '<div id="info"></div><div class="dgs" id="dgStrip"></div><article class="song" id="songBody"></article>';
  refreshSong();
  window.scrollTo(0, 0);
}
function fmtDur(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
function refreshSong() {
  var song = S.song; if (!song) return;

  hidePop();
  var ctx = ctxFor(song, S.shift, S.capo);
  $('#tval').textContent = (S.shift > 0 ? '+' : '') + S.shift;
  $('#capo').value = String(S.capo);
  $('#durv').textContent = fmtDur(S.dur);
  var info = '';
  if (ctx.key) {
    info += '<p class="info">Suena en <b>' + esc(keyName(ctx.key, S.shift)) + '</b>' + (S.shift ? ' (original ' + esc(keyName(ctx.key, 0)) + ')' : '') +
      (S.capo ? ' · cejilla en el traste ' + S.capo + ', formas en <b>' + esc(keyName(ctx.key, ctx.ss)) + '</b>' : '') +
      (ctx.inferred ? ' · tonalidad tomada del primer acorde' : '') + '</p>';
  } else info += '<p class="info">La canción no tiene tonalidad definida.</p>';
  var n = countDoubts(ctx.blocks);
  if (n) info += '<div class="banner warn">' + n + (n === 1 ? ' marca por revisar, resaltada' : ' marcas por revisar, resaltadas') + ' en ámbar. Se corrigen en el editor.</div>';
  if (ctx.ss !== 0 && hasUntransposable(ctx.blocks)) info += '<div class="banner">Las figuras cuerda-traste y las tablaturas conservan su posición original.</div>';
  $('#info').innerHTML = info;
  var strip = $('#dgStrip');
  strip.hidden = !S.dg;
  strip.innerHTML = S.dg ? stripHTML(song, ctx) : '';
  var body = $('#songBody');
  body.style.setProperty('--fs', S.fs + 'px');
  body.innerHTML = blocksHTML(ctx.blocks, ctx, 'view');
}
/* ---------- Autoscroll ---------- */
var raf = null, lastTs = 0, acc = 0;
function tick(ts) {
  if (!S.auto) { raf = null; return; }
  var body = $('#songBody');
  if (!body) { stopAuto(); return; }
  var dt = Math.min((ts - lastTs) / 1000, 0.1); lastTs = ts;
  acc += (body.scrollHeight / S.dur) * dt;
  var px = Math.floor(acc);
  if (px >= 1) { acc -= px; window.scrollBy(0, px); }
  var atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atEnd) { stopAuto(); return; }
  raf = requestAnimationFrame(tick);
}
function startAuto() {
  S.auto = true; acc = 0; lastTs = performance.now();
  var b = $('#autoBtn'); if (b) b.textContent = 'Pausar autoscroll';
  raf = requestAnimationFrame(tick);
}
function stopAuto() {
  S.auto = false;
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  var b = $('#autoBtn'); if (b) b.textContent = 'Iniciar autoscroll';
}
/* ---------- Editor ---------- */
var NEW_BODY = '{intro: Am - F - C - G}\n\n[Am]Escribe la primera línea con el acorde [F]justo antes de la sílaba\n[C]donde cae cada cambio, y sigue con la [G]siguiente\n';
function openEditor(id, review) {
  if (!editable()) return;
  if (!review) imp.cancel();
  stopAuto(); hidePop();
  S.view = 'edit'; S.pos = {}; S.review = review || null; S.revI = 0;
  if (review) { S.draft = review.song; S.isNew = true; }
  else if (id) { S.draft = clone(S.song); S.isNew = false; }
  else { S.draft = { id: uid(), title: 'Canción nueva', artist: '', key: '', tuning: '', source: '', page: '', status: 'pendiente', body: NEW_BODY, diagrams: {} }; S.isNew = true; }
  var d = S.draft;
  var stOpts = Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (d.status === k ? ' selected' : '') + '>' + STATUS[k][0] + '</option>'; }).join('');
  view.innerHTML =
    '<div class="shead"><h1>' + (review ? 'Revisar canción' : S.isNew ? 'Nueva canción' : 'Editar canción') + '</h1></div>' +
    '<div class="ed' + (review ? ' rv' : '') + '" style="margin-top:16px">' +
    (review ? '<aside class="revcol" id="rev"><p class="revlab">' + esc(review.label) + '</p><div id="revDoubt"></div>' +
      (review.remarks ? '<p class="revrem"><b>Del papel:</b> ' + esc(review.remarks) + '</p>' : '') +
      '<div class="revimg" id="revImg">' + review.crops.map(function (c) { return '<img src="' + esc(c) + '" alt="Foto de la canción">'; }).join('') + '</div></aside>' : '') +
    '<form class="form" id="edForm" autocomplete="off">' +
      '<div class="row"><label class="f">Título<input type="text" id="fTitle"></label><label class="f">Artista<input type="text" id="fArtist"></label></div>' +
      '<div class="row"><label class="f">Tonalidad<input type="text" id="fKey" placeholder="Am, G, Bb"></label>' +
        '<label class="f">Afinación o cejilla de la fuente<input type="text" id="fTuning"></label>' +
        '<label class="f">Estado<select id="fStatus">' + stOpts + '</select></label></div>' +
      '<label class="f">Letra y acordes<textarea id="fBody" spellcheck="false"></textarea></label>' +
      '<details class="syntax"><summary>Cómo se escribe</summary><ul>' +
        '<li><code>[Am]</code> pone el acorde sobre la sílaba que sigue.</li>' +
        '<li><code>&gt; G D Em</code> escribe una línea solo de acordes.</li>' +
        '<li><code>{intro: G - D (50-60-62)}</code> escribe la introducción. Cada grupo entre paréntesis es cuerda y traste, y no se transpone.</li>' +
        '<li><code>{c: texto}</code> agrega una nota.</li>' +
        '<li><code>{sot}</code> y <code>{eot}</code> encierran una tablatura.</li>' +
        '<li><code>{alt: texto}</code> guarda una línea alternativa que solo se ve aquí.</li>' +
        '<li><code>A*</code> marca una variante de posición con su propio diagrama.</li>' +
        '<li><code>[Sld7]</code>, <code>[Am?]</code> y <code>(62-5?)</code> marcan una duda en ámbar.</li>' +
      '</ul></details>' +
      (review
        ? '<div class="actions"><button type="submit" class="btn primary">Guardar y seguir</button><button type="button" class="btn" id="edSkip">Saltar esta canción</button><button type="button" class="btn" id="edAbort">Terminar importación</button></div>'
        : '<div class="actions"><button type="submit" class="btn primary">Guardar</button><button type="button" class="btn" id="edCancel">Cancelar</button>' +
          (S.isNew ? '' : '<button type="button" class="btn danger" id="edDel">Eliminar canción</button>') + '</div>') +
    '</form>' +
    '<aside class="pv"><div class="pvh"><span>Vista previa</span><span id="pvN"></span></div><div class="dgs" id="edDg"></div><article class="song" id="pv"></article></aside></div>';
  $('#fTitle').value = d.title; $('#fArtist').value = d.artist; $('#fKey').value = d.key;
  $('#fTuning').value = d.tuning; $('#fBody').value = d.body;
  refreshPreview();
  if (review) {
    var im = $('#revImg img');
    if (im) im.addEventListener('load', revRender);
  }
  window.scrollTo(0, 0);
}

/* ---------- Revisión: dudas junto a la foto ---------- */
var KIND = { ilegible: 'No se lee como acorde', incierto: 'Lectura incierta', figura: 'Figura incompleta' };
function revDoubts() {
  var rv = S.review; if (!rv) return [];
  var seen = {};
  return listDoubts(S.draft.body).map(function (x) {
    var k = seen[x.text] = (seen[x.text] || 0);
    seen[x.text]++;
    var md = rv.doubts.filter(function (m) { return m.text === x.text; })[k];
    x.model = md || null;
    return x;
  });
}
function zoomBox(b) {
  var w = Math.min(1, Math.max(b.w + 0.08, 0.35)), h = Math.min(1, Math.max(b.h + 0.04, 0.1));
  return { x: Math.max(0, Math.min(1 - w, b.x + b.w / 2 - w / 2)), y: Math.max(0, Math.min(1 - h, b.y + b.h / 2 - h / 2)), w: w, h: h };
}
function revRender() {
  var rv = S.review, el = $('#revDoubt'); if (!rv || !el) return;
  var list = revDoubts();
  if (!list.length) { el.innerHTML = '<span class="chip ok">Sin dudas pendientes</span>'; return; }
  S.revI = Math.max(0, Math.min(list.length - 1, S.revI));
  var x = list[S.revI];
  var h = '<div class="rvnav"><button class="btn sq" type="button" data-rev="prev" aria-label="Duda anterior">‹</button>' +
    '<span>Duda ' + (S.revI + 1) + ' de ' + list.length + '</span>' +
    '<button class="btn sq" type="button" data-rev="next" aria-label="Duda siguiente">›</button></div>' +
    '<p class="rvq"><code class="doubt">' + esc(x.text) + '</code> <span class="hint">' + esc(KIND[x.kind] || '') + '</span></p>' +
    (x.model && x.model.note ? '<p class="hint">' + esc(x.model.note) + '</p>' : '');
  if (x.model && x.model.box && rv.crops.length === 1) {
    var z = zoomBox(x.model.box), im = $('#revImg img');
    var cw = im && im.naturalWidth, ch = im && im.naturalHeight;
    var aspect = cw && ch ? (z.w * cw) / (z.h * ch) : (z.w / z.h) * 0.75;
    var pw = z.w >= 1 ? 0 : (z.x / (1 - z.w)) * 100, ph = z.h >= 1 ? 0 : (z.y / (1 - z.h)) * 100;
    h += '<div class="zoom" role="img" aria-label="Ampliación de la duda" style="aspect-ratio:' + aspect.toFixed(3) + ';background-image:url(' + "'" + rv.crops[0] + "'" + ');background-size:' + (100 / z.w).toFixed(2) + '% auto;background-position:' + pw.toFixed(2) + '% ' + ph.toFixed(2) + '%"></div>';
  }
  el.innerHTML = h;
}
function revGo(step) {
  var list = revDoubts(); if (!list.length) return;
  S.revI = (S.revI + step + list.length) % list.length;
  revRender();
  var x = list[S.revI], ta = $('#fBody'); if (!ta) return;
  ta.focus(); ta.setSelectionRange(x.start, x.end);
  var lh = parseFloat(window.getComputedStyle(ta).lineHeight) || 20;
  ta.scrollTop = Math.max(0, x.line * lh - ta.clientHeight / 2);
}
function refreshPreview() {
  var d = S.draft;
  var ctx = ctxFor(d, 0, 0);
  var n = countDoubts(ctx.blocks);
  $('#pvN').innerHTML = n ? '<span class="chip warn">' + n + (n === 1 ? ' duda' : ' dudas') + '</span>' : '';
  $('#edDg').innerHTML = stripHTML(d, ctx);
  $('#pv').innerHTML = blocksHTML(ctx.blocks, ctx, 'edit');
  if (S.review) revRender();
}
function readForm() {
  var d = S.draft;
  d.title = $('#fTitle').value; d.artist = $('#fArtist').value; d.key = $('#fKey').value.trim();
  d.tuning = $('#fTuning').value; d.status = $('#fStatus').value; d.body = $('#fBody').value;
}
/* ---------- Editor de diagramas ---------- */
var dgS = null, dgTarget = null;
function dgOut() {
  return { frets: dgS.frets.slice(), base: dgS.base, barre: dgS.barre.on ? { fret: dgS.barre.fret, from: dgS.barre.from, to: dgS.barre.to } : null };
}
function openDg(orig, start) {
  if (!editable()) return;
  dgTarget = cur();
  var cust = dgTarget.diagrams && dgTarget.diagrams[orig];
  var b = start || cust || shapeFor(parseChord(orig)) || { frets: [-1, -1, -1, -1, -1, -1], base: 1, barre: null };
  dgS = { orig: orig, frets: b.frets.slice(), base: b.base,
    barre: b.barre ? { on: true, fret: b.barre.fret, from: b.barre.from, to: b.barre.to } : { on: false, fret: b.base, from: 0, to: 5 }, hasCustom: !!cust };
  $('#dgTitle').textContent = 'Diagrama de ' + orig;
  $('#dgDel').hidden = !cust;
  renderDg();
  $('#dgModal').hidden = false;
  $('#dgBase').focus();
}
function opts(from, to, label, sel) {
  var s = '';
  for (var i = from; i <= to; i++) s += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + label(i) + '</option>';
  return s;
}
function renderDg() {
  $('#dgBig').innerHTML = dgSVG(dgOut(), 230, true);
  $('#dgBase').value = dgS.base;
  $('#dgBarreOn').checked = dgS.barre.on;
  $('#dgBarreRow').hidden = !dgS.barre.on;
  $('#dgBF').innerHTML = opts(dgS.base, dgS.base + 4, function (i) { return i; }, dgS.barre.fret);
  var sl = function (i) { return (6 - i) + 'ª'; };
  $('#dgBFrom').innerHTML = opts(0, 5, sl, dgS.barre.from);
  $('#dgBTo').innerHTML = opts(0, 5, sl, dgS.barre.to);
}
function closeDg() { $('#dgModal').hidden = true; dgS = null; }
function afterDg() {
  if (S.view === 'edit') refreshPreview();
  else { api.saveSong(S.song, false).catch(failSave); refreshSong(); }
}
/* ---------- Exportar ---------- */
function openExport(song) {
  $('#exTa').value = toChordPro(song);
  $('#exMsg').textContent = '';
  $('#exModal').hidden = false;
  $('#exCopy').focus();
}
/* ---------- Diagrama al pasar el mouse (o tocar) sobre un acorde ---------- */
var pop = $('#pop'), popT = null, popFor = null;
function popCtx() {
  if (S.view === 'song' && S.song) return { song: S.song, ctx: ctxFor(S.song, S.shift, S.capo) };
  if (S.view === 'edit' && S.draft) return { song: S.draft, ctx: ctxFor(S.draft, 0, 0) };
  return null;
}
function shownFor(orig) {
  var pc = popCtx(); if (!pc) return null;
  var P = positionsFor(pc.song, pc.ctx, orig);
  return P.list.length ? clone(P.list[posIndex(P)].d) : null;
}
function refreshStrip() {
  var pc = popCtx(); if (!pc) return;
  if (S.view === 'song') $('#dgStrip').innerHTML = S.dg ? stripHTML(pc.song, pc.ctx) : '';
  else $('#edDg').innerHTML = stripHTML(pc.song, pc.ctx);
}
function renderPop() {
  var pc = popCtx(); if (!pc || !popFor) return;
  var P = positionsFor(pc.song, pc.ctx, popFor.orig);
  var n = P.list.length, i = posIndex(P);
  var h = '<h3>' + esc(P.disp) + '</h3>';
  if (n) {
    h += dgSVG(P.list[i].d, 64) +
      '<div class="nav"><button class="btn sq" type="button" data-pop="prev" aria-label="Posición anterior">‹</button>' +
      '<span>' + (i + 1) + ' de ' + n + (P.list[i].custom ? ' · propio' : '') + '</span>' +
      '<button class="btn sq" type="button" data-pop="next" aria-label="Posición siguiente">›</button></div>';
  } else h += '<div class="blank">?</div><p class="hint">No hay una forma conocida para este acorde.</p>';
  if (pc.ctx.ss === 0 && editable()) h += '<button class="btn" type="button" data-pop="edit">' + (n ? 'Editar esta forma' : 'Dibujar') + '</button>';
  pop.innerHTML = h;
}
function placePop(el) {
  var r = el.getBoundingClientRect(), w = pop.offsetWidth || 112, h = pop.offsetHeight || 140;
  var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  var top = r.top - h - 6;
  if (top < 8) top = r.bottom + 6;
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
}
function showPop(el) {
  clearTimeout(popT);
  popFor = { orig: el.getAttribute('data-ch'), el: el };
  renderPop();
  pop.hidden = false;
  placePop(el);
}
function hidePop() { clearTimeout(popT); pop.hidden = true; popFor = null; }
function hidePopSoon() { clearTimeout(popT); popT = setTimeout(hidePop, 180); }

/* ---------- Eventos ---------- */
$('#goHome').addEventListener('click', function () { if (user && !denied) renderLibrary(); });
$('#newSong').addEventListener('click', function () { imp.cancel(); openEditor(null); });
$('#signOut').addEventListener('click', function () { api.signOut(); });
$('#signInTop').addEventListener('click', function () { api.signIn().catch(function (err) { toast('No se pudo iniciar sesión: ' + ((err && err.message) || 'error'), true); }); });
$('#importBtn').addEventListener('click', function () { stopAuto(); hidePop(); S.review = null; S.view = 'import'; imp.render(); });

view.addEventListener('click', function (e) {
  var t = e.target;
  if (t.id === 'signIn') { api.signIn().catch(function (err) { toast('No se pudo iniciar sesión: ' + ((err && err.message) || 'error'), true); }); return; }
  if (t.id === 'signOut2') { api.signOut(); return; }
  if (t.id === 'seed') {
    t.disabled = true;
    api.saveMany(clone(SAMPLES)).catch(failSave);
    return;
  }
  var o = t.closest('[data-open]');
  if (o) { openSong(o.getAttribute('data-open')); return; }
  var ed = t.closest('[data-edit]');
  if (ed) { var eo = ed.getAttribute('data-edit'); openDg(eo, shownFor(eo)); return; }
  var a = t.closest('[data-act]');
  if (!a) return;
  var act = a.getAttribute('data-act');
  if (act === 'back') renderLibrary();
  else if (act === 'edit') openEditor(S.id);
  else if (act === 'export') openExport(S.song);
  else if (act === 'tp') { S.shift = Math.min(11, S.shift + 1); refreshSong(); }
  else if (act === 'tm') { S.shift = Math.max(-11, S.shift - 1); refreshSong(); }
  else if (act === 't0') { S.shift = 0; S.capo = 0; refreshSong(); }
  else if (act === 'fp') { S.fs = Math.min(40, S.fs + 1); refreshSong(); }
  else if (act === 'fm') { S.fs = Math.max(9, S.fs - 1); refreshSong(); }
  else if (act === 'auto') { if (S.auto) stopAuto(); else startAuto(); }
});
view.addEventListener('input', function (e) {
  var id = e.target.id;
  if (id === 'q') { S.q = e.target.value; fillList(); }
  else if (id === 'dur') { S.dur = parseInt(e.target.value, 10); $('#durv').textContent = fmtDur(S.dur); }
  else if (S.view === 'edit' && /^f(Title|Artist|Key|Tuning|Status|Body)$/.test(id)) { readForm(); refreshPreview(); }
});
view.addEventListener('change', function (e) {
  var id = e.target.id;
  if (id === 'capo') { S.capo = parseInt(e.target.value, 10); refreshSong(); }
  else if (id === 'dgToggle') { S.dg = e.target.checked; refreshSong(); }
});
view.addEventListener('submit', function (e) {
  e.preventDefault();
  if (S.view !== 'edit') return;
  readForm();
  var d = S.draft;
  if (!d.title.trim()) d.title = 'Sin título';
  d.doubts = countDoubts(parseBody(d.body));
  if (S.review) {
    if (d.status === 'pendiente') d.status = d.doubts ? 'dudas' : 'revisada';
    api.saveSong(d, true).catch(failSave);
    var rv = S.review; S.review = null;
    rv.onSave(d);
    return;
  }
  api.saveSong(d, S.isNew).catch(failSave);
  showSong(d);
});
var delArmed = null;
view.addEventListener('click', function (e) {
  if (e.target.id === 'edSkip' && S.review) { var r1 = S.review; S.review = null; r1.onSkip(); }
  else if (e.target.id === 'edAbort' && S.review) { var r2 = S.review; S.review = null; r2.onAbort(); }
  else if (e.target.getAttribute && e.target.getAttribute('data-rev')) revGo(e.target.getAttribute('data-rev') === 'next' ? 1 : -1);
  else if (e.target.id === 'edCancel') { if (S.isNew) renderLibrary(); else showSong(S.song); }
  else if (e.target.id === 'edDel') {
    var b = e.target;
    if (!delArmed) {
      b.textContent = 'Confirmar: eliminar para siempre';
      delArmed = setTimeout(function () { delArmed = null; if (b.isConnected) b.textContent = 'Eliminar canción'; }, 4000);
    } else {
      clearTimeout(delArmed); delArmed = null;
      api.deleteSong(S.draft.id).catch(failSave);
      renderLibrary();
    }
  }
});

/* Diagrama emergente */
view.addEventListener('mouseover', function (e) { var c = e.target.closest('[data-ch]'); if (c) showPop(c); });
view.addEventListener('mouseout', function (e) { if (e.target.closest('[data-ch]')) hidePopSoon(); });
view.addEventListener('click', function (e) { var c = e.target.closest('[data-ch]'); if (c) showPop(c); });
view.addEventListener('keydown', function (e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-ch]')) { e.preventDefault(); showPop(e.target); }
});
pop.addEventListener('mouseenter', function () { clearTimeout(popT); });
pop.addEventListener('mouseleave', hidePopSoon);
pop.addEventListener('click', function (e) {
  var b = e.target.closest('[data-pop]'); if (!b || !popFor) return;
  var act = b.getAttribute('data-pop');
  var pc = popCtx(); if (!pc) return;
  var P = positionsFor(pc.song, pc.ctx, popFor.orig);
  if (act === 'prev' || act === 'next') {
    S.pos[P.disp] = posIndex(P) + (act === 'next' ? 1 : -1);
    renderPop(); refreshStrip();
  } else if (act === 'edit') {
    var o = popFor.orig, d = P.list.length ? clone(P.list[posIndex(P)].d) : null;
    hidePop(); openDg(o, d);
  }
});
document.addEventListener('click', function (e) {
  if (pop.hidden) return;
  var path = e.composedPath ? e.composedPath() : [];
  if (path.indexOf(pop) >= 0 || pop.contains(e.target) || (e.target.closest && e.target.closest('[data-ch]'))) return;
  hidePop();
});
window.addEventListener('scroll', hidePop, { passive: true });

/* Editor de diagramas */
$('#dgBig').addEventListener('click', function (e) {
  var c = e.target.closest('.cell'); if (!c || !dgS) return;
  if (c.hasAttribute('data-top')) {
    var i = parseInt(c.getAttribute('data-top'), 10);
    dgS.frets[i] = dgS.frets[i] === -1 ? 0 : -1;
  } else {
    var s = parseInt(c.getAttribute('data-i'), 10), f = dgS.base + parseInt(c.getAttribute('data-r'), 10);
    dgS.frets[s] = dgS.frets[s] === f ? 0 : f;
  }
  renderDg();
});
$('#dgBase').addEventListener('change', function (e) {
  var v = Math.max(1, Math.min(15, parseInt(e.target.value, 10) || 1));
  dgS.base = v;
  if (dgS.barre.fret < v) dgS.barre.fret = v;
  if (dgS.barre.fret > v + 4) dgS.barre.fret = v + 4;
  renderDg();
});
$('#dgBarreOn').addEventListener('change', function (e) { dgS.barre.on = e.target.checked; if (dgS.barre.on) dgS.barre.fret = Math.max(dgS.base, Math.min(dgS.base + 4, dgS.barre.fret)); renderDg(); });
$('#dgBF').addEventListener('change', function (e) { dgS.barre.fret = parseInt(e.target.value, 10); renderDg(); });
$('#dgBFrom').addEventListener('change', function (e) { dgS.barre.from = parseInt(e.target.value, 10); if (dgS.barre.to < dgS.barre.from) dgS.barre.to = dgS.barre.from; renderDg(); });
$('#dgBTo').addEventListener('change', function (e) { dgS.barre.to = parseInt(e.target.value, 10); if (dgS.barre.from > dgS.barre.to) dgS.barre.from = dgS.barre.to; renderDg(); });
$('#dgSave').addEventListener('click', function () {
  dgTarget.diagrams = dgTarget.diagrams || {};
  dgTarget.diagrams[dgS.orig] = dgOut();
  closeDg(); afterDg();
});
$('#dgDel').addEventListener('click', function () {
  if (dgTarget.diagrams) delete dgTarget.diagrams[dgS.orig];
  closeDg(); afterDg();
});
$('#dgCancel').addEventListener('click', closeDg);

/* Exportar */
$('#exClose').addEventListener('click', function () { $('#exModal').hidden = true; });
$('#exCopy').addEventListener('click', function () {
  var ta = $('#exTa');
  var done = function () { $('#exMsg').textContent = 'Copiado.'; };
  var fb = function () { ta.focus(); ta.select(); $('#exMsg').textContent = 'Selecciona y copia con Ctrl+C o Cmd+C.'; };
  try { navigator.clipboard.writeText(ta.value).then(done, fb); } catch (err) { fb(); }
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { hidePop(); if (!$('#dgModal').hidden) closeDg(); if (!$('#exModal').hidden) $('#exModal').hidden = true; }
});
[$('#dgModal'), $('#exModal')].forEach(function (m) {
  m.addEventListener('click', function (e) { if (e.target === m) { if (m.id === 'dgModal') closeDg(); else m.hidden = true; } });
});

api.onAuth(applyAuth);
}
