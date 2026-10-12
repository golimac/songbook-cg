# Songbook CG

Cancionero personal para guitarra: letras con acordes, transposición, diagramas, edición y exportación a ChordPro.

- **Alojamiento:** Vercel, desde este repositorio (carpeta `public/`, sin paso de compilación).
- **Datos:** Firebase Firestore. `songs/{id}` guarda los datos livianos de la lista y `bodies/{id}` el cuerpo de cada canción.
- **Acceso:** inicio de sesión con Google. Las reglas de `firestore.rules` permiten leer y escribir solo al dueño.

## Puesta en marcha

1. **Reglas de Firestore.** En la consola de Firebase, Firestore Database, pestaña Reglas: pega `firestore.rules`, cambia `REEMPLAZA_CON_TU_CORREO@gmail.com` por tu correo de Google y publica.
2. **Vercel.** Importa el repositorio en Vercel con el preset *Other*. No hay comando de compilación. `vercel.json` ya indica la carpeta `public`.
3. **Dominios autorizados.** En Firebase, Authentication, Configuración, Dominios autorizados: agrega el dominio que Vercel asigne (por ejemplo `songbook-cg.vercel.app`).

## Pruebas

```
npm install
npm test
```

Las pruebas cubren el núcleo (acordes, transposición, formas, ChordPro) y la interfaz con una base de datos simulada.

## Estructura

```
public/index.html          página única
public/css/app.css         estilos
public/js/core.js          acordes, transposición, formato de canción, diagramas, ChordPro
public/js/app.js           interfaz
public/js/firebase-api.js  capa de datos y acceso
firestore.rules            reglas de seguridad
tests/                     pruebas
```
