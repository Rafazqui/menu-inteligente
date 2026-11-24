# Menú Inteligente · HR Coffee & Deli

App web para cada mesa del café: el cliente escanea el QR de su mesa (o acerca su celular al sticker NFC) y desde su teléfono puede:

1. **Jugar por el premio de la mesa** (ruleta, rasca y gana o gato contra la máquina), un intento por visita.
2. **Ver el menú** (el PDF, mostrado página por página).
3. **Ver la ludoteca** (portadas, se voltean a la contraportada y se piden al mesero).
4. **Llamar al mesero**, con mensaje opcional ("Agua natural", "La cuenta"…).
5. **Jugar minijuegos** mientras espera (Torre de Hot Cakes y Buscaminas).
6. Una invitación aparte a **dejar reseña en Google** (sin premio a cambio, por las políticas de Google).

El personal usa el **panel en vivo** (`/admin`): alertas con sonido, mapa de mesas, aprobación y cierre de mesas. El dueño además tiene **Configuración** (probabilidades, premios, ludoteca, menú, mesas, personal) y las **tablillas QR** listas para imprimir.

## Cómo correrlo

La app usa **PostgreSQL**, así puede correr en uno o varios servidores a la vez.

### Desarrollo (PostgreSQL local, sin instalar nada)

```bash
npm install
npm run db:local     # Terminal 1: arranca PostgreSQL local (déjala abierta)
npm run dev          # Terminal 2: la app en http://localhost:3000
```

La primera vez, `db:local` crea la base en `data/postgres` y el archivo `.env.local` apuntando a ella.

### Publicar en Vercel

1. En tu proyecto de Vercel: **Storage → Create Database → Neon (Postgres)** y conéctala al proyecto. Vercel agrega solo `DATABASE_URL` y `DATABASE_URL_UNPOOLED`.
2. **Deployments → ⋯ → Redeploy** para que la app tome las variables.
3. Para subir tus datos actuales a Neon, desde tu PC (usa la cadena **sin** `-pooler`, en Storage → tu base → `.env.local`):
   ```powershell
   $env:DATABASE_URL_DIRECT="postgresql://...neon.tech/neondb?sslmode=require"
   npm.cmd run db:migrar -- --reemplazar
   ```
   (`--reemplazar` borra los datos de ejemplo que la app crea al arrancar con la base vacía.)

Límites en Vercel: archivos de máximo **4 MB**; las alertas en vivo se reconectan solas cada pocos minutos (normal en Vercel) y el panel además consulta cada 20 s como respaldo.

### Producción o base en la nube (otro hosting)

1. Crea una base PostgreSQL (por ejemplo gratis en [Neon](https://neon.tech) o en Railway).
2. Copia `.env.example` como `.env.local` (o configura las variables en tu hosting) y pega tu cadena de conexión en `DATABASE_URL`.
3. `npm run build` y `npm start`.

Si la base está vacía, la app crea sola las tablas y los datos de ejemplo de HR Coffee.

Usuarios iniciales (cámbialos en Configuración → Personal):

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `hrcoffee2026` | Dueño |
| `mesero` | `mesero2026` | Personal |

Para simular una mesa: entra a `/admin/qr` y abre la URL que aparece debajo de cualquier QR.

### Migrar los datos de la versión anterior (SQLite)

Si ya tenías datos en `data/app.db`, cópialos a PostgreSQL **antes** de arrancar la app con la base nueva:

```bash
npm run db:migrar                  # copia todo y verifica
npm run db:migrar -- --reemplazar  # si PostgreSQL ya tenía datos y quieres sobrescribirlos
```

Se conservan los IDs, los tokens de los QR impresos, las contraseñas, el historial, los archivos subidos y la clave de las cookies (las sesiones abiertas siguen válidas). Todo ocurre en una sola transacción: si algo falla, PostgreSQL queda sin cambios. La carpeta `data/` no se modifica; guárdala como respaldo.

### Probar desde tu celular (misma red Wi-Fi)

```powershell
$env:DEV_ORIGINS="192.168.1.50"   # la IP de tu PC (ipconfig)
npx next dev -H 0.0.0.0
```
Luego abre `http://192.168.1.50:3000/admin/qr` y escanea un QR con el celular.

## Cómo funciona la seguridad

- **QR con token aleatorio** (`/m/Ab3...`), no con el número de mesa: no se pueden adivinar las URLs de otras mesas.
- **El mesero aprueba cada mesa** la primera vez que se escanea. Alguien con una foto del QR no puede hacer nada desde fuera del café. Al cerrar la mesa (ya se fueron), todos los celulares de esa mesa se desconectan.
- **Cookies firmadas** (JWT HS256, httpOnly): el cliente no puede hacerse pasar por otra mesa.
- **El servidor decide los premios**: la ruleta y el rasca y gana solo animan el resultado; el gato valida cada jugada en el servidor. Un premio por visita, garantizado en la base de datos con bloqueo de fila, aunque dos celulares jueguen a la vez en servidores distintos.
- **Una sesión por mesa**: un índice único evita sesiones duplicadas si dos celulares escanean al mismo tiempo.
- **Límites**: espera entre llamadas al mesero, límite de solicitudes y protección contra fuerza bruta en el login.
- **CSRF**: cookies SameSite + verificación del encabezado Origin.
- **Archivos**: se revisa el tipo real del archivo (no solo la extensión), con límite de tamaño y nombres aleatorios.

## Estructura

```
src/app/m/[token]       Entrada del QR/NFC (crea o se une a la sesión de la mesa)
src/app/mesa/*          Pantallas del cliente (celular)
src/app/admin/*         Panel del personal
src/app/api/*           API (mesa/*, admin/*, uploads)
src/lib/                Base de datos (PostgreSQL), auth, premios, IA del gato, eventos
src/lib/schema.ts       Esquema de tablas (se crea solo al arrancar)
scripts/                Migración desde SQLite y utilidades
```

## Producción

Todo el estado vive en PostgreSQL, así que puedes correr **uno o varios servidores** de la app a la vez (Railway, Render, Fly.io, un VPS…) sin disco persistente:

- **Datos, archivos subidos (menú, portadas) y la clave de cookies** → en PostgreSQL.
- **Alertas en vivo** → `LISTEN/NOTIFY` de PostgreSQL: una llamada que recibe un servidor suena en el panel conectado a cualquier otro.

Variables de entorno (ver `.env.example`):

- `DATABASE_URL`: conexión a PostgreSQL.
- `DATABASE_URL_DIRECT`: (Neon/Supabase) conexión directa **sin pooler**, para las alertas en vivo. En Railway o un VPS no hace falta.
- `PUBLIC_BASE_URL`: dominio público, ej. `https://mesa.hrcoffee.mx` (a esto apuntan los QR impresos).
- `AUTH_SECRET`: opcional; si falta, se usa la guardada en la base.

**Límite conocido:** los límites de frecuencia (llamadas, intentos de login) se cuentan por servidor. Con 1–3 servidores es suficiente; para muchos, conviene moverlos a Redis.

## Listo para más negocios

Todas las tablas tienen `restaurant_id`. Para venderlo a otros cafés falta: panel de súper administrador para dar de alta negocios, una dirección por negocio y marca configurable (logo y colores ya se guardan en `restaurants`).
