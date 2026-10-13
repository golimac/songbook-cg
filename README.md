# Songbook CG

Cancionero personal para guitarra: letras con acordes, transposición, diagramas, edición y exportación a ChordPro.

- **Alojamiento:** Vercel, desde este repositorio (carpeta `public/`, sin paso de compilación).
- **Datos:** Firebase Firestore. `songs/{id}` guarda los datos livianos de la lista y `bodies/{id}` el cuerpo de cada canción.
- **Acceso:** cualquiera con el enlace puede ver las canciones revisadas (las pendientes y con dudas solo las ve el dueño; modo invitado: transponer, cejilla, diagramas, autoscroll y exportar, sin editar nada). Escribir exige iniciar sesión con la cuenta del dueño, según `firestore.rules`.

## Puesta en marcha

1. **Reglas de Firestore.** En la consola de Firebase, Firestore Database, pestaña Reglas: pega `firestore.rules` (reemplaza lo que haya), cambia `REEMPLAZA_CON_TU_CORREO@gmail.com` por tu correo de Google y publica.
2. **Vercel.** Importa el repositorio en Vercel con el preset *Other*. No hay comando de compilación. `vercel.json` ya indica la carpeta `public`.
3. **Dominios autorizados.** En Firebase, Authentication, Configuración, Dominios autorizados: agrega el dominio que Vercel asigne (por ejemplo `songbook-cg.vercel.app`).
4. **Lectura de fotos.** En Vercel, Settings, Environment Variables, agrega y vuelve a desplegar:

   | Variable | Valor |
   | --- | --- |
   | `ANTHROPIC_API_KEY` | llave creada en console.anthropic.com |
   | `OWNER_EMAIL` | tu correo de Google; solo esa cuenta puede usar la función |
   | `ANTHROPIC_MODEL` | opcional; transcripción, por defecto `claude-opus-5-5` |
   | `ANTHROPIC_MODEL_SEGMENT` | opcional; detección de canciones, por defecto `claude-sonnet-5-5` |

## Pruebas

```
npm install
npm test
```

Las pruebas cubren el núcleo (acordes, transposición, solfeo, formas, ChordPro), la función de lectura con `fetch` simulado, la geometría de recuadros y la interfaz con una base de datos simulada.

## Estructura

```
public/index.html          página única
public/css/app.css         estilos
public/js/core.js          acordes, transposición, formato de canción, diagramas, ChordPro
public/js/app.js           interfaz
public/js/photo.js         fotos: recortes en canvas y geometría de recuadros
public/js/import.js        importar fotos: recuadros, lectura y paso a revisión
public/js/firebase-api.js  capa de datos y acceso
api/read.js, api/_lib.js   función de Vercel que lee fotos con el modelo de visión
firestore.rules            reglas de seguridad
tests/                     pruebas
```

## Estilos

La interfaz usa Tailwind 4. El código fuente de los estilos está en `src/app.css` y el resultado compilado en `public/css/app.css` (se sube al repositorio, Vercel no compila nada). Después de cambiar estilos o clases en `public/js`, ejecuta `npm run build:css`.
