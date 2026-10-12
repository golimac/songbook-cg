// Importar fotos: elegir fotos, detectar y ajustar recuadros de canciones, leerlas con el modelo y pasar a la pantalla de revisión.
import { dragBox, groupSongs, removeBox } from './photo.js';
import { convertSolfege } from './core.js';

export function createImporter(d) {
  // d: { view, esc, toast, api, imaging, uid, openReview(review), finish(savedCount) }
  var I = { active: false, run: 0, files: [], fi: 0, saved: 0, h: null, boxes: [], pageVal: '', nextPage: '', cancionero: '' };
  var view = d.view, esc = d.esc;
  var drag = null;

  function remember(k, v) { try { localStorage.setItem('songbookcg.' + k, v); } catch (e) { /* sin almacenamiento */ } }
  function recall(k) { try { return localStorage.getItem('songbookcg.' + k) || ''; } catch (e) { return ''; } }
  function errMsg(e) { return (e && e.message) || 'error desconocido'; }
  function mine(run) { return I.active && run === I.run; }

  /* ---------- 1. Elegir fotos ---------- */
  function render() {
    I.active = true; I.run++;
    view.innerHTML = '<h1>Importar fotos</h1>' +
      '<p class="hint" style="margin-top:6px">Una foto por página. El sistema encuentra las canciones, tú ajustas los recuadros, y después revisas cada transcripción junto a la foto.</p>' +
      '<form class="form" id="imForm" style="margin-top:16px;max-width:560px" autocomplete="off">' +
        '<div class="row"><label class="f">Cancionero<input type="text" id="imSrc" placeholder="Nombre del cancionero"></label>' +
        '<label class="f">Página de la primera foto<input type="text" id="imPage" inputmode="numeric"></label></div>' +
        '<label class="f">Fotos<input type="file" id="imFiles" accept="image/*" multiple></label>' +
        '<div class="actions"><button class="btn primary" type="submit">Empezar</button><button class="btn" type="button" id="imCancel">Cancelar</button></div>' +
      '</form>';
    $('#imSrc').value = recall('cancionero');
  }
  function $(s) { return view.querySelector(s); }

  function cancel() {
    if (!I.active) return;
    I.active = false; I.run++;
    release();
  }
  function release() { if (I.h) { d.imaging.release(I.h); I.h = null; } }
  function finish() {
    var n = I.saved;
    cancel();
    d.finish(n);
  }

  /* ---------- 2. Recuadros ---------- */
  function beginPhoto() {
    var run = I.run;
    release();
    var file = I.files[I.fi];
    view.innerHTML = '<p class="hint">Abriendo la foto ' + (I.fi + 1) + ' de ' + I.files.length + '…</p>';
    d.imaging.load(file).then(function (h) {
      if (!mine(run)) { d.imaging.release(h); return; }
      I.h = h;
      view.innerHTML = '<p class="hint">Buscando las canciones de la foto ' + (I.fi + 1) + ' de ' + I.files.length + '… tarda unos segundos.</p>';
      return d.api.readPage({ mode: 'segment', images: [d.imaging.page(h)] }).then(function (r) { return r; }, function (e) {
        d.toast('No se pudieron detectar las canciones: ' + errMsg(e) + '. Dibuja los recuadros a mano.', true);
        return null;
      }).then(function (r) {
        if (!mine(run)) return;
        var songs = r && r.songs && r.songs.length ? r.songs : [{ title: '', box: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }, continues: null, note: '' }];
        I.boxes = songs.map(function (s) { return { title: s.title || '', box: s.box, continues: s.continues == null ? null : s.continues, note: s.note || '' }; });
        I.pageVal = (r && r.page_number) || I.nextPage || '';
        renderSeg();
      });
    }).catch(function (e) {
      if (!mine(run)) return;
      d.toast('No se pudo abrir la foto: ' + errMsg(e), true);
      nextPhoto();
    });
  }

  function boxStyle(b) { return 'left:' + (b.x * 100).toFixed(2) + '%;top:' + (b.y * 100).toFixed(2) + '%;width:' + (b.w * 100).toFixed(2) + '%;height:' + (b.h * 100).toFixed(2) + '%'; }

  function renderSeg() {
    var boxes = I.boxes.map(function (b, i) {
      return '<div class="bx" data-i="' + i + '" style="' + boxStyle(b.box) + '"><span class="bxn">' + (i + 1) + '</span>' +
        ['nw', 'ne', 'sw', 'se'].map(function (h) { return '<i class="hd" data-h="' + h + '"></i>'; }).join('') + '</div>';
    }).join('');
    view.innerHTML = '<h1>Foto ' + (I.fi + 1) + ' de ' + I.files.length + '</h1>' +
      '<p class="hint" style="margin-top:6px">Cada recuadro es una canción. Muévelo desde el centro y cambia su tamaño desde las esquinas. Si un recuadro continúa otra canción, elígela en la lista.</p>' +
      '<div class="seg2">' +
        '<div class="stagewrap"><div class="stage" id="imStage"><img src="' + esc(I.h.url) + '" alt="Foto de la página" draggable="false">' + boxes + '</div></div>' +
        '<div class="segside">' +
          '<label class="f">Página de esta foto<input type="text" id="imPageVal" inputmode="numeric" value="' + esc(I.pageVal) + '"></label>' +
          '<div id="segList" class="segList"></div>' +
          '<div class="actions"><button class="btn" type="button" id="imAdd">Agregar recuadro</button>' +
          '<button class="btn primary" type="button" id="imGo">Leer las canciones</button>' +
          '<button class="btn" type="button" id="imSkip">Saltar esta foto</button></div>' +
        '</div></div>';
    renderSegList();
  }

  function renderSegList() {
    var el = $('#segList'); if (!el) return;
    el.innerHTML = I.boxes.map(function (b, i) {
      var opts = '<option value="">Empieza una canción</option>';
      for (var j = 0; j < i; j++) opts += '<option value="' + j + '"' + (b.continues === j ? ' selected' : '') + '>Continúa el recuadro ' + (j + 1) + '</option>';
      return '<div class="sgi"><span class="sgn">' + (i + 1) + '</span>' +
        '<input type="text" data-t="' + i + '" value="' + esc(b.title) + '" placeholder="Título" aria-label="Título del recuadro ' + (i + 1) + '">' +
        '<select data-c="' + i + '" aria-label="Continuación del recuadro ' + (i + 1) + '">' + opts + '</select>' +
        '<button class="btn" type="button" data-del="' + i + '" aria-label="Quitar el recuadro ' + (i + 1) + '">Quitar</button>' +
        (b.note ? '<p class="hint sgnote">' + esc(b.note) + '</p>' : '') + '</div>';
    }).join('');
  }

  function stageEl() { return $('#imStage'); }

  /* ---------- 3. Lectura con el modelo ---------- */
  function readAll() {
    var run = I.run;
    var groups = groupSongs(I.boxes);
    var results = [];
    var gi = 0;
    function step() {
      if (!mine(run)) return;
      if (gi >= groups.length) { reviewQueue(results); return; }
      var g = groups[gi];
      var title = g.title || 'canción ' + (gi + 1);
      view.innerHTML = '<h1>Leyendo</h1><p class="hint" style="margin-top:6px">Canción ' + (gi + 1) + ' de ' + groups.length + ': ' + esc(title) + '. Tarda entre 20 y 60 segundos.</p>';
      var images = g.indices.map(function (i) { return d.imaging.crop(I.h, I.boxes[i].box); });
      var hint = [I.cancionero ? 'Cancionero: ' + I.cancionero : '', I.pageVal ? 'página ' + I.pageVal : '', g.title ? 'título detectado: ' + g.title : ''].filter(Boolean).join(', ');
      d.api.readPage({ mode: 'transcribe', images: images, hint: hint }).then(function (r) {
        if (!mine(run)) return;
        results.push({ group: g, result: r, images: images });
        gi++; step();
      }, function (e) {
        if (!mine(run)) return;
        view.innerHTML = '<h1>No se pudo leer</h1><p class="hint" style="margin-top:6px">' + esc(title) + ': ' + esc(errMsg(e)) + '</p>' +
          '<div class="actions" style="margin-top:12px"><button class="btn primary" type="button" id="imRetry">Reintentar</button>' +
          '<button class="btn" type="button" id="imSkipSong">Saltar esta canción</button><button class="btn" type="button" id="imAbort">Terminar importación</button></div>';
        retry = step; skipSong = function () { gi++; step(); };
      });
    }
    var retry = null, skipSong = null;
    I.retry = function () { retry && retry(); };
    I.skipSong = function () { skipSong && skipSong(); };
    step();
  }

  /* ---------- 4. Revisión ---------- */
  function conv(t) { return convertSolfege('[' + t + ']').slice(1, -1); }
  function reviewQueue(results) {
    var run = I.run, k = 0;
    function next() {
      if (!mine(run)) return;
      if (k >= results.length) { nextPhoto(); return; }
      var it = results[k], r = it.result;
      var song = {
        id: d.uid(), title: r.title || it.group.title || 'Sin título', artist: r.artist || '', key: r.key || '', tuning: r.tuning || '',
        source: I.cancionero, page: I.pageVal, status: 'pendiente', body: convertSolfege(r.body || ''), diagrams: {}, doubts: 0
      };
      k++;
      d.openReview({
        song: song, crops: it.images,
        doubts: (r.doubts || []).map(function (x) { return { text: conv(x.text), note: x.note, box: x.box }; }),
        remarks: r.remarks || '',
        label: 'Canción ' + k + ' de ' + results.length + ' · foto ' + (I.fi + 1) + ' de ' + I.files.length,
        onSave: function () { I.saved++; next(); },
        onSkip: next,
        onAbort: finish
      });
    }
    next();
  }

  function nextPhoto() {
    release();
    I.fi++;
    var n = parseInt(I.pageVal, 10);
    I.nextPage = isNaN(n) ? '' : String(n + 1);
    if (I.fi >= I.files.length) { finish(); return; }
    beginPhoto();
  }

  /* ---------- Eventos ---------- */
  view.addEventListener('submit', function (e) {
    if (!e.target || e.target.id !== 'imForm') return;
    e.preventDefault();
    var files = [].slice.call($('#imFiles').files || []);
    if (!files.length) { d.toast('Elige al menos una foto.', true); return; }
    I.files = files.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    I.fi = 0; I.saved = 0;
    I.cancionero = $('#imSrc').value.trim();
    remember('cancionero', I.cancionero);
    I.nextPage = $('#imPage').value.trim();
    beginPhoto();
  });

  view.addEventListener('click', function (e) {
    if (!I.active) return;
    var id = e.target.id;
    if (id === 'imCancel') { cancel(); d.finish(0, true); }
    else if (id === 'imAdd') { I.boxes.push({ title: '', box: { x: 0.3, y: 0.3, w: 0.4, h: 0.3 }, continues: null, note: '' }); renderSeg(); }
    else if (id === 'imGo') { readAll(); }
    else if (id === 'imSkip') nextPhoto();
    else if (id === 'imRetry') I.retry();
    else if (id === 'imSkipSong') I.skipSong();
    else if (id === 'imAbort') finish();
    else if (e.target.getAttribute && e.target.getAttribute('data-del') != null) {
      if (I.boxes.length <= 1) { d.toast('Debe quedar al menos un recuadro.', true); return; }
      I.boxes = removeBox(I.boxes, parseInt(e.target.getAttribute('data-del'), 10));
      renderSeg();
    }
  });
  view.addEventListener('input', function (e) {
    if (!I.active) return;
    var t = e.target;
    if (t.id === 'imPageVal') I.pageVal = t.value.trim();
    else if (t.getAttribute && t.getAttribute('data-t') != null) I.boxes[parseInt(t.getAttribute('data-t'), 10)].title = t.value;
  });
  view.addEventListener('change', function (e) {
    if (!I.active) return;
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-c') != null) {
      var i = parseInt(t.getAttribute('data-c'), 10);
      I.boxes[i].continues = t.value === '' ? null : parseInt(t.value, 10);
    }
  });

  view.addEventListener('pointerdown', function (e) {
    if (!I.active || !stageEl() || !stageEl().contains(e.target)) return;
    var bx = e.target.closest && e.target.closest('.bx'); if (!bx) return;
    var hd = e.target.getAttribute && e.target.getAttribute('data-h');
    var i = parseInt(bx.getAttribute('data-i'), 10);
    var r = stageEl().getBoundingClientRect();
    drag = { i: i, handle: hd || 'move', sx: e.clientX, sy: e.clientY, w: r.width || 1, h: r.height || 1, start: Object.assign({}, I.boxes[i].box), el: bx };
    if (stageEl().setPointerCapture && e.pointerId != null) { try { stageEl().setPointerCapture(e.pointerId); } catch (x) { /* sin captura */ } }
    e.preventDefault();
  });
  view.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var nb = dragBox(drag.start, drag.handle, (e.clientX - drag.sx) / drag.w, (e.clientY - drag.sy) / drag.h);
    I.boxes[drag.i].box = nb;
    drag.el.setAttribute('style', boxStyle(nb));
  });
  function endDrag() { drag = null; }
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);

  return { render: render, cancel: cancel, isActive: function () { return I.active; } };
}
