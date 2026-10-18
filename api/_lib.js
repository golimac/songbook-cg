// Lógica de la función de lectura de fotos. Sin dependencias, para probarla con fetch simulado.

export const MAX_IMAGES = 4;
export const MAX_BYTES = 4_000_000; // Vercel limita el cuerpo de una función a 4,5 MB

const BOX = {
  type: 'object',
  description: 'Rectángulo en fracciones de 0 a 1 de la imagen: x e y son la esquina superior izquierda.',
  properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
  required: ['x', 'y', 'w', 'h']
};

export const TOOLS = {
  segment: {
    name: 'report_segments',
    description: 'Informa qué canciones hay en la foto de la página y dónde están.',
    input_schema: {
      type: 'object',
      properties: {
        page_number: { type: 'string', description: 'Número de página impreso en el encabezado, o cadena vacía.' },
        page_header: { type: 'string', description: 'Texto del encabezado de la página tal como se lee (por ejemplo: 52 "E.C."), o cadena vacía.' },
        songs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              box: BOX,
              continues: { type: ['integer', 'null'], description: 'Índice (desde 0) del recuadro de esta lista al que continúa este, o null si empieza una canción.' },
              note: { type: 'string', description: 'Duda sobre este recuadro (límite incierto, posible continuación), o cadena vacía.' }
            },
            required: ['title', 'box', 'continues', 'note']
          }
        }
      },
      required: ['page_number', 'page_header', 'songs']
    }
  },
  transcribe: {
    name: 'report_song',
    description: 'Entrega la transcripción de una canción.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        artist: { type: 'string', description: 'Solo si aparece impreso; si no, cadena vacía.' },
        key: { type: 'string', description: 'Tonalidad solo si aparece impresa; si no, cadena vacía.' },
        tuning: { type: 'string', description: 'Indicación impresa de afinación o cejilla, por ejemplo: Afinar las cuerdas un tono más bajo.' },
        body: { type: 'string', description: 'Letra y acordes en el formato de Songbook CG descrito en las instrucciones.' },
        doubts: {
          type: 'array',
          description: 'Cada lectura insegura que dejaste marcada en el texto.',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'El fragmento dudoso exactamente como aparece en body.' },
              note: { type: 'string', description: 'Qué dudas: lectura alternativa o motivo.' },
              box: BOX
            },
            required: ['text', 'note']
          }
        },
        remarks: { type: 'string', description: 'Cosas de la página que no encajan en el formato: diagramas de acordes impresos (con su rótulo), símbolos raros, tachaduras. Cadena vacía si no hay.' }
      },
      required: ['title', 'artist', 'key', 'tuning', 'body', 'doubts', 'remarks']
    }
  }
};

export const SYSTEM = `Eres un transcriptor experto de cancioneros de guitarra impresos en papel, en español. Las páginas se fotografían con el celular: pueden estar torcidas, con sombras, manchas, texto borroso, perforaciones y trozos de las páginas vecinas en los bordes (ignora esos trozos).

Cada página trae una o varias canciones en una o dos columnas. Una canción puede continuar en otra columna, casi siempre solo con la letra repetida.

FORMATO DE SALIDA (campo body), una línea del papel por línea de salida:
- Las líneas de letra llevan cada acorde entre corchetes justo antes de la sílaba que queda debajo del inicio del acorde: "[Am]El derrumbe de un [D]sueño". Si un acorde queda sobre un espacio o al final, ponlo antes de la sílaba más cercana a su derecha o al final de la línea.
- Una línea que solo trae acordes se escribe con "> ": "> Am F C G".
- La introducción se escribe "{intro: G - D - Em - C}". Separa siempre los acordes con " - " aunque el papel use guiones largos o sin espacios. Los grupos entre paréntesis que trae el papel, como "DO(DO4-DO-SOL7)", se conservan entre paréntesis.
- Un subtítulo o indicación entre paréntesis (afinación, cejilla, "etc.") va como nota: "{c: texto}". La afinación también va en el campo tuning.
- Las tablaturas van entre "{sot}" y "{eot}", una línea del papel por línea, con el espaciado original.
- Si el papel tiene una corrección tachada, escribe la versión corregida y la tachada en una línea aparte "{alt: texto}" justo debajo.
- Separa las estrofas con una línea vacía. Omite las marcas de sección A) B) C) del margen. Conserva "etc." y puntos suspensivos tal como están.
- No inventes ni completes nada. Transcribe solo lo que se ve.

ACORDES (los cancioneros usan solfeo; puedes escribir solfeo o letras, el sistema lo convierte): DO RE MI FA SOL LA SI = C D E F G A B. Conserva exactamente los modificadores: m (menor), 7, 4, 6, 9, 7+, "d" (disminuido), # y b, barra de bajo ("RE/FA", "SOL4/9"), y el asterisco (*) que acompaña a algunos acordes: "LA*", "MIm*". Si junto a una figura de números romanos y trastes ves algo como (V-0 - VI-0-2-4), escríbelo como pares cuerda-traste: (50-60-62-64), donde el número romano es la cuerda.

DUDAS: cuando no estés seguro de un acorde, escribe tu mejor lectura con un signo de interrogación al final dentro de los corchetes: "[Am?]". Si no puedes leerlo en absoluto, copia lo que ves tal cual, aunque no sea un acorde válido: "[Sld7]". Si una figura de trastes queda incompleta, marca el hueco con "?": (62-5?-64). Cada duda va también en doubts, con su recuadro aproximado dentro de la imagen. Una duda marcada vale más que una lectura inventada.

DIAGRAMAS IMPRESOS (cuadrículas de mástil con puntos): no los transcribas. Menciónalos en remarks con su rótulo, por ejemplo "Diagrama impreso: MIm*".`;

export function dataUrlToImage(u) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(u || ''));
  return m ? { media_type: m[1], data: m[2] } : null;
}

export function validateBody(b) {
  if (!b || typeof b !== 'object') return { error: 'Falta el cuerpo de la solicitud.' };
  if (b.mode !== 'segment' && b.mode !== 'transcribe') return { error: 'Modo no válido.' };
  if (!Array.isArray(b.images) || !b.images.length) return { error: 'Falta la imagen.' };
  if (b.images.length > MAX_IMAGES) return { error: 'Demasiadas imágenes en una solicitud.' };
  const images = b.images.map(dataUrlToImage);
  if (images.some((i) => !i)) return { error: 'Imagen no válida: usa JPEG, PNG o WebP en base64.' };
  if (b.mode === 'segment' && images.length !== 1) return { error: 'La detección de canciones recibe una sola imagen.' };
  const size = images.reduce((n, i) => n + i.data.length, 0);
  if (size > MAX_BYTES) return { error: 'Las imágenes pesan demasiado; redúcelas e intenta de nuevo.' };
  const hint = typeof b.hint === 'string' ? b.hint.slice(0, 400) : '';
  return { mode: b.mode, images, hint, chordsOnly: b.mode === 'transcribe' && b.chordsOnly === true };
}

// Modo "solo acordes": el modelo lee la estructura y los acordes y deja la letra para que la escriba la persona.
export const CHORDS_ONLY = `MODO SOLO ACORDES. En esta lectura no transcribes ninguna palabra de la letra, ni siquiera las primeras. Solo entregas la estructura y los acordes:
- Cada línea del papel que trae acordes sobre la letra se escribe como una línea de acordes sueltos, separados por espacios, con los espacios necesarios para que cada acorde quede en la misma posición horizontal relativa que tiene en el papel (un carácter por cada letra de la letra impresa). Debajo va una línea vacía, donde la persona escribirá la letra.
- Una línea del papel que solo trae letra, sin acordes, se escribe como una línea vacía.
- La introducción se escribe "{intro: G - D - Em - C}", las indicaciones entre paréntesis como "{c: texto}" y las tablaturas entre "{sot}" y "{eot}", como en el formato normal.
- Las dudas de acordes siguen igual: "Am?" y lo ilegible se copia tal cual.
- En remarks escribe "Solo acordes: la letra queda por escribir." además de lo que corresponda.`;

export function buildRequest(parsed, env, retry) {
  const tool = TOOLS[parsed.mode];
  const model = parsed.mode === 'segment'
    ? (env.ANTHROPIC_MODEL_SEGMENT || 'claude-sonnet-5-5')
    : (env.ANTHROPIC_MODEL || 'claude-opus-5-5');
  const multi = parsed.images.length > 1;
  const ask = parsed.mode === 'segment'
    ? 'Esta es la foto de una página. Identifica cada canción y devuelve su recuadro, que debe incluir título, introducción, acordes, letra y los diagramas impresos de esa canción. Usa el orden de lectura: columna izquierda de arriba abajo y luego la derecha. Si un bloque continúa una canción anterior (por ejemplo, letra repetida sin acordes al pie de una columna), indica en "continues" el índice del recuadro al que sigue. Si un límite o una continuación es dudoso, dilo en "note".'
    : (multi
      ? 'Estas imágenes son partes consecutivas de UNA sola canción, en orden. Transcríbela completa como una canción.'
      : 'Transcribe la canción de esta imagen.');
  const askFinal = parsed.chordsOnly ? 'Lee de esta imagen solo la estructura y los acordes de la canción, sin ninguna palabra de la letra, como indican las instrucciones del modo solo acordes.' : ask;
  const content = parsed.images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } }));
  content.push({ type: 'text', text: askFinal + (parsed.hint ? '\n\nContexto del usuario: ' + parsed.hint : '') +
    (retry ? '\n\nIMPORTANTE: tu respuesta anterior no llamó a la herramienta. Responde solo llamando a ' + tool.name + '.' : '') });
  return {
    model,
    max_tokens: parsed.mode === 'segment' ? 2000 : 6000,
    // Algunos modelos no admiten forzar la herramienta (tool_choice "tool"), así que se pide en las instrucciones.
    system: SYSTEM + (parsed.chordsOnly ? '\n\n' + CHORDS_ONLY : '') + '\n\nEntrega SIEMPRE el resultado llamando a la herramienta ' + tool.name + ', sin texto antes ni después.',
    tools: [tool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }]
  };
}

export function extractToolInput(resp, name) {
  const blocks = resp && Array.isArray(resp.content) ? resp.content : [];
  const b = blocks.find((x) => x.type === 'tool_use' && x.name === name);
  if (!b || !b.input || typeof b.input !== 'object') throw new Error('El modelo no devolvió el resultado esperado.');
  return b.input;
}

const str = (v) => (typeof v === 'string' ? v : '');
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export function normBox(b) {
  if (!b || typeof b !== 'object') return null;
  const x = clamp01(num(b.x)), y = clamp01(num(b.y));
  const w = Math.min(1 - x, Math.max(0, num(b.w))), h = Math.min(1 - y, Math.max(0, num(b.h)));
  return w > 0.01 && h > 0.01 ? { x, y, w, h } : null;
}

export function normalizeSegments(input) {
  const songs = (Array.isArray(input.songs) ? input.songs : []).map((s) => ({
    title: str(s.title).trim(), box: normBox(s.box), continues: Number.isInteger(s.continues) ? s.continues : null, note: str(s.note).trim()
  })).filter((s) => s.box);
  songs.forEach((s, i) => { if (s.continues != null && (s.continues < 0 || s.continues >= i)) s.continues = null; });
  return { page_number: str(input.page_number).trim(), page_header: str(input.page_header).trim(), songs };
}

export function normalizeSong(input) {
  const body = str(input.body).replace(/\r/g, '').replace(/[–—]/g, '-').replace(/\s+$/, '');
  return {
    title: str(input.title).trim(), artist: str(input.artist).trim(), key: str(input.key).trim(), tuning: str(input.tuning).trim(),
    body,
    doubts: (Array.isArray(input.doubts) ? input.doubts : []).map((d) => ({ text: str(d.text), note: str(d.note), box: normBox(d.box) })).filter((d) => d.text),
    remarks: str(input.remarks).trim()
  };
}

// Comprueba con Firebase que el token es de la cuenta dueña. Evita gastar dinero en la API de Anthropic con tokens ajenos.
export async function verifyOwner(idToken, env, fetchFn) {
  if (!idToken || !env.OWNER_EMAIL) return false;
  const key = env.FIREBASE_API_KEY || 'AIzaSyAXaNKvWtrJTkvoMpTiMrxbpOmAwhSmJM8';
  const r = await fetchFn('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(key), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken })
  });
  if (!r.ok) return false;
  const j = await r.json();
  const u = j && j.users && j.users[0];
  return !!u && u.emailVerified === true && String(u.email).toLowerCase() === String(env.OWNER_EMAIL).toLowerCase();
}

export async function handle(req, env, fetchFn) {
  if (req.method !== 'POST') return { status: 405, body: { error: 'Usa POST.' } };
  if (!env.ANTHROPIC_API_KEY) return { status: 500, body: { error: 'Falta la variable ANTHROPIC_API_KEY en Vercel.' } };
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let owner = false;
  try { owner = await verifyOwner(token, env, fetchFn); } catch (e) { return { status: 502, body: { error: 'No se pudo verificar la sesión.' } }; }
  if (!owner) return { status: 401, body: { error: 'Sesión no autorizada.' } };
  const parsed = validateBody(req.body);
  if (parsed.error) return { status: 400, body: { error: parsed.error } };
  const call = (retry) => fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(buildRequest(parsed, env, retry))
  });
  let resp;
  try { resp = await call(false); } catch (e) { return { status: 502, body: { error: 'No se pudo contactar al modelo.' } }; }
  if (resp.status === 401) return { status: 502, body: { error: 'La llave de Anthropic venció o no es válida. Crea una nueva en console.anthropic.com y reemplaza ANTHROPIC_API_KEY en Vercel (Settings, Environment Variables), luego haz Redeploy.' } };
  if (!resp.ok) {
    let msg = '';
    try { const j = await resp.json(); msg = j && j.error && j.error.message ? j.error.message : ''; } catch (e) { /* sin detalle */ }
    return { status: 502, body: { error: 'El modelo respondió con error ' + resp.status + (msg ? ': ' + msg : '.') } };
  }
  const name = TOOLS[parsed.mode].name;
  const finish = (input) => ({ status: 200, body: parsed.mode === 'segment' ? normalizeSegments(input) : normalizeSong(input) });
  try {
    return finish(extractToolInput(await resp.json(), name));
  } catch (e) {
    // Sin tool_choice forzado el modelo puede contestar con texto: un solo reintento recordándole la herramienta.
    try {
      const r2 = await call(true);
      if (!r2.ok) return { status: 502, body: { error: 'El modelo respondió con error ' + r2.status + '.' } };
      return finish(extractToolInput(await r2.json(), name));
    } catch (e2) { return { status: 502, body: { error: e2.message } }; }
  }
}
