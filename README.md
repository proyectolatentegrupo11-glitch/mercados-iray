# 🛒 Mercados IRAY · Inventario digital

Aplicación web para el control de inventario de **Mercados IRAY** (Bogotá).
Pensada para personas con nivel digital básico: botones grandes, textos claros
en español y **funcionamiento sin internet**.

- 📦 Inventario completo (agregar, editar, eliminar).
- 💵 Valor total del inventario calculado solo.
- ⏰ Semáforo de vencimientos (amarillo = por vencer en ≤30 días, rojo = vencido).
- 🔎 Buscador por nombre o código.
- 🏷️ Lector de código de barras por **USB** (como teclado) y por **cámara**.
- ⬇️ Exportación a **CSV** (se abre en Excel).
- 🌙 Modo claro / oscuro.
- 💾 Guardado automático en el dispositivo (**localStorage**, offline).
- ☁️ Sincronización **opcional** con Supabase cuando hay internet.

---

## 🧰 Requisitos

- Node.js 18 o superior.

## ▶️ Correr en local

```bash
npm install
npm run dev
```

Abre la dirección que muestra la consola (normalmente `http://localhost:5173`).

> La app funciona **sin configurar nada**. Supabase es opcional.

## 🏗️ Generar versión de producción

```bash
npm run build      # genera la carpeta dist/
npm run preview    # previsualiza la build
```

---

## 🚀 Desplegar en Vercel (GitHub → Vercel)

```bash
# 1. Subir a GitHub
git init && git add . && git commit -m "initial"
git remote add origin https://github.com/USUARIO/REPO.git
git branch -M main && git push -u origin main

# 2. En vercel.com → Add New Project → importar el repo → Deploy
#    Vercel detecta Vite automáticamente gracias a vercel.json
```

Si subes el proyecto dentro de una subcarpeta del repo, configura
**Root Directory** en Vercel → Settings → General.

### Variables de entorno (solo si usarás Supabase)

En Vercel → Settings → Environment Variables agrega (con prefijo `VITE_`):

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

---

## ☁️ (Opcional) Conectar Supabase

La app vive en el dispositivo por defecto. Si quieres que el inventario se
**comparta entre los dos celulares y los dos computadores**, crea un proyecto
en [supabase.com](https://supabase.com) y ejecuta este SQL en el editor:

```sql
-- Tabla de productos
create table if not exists productos (
  id        text primary key,
  nombre    text not null,
  codigo    text,
  cantidad  numeric not null default 0,
  costo     numeric not null default 0,
  precio    numeric not null default 0,
  vence     date
);

-- Habilitar Row Level Security
alter table productos enable row level security;

-- Política simple para un negocio (un solo equipo de confianza).
-- Permite leer y escribir con la anon key.
-- Para un control más estricto, reemplázala por autenticación de Supabase.
create policy "acceso_negocio_iray"
  on productos for all
  using (true)
  with check (true);
```

Luego copia la **URL** y la **anon key** del proyecto (Settings → API) en
tu archivo `.env` local (ver `.env.example`) y en Vercel.

> ⚠️ La política de arriba es abierta para simplificar el uso en un negocio
> pequeño. Si en el futuro hay datos sensibles, conviene migrar a autenticación
> de Supabase con políticas por usuario.

---

## 🆘 Solución de problemas en Vercel

| Síntoma | Causa | Solución |
|--------|-------|----------|
| `404 NOT_FOUND` | Falta `vercel.json` o `outputDirectory` | Ya viene incluido con `dist`. Redeploy. |
| `vite: command not found` | `vite` en devDependencies | Aquí está en `dependencies` ✅ |
| Variables `undefined` | Sin prefijo `VITE_` | Renómbralas y agrégalas en Vercel. |
| App en subcarpeta | Root Directory mal | Configurar en Settings → General. |

---

## 📁 Estructura

```
mercados-iray/
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── main.jsx
    └── App.jsx
```

Hecho para crecer: el siguiente paso natural es agregar catálogo digital y
control de pedidos sobre esta misma base.
