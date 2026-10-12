// Fotos: lectura del archivo, reducción y recortes en canvas, y la geometría de los recuadros de canciones.

export const MIN_BOX = 0.04;

export function clampBox(b) {
  const w = Math.max(MIN_BOX, Math.min(1, b.w)), h = Math.max(MIN_BOX, Math.min(1, b.h));
  return { x: Math.max(0, Math.min(1 - w, b.x)), y: Math.max(0, Math.min(1 - h, b.y)), w: w, h: h };
}

export function padBox(b, p) {
  const x = Math.max(0, b.x - p), y = Math.max(0, b.y - p);
  return { x: x, y: y, w: Math.min(1, b.x + b.w + p) - x, h: Math.min(1, b.y + b.h + p) - y };
}

/* Mueve o redimensiona un recuadro. handle: 'move' o una combinación de n, s, e, w (nw, se...). dx y dy en fracciones. */
export function dragBox(b, handle, dx, dy) {
  if (handle === 'move') return clampBox({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h });
  let x1 = b.x, y1 = b.y, x2 = b.x + b.w, y2 = b.y + b.h;
  if (handle.indexOf('w') >= 0) x1 = Math.min(x2 - MIN_BOX, Math.max(0, x1 + dx));
  if (handle.indexOf('e') >= 0) x2 = Math.max(x1 + MIN_BOX, Math.min(1, x2 + dx));
  if (handle.indexOf('n') >= 0) y1 = Math.min(y2 - MIN_BOX, Math.max(0, y1 + dy));
  if (handle.indexOf('s') >= 0) y2 = Math.max(y1 + MIN_BOX, Math.min(1, y2 + dy));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/* Junta los recuadros que continúan a otro en una sola canción. Devuelve [{ indices, title }] con la raíz primero. */
export function groupSongs(boxes) {
  const rootOf = (i) => { let n = 0; while (boxes[i].continues != null && boxes[boxes[i].continues] && n++ < boxes.length) i = boxes[i].continues; return i; };
  const groups = {}, order = [];
  boxes.forEach((b, i) => {
    const r = rootOf(i);
    if (!groups[r]) { groups[r] = []; order.push(r); }
    groups[r].push(i);
  });
  return order.map((r) => ({ indices: groups[r], title: boxes[r].title }));
}

/* Quita referencias rotas tras borrar el recuadro n: las continuaciones de n pasan a su raíz y los índices se corren. */
export function removeBox(boxes, n) {
  const target = boxes[n].continues;
  return boxes.filter((_, i) => i !== n).map((b) => {
    let c = b.continues;
    if (c === n) c = target;
    if (c != null && c > n) c -= 1;
    return Object.assign({}, b, { continues: c });
  });
}

/* Posición CSS (fondo ampliado) para mostrar solo una parte de una imagen. */
export function zoomStyle(box) {
  const w = Math.max(box.w, MIN_BOX), h = Math.max(box.h, MIN_BOX);
  const px = w >= 1 ? 0 : (box.x / (1 - w)) * 100, py = h >= 1 ? 0 : (box.y / (1 - h)) * 100;
  return { size: (100 / w).toFixed(2) + '% auto', pos: px.toFixed(2) + '% ' + py.toFixed(2) + '%' };
}

/* ---- Imágenes (solo navegador) ---- */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img: img, url: url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen.')); };
    img.src = url;
  });
}

function draw(handle, box, maxSide, quality) {
  const sw = Math.round(handle.width * box.w), sh = Math.round(handle.height * box.h);
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(handle.img, Math.round(handle.width * box.x), Math.round(handle.height * box.y), sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

export const imaging = {
  load: loadImage,
  // Foto entera reducida para detectar canciones
  page: (handle) => draw(handle, { x: 0, y: 0, w: 1, h: 1 }, 1600, 0.82),
  // Recorte de una canción con más resolución
  crop: (handle, box) => draw(handle, padBox(box, 0.01), 1800, 0.88),
  release: (handle) => { try { URL.revokeObjectURL(handle.url); } catch (e) { /* nada que liberar */ } }
};
