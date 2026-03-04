# 🔥 IGNIS — Gestión de Material Parque de Bomberos

## Instalación (solo la primera vez)

1. Descomprime esta carpeta en tu Mac (ej: Escritorio)
2. Abre la Terminal (Command + Espacio → escribe "Terminal")
3. Escribe estos comandos uno a uno:

```
cd ~/Desktop/ignis-app
npm install
npm run dev
```

4. Abre el navegador en: http://localhost:5173

## Arrancar la app (cada vez)

```
cd ~/Desktop/ignis-app
npm run dev
```

Y abre: http://localhost:5173

## Variables de entorno (obligatorio)

Crea el archivo `.env` en la raíz del proyecto con:

```
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
VITE_STREET_PDFS_BUCKET=pdfs-calles
```

Puedes copiar `.env.example` y editarlo:

```
cp .env.example .env
```

## Callejero: PDFs en Supabase Storage (recomendado)

Para que `Ruta más rápida` cargue PDFs online (sin depender de carpeta local):

1. Ejecuta [street-pdfs-storage.sql](/Users/victor/Desktop/ignis-app/street-pdfs-storage.sql) en Supabase SQL Editor.
2. En Supabase, sube los PDFs al bucket `pdfs-calles`.
3. Usa la variable `VITE_STREET_PDFS_BUCKET=pdfs-calles` (o el nombre que quieras).

Nota: si no existe el PDF en Storage, la app usa fallback local (`/pdfs_calles/...`).

## Publicar en web (recomendado: Vercel)

1. Sube este proyecto a GitHub.
2. Entra en [Vercel](https://vercel.com), importa el repositorio.
3. En **Project Settings > Environment Variables**, añade:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

El proyecto ya incluye `vercel.json` para que React Router funcione con rutas directas.

## Alternativa: Netlify

1. Sube el proyecto a GitHub.
2. Entra en [Netlify](https://netlify.com), crea un sitio desde el repo.
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Añade en Variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

El proyecto ya incluye `netlify.toml` con redirect SPA.

## ¿Cómo se guardan los datos?

Los datos se guardan automáticamente en el navegador (localStorage).
- ✅ Se guardan solos al hacer cualquier cambio
- ✅ Persisten aunque cierres la app o apagues el Mac
- ✅ Cada dispositivo tiene sus propios datos independientes
- ⚠️  Si borras los datos del navegador, se pierden

## Estructura del proyecto

```
ignis-app/
├── src/
│   ├── components/     → Sidebar, Modal, Toast
│   ├── data/           → Configuración de unidades
│   ├── lib/            → Estado global + localStorage
│   └── pages/          → Dashboard, Unidades, Alertas...
├── index.html
└── package.json
```
