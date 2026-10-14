// Capa de datos sobre Firebase. app.js solo conoce la interfaz que devuelve createFirebaseApi().
//
// Modelo en Firestore:
//   songs/{id}   datos livianos para la lista: title, artist, key, tuning, source, page, status, doubts, album, year, cover, createdAt, updatedAt
//   chords/{nombre}  posiciones de un acorde (biblioteca de acordes): name, shapes [{frets, base, barre}]
//   bodies/{id}  cuerpo pesado, se lee al abrir la canción: body, diagrams, prefs (posición principal por acorde)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, onSnapshot, query, where, writeBatch, serverTimestamp, setDoc, deleteDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const META = ['title', 'artist', 'key', 'tuning', 'source', 'page', 'status', 'doubts', 'album', 'year', 'cover', 'chords'];

export function createFirebaseApi() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  // Copia local en IndexedDB: la lista y las canciones ya abiertas funcionan sin conexión.
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });

  return {
    onAuth(cb) {
      return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
    },
    async signIn() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        if (e && e.code === 'auth/popup-blocked') await signInWithRedirect(auth, provider);
        else if (!e || (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request')) throw e;
      }
    },
    signOut() { return signOut(auth); },

    // Lista liviana, en vivo. Devuelve la función para dejar de escuchar.
    subscribeSongs(onData, onError) {
      // Los invitados piden solo las revisadas; las reglas de Firestore exigen esa misma condición.
      const col = collection(db, 'songs');
      return onSnapshot(auth.currentUser ? col : query(col, where('status', '==', 'revisada')), (snap) => {
        onData(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())));
      }, onError);
    },

    // Biblioteca de acordes: pública para leer, solo el dueño escribe.
    subscribeChords(onData, onError) {
      return onSnapshot(collection(db, 'chords'), (snap) => {
        onData(snap.docs.map((d) => d.data()).filter((x) => x && x.name));
      }, onError || (() => {}));
    },
    saveChord(name, shapes) {
      return setDoc(doc(db, 'chords', name.replace(/\//g, '_')), { name, shapes, updatedAt: serverTimestamp() });
    },
    deleteChord(name) { return deleteDoc(doc(db, 'chords', name.replace(/\//g, '_'))); },

    async getBody(id) {
      const s = await getDoc(doc(db, 'bodies', id));
      return s.exists() ? s.data() : { body: '', diagrams: {} };
    },

    // Con la copia local activa, commit() no se resuelve hasta que el servidor responde.
    // La lista ya refleja el cambio al instante, así que app.js no espera esta promesa.
    saveSong(song, isNew) {
      const meta = {};
      META.forEach((k) => { if (k === 'chords') { if (Array.isArray(song.chords)) meta.chords = song.chords; } else meta[k] = song[k] == null ? '' : song[k]; });
      meta.doubts = song.doubts || 0;
      meta.updatedAt = serverTimestamp();
      if (isNew) meta.createdAt = serverTimestamp();
      const b = writeBatch(db);
      b.set(doc(db, 'songs', song.id), meta, { merge: true });
      b.set(doc(db, 'bodies', song.id), { body: song.body || '', diagrams: song.diagrams || {}, prefs: song.prefs || {} });
      return b.commit();
    },

    setSongChords(id, chords) { return updateDoc(doc(db, 'songs', id), { chords, libSync: true }); },

    deleteSong(id) {
      const b = writeBatch(db);
      b.delete(doc(db, 'songs', id));
      b.delete(doc(db, 'bodies', id));
      return b.commit();
    },

    // Envía una foto o recorte a la función de Vercel que la lee con el modelo de visión.
    async readPage(payload) {
      const u = auth.currentUser;
      if (!u) throw new Error('Inicia sesión primero.');
      const token = await u.getIdToken();
      const r = await fetch('/api/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify(payload)
      });
      let j = null;
      try { j = await r.json(); } catch (e) { /* respuesta sin JSON */ }
      if (!r.ok) throw new Error((j && j.error) || 'La lectura falló (' + r.status + ').');
      return j;
    },

    // Busca álbum, año y carátula en el catálogo público de iTunes, a través de la función de Vercel.
    async searchAlbum(payload) {
      const u = auth.currentUser;
      if (!u) throw new Error('Inicia sesión primero.');
      const token = await u.getIdToken();
      const r = await fetch('/api/album', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify(payload)
      });
      let j = null;
      try { j = await r.json(); } catch (e) { /* respuesta sin JSON */ }
      if (!r.ok) throw new Error((j && j.error) || 'La búsqueda falló (' + r.status + ').');
      return j.results || [];
    },

    saveMany(songs) {
      const b = writeBatch(db);
      songs.forEach((song) => {
        const meta = {};
        META.forEach((k) => { if (k === 'chords') { if (Array.isArray(song.chords)) meta.chords = song.chords; } else meta[k] = song[k] == null ? '' : song[k]; });
        meta.updatedAt = serverTimestamp();
        meta.createdAt = serverTimestamp();
        b.set(doc(db, 'songs', song.id), meta);
        b.set(doc(db, 'bodies', song.id), { body: song.body || '', diagrams: song.diagrams || {}, prefs: song.prefs || {} });
      });
      return b.commit();
    }
  };
}
