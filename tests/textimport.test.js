// Lectura de archivos de texto, Word y PDF, y separación de canciones.
import { deflateRawSync } from 'node:zlib';
import { wrapTabs, convertBody, extOf, decodeText, docxToText, readZipEntry, pdfItemsToText, splitSongs, toSong, extractText, cleanText } from '../public/js/textimport.js';

const fails = [];
const ok = (n, c) => { console.log((c ? 'ok    ' : 'FALLA ') + n); if (!c) fails.push(n); };
const eq = (n, a, b) => ok(n + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' → ' + JSON.stringify(a)), JSON.stringify(a) === JSON.stringify(b));

/* zip mínimo con una entrada */
function zip(name, content, store) {
  const nm = Buffer.from(name), raw = Buffer.from(content);
  const data = store ? raw : deflateRawSync(raw);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(store ? 0 : 8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(store ? 0 : 8, 10); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  const off = lh.length + nm.length + data.length;
  eocd.writeUInt32LE(cd.length + nm.length, 12); eocd.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([lh, nm, data, cd, nm, eocd]));
}

eq('extensión', [extOf('Mi Canción.PDF'), extOf('a.docx'), extOf('sin')], ['pdf', 'docx', '']);
eq('utf-8', decodeText(new TextEncoder().encode('Canción ñandú')), 'Canción ñandú');
eq('windows-1252 cuando no es utf-8', decodeText(new Uint8Array([0x43, 0x61, 0x6e, 0x63, 0x69, 0xf3, 0x6e])), 'Canción');
eq('tabulaciones a columnas', cleanText('Am\tF'), 'Am      F');
eq('saltos de página y retornos', cleanText('a\r\nb\fc'), 'a\nb\n\nc');

const xml = '<w:document><w:body><w:p><w:r><w:t>Am</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">F  </w:t></w:r></w:p><w:p><w:r><w:t>Hola &amp; adiós</w:t></w:r></w:p><w:p/><w:p><w:r><w:t>Fin</w:t></w:r></w:p></w:body></w:document>';
eq('docx: párrafos, tabulación y entidades', docxToText(xml), 'Am\tF  \nHola & adiós\n\nFin\n');
const dz = await readZipEntry(zip('word/document.xml', xml), 'word/document.xml');
eq('zip comprimido', new TextDecoder().decode(dz), xml);
const sz = await readZipEntry(zip('word/document.xml', xml, true), 'word/document.xml');
eq('zip sin compresión', new TextDecoder().decode(sz), xml);
eq('entrada que no existe', await readZipEntry(zip('a.xml', 'x'), 'word/document.xml'), null);
const mk = (name, bytes, type) => ({ name, type: type || '', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
eq('extractText de un .docx', (await extractText(mk('a.docx', zip('word/document.xml', xml)))).split('\n').slice(0, 2), ['Am      F', 'Hola & adiós']);
eq('extractText de un .txt', await extractText(mk('a.txt', new TextEncoder().encode('Hola mundo\nAm   F'))), 'Hola mundo\nAm   F');
let e1 = ''; try { await extractText(mk('viejo.doc', new Uint8Array(4))); } catch (e) { e1 = e.message; }
ok('un .doc pide guardarlo como .docx o PDF', /\.docx o PDF/.test(e1));
let e2 = ''; try { await extractText(mk('x.txt', new TextEncoder().encode('   '))); } catch (e) { e2 = e.message; }
ok('un archivo sin texto se avisa', /no tiene texto/.test(e2));

/* PDF: ítems con posición → líneas con los acordes en su columna */
const it = (str, x, y) => ({ str, x, y, w: str.length * 6, h: 10 });
const page = pdfItemsToText([
  it('Am', 10, 700), it('F', 82, 700),
  it('Hola mundo', 10, 688), it('que tal', 82, 688),
  it('G', 10, 650),
  it('Otra linea', 10, 638)
]);
const pl = page.split('\n');
eq('pdf: la línea de acordes conserva columnas', pl[0], 'Am' + ' '.repeat(10) + 'F');
eq('pdf: la letra va debajo', pl[1].startsWith('Hola mundo'), true);
eq('pdf: un hueco grande deja una línea en blanco', pl[2], '');
eq('pdf: sin ítems', pdfItemsToText([it(' ', 1, 1)]), '');

/* separar canciones */
const dos = 'La maza\n\nAm   F\nHola mundo\n\n\n\nOtra cancion\n\nC    G\nChao mundo';
const sp = splitSongs(dos);
eq('dos canciones por títulos tras dos líneas en blanco', sp.map((s) => s.title), ['La maza', 'Otra cancion']);
eq('el título sale del cuerpo', sp[0].text, 'Am   F\nHola mundo');
const sec = 'Una\n\nAm   F\nHola\n\n\nCoro\nG    C\nCanto';
eq('una sección (Coro) no parte la canción', splitSongs(sec).length, 1);
eq('separador de guiones', splitSongs('Uno\nHola mundo\n----\nDos\nChao mundo').map((s) => s.title), ['Uno', 'Dos']);
eq('sin título reconocible', splitSongs('Am   F\nHola mundo')[0].title, '');
eq('solo espacios no es una canción', splitSongs('\n\n   \n').length, 0);
const ts = toSong(sp[0], 'cancionero.pdf');
eq('toSong convierte acordes sobre la letra', ts.body, '[Am]Hola [F]mundo');
eq('toSong cuenta las líneas de acordes', ts.chordLines, 1);
eq('toSong usa el nombre del archivo si no hay título', toSong({ title: '', text: 'x' }, 'Mi_cancion.txt').title, 'Mi cancion');

/* tablatura en texto */
const tab = 'Intro:\n\nC/E   G/B\ne: ---0-----0---|\nB: -----5-3-----\nG: -0-----0-----\nD: ---------0---\nA: -3-----2-----\nE: --------------\n\nC    G\nHola mundo';
const wt = wrapTabs(tab).split('\n');
eq('la tablatura se envuelve en {sot} y {eot}', [wt[3], wt[10]], ['{sot}', '{eot}']);
eq('dos líneas sueltas parecidas a tablatura no se envuelven', wrapTabs('e: ----\nB: ----').includes('{sot}'), false);
const cb = convertBody(tab);
const cl = cb.text.split('\n');
eq('el acorde sobre la tablatura queda como línea de acordes', cl[2], '> C/E G/B');
eq('la tablatura no se toca', cl.slice(4, 10).every((l, i) => l === tab.split('\n')[3 + i]), true);
eq('la letra de después sí se convierte', cl[cl.length - 1], '[C]Hola [G]mundo'.replace('[C]Hola [G]mundo', '[C]Hola [G]mundo'));

/* PDF con letra proporcional: el acorde se ubica sobre la letra que tiene debajo */
const prop = pdfItemsToText([
  { str: 'C     G', x: 10, y: 700, w: 7 * 7, h: 10 },
  { str: 'Tu estabas aqui', x: 10, y: 688, w: 15 * 5, h: 10 }
]);
eq('proporcional: G cae donde empieza lo que hay debajo', prop.split('\n')[0].indexOf('G'), Math.round((10 + (6 / 7) * 49 - 10) / (75 / 15)));

if (fails.length) { console.log('\nFALLARON:\n' + fails.join('\n')); process.exit(1); }
console.log('\ntodas las pruebas pasan');
