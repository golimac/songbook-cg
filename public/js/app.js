import {
  parseChord, chordToString, transposeChord, parseKey, flatsFor, keyName, parseBody, collectChords,
  countDoubts, hasUntransposable, inferKey, segTokens, shapesFor, shapeFor, diagramFor, toChordPro, listDoubts, chordsAbove, chordHint, setUserShapes, chordKey, fillTab, catalogNames, catQual, nameShape
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
    body: '{intro: F - Bb - C4 - C}\n\n[F]Marea baja, [Bb]barcos sin prisa\n[Gm7]el muelle cuenta [C4]lo que el agua [C]dejó\n[F]Una gaviota [F/A]cruza la bahía\n[Bb]y el faro se queda [Bdim7]solo con su luz [C]\n\n{c: Final, con el acorde de novena}\n[Dm]Vuelve la sal, [Bb7/9]vuelve el color\n[Bb]y la tarde se [C]aquieta [F]' }
];

/* ---------- Estado ---------- */
var chordLib = {};         // biblioteca de acordes: nombre -> [{frets, base, barre}]
var songs = [];            // datos livianos de la lista, en vivo desde Firestore
var listLoaded = false;
var user = null, unsub = null, denied = false;
/* Letra: 16 px en pantallas táctiles (iPad en el atril), 14 px con ratón */
function defaultFs() { try { return window.matchMedia('(pointer: coarse)').matches ? 16 : 14; } catch (e) { return 14; } }
var S = { view: 'library', id: null, song: null, shift: 0, capo: 0, fs: defaultFs(), dg: true, auto: false, dur: 150, q: '', draft: null, isNew: false, pos: {}, review: null, revI: 0 };
var view = $('#view');
function editable() { return !!user; }
/* Los botones de forma principal y de editar diagramas salen solo con el editor de la canción abierto, no al leer. */
function inEdit() { return !!user && S.view === 'edit'; }
function cur() { return S.view === 'edit' ? S.draft : S.song; }
function failSave(e) { toast((e && e.code === 'permission-denied') ? 'Esta cuenta no tiene permiso para editar.' : 'No se pudo guardar: ' + ((e && e.message) || 'error desconocido'), true); }
var imp = createImporter({
  view: view, esc: esc, toast: toast, api: api, imaging: cfg.imaging || realImaging, extractText: cfg.extractText, uid: uid,
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
/* Las marcas de duda son del editor: el invitado ve los acordes normales. */
function dbt(flag) { return flag && editable() ? ' doubt' : ''; }
function tokHTML(tokens, ctx) {
  return tokens.map(function (t) {
    if (t.type === 'chord') return '<span class="ch' + dbt(t.chord.doubt) + '"' + chAttr(t.chord) + '>' + esc(dc(t.chord, ctx)) + '</span>';
    if (t.type === 'doubt') return '<span class="ch' + dbt(true) + '"' + (editable() ? ' title="Lectura dudosa"' : '') + '>' + esc(t.text) + '</span>';
    if (t.type === 'fig') return '<span class="fig' + dbt(t.incomplete) + '" title="Figura cuerda-traste, no se transpone">' + esc(t.text) + '</span>';
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
      var p = parseChord(s.chord), st = p ? null : segTokens(s.chord);
      if (st) c = '<span class="c cs">' + tokHTML(st, ctx) + '</span>';
      else c = p ? '<span class="c' + dbt(p.doubt) + '"' + chAttr(p) + '>' + esc(dc(p, ctx)) + '</span>'
            : '<span class="c' + dbt(true) + '"' + (editable() ? ' title="Lectura dudosa"' : '') + '>' + esc(s.chord) + '</span>';
    } else c = '<span class="c"> </span>';
    return '<span class="seg">' + c + '<span class="t">' + esc(s.text) + '</span></span>';
  }).join('') + '</div>';
}
function fillHTML(b) {
  var ed = editable();
  var tab = fillTab(b.steps, function (n, t) { return ed && n.doubt ? '<span class="fn doubt">' + esc(t) + '</span>' : esc(t); });
  var bad = ed ? b.steps.reduce(function (a, st) { return a.concat(st.notes.filter(function (n) { return n.bad; })); }, []) : [];
  return '<div class="fill"><span class="lab">' + esc(b.label) + '</span><pre class="tab">' + tab + '</pre>' +
    (bad.length ? '<div class="fillbad">No se pudo leer: ' + bad.map(function (n) { return '<span class="fn doubt">' + esc(n.text) + '</span>'; }).join(' ') + '</div>' : '') + '</div>';
}
function blocksHTML(blocks, ctx, mode) {
  return blocks.map(function (b) {
    switch (b.type) {
      case 'gap': return '<div class="gap"></div>';
      case 'note': return '<div class="note">' + esc(b.text) + '</div>';
      case 'alt': return mode === 'edit' ? '<div class="alt">alternativa · ' + esc(b.text) + '</div>' : '';
      case 'fill': return fillHTML(b);
      case 'tab': return '<pre class="tab">' + esc(b.lines.join('\n')) + '</pre>';
      case 'chords':
        return b.label || b.cont
          ? '<div class="cl lb' + (b.cont ? ' cont' : '') + '"><span class="lab">' + esc(b.label) + '</span><span class="clt">' + tokHTML(b.tokens, ctx) + '</span></div>'
          : '<div class="cl">' + tokHTML(b.tokens, ctx) + '</div>';
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
  /* La posición que el editor fijó como principal en esta canción va primero (solo en la tonalidad original). */
  var pref = ctx.ss === 0 && song.prefs && song.prefs[orig];
  if (pref) {
    var at = -1;
    list.forEach(function (x, i) { if (at < 0 && x.d.frets.join(',') === pref) at = i; });
    if (at > 0) list.unshift(list.splice(at, 1)[0]);
  }
  return { disp: disp, list: list, pref: !!pref };
}
function posIndex(P) {
  var n = P.list.length;
  return n ? (((S.pos[P.disp] || 0) % n) + n) % n : 0;
}
function stripHTML(song, ctx, ro) {
  var can = !ro && ctx.ss === 0 && inEdit();
  return collectChords(ctx.blocks).map(function (it) {
    var P = positionsFor(song, ctx, it.orig);
    var tag = can ? 'button' : 'div';
    var attr = can ? ' data-edit="' + esc(it.orig) + '" type="button"' : '';
    if (P.list.length) {
      var cur = P.list[posIndex(P)];
      return '<' + tag + ' class="dg"' + attr + (cur.custom ? ' data-own="1"' : '') + '>' + dgSVG(cur.d) + '<b>' + esc(P.disp) + '</b><i>&nbsp;</i></' + tag + '>';
    }
    return '<' + tag + ' class="dg none"' + attr + '><div class="blank">?</div><b>' + esc(P.disp) + '</b><i>' + (can ? 'dibujar' : 'sin forma') + '</i></' + tag + '>';
  }).join('');
}

/* ---------- Biblioteca ---------- */
var STATUS = { pendiente: ['Pendiente', ''], dudas: ['Con dudas', 'warn'], revisada: ['Revisada', 'ok'] };
/* La portada reúne los accesos; la lista completa vive solo en "Todas". */
var LIB = { page: 'home', artist: '', jump: '', chord: '' }; /* home | nuevas | todas | artistas | artista | pendientes */
var RV_KEY = 'songbookcg.vistas';
function vistas() { try { return JSON.parse(window.localStorage.getItem(RV_KEY) || '[]'); } catch (e) { return []; } }
function marcarVista(id) {
  try { window.localStorage.setItem(RV_KEY, JSON.stringify([id].concat(vistas().filter(function (x) { return x !== id; })).slice(0, 24))); } catch (e) { /* sin almacenamiento */ }
}
/* Direcciones: /c/<id> abre una canción; / es la biblioteca. */
var curUrl = window.location.pathname;
function setUrl(p) { if (p === curUrl) return; try { window.history.pushState(null, '', p); } catch (e) { /* sin historial */ } curUrl = p; }
function pathId() { var m = /^\/c\/([^\/]+)\/?$/.exec(window.location.pathname); return m ? decodeURIComponent(m[1]) : ''; }
S.pendingId = pathId();
function routeSong(id) {
  if (!listLoaded) { S.pendingId = id; return; }
  if (songs.some(function (s) { return s.id === id; })) { openSong(id); return; }
  imp.cancel(); stopAuto(); hidePop(); S.review = null; S.view = 'library'; S.song = null; S.opening = '';
  document.title = 'Songbook CG';
  view.innerHTML = '<div class="login"><h1>Canción no disponible</h1><p class="hint">Este enlace no corresponde a ninguna canción que puedas ver.</p>' +
    '<button class="btn primary" type="button" data-lib="home">Ir a la biblioteca</button></div>';
}
function copyLink() {
  var url = window.location.origin + '/c/' + encodeURIComponent(S.id);
  var msg = 'Enlace copiado.' + (editable() && S.song && S.song.status !== 'revisada' ? ' Los invitados solo la verán cuando esté revisada.' : '');
  function fallback() {
    var ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var okc = false; try { okc = document.execCommand('copy'); } catch (e) { /* sin copiar */ }
    document.body.removeChild(ta);
    toast(okc ? msg : 'Copia este enlace: ' + url, !okc);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { toast(msg); }, fallback); else fallback();
}
function renderLibrary() {
  if (!S.pendingId) setUrl('/');
  document.title = 'Songbook CG';
  imp.cancel(); stopAuto(); hidePop();
  S.review = null;
  S.view = 'library'; S.song = null; S.opening = '';
  view.innerHTML = '<div id="lib"></div>';
  var jumping = !!LIB.jump;
  fillList();
  if (!jumping) window.scrollTo(0, 0);
}
function songItem(s, sub) {
  var n = s.doubts || 0;
  var st = STATUS[s.status] || STATUS.pendiente;
  return '<button class="item" data-open="' + esc(s.id) + '"><span class="it-title">' + esc(s.title) + '</span>' +
    '<span class="it-chips">' + (parseKey(s.key) ? '<span class="chip">' + esc(s.key) + '</span>' : '') +
    (editable() ? (n ? '<span class="chip warn">' + n + (n === 1 ? ' duda' : ' dudas') + '</span>' : '') +
    '<span class="chip ' + st[1] + '">' + st[0] + '</span>' : '') + '</span>' +
    (sub ? '<span class="it-sub">' + esc(sub) + '</span>' : '') + '</button>';
}
/* Versiones de una misma canción (mismo título y artista) quedan juntas en un marco */
function itemsHTML(list, withArtist) {
  var out = [], i = 0;
  while (i < list.length) {
    var k = norm(list[i].title) + '|' + norm(list[i].artist), j = i;
    while (j < list.length && norm(list[j].title) + '|' + norm(list[j].artist) === k) j++;
    var grp = list.slice(i, j).map(function (s) { return songItem(s, withArtist || artistParts(s.artist).length > 1 ? artistLabel(s) : ''); }).join('');
    out.push(j - i > 1 ? '<div class="vgroup"><span class="vg-l">' + (j - i) + ' versiones</span>' + grp + '</div>' : grp);
    i = j;
  }
  return out.join('');
}
function byTitle(a, b) { return String(a.title).localeCompare(String(b.title), 'es') || String(a.artist).localeCompare(String(b.artist), 'es'); }
function letterOf(t) { var c = norm(t).replace(/[^a-z0-9]/g, '').charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; }
/* Varios artistas se separan con ";": cada uno cuenta aparte en el índice de Artistas. */
function artistParts(str) { return String(str || '').split(';').map(function (x) { return x.trim(); }).filter(Boolean); }
function artistsOf(s) { var p = artistParts(s.artist); return p.length ? p : ['Sin artista']; }
function artistLabel(s) { return artistParts(s.artist).join('; '); }
function artistGroups() { var m = artistIndex(), by = {}; Object.keys(m).forEach(function (k) { by[m[k].name] = m[k].songs; }); return by; }
function hasArtist(s, name) { var k = norm(name); return artistsOf(s).some(function (a) { return norm(a) === k; }); }
function artistIndex() {
  var map = {};
  songs.slice().sort(byTitle).forEach(function (s) {
    var seen = {};
    artistsOf(s).forEach(function (a) {
      var k = norm(a); if (seen[k]) return; seen[k] = 1;
      (map[k] = map[k] || { name: a, songs: [] }).songs.push(s);
    });
  });
  return map;
}
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
function crumb(back, title, count) {
  return '<div class="crumb"><button type="button" class="btn" data-lib="' + back[0] + '">← ' + back[1] + '</button><h1>' + esc(title) + (count != null ? '<span>' + count + '</span>' : '') + '</h1></div>';
}
var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

/* Marca de tiempo en milisegundos; null significa que el servidor aún la está escribiendo (recién creada). */
function stamp(s) {
  var v = s.createdAt != null ? s.createdAt : s.updatedAt;
  if (v == null) return s.createdAt === null ? Date.now() : 0;
  return typeof v.toMillis === 'function' ? v.toMillis() : Number(v) || 0;
}
function ago(ms) {
  if (!ms) return '';
  var m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return 'ahora';
  if (m < 60) return 'hace ' + m + ' min';
  var h = Math.round(m / 60); if (h < 24) return 'hace ' + h + ' h';
  var d = Math.round(h / 24); if (d < 31) return 'hace ' + d + (d === 1 ? ' día' : ' días');
  var mo = Math.round(d / 30); return mo < 12 ? 'hace ' + mo + (mo === 1 ? ' mes' : ' meses') : 'hace más de un año';
}
function safeCover(u) { return /^https:\/\/[^\s"'<>]+$/.test(u || '') ? u : ''; }
function avatar(name, cover) {
  if (safeCover(cover)) return '<img class="av cv" src="' + esc(cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
  var h = 0, t = String(name || '?'); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360;
  var c = norm(t).replace(/[^a-z0-9]/g, '').charAt(0).toUpperCase() || '♪';
  return '<span class="av" style="--h:' + h + '" aria-hidden="true">' + c + '</span>';
}
var HOME_N = 7;
function miniSong(s, meta) {
  return '<button type="button" class="mini" data-open="' + esc(s.id) + '">' + avatar(artistParts(s.artist)[0] || s.title, s.cover) +
    '<span class="mi-t"><b>' + esc(s.title) + '</b><i>' + esc(artistLabel(s) || 'Sin artista') + '</i></span>' +
    '<span class="mi-m">' + esc(meta || '') + '</span></button>';
}
function homeBox(cls, title, count, icon, rows, more, empty) {
  return '<section class="box ' + cls + '"><header><span class="bx-i" aria-hidden="true">' + icon + '</span><h2>' + title + '</h2><span class="bx-n">' + count + '</span></header>' +
    '<div class="bx-l">' + (rows || '<p class="bx-e">' + empty + '</p>') + '</div>' +
    (more ? '<button type="button" class="more" data-lib="' + more + '">Ver más <span aria-hidden="true">→</span></button>' : '') + '</section>';
}
var IC = {
  new: '<svg viewBox="0 0 24 24"><path d="M12 3l2.1 5.4L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.9-.6z"/></svg>',
  todas: '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  art: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/></svg>',
  pend: '<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/></svg>',
  ch: '<svg viewBox="0 0 24 24"><path d="M6 3v18M12 3v18M18 3v18M4 7h16M4 13h16"/><circle cx="12" cy="10" r="1.6"/></svg>',
  seen: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
};
/* Todos los acordes de la biblioteca: los del catálogo, los de tus canciones y los que tengan lista guardada */
function chordNames() {
  var seen = {}, out = [];
  function add(n) {
    var c = parseChord(n); if (!c || c.star || c.doubt) return;
    var k = chordKey(c), pcs = chordPcOf(c) + '|' + libQual(c.qual) + '|' + (c.bass || '');
    if (seen[pcs]) return;
    seen[pcs] = 1; out.push(k);
  }
  Object.keys(chordLib).forEach(add);
  catalogNames().forEach(function (n) {
    add(n);
    if (/^[A-G][#b]?sus[24]$/.test(n)) add(n.replace(/sus/, ''));
  });
  songs.forEach(function (s) { (Array.isArray(s.chords) ? s.chords : []).forEach(add); });
  return out.sort(function (a, b) {
    var ca = parseChord(a), cb = parseChord(b);
    return (chordPcOf(ca) - chordPcOf(cb)) || (a < b ? -1 : a > b ? 1 : 0);
  });
}
function chordPcOf(c) { var k = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[c.root] + (c.acc === '#' ? 1 : c.acc === 'b' ? -1 : 0); return (k + 12) % 12; }
/* Identidad de un acorde sin importar cómo se escriba (A4 = Asus4, C+ = Caug, D/A = D/A) */
/* A4 y Asus4 son acordes distintos para el cancionero (igual C4 y Csus4); el resto de escrituras equivalen */
function libQual(q) { return q === '4' || q === '2' ? q : catQual(q); }
function eqKey(name) {
  var c = parseChord(name); if (!c || c.star || c.doubt) return '';
  return chordPcOf(c) + '|' + libQual(c.qual) + '|' + (c.bass || '');
}
function libKey(name) {
  var c = parseChord(name); if (!c) return name;
  var ks = Object.keys(chordLib);
  for (var i = 0; i < ks.length; i++) { var o = parseChord(ks[i]); if (o && chordKey(o) !== chordKey(c) && sameChord(o, c) && chordLib[ks[i]].length) return ks[i]; }
  return chordKey(c);
}
function sameChord(a, b) { return chordPcOf(a) === chordPcOf(b) && libQual(a.qual) === libQual(b.qual) && (a.bass || '') === (b.bass || ''); }
function cpShape(d) { return { frets: d.frets.slice(), base: d.base || 1, barre: d.barre ? { fret: d.barre.fret, from: d.barre.from, to: d.barre.to } : null }; }
/* Posiciones de un acorde tal como las ve la biblioteca: la lista guardada, o las del catálogo si nunca se tocó */
function curShapes(name) {
  if (chordLib[name] && chordLib[name].length) return chordLib[name].map(cpShape);
  var c = parseChord(name);
  return c ? shapesFor(c, true).map(cpShape) : [];
}
function chordBox() {
  if (!editable()) return '';
  return '<button type="button" class="box chlink b-ch" data-lib="acordes"><span class="bx-i" aria-hidden="true">' + IC.ch + '</span>' +
    '<b class="chl-t">Biblioteca de acordes</b><span class="bx-n">' + plural(chordNames().length, 'acorde', 'acordes') + '</span><span class="chl-go" aria-hidden="true">→</span></button>';
}
function chordDetailHTML(key) {
  var c = parseChord(key); if (!c) return '';
  var lk = libKey(key), list = curShapes(lk);
  var ed = editable(), stored = !!(chordLib[lk] && chordLib[lk].length);
  var h = '<section class="chdet" id="chdet"><header><h2>' + esc(key) + '</h2><span class="hint">' + plural(list.length, 'posición', 'posiciones') + '</span>' +
    '<button type="button" class="btn" data-chsee="">Cerrar</button></header>';
  if (!list.length) h += '<p class="bx-e">No hay posiciones conocidas para este acorde.' + (ed ? ' Dibuja la primera.' : '') + '</p>';
  h += '<div class="chshapes">';
  list.forEach(function (d, i) {
    h += '<figure>' + dgSVG(d, 80) + (ed ? '<span class="grp"><button type="button" class="btn" data-chedit="' + esc(lk) + '" data-i="' + i + '">Editar</button>' +
      '<button type="button" class="btn danger" data-chdel="' + esc(lk) + '" data-i="' + i + '">Quitar</button></span>' : '') + '</figure>';
  });
  h += '</div>' + (ed ? '<div class="actions"><button type="button" class="btn primary" data-chadd="' + esc(lk) + '">Agregar una posición</button>' +
    (stored && shapesFor(c, true).length ? '<button type="button" class="btn" data-chreset="' + esc(lk) + '">Volver a las posiciones originales</button>' : '') + '</div>' : '') + '</section>';
  return h;
}
function acordesHTML() {
  var names = chordNames();
  var h = crumb(['home', 'Inicio'], 'Biblioteca de acordes', names.length);
  h += '<form class="chadd" id="chAdd"><label class="f">Buscar acorde<input type="text" id="chName" autocomplete="off" placeholder="Por ejemplo Am7, C4 o C/G" value="' + esc(LIB.chord || '') + '"></label>' +
    '<button class="btn primary" type="submit">Ver posiciones</button><span class="hint" id="chMsg" role="status"></span>' +
    (editable() ? '<button type="button" class="btn chscan" id="chScan" title="Revisa tus canciones y trae a la biblioteca los diagramas que dibujaste en ellas">Traer diagramas</button>' : '') + '</form>' +
    (editable() ? '<p class="hint chprog" id="chProg" role="status"></p>' : '');
  if (LIB.chord) h += chordDetailHTML(LIB.chord);
  return h + '<div class="chgrid">' + names.map(function (n) {
    var list = curShapes(libKey(n));
    return '<article class="chcard" data-n="' + esc(n.toLowerCase()) + '" data-k="' + esc(eqKey(n)) + '"><h3><button type="button" class="lnk" data-chsee="' + esc(n) + '">' + esc(n) + '</button></h3><div class="chshapes">' + list.slice(0, 4).map(function (d) {
      return '<figure>' + dgSVG(d, 64) + '</figure>';
    }).join('') + (list.length > 4 ? '<span class="hint">+' + (list.length - 4) + ' más</span>' : '') + '</div></article>';
  }).join('') + '</div><p class="bx-e" id="chNone" hidden>Ningún acorde de la lista coincide. Pulsa «Ver posiciones» para abrirlo o agregarlo.</p>';
}
/* Diagramas dibujados dentro de las canciones: pasan a la biblioteca como posiciones de su acorde */
function harvestDiagrams(list) {
  var changed = {};
  list.forEach(function (dg) {
    Object.keys(dg || {}).forEach(function (orig) {
      var d = dg[orig], c = parseChord(orig);
      if (!c || c.star || !d || !d.frets || d.frets.length !== 6) return;
      var lk = libKey(orig), shapes = changed[lk] || curShapes(lk), f = d.frets.join(',');
      if (shapes.some(function (x) { return x.frets.join(',') === f; })) return;
      shapes.push(cpShape(d)); changed[lk] = shapes;
    });
  });
  var ks = Object.keys(changed);
  ks.forEach(function (k) { chordLib[k] = changed[k]; api.saveChord(k, changed[k]).catch(failSave); });
  if (ks.length) onChords();
  return ks.length;
}
/* Acordes que usa cada canción: se guardan en la ficha; las que no los tienen se completan una vez */
function bodyChordNames(body) { return collectChords(parseBody(body || '')).map(function (x) { return x.orig; }); }
function ensureSongChords(force) {
  if (!editable() || S.chBusy || !api.setSongChords) return;
  var miss = force ? songs.slice() : songs.filter(function (s) { return !Array.isArray(s.chords) || !s.libSync; });
  if (!miss.length) { if (force) { var e0 = $('#chProg'); if (e0) e0.textContent = 'No hay canciones para revisar.'; } return; }
  S.chBusy = true;
  var fails = 0, added = 0, firstErr = '';
  function prog(t) { var el = $('#chProg'); if (el) el.textContent = t; }
  (function next(i) {
    if (i >= miss.length) {
      S.chBusy = false;
      prog(fails ? 'No se pudieron revisar ' + plural(fails, 'canción', 'canciones') + (firstErr ? ' (' + firstErr + ')' : '') + '.'
        : force ? 'Listo: ' + plural(miss.length, 'canción revisada', 'canciones revisadas') + ', ' + plural(added, 'posición nueva', 'posiciones nuevas') + ' en la biblioteca.' : '');
      if (S.view === 'library' && LIB.page === 'acordes' && !force) fillList();
      return;
    }
    var s = miss[i];
    prog('Revisando canciones… ' + (i + 1) + ' de ' + miss.length);
    api.getBody(s.id).then(function (b) {
      var list = bodyChordNames(b && b.body);
      added += harvestDiagrams([b && b.diagrams]);
      s.chords = list; s.libSync = true;
      return api.setSongChords(s.id, list);
    }).then(function () { next(i + 1); }, function (er) { fails++; if (!firstErr) firstErr = (er && (er.code || er.message)) || 'error'; next(i + 1); });
  })(0);
}
function homeHTML() {
  var byId = {}; songs.forEach(function (s) { byId[s.id] = s; });
  var seen = vistas().map(function (id) { return byId[id]; }).filter(Boolean).slice(0, 8);
  var have = {}; songs.forEach(function (s) { have[letterOf(s.title)] = 1; });
  var by = artistGroups();
  var names = Object.keys(by);
  var pendList = songs.filter(function (s) { return s.status !== 'revisada'; }).sort(byTitle);
  var nuevas = songs.slice().sort(function (a, b) { return stamp(b) - stamp(a) || byTitle(a, b); });
  var top = names.filter(function (a) { return a !== 'Sin artista'; }).sort(function (a, b) { return by[b].length - by[a].length || a.localeCompare(b, 'es'); }).concat(by['Sin artista'] ? ['Sin artista'] : []);
  return '<section class="hero"><div class="hero-t"><h1>Tu cancionero</h1><p>' + plural(songs.length, 'canción', 'canciones') + ' · ' + plural(names.length, 'artista', 'artistas') + '</p></div>' +
      '<svg class="hero-fb" viewBox="0 0 320 90" aria-hidden="true" preserveAspectRatio="xMaxYMid slice">' +
      [0, 1, 2, 3, 4, 5].map(function (i) { return '<line x1="0" x2="320" y1="' + (10 + i * 14) + '" y2="' + (10 + i * 14) + '" stroke-width="' + (0.8 + i * 0.35) + '"/>'; }).join('') +
      [40, 100, 155, 205, 250, 292].map(function (x) { return '<line class="fr" x1="' + x + '" x2="' + x + '" y1="10" y2="80"/>'; }).join('') +
      '<circle cx="127" cy="31" r="5"/><circle cx="180" cy="59" r="5"/><circle cx="228" cy="45" r="5"/><circle cx="73" cy="17" r="5"/></svg></section>' +
    '<div class="azrow" role="group" aria-label="Ir a la letra">' + LETTERS.map(function (L) {
      return '<button type="button" class="az" data-letter="' + L + '"' + (have[L] ? '' : ' disabled') + '>' + L + '</button>';
    }).join('') + '</div>' +
    '<section class="box seenbox"><header><span class="bx-i" aria-hidden="true">' + IC.seen + '</span><h2>Visto recientemente</h2></header>' +
      (seen.length ? '<div class="vstrip">' + seen.map(function (s) {
        return '<button class="vcard" data-open="' + esc(s.id) + '">' + avatar(artistParts(s.artist)[0] || s.title, s.cover) + '<span class="it-title">' + esc(s.title) + '</span>' +
          '<span class="vc-sub">' + esc(artistLabel(s)) + '</span>' + (parseKey(s.key) ? '<span class="chip">' + esc(s.key) + '</span>' : '') + '</button>';
      }).join('') + '</div>' : '<p class="bx-e">Aquí quedan las últimas canciones que abras en este dispositivo.</p>') + '</section>' +
    '<div class="boxes">' +
      homeBox('b-new', 'Nuevas', '', IC.new, nuevas.slice(0, HOME_N).map(function (s) { return miniSong(s, parseKey(s.key) ? s.key : ''); }).join(''), 'nuevas', '') +
      (editable() && pendList.length ? homeBox('b-pend', 'Pendientes', pendList.length + ' por revisar', IC.pend, pendList.slice(0, HOME_N).map(function (s) { return miniSong(s, parseKey(s.key) ? s.key : ''); }).join(''), pendList.length > HOME_N ? 'pendientes' : '', '') : '') +
      homeBox('b-todas', 'Todas', plural(songs.length, 'canción', 'canciones'), IC.todas, songs.slice().sort(byTitle).slice(0, HOME_N).map(function (s) { return miniSong(s, parseKey(s.key) ? s.key : ''); }).join(''), 'todas', '') +
      homeBox('b-art', 'Artistas', plural(names.length, 'artista', 'artistas'), IC.art, top.slice(0, HOME_N).map(function (a) {
        return '<button type="button" class="mini" data-artist="' + esc(a) + '">' + avatar(a) + '<span class="mi-t"><b>' + esc(a) + '</b></span><span class="mi-m">' + plural(by[a].length, 'canción', 'canciones') + '</span></button>';
      }).join(''), 'artistas', '') +
      chordBox() +
    '</div>';
}
function nuevasHTML() {
  var list = songs.slice().sort(function (a, b) { return stamp(b) - stamp(a) || byTitle(a, b); });
  return crumb(['home', 'Inicio'], 'Nuevas', list.length) + '<div class="list">' + list.map(function (s) { return songItem(s, artistLabel(s)); }).join('') + '</div>';
}
function todasHTML() {
  var items = songs.slice().sort(byTitle), groups = {}, letters = [];
  items.forEach(function (s) { var L = letterOf(s.title); if (!groups[L]) { groups[L] = []; letters.push(L); } groups[L].push(s); });
  return crumb(['home', 'Inicio'], 'Todas', items.length) + '<div class="libbody"><div class="list">' +
    letters.map(function (L) { return '<h2 class="lg" id="g-' + (L === '#' ? 'num' : L) + '">' + L + '</h2>' + itemsHTML(groups[L], true); }).join('') +
    '</div><nav class="rail" aria-label="Ir a la letra">' + (items.length >= 24
      ? letters.map(function (L) { return '<button type="button" data-jump="' + (L === '#' ? 'num' : L) + '" aria-label="Ir a ' + L + '">' + L + '</button>'; }).join('') : '') + '</nav></div>';
}
function artistasHTML() {
  var by = artistGroups();
  var names = Object.keys(by).sort(function (a, b) {
    if (a === 'Sin artista') return 1; if (b === 'Sin artista') return -1;
    return a.localeCompare(b, 'es');
  });
  return crumb(['home', 'Inicio'], 'Artistas', names.length) + '<div class="agrid">' + names.map(function (a) {
    return '<button type="button" class="artist" data-artist="' + esc(a) + '"><span>' + esc(a) + '</span><i>' + by[a].length + '</i></button>';
  }).join('') + '</div>';
}
function artistaHTML() {
  var list = songs.filter(function (s) { return hasArtist(s, LIB.artist); }).sort(byTitle);
  return crumb(['artistas', 'Artistas'], LIB.artist, list.length) + '<div class="list">' + itemsHTML(list, false) + '</div>';
}
function pendientesHTML() {
  var list = songs.filter(function (s) { return s.status !== 'revisada'; }).sort(byTitle);
  return crumb(['home', 'Inicio'], 'Pendientes', list.length) +
    (list.length ? '<div class="list">' + itemsHTML(list, true) + '</div>' : '<p class="hint">No tienes canciones por revisar.</p>');
}
function resultsHTML(q) {
  var words = norm(q).split(/\s+/).filter(Boolean);
  var list = songs.filter(function (s) {
    var hay = norm(s.title + ' ' + s.artist);
    return words.every(function (w) { return hay.indexOf(w) >= 0; });
  }).sort(byTitle);
  return '<div class="crumb"><button type="button" class="btn" data-lib="clear">Limpiar búsqueda</button><p class="count" id="count">' + plural(list.length, 'resultado', 'resultados') + '</p></div>' +
    (list.length ? '<div class="list">' + itemsHTML(list, true) + '</div>' : '<p class="hint">No hay canciones que coincidan.</p>');
}
function fillList() {
  if (S.view !== 'library') return;
  var box = $('#lib'); if (!box) return;
  if (!listLoaded) { box.innerHTML = '<p class="hint">Cargando biblioteca…</p>'; return; }
  if (!songs.length && LIB.page !== 'acordes') {
    box.innerHTML = editable()
      ? '<div class="empty"><p>La biblioteca está vacía. Agrega una canción con el botón de arriba, o carga tres canciones de ejemplo para probar la aplicación.</p>' +
        '<button class="btn" id="seed">Cargar canciones de ejemplo</button></div>'
      : '<div class="empty"><p>La biblioteca está vacía.</p></div>';
    return;
  }
  if ((LIB.page === 'pendientes' || LIB.page === 'acordes') && !editable()) LIB.page = 'home';
  if (LIB.page === 'acordes') ensureSongChords();
  var page = LIB.page === 'artista' && !songs.some(function (s) { return hasArtist(s, LIB.artist); }) ? 'artistas' : LIB.page;
  box.innerHTML = S.q.trim() ? resultsHTML(S.q)
    : page === 'todas' ? todasHTML() : page === 'artistas' ? artistasHTML() : page === 'artista' ? artistaHTML()
    : page === 'pendientes' ? pendientesHTML() : page === 'nuevas' ? nuevasHTML() : page === 'acordes' ? acordesHTML() : homeHTML();
  if (LIB.jump) {
    var g = document.getElementById('g-' + (LIB.jump === '#' ? 'num' : LIB.jump));
    LIB.jump = '';
    if (g && g.scrollIntoView) g.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
  }
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
  user = u; denied = false; LIB.page = 'home'; LIB.artist = '';
  if (unsub) { unsub(); unsub = null; }
  songs = []; listLoaded = false;
  var on = !!u;
  $('#who').hidden = !on; $('#who').textContent = on ? u.email : '';
  $('#signOut').hidden = !on; $('#newSong').hidden = !on; $('#importBtn').hidden = !on; $('#signInTop').hidden = on;
  renderLibrary();
  unsub = api.subscribeSongs(function (list) {
    songs = user ? list : list.filter(function (s) { return s.status === 'revisada'; }); listLoaded = true;
    fillList();
    if (S.pendingId) { var pid = S.pendingId; S.pendingId = ''; routeSong(pid); }
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
  S.opening = id;
  api.getBody(id).then(function (b) {
    if (S.opening !== id) return;
    showSong(Object.assign({ diagrams: {}, prefs: {} }, meta, { body: b.body || '', diagrams: b.diagrams || {}, prefs: b.prefs || {} }));
  }, function (e) {
    toast('No se pudo abrir la canción: ' + ((e && e.message) || 'sin conexión y sin copia local'), true);
    renderLibrary();
  });
}
function albumLine(s) { return s.album ? s.album + (s.year ? ' (' + s.year + ')' : '') : s.year || ''; }
function showSong(song) {
  imp.cancel(); S.review = null; stopAuto(); hidePop();
  marcarVista(song.id);
  setUrl('/c/' + encodeURIComponent(song.id)); document.title = song.title + ' · Songbook CG';
  S.view = 'song'; S.id = song.id; S.song = song; S.shift = 0; S.capo = 0; S.pos = {};
  var capoOpts = '<option value="0">Sin cejilla</option>';
  for (var i = 1; i <= 9; i++) capoOpts += '<option value="' + i + '">Traste ' + i + '</option>';
  view.innerHTML =
    '<div class="shead"><div class="sh-t">' + (safeCover(song.cover) ? '<img class="cover" src="' + esc(song.cover) + '" alt="Carátula de ' + esc(song.album || song.title) + '" referrerpolicy="no-referrer">' : '') +
    '<div><h1>' + esc(song.title) + '</h1><p class="meta">' + esc([artistLabel(song), albumLine(song)].filter(Boolean).join(' · ')) + '</p></div></div>' +
    '<div class="actions"><button class="btn" data-act="back">Biblioteca</button><button class="btn" data-act="share">Copiar enlace</button><button class="btn" data-act="print">Imprimir</button><button class="btn" data-act="export">Exportar</button>' + (editable() ? '<button class="btn primary" data-act="edit">Editar</button>' : '') + '</div></div>' +
    '<div class="controls" id="controls">' +
      '<div class="grp"><span class="lab">Transponer</span><button class="btn sq" data-act="tm" aria-label="Bajar un semitono">−</button><output id="tval">0</output><button class="btn sq" data-act="tp" aria-label="Subir un semitono">+</button><button class="btn" data-act="t0">Original</button></div>' +
      '<div class="grp"><label class="lab" for="capo">Cejilla</label><select id="capo">' + capoOpts + '</select></div>' +
      '<div class="grp"><span class="lab">Letra</span><button class="btn sq" data-act="fm" aria-label="Letra más pequeña">A−</button><button class="btn sq" data-act="fp" aria-label="Letra más grande">A+</button></div>' +
      '<div class="grp"><label class="chk"><input type="checkbox" id="dgToggle"' + (S.dg ? ' checked' : '') + '> Diagramas</label></div>' +
      '<div class="grp"><button class="btn" data-act="auto" id="autoBtn">Iniciar autoscroll</button><input type="range" id="dur" min="30" max="420" step="10" value="' + S.dur + '" aria-label="Duración del autoscroll"><output id="durv"></output></div>' +
    '</div>' +
    '<div id="info"></div><div id="audioBox"></div><div class="songgrid"><div class="dgs" id="dgStrip"></div><article class="song" id="songBody"></article></div>';
  refreshSong();
  window.scrollTo(0, 0);
}
/* ---------- Impresión ---------- */
var PR_KEY = 'songbookcg.imprimir';
var PR = { paper: 'letter', meta: true, dg: true, fs: 13, cols: false };
try { var _pr = JSON.parse(window.localStorage.getItem(PR_KEY) || 'null'); if (_pr) Object.keys(PR).forEach(function (k) { if (_pr[k] != null && typeof _pr[k] === typeof PR[k]) PR[k] = _pr[k]; }); } catch (e) { /* sin almacenamiento */ }
function savePrefs() { try { window.localStorage.setItem(PR_KEY, JSON.stringify(PR)); } catch (e) { /* sin almacenamiento */ } }
function showPrint() {
  stopAuto(); hidePop();
  S.view = 'print';
  renderPrint();
  window.scrollTo(0, 0);
}
function backToSong() {
  var sh = S.shift, cp = S.capo;
  showSong(S.song);
  S.shift = sh; S.capo = cp; refreshSong();
}
function renderPrint() {
  var song = S.song, ctx = ctxFor(song, S.shift, S.capo);
  var notes = [];
  while (ctx.blocks.length && ctx.blocks[0].type === 'note') notes.push(ctx.blocks.shift().text);
  var meta = '';
  if (PR.meta) {
    var lines = [];
    if (song.album || song.year) lines.push(esc(albumLine(song)));
    if (ctx.key) lines.push('Tonalidad: <b>' + esc(keyName(ctx.key, S.shift)) + '</b>' + (S.shift ? ' (original ' + esc(keyName(ctx.key, 0)) + ')' : '') +
      (S.capo ? ' · cejilla en el traste ' + S.capo + ', formas en <b>' + esc(keyName(ctx.key, ctx.ss)) + '</b>' : ''));
    if (notes.length) lines.push('Nota: <i>' + esc(notes.join(' · ').replace(/\s+/g, ' ')) + '</i>');
    meta = '<div class="sh-meta">' + lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') + '</div>';
  }
  var head = '<header class="sh-head">' + (PR.meta && safeCover(song.cover) ? '<img class="cover" src="' + esc(song.cover) + '" alt="" referrerpolicy="no-referrer">' : '') +
    '<div><h1>' + esc(song.title) + '</h1>' + (artistLabel(song) ? '<p class="sh-art">' + esc(artistLabel(song)) + '</p>' : '') + meta + '</div></header>';
  var dg = PR.dg ? '<div class="dgs pdg">' + stripHTML(song, ctx, true) + '</div>' : '';
  var opts = '<aside class="opts" aria-label="Opciones de impresión"><div class="opt-card">' +
    '<label class="opt"><span>Tamaño del papel</span><select id="prPaper"><option value="letter"' + (PR.paper === 'letter' ? ' selected' : '') + '>Carta</option><option value="a4"' + (PR.paper === 'a4' ? ' selected' : '') + '>A4</option></select></label>' +
    '<label class="opt"><span>Datos de la canción</span><input type="checkbox" id="prMeta"' + (PR.meta ? ' checked' : '') + '></label>' +
    '<label class="opt"><span>Diagramas de acordes</span><input type="checkbox" id="prDg"' + (PR.dg ? ' checked' : '') + '></label>' +
    '<div class="opt"><span>Tamaño de letra</span><span class="grp"><button class="btn sq" type="button" data-act="pfm" aria-label="Letra más pequeña">−</button><output>' + PR.fs + '</output><button class="btn sq" type="button" data-act="pfp" aria-label="Letra más grande">+</button></span></div>' +
    '<label class="opt"><span>Dos columnas</span><input type="checkbox" id="prCols"' + (PR.cols ? ' checked' : '') + '></label></div>' +
    '<button class="btn primary big" type="button" data-act="doprint">Imprimir o guardar PDF</button>' +
    '<button class="btn big" type="button" data-act="unprint">Volver a la canción</button>' +
    '<p class="hint">En el diálogo de impresión elige "Guardar como PDF" para obtener el archivo. Se imprime con la transposición y la cejilla que tenías en la canción.</p></aside>';
  view.innerHTML = '<div class="prt"><div class="sheetwrap"><article class="sheet' + (PR.cols ? ' two' : '') + ' ' + PR.paper + '">' + head + dg +
    '<div class="song" id="prBody" style="--fs:' + PR.fs + 'px">' + blocksHTML(ctx.blocks, ctx, 'view') + '</div></article></div>' + opts + '</div>';
  var st = document.getElementById('pgsz');
  if (!st) { st = document.createElement('style'); st.id = 'pgsz'; document.head.appendChild(st); }
  st.textContent = '@page { size: ' + (PR.paper === 'a4' ? 'A4' : 'letter') + '; margin: 14mm; }';
}
/* Audio propio. El reproductor se arma una vez por canción para que transponer no lo detenga. Con sesión se pide por el nombre
   del archivo; sin sesión, por la canción (el servidor solo responde si está revisada). Si el enlace temporal vence, pide otro y sigue. */
function audioSource(song) { return editable() ? (api.audioUrl ? api.audioUrl(song.audio) : null) : (api.audioPlay ? api.audioPlay(song.id) : null); }
function setupAudio(song) {
  var box = $('#audioBox'); if (!box) return;
  var key = song && song.audio && (editable() ? api.audioUrl : api.audioPlay) ? song.id + '|' + song.audio + '|' + (editable() ? 'o' : 'g') : '';
  if ((box.getAttribute('data-k') || '') === key) return;
  box.setAttribute('data-k', key);
  if (!key) { box.innerHTML = ''; return; }
  box.innerHTML = '<div class="audio"><span class="hint">Cargando el audio…</span></div>';
  audioSource(song).then(function (url) {
    if (box.getAttribute('data-k') !== key) return;
    box.innerHTML = '<div class="audio"><audio controls preload="none" src="' + esc(url) + '"></audio>' +
      '<div class="speed"><label class="lab" for="spd">Velocidad</label><input type="range" id="spd" min="75" max="100" step="1" value="100"><output id="spdv" for="spd">100%</output></div></div>';
    var el = box.querySelector('audio'), tries = 0;
    el.preservesPitch = true; el.webkitPreservesPitch = true;
    el.addEventListener('error', function () {
      if (tries++ > 1 || box.getAttribute('data-k') !== key) return;
      var t = el.currentTime, playing = !el.paused;
      audioSource(song).then(function (u2) {
        if (box.getAttribute('data-k') !== key) return;
        el.src = u2; el.currentTime = t; if (playing) el.play();
      }, function () { /* sin red: queda el mensaje del navegador */ });
    });
  }, function (e) {
    if (box.getAttribute('data-k') !== key) return;
    box.innerHTML = '<div class="audio"><span class="hint">No se pudo cargar el audio: ' + esc((e && e.message) || 'error') + '</span></div>';
  });
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
    info += '<p class="info">Tonalidad: <b>' + esc(keyName(ctx.key, S.shift)) + '</b>' + (S.shift ? ' (original ' + esc(keyName(ctx.key, 0)) + ')' : '') +
      (S.capo ? ' · cejilla en el traste ' + S.capo + ', formas en <b>' + esc(keyName(ctx.key, ctx.ss)) + '</b>' : '') +
      (ctx.inferred ? ' · tonalidad tomada del primer acorde' : '') + '</p>';
  } else info += '<p class="info">La canción no tiene tonalidad definida.</p>';
  /* La nota de afinación o cejilla va bajo la tonalidad: la del inicio de la letra; sin nota, no sale nada. */
  var notes = [];
  while (ctx.blocks.length && ctx.blocks[0].type === 'note') notes.push(ctx.blocks.shift().text);
  if (notes.length) info += '<p class="info">Nota: <i>' + esc(notes.join(' · ').replace(/\s+/g, ' ')) + '</i></p>';
  var n = countDoubts(ctx.blocks);
  if (n && editable()) info += '<div class="banner warn">' + n + (n === 1 ? ' marca por revisar, resaltada' : ' marcas por revisar, resaltadas') + ' en ámbar. Se corrigen en el editor.</div>';
  if (ctx.ss !== 0 && hasUntransposable(ctx.blocks)) info += '<div class="banner">Las figuras cuerda-traste y las tablaturas conservan su posición original.</div>';
  $('#info').innerHTML = info;
  setupAudio(song);
  var strip = $('#dgStrip');
  strip.hidden = !S.dg;
  strip.innerHTML = S.dg ? stripHTML(song, ctx) : '';
  var body = $('#songBody');
  body.style.setProperty('--fs', S.fs + 'px');
  body.innerHTML = blocksHTML(ctx.blocks, ctx, 'view');
  fitStrip();
}
/* El panel de acordes se queda fijo solo si cabe en la pantalla; si no, baja con la página (un único scroll). */
function fitStrip() {
  var strip = $('#dgStrip'); if (!strip || strip.hidden) return;
  strip.classList.remove('fit');
  var bar = $('#controls');
  var top = (bar ? bar.offsetHeight : 0) + 52 + 8 + 16;
  strip.style.top = top + 'px';
  if (strip.offsetHeight && strip.offsetHeight <= window.innerHeight - top - 12) strip.classList.add('fit');
}
window.addEventListener('resize', function () { if (S.view === 'song') fitStrip(); });
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
      '<label class="f">Título<input type="text" id="fTitle"></label>' +
      '<div class="row3"><label class="f">Artista<input type="text" id="fArtist" placeholder="Varios: Silvio Rodríguez; Piero"></label>' +
        '<label class="f">Tonalidad<input type="text" id="fKey" placeholder="Am, G, Bb"></label>' +
        '<label class="f">Estado<select id="fStatus">' + stOpts + '</select></label></div>' +
      '<label class="f">Afinación o cejilla de la fuente<textarea id="fTuning" rows="2" spellcheck="false"></textarea></label>' +
      '<div class="albumbox"><div class="ab-c" id="abCover"></div><div class="ab-f">' +
        '<div class="row3 ab-r"><label class="f">Álbum<input type="text" id="fAlbum"></label><label class="f">Año<input type="text" id="fYear" inputmode="numeric" maxlength="4"></label>' +
        '<label class="f">Carátula (URL)<input type="text" id="fCover" placeholder="https://…"></label></div>' +
        '<div class="actions"><button type="button" class="btn" id="alFind">Buscar álbum</button><button type="button" class="btn" id="alClear">Quitar álbum</button><span class="hint" id="alMsg" role="status"></span></div>' +
        '<div class="alres" id="alRes" hidden></div></div></div>' +
      (api.audioList ? '<div class="audiobox"><div class="row2 au-r"><label class="f">Audio (archivo en R2)<input type="text" id="fAudio" readonly placeholder="Sin audio"></label>' +
        '<label class="f">Buscar por nombre<input type="text" id="auQ" placeholder="Parte del título o del artista"></label></div>' +
        '<div class="actions"><button type="button" class="btn" id="auFind">Buscar audio</button><button type="button" class="btn" id="auClear">Quitar audio</button><span class="hint" id="auMsg" role="status"></span></div>' +
        '<div class="alres" id="auRes" hidden></div></div>' : '') +
      '<label class="f">Letra y acordes<textarea id="fBody" spellcheck="false"></textarea></label>' +
      '<div class="actions"><button type="button" class="btn" id="edAbove">Convertir acordes sobre la letra</button><span class="hint" id="abMsg" role="status"></span></div>' +
      '<details class="syntax"><summary>Cómo se escribe</summary><ul>' +
        '<li><code>[Am]</code> pone el acorde sobre la sílaba que sigue. Varios acordes sobre la misma sílaba van juntos: <code>[C-F-C]</code> o <code>[C (C4-C-G7-C)]</code>. Una figura cuerda-traste puede ir con o sin paréntesis: <code>(52)</code> o <code>62-63-63</code>.</li>' +
        '<li><code>&gt; G D Em</code> escribe una línea solo de acordes.</li>' +
        '<li>Si pegas la letra con los acordes en una línea encima, alineados con las sílabas, el botón <b>Convertir acordes sobre la letra</b> los pasa a <code>[Am]</code>. Acepta solfeo.</li>' +
        '<li><code>{intro: G - D (50-60-62)}</code> escribe la introducción. Cada grupo entre paréntesis es cuerda y traste, y no se transpone. Para partirla en líneas, escribe otra <code>{intro: …}</code> justo debajo: se leen como una sola introducción. Igual con <code>{outro: …}</code> e <code>{interludio: …}</code>.</li>' +
        '<li><code>{c: texto}</code> agrega una nota.</li>' +
        '<li><code>{fill: 30,32,(63,20),21}</code> escribe un fill en su propia línea, debajo del verso. Cada nota es cuerda y traste: <code>30</code> es la 3ª al aire y <code>110</code> la 1ª en el traste 10. Lo que va entre paréntesis suena a la vez. La tablatura se dibuja sola. Con nombre: <code>{fill Puente: 30,32}</code>.</li>' +
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
  $('#fTuning').value = d.tuning || ''; $('#fBody').value = d.body || '';
  $('#fAlbum').value = d.album || ''; $('#fYear').value = d.year || ''; $('#fCover').value = d.cover || '';
  if ($('#fAudio')) { $('#fAudio').value = d.audio || ''; $('#auQ').value = d.title || ''; }
  coverPrev();
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
  d.album = $('#fAlbum').value.trim(); d.year = $('#fYear').value.replace(/\D/g, '').slice(0, 4); d.cover = $('#fCover').value.trim();
  if ($('#fAudio')) d.audio = $('#fAudio').value.trim();
}
function findAudio() {
  var res = $('#auRes'), msg = $('#auMsg'), q = $('#auQ').value.trim();
  msg.textContent = 'Buscando…'; res.hidden = true;
  api.audioList(q).then(function (list) {
    if (S.view !== 'edit') return;
    S.audioRes = list;
    if (!list.length) { msg.textContent = 'No hay archivos con ese nombre en R2. Prueba con menos palabras.'; return; }
    msg.textContent = 'Elige el archivo.';
    res.hidden = false;
    res.innerHTML = list.map(function (f, i) {
      return '<button type="button" class="alopt auopt" data-au="' + i + '"><span><b>' + esc(f.key) + '</b><i>' + (f.size ? (f.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : '') + '</i></span></button>';
    }).join('');
  }, function (e) { if (S.view === 'edit') msg.textContent = 'No se pudo buscar: ' + ((e && e.message) || 'error'); });
}
function coverPrev() {
  var el = $('#abCover'); if (!el) return;
  var u = safeCover($('#fCover').value.trim());
  el.innerHTML = u ? '<img src="' + esc(u) + '" alt="Carátula" referrerpolicy="no-referrer">' : '<span aria-hidden="true">♪</span>';
}
function findAlbum() {
  readForm();
  var d = S.draft, res = $('#alRes'), msg = $('#alMsg');
  if (!api.searchAlbum) { msg.textContent = 'La búsqueda no está disponible.'; return; }
  if (!d.title.trim()) { msg.textContent = 'Escribe primero el título.'; return; }
  msg.textContent = 'Buscando…'; res.hidden = true;
  api.searchAlbum({ title: d.title, artist: artistParts(d.artist)[0] || '' }).then(function (list) {
    if (S.view !== 'edit') return;
    S.albumRes = list;
    if (!list.length) { msg.textContent = 'No encontré nada. Prueba con otro título o escribe los datos a mano.'; return; }
    msg.textContent = 'Elige el que corresponde.';
    res.hidden = false;
    res.innerHTML = list.map(function (r, i) {
      return '<button type="button" class="alopt" data-al="' + i + '"><img src="' + esc(r.cover) + '" alt="" loading="lazy" referrerpolicy="no-referrer"><span><b>' + esc(r.album) + (r.year ? ' (' + esc(r.year) + ')' : '') + '</b><i>' + esc(r.song) + ' · ' + esc(r.artist) + '</i></span></button>';
    }).join('');
  }, function (e) { if (S.view === 'edit') msg.textContent = 'No se pudo buscar: ' + ((e && e.message) || 'error'); });
}
/* ---------- Editor de diagramas ---------- */
var dgS = null, dgTarget = null, dgLib = null;
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
function openDgLib(name, idx) {
  if (!editable()) return;
  var list = curShapes(name), cur0 = idx != null ? list[idx] : null;
  var b = cur0 || shapeFor(parseChord(name)) || { frets: [-1, -1, -1, -1, -1, -1], base: 1, barre: null };
  dgLib = { name: name, idx: cur0 ? idx : null };
  dgS = { orig: name, frets: b.frets.slice(), base: b.base || 1,
    barre: b.barre ? { on: true, fret: b.barre.fret, from: b.barre.from, to: b.barre.to } : { on: false, fret: b.base || 1, from: 0, to: 5 }, hasCustom: !!cur0 };
  $('#dgTitle').textContent = 'Diagrama de ' + name;
  $('#dgDel').hidden = !cur0; $('#dgDel').textContent = 'Quitar esta posición';
  renderDg();
  $('#dgModal').hidden = false;
  $('#dgBase').focus();
}
function saveLibShape(out) {
  var n = dgLib.name, f = out.frets.join(',');
  if (dgLib.idx != null && dgLib.moveTo && eqKey(dgLib.moveTo) !== eqKey(n)) {
    /* La forma pasa a otro acorde: se agrega allí (sin repetirla) y se quita de este */
    var t = dgLib.moveTo, tl = curShapes(t);
    if (!tl.some(function (x) { return x.frets.join(',') === f; })) tl.push(out);
    chordLib[t] = tl; api.saveChord(t, tl).catch(failSave);
    var rest = curShapes(n).filter(function (x, i) { return i !== dgLib.idx; });
    if (rest.length) { chordLib[n] = rest; api.saveChord(n, rest).catch(failSave); }
    else { delete chordLib[n]; api.deleteChord(n).catch(failSave); }
    onChords();
    toast('La forma pasó a ' + t + '.');
    return true;
  }
  var shapes = curShapes(n);
  var dup = shapes.some(function (x, i) { return i !== dgLib.idx && x.frets.join(',') === f; });
  if (dup && dgLib.idx != null) { toast('Esa posición ya está en la lista de ' + n + '.', true); return false; }
  if (dup) {
    /* Agregar una posición que el acorde ya tiene: la lista queda guardada en la biblioteca y no se repite la forma */
    chordLib[n] = shapes; onChords();
    api.saveChord(n, shapes).catch(failSave);
    toast('Esa posición ya estaba en ' + n + '. El acorde quedó en la biblioteca.');
    return true;
  }
  if (dgLib.idx != null) shapes[dgLib.idx] = out; else shapes.push(out);
  chordLib[n] = shapes; onChords();
  api.saveChord(n, shapes).catch(failSave);
  return true;
}
function dropLibShape(name, idx) {
  var n = name || dgLib.name, ix = idx != null ? idx : dgLib.idx, shapes = curShapes(n).filter(function (x, i) { return i !== ix; });
  if (shapes.length) { chordLib[n] = shapes; api.saveChord(n, shapes).catch(failSave); }
  else { delete chordLib[n]; api.deleteChord(n).catch(failSave); }
  onChords();
}
function resetLibChord(name) {
  if (!chordLib[name]) return;
  delete chordLib[name]; api.deleteChord(name).catch(failSave); onChords();
}
function onChords() {
  var m = {};
  Object.keys(chordLib).forEach(function (n) { var c = parseChord(n); if (c) m[chordKey(c)] = chordLib[n]; });
  setUserShapes(m);
  if (S.view === 'song' && S.song) refreshSong();
  else if (S.view === 'edit' && S.draft) refreshPreview();
  else if (S.view === 'library') fillList();
}
function opts(from, to, label, sel) {
  var s = '';
  for (var i = from; i <= to; i++) s += '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + label(i) + '</option>';
  return s;
}
/* Trastes que suenan: una cejilla cubre las cuerdas al aire o más bajas de su tramo */
function dgSounding() {
  var f = dgS.frets.slice();
  if (dgS.barre.on) for (var i = Math.min(dgS.barre.from, dgS.barre.to); i <= Math.max(dgS.barre.from, dgS.barre.to); i++) if (f[i] >= 0 && f[i] < dgS.barre.fret) f[i] = dgS.barre.fret;
  return f;
}
function renderDgNames() {
  var el = $('#dgNames'); if (!el) return;
  var names = nameShape(dgSounding()), can = !!dgLib, curN = dgLib ? (dgLib.moveTo || dgLib.name) : dgS.orig, ck = eqKey(curN);
  if (!names.length) { el.innerHTML = '<span class="hint">Pon al menos dos notas y aquí aparecen los nombres posibles.</span>'; return; }
  el.innerHTML = '<span class="dgn-t">Podría ser</span>' + names.map(function (n) {
    var cur = eqKey(n) === ck ? ' cur' : '';
    return can ? '<button type="button" class="dgn' + cur + '" data-dgname="' + esc(n) + '">' + esc(n) + '</button>' : '<span class="dgn' + cur + '">' + esc(n) + '</span>';
  }).join('') + (can ? '<span class="hint">' + (dgLib.idx == null ? 'Toca un nombre para guardar la forma con él.' : 'Toca un nombre para pasar esta forma a ese acorde.') + '</span>' : '');
}
function renderDg() {
  renderDgNames();
  $('#dgBig').innerHTML = dgSVG(dgOut(), 230, true);
  $('#dgBase').value = dgS.base;
  $('#dgBarreOn').checked = dgS.barre.on;
  $('#dgBarreRow').hidden = !dgS.barre.on;
  $('#dgBF').innerHTML = opts(dgS.base, dgS.base + 4, function (i) { return i; }, dgS.barre.fret);
  var sl = function (i) { return (6 - i) + 'ª'; };
  $('#dgBFrom').innerHTML = opts(0, 5, sl, dgS.barre.from);
  $('#dgBTo').innerHTML = opts(0, 5, sl, dgS.barre.to);
}
function closeDg() { $('#dgModal').hidden = true; dgS = null; dgLib = null; $('#dgDel').textContent = 'Quitar el propio'; }
function afterDg() {
  if (S.view === 'edit') refreshPreview();
  else { api.saveSong(S.song, false).catch(failSave); harvestDiagrams([S.song.diagrams]); refreshSong(); }
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
      '<span>' + (i + 1) + ' de ' + n + '</span>' +
      '<button class="btn sq" type="button" data-pop="next" aria-label="Posición siguiente">›</button></div>';
  } else h += '<div class="blank">?</div><p class="hint">No hay una forma conocida para este acorde.</p>';
  if (pc.ctx.ss === 0 && inEdit() && n > 1) {
    if (i > 0) h += '<button class="btn" type="button" data-pop="pref">Usar como principal</button>';
    else if (P.pref) h += '<button class="btn" type="button" data-pop="unpref">Quitar como principal</button>';
  }
  if (pc.ctx.ss === 0 && inEdit()) h += '<button class="btn" type="button" data-pop="edit">' + (n ? 'Editar esta forma' : 'Dibujar') + '</button>';
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

/* ---------- Tema claro / oscuro ---------- */
var TH_KEY = 'songbookcg.tema';
function temaActual() {
  var t = null; try { t = window.localStorage.getItem(TH_KEY); } catch (e) { /* sin almacenamiento */ }
  if (t === 'light' || t === 'dark') return t;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
}
function aplicarTema(t) {
  document.documentElement.setAttribute('data-theme', t);
  var b = $('#theme'); if (b) { b.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false'); b.setAttribute('aria-label', t === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'); }
}
aplicarTema(temaActual());
$('#theme').addEventListener('click', function () {
  var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  try { window.localStorage.setItem(TH_KEY, t); } catch (e) { /* sin almacenamiento */ }
  aplicarTema(t);
});

/* ---------- Eventos ---------- */
$('#goHome').addEventListener('click', function () { if (denied) return; LIB.page = 'home'; LIB.artist = ''; S.q = ''; $('#q').value = ''; renderLibrary(); });
window.addEventListener('popstate', function () {
  if (denied || S.view === 'login') { curUrl = window.location.pathname; return; }
  if (S.view === 'edit' || imp.isActive()) {
    try { window.history.pushState(null, '', curUrl); } catch (e) { /* sin historial */ }
    toast('Guarda o cancela antes de salir.', true); return;
  }
  curUrl = window.location.pathname;
  var id = pathId();
  if (id) routeSong(id); else renderLibrary();
});
/* Buscador de la barra superior: funciona en toda la app, menos al editar o importar */
function searchBlocked() { return S.view === 'edit' || imp.isActive(); }
$('#q').addEventListener('focus', function (e) { if (searchBlocked()) { e.target.blur(); toast('Guarda o cancela antes de buscar.', true); } });
$('#q').addEventListener('input', function (e) {
  if (searchBlocked()) { e.target.value = S.q; toast('Guarda o cancela antes de buscar.', true); return; }
  if (denied || S.view === 'login') return;
  S.q = e.target.value;
  if (S.view === 'library') fillList(); else renderLibrary();
});
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
  var al = t.closest('[data-al]');
  if (al && S.view === 'edit') {
    var pick = (S.albumRes || [])[parseInt(al.getAttribute('data-al'), 10)];
    if (pick) {
      $('#fAlbum').value = pick.album; $('#fYear').value = pick.year; $('#fCover').value = pick.cover;
      if (!$('#fArtist').value.trim()) $('#fArtist').value = pick.artist;
      readForm(); coverPrev(); $('#alRes').hidden = true; $('#alMsg').textContent = 'Álbum aplicado.';
    }
    return;
  }
  if (t.id === 'chScan') { ensureSongChords(true); return; }
  var au = t.closest('[data-au]');
  if (au && S.view === 'edit') {
    var pf = (S.audioRes || [])[parseInt(au.getAttribute('data-au'), 10)];
    if (pf) { $('#fAudio').value = pf.key; readForm(); $('#auRes').hidden = true; $('#auMsg').textContent = 'Audio asignado.'; }
    return;
  }
  if (t.id === 'auFind') { findAudio(); return; }
  if (t.id === 'auClear') { $('#fAudio').value = ''; readForm(); $('#auRes').hidden = true; $('#auMsg').textContent = ''; return; }
  if (t.id === 'alFind') { findAlbum(); return; }
  if (t.id === 'alClear') { $('#fAlbum').value = ''; $('#fYear').value = ''; $('#fCover').value = ''; readForm(); coverPrev(); $('#alRes').hidden = true; $('#alMsg').textContent = ''; return; }
  var o = t.closest('[data-open]');
  if (o) { openSong(o.getAttribute('data-open')); return; }
  var ce = t.closest('[data-chedit]');
  if (ce) { openDgLib(ce.getAttribute('data-chedit'), parseInt(ce.getAttribute('data-i'), 10)); return; }
  var ca = t.closest('[data-chadd]');
  if (ca) { openDgLib(ca.getAttribute('data-chadd'), null); return; }
  var cr = t.closest('[data-chreset]');
  if (cr) { resetLibChord(cr.getAttribute('data-chreset')); toast('Volvieron las posiciones originales.'); return; }
  var cd = t.closest('[data-chdel]');
  if (cd) { dropLibShape(cd.getAttribute('data-chdel'), parseInt(cd.getAttribute('data-i'), 10)); toast('Posición quitada.'); return; }
  var cs = t.closest('[data-chsee]');
  if (cs) { LIB.chord = cs.getAttribute('data-chsee'); LIB.page = 'acordes'; fillList(); window.scrollTo(0, 0); return; }
  var lb = t.closest('[data-lib]');
  if (lb) {
    var pg = lb.getAttribute('data-lib');
    if (pg !== 'clear') LIB.page = pg;
    if (pg === 'acordes') LIB.chord = '';
    LIB.artist = pg === 'artista' ? LIB.artist : '';
    S.q = ''; $('#q').value = '';
    renderLibrary(); return;
  }
  var ar = t.closest('[data-artist]');
  if (ar) { LIB.page = 'artista'; LIB.artist = ar.getAttribute('data-artist'); renderLibrary(); return; }
  var lt = t.closest('[data-letter]');
  if (lt) { LIB.page = 'todas'; LIB.jump = lt.getAttribute('data-letter'); renderLibrary(); return; }
  var jp = t.closest('[data-jump]');
  if (jp) { var g = document.getElementById('g-' + jp.getAttribute('data-jump')); if (g) g.scrollIntoView({ block: 'start' }); return; }
  var ed = t.closest('[data-edit]');
  if (ed) { var eo = ed.getAttribute('data-edit'); openDg(eo, shownFor(eo)); return; }
  var a = t.closest('[data-act]');
  if (!a) return;
  var act = a.getAttribute('data-act');
  if (act === 'back') renderLibrary();
  else if (act === 'edit') openEditor(S.id);
  else if (act === 'export') openExport(S.song);
  else if (act === 'share') copyLink();
  else if (act === 'print') showPrint();
  else if (act === 'unprint') backToSong();
  else if (act === 'doprint') window.print();
  else if (act === 'pfp') { PR.fs = Math.min(24, PR.fs + 1); savePrefs(); renderPrint(); }
  else if (act === 'pfm') { PR.fs = Math.max(8, PR.fs - 1); savePrefs(); renderPrint(); }
  else if (act === 'tp') { S.shift = Math.min(11, S.shift + 1); refreshSong(); }
  else if (act === 'tm') { S.shift = Math.max(-11, S.shift - 1); refreshSong(); }
  else if (act === 't0') { S.shift = 0; S.capo = 0; refreshSong(); }
  else if (act === 'fp') { S.fs = Math.min(40, S.fs + 1); refreshSong(); }
  else if (act === 'fm') { S.fs = Math.max(9, S.fs - 1); refreshSong(); }
  else if (act === 'auto') { if (S.auto) stopAuto(); else startAuto(); }
});
view.addEventListener('input', function (e) {
  var id = e.target.id;
  if (id === 'spd') {
    var ael = $('#audioBox audio'), pct = parseInt(e.target.value, 10);
    if (ael) { ael.playbackRate = pct / 100; ael.preservesPitch = true; ael.webkitPreservesPitch = true; }
    $('#spdv').textContent = pct + '%';
  }
  if (id === 'dur') { S.dur = parseInt(e.target.value, 10); $('#durv').textContent = fmtDur(S.dur); }
  else if (id === 'chName') {
    var qv = e.target.value.trim().toLowerCase().replace(/\s+/g, ''), shown = 0, qk = eqKey(e.target.value.trim());
    Array.prototype.forEach.call(view.querySelectorAll('.chcard'), function (cd) {
      var on = !qv || cd.getAttribute('data-n').indexOf(qv) === 0 || (!!qk && cd.getAttribute('data-k') === qk);
      cd.hidden = !on; if (on) shown++;
    });
    var nn = $('#chNone'); if (nn) nn.hidden = !!shown;
    $('#chMsg').textContent = '';
  }
  else if (S.view === 'edit' && /^f(Title|Artist|Key|Tuning|Status|Body|Album|Year|Cover)$/.test(id)) { readForm(); if (id === 'fCover') coverPrev(); refreshPreview(); }
});
view.addEventListener('change', function (e) {
  var id = e.target.id;
  if (id === 'capo') { S.capo = parseInt(e.target.value, 10); refreshSong(); }
  else if (id === 'dgToggle') { S.dg = e.target.checked; refreshSong(); }
  else if (S.view === 'print' && /^pr(Paper|Meta|Dg|Cols)$/.test(id)) {
    if (id === 'prPaper') PR.paper = e.target.value; else if (id === 'prMeta') PR.meta = e.target.checked;
    else if (id === 'prDg') PR.dg = e.target.checked; else PR.cols = e.target.checked;
    savePrefs(); renderPrint();
  }
});
view.addEventListener('submit', function (e) {
  if (e.target.id === 'chAdd') {
    e.preventDefault();
    var raw = $('#chName').value.trim(), c = parseChord(raw);
    if (!c || c.star || c.doubt) { $('#chMsg').textContent = 'No reconozco ese acorde. Prueba con Am7, C4 o C/G.'; return; }
    LIB.chord = chordKey(c); fillList();
    return;
  }
  e.preventDefault();
  if (S.view !== 'edit') return;
  readForm();
  var d = S.draft;
  if (!d.title.trim()) d.title = 'Sin título';
  d.doubts = countDoubts(parseBody(d.body));
  d.chords = bodyChordNames(d.body);
  harvestDiagrams([d.diagrams]);
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
  else if (e.target.id === 'edAbove') {
    var ta0 = $('#fBody'), r0 = chordsAbove(ta0.value);
    if (!r0.count) { var h0 = chordHint(ta0.value); $('#abMsg').textContent = h0 ? 'No reconocí «' + h0.token + '» como acorde en la línea ' + h0.line + (h0.odd.length ? '. Tiene un carácter oculto o poco común (' + h0.odd.join(', ') + '): bórralo y escríbelo de nuevo.' : '. Corrígelo y vuelve a intentar.') : 'No encontré líneas de acordes sobre la letra.'; }
    else { ta0.value = r0.text; ta0.dispatchEvent(new Event('input', { bubbles: true })); $('#abMsg').textContent = r0.count + ' líneas convertidas.'; }
  }
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
  if (e.key === 'Enter' && e.target && e.target.id === 'auQ') { e.preventDefault(); findAudio(); return; }
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
  } else if ((act === 'pref' || act === 'unpref') && inEdit() && pc.ctx.ss === 0) {
    var cur = P.list[posIndex(P)];
    pc.song.prefs = pc.song.prefs || {};
    if (act === 'pref' && cur) pc.song.prefs[popFor.orig] = cur.d.frets.join(',');
    else delete pc.song.prefs[popFor.orig];
    S.pos[P.disp] = 0;
    afterDg();
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
$('#dgNames').addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('[data-dgname]');
  if (!b || !dgLib) return;
  var nm = b.getAttribute('data-dgname');
  if (dgLib.idx == null) { dgLib.name = libKey(nm); $('#dgTitle').textContent = 'Diagrama de ' + nm; }
  else if (eqKey(nm) === eqKey(dgLib.name)) { dgLib.moveTo = null; $('#dgTitle').textContent = 'Diagrama de ' + dgLib.name; }
  else { dgLib.moveTo = libKey(nm); $('#dgTitle').textContent = 'Diagrama de ' + dgLib.name + ' · pasará a ' + nm; }
  renderDgNames();
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
  if (dgLib) { if (saveLibShape(dgOut())) closeDg(); return; }
  dgTarget.diagrams = dgTarget.diagrams || {};
  dgTarget.diagrams[dgS.orig] = dgOut();
  closeDg(); afterDg();
});
$('#dgDel').addEventListener('click', function () {
  if (dgLib) { dropLibShape(); closeDg(); return; }
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
if (api.subscribeChords) api.subscribeChords(function (list) {
  chordLib = {}; list.forEach(function (d) { if (d && d.name && d.shapes && d.shapes.length) chordLib[d.name] = d.shapes; });
  onChords();
}, function () {});
}
