# Vida y Tu DATA

CRM propio del Grupo Vida y Tu (centros Horizonte, Eclipse y Bellamar). Área comercial: gestión de leads desde la entrada hasta la conversión en tratamiento. Construido con Next.js 15 (App Router), TypeScript, Tailwind CSS y Supabase (Postgres + Auth + RLS + Storage + Realtime).

## Requisitos

- Node.js 20+
- Cuenta de Supabase con un proyecto en la región UE

## Arrancar en local

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Copia `.env.example` a `.env.local` y rellena los valores de Supabase (Project Settings → API):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo para el seed; jamás se expone al navegador)

3. Arranca el servidor de desarrollo:

   ```bash
   npm run dev
   ```

   Abre [http://localhost:3000](http://localhost:3000) — te redirigirá a `/login`.

## Base de datos

Las migraciones viven en `supabase/migrations` y son la ÚNICA fuente de verdad del esquema. Nunca se hacen cambios manuales en la base de datos.

- Vincular el proyecto (una vez): `npx supabase link --project-ref <ref>`
- Aplicar migraciones al remoto: `npx supabase db push`

## Regenerar tipos TypeScript

Tras cualquier cambio de esquema:

```bash
npm run db:types
```

Genera `src/lib/database.types.ts` a partir del esquema remoto. No editar ese archivo a mano.

## Datos de prueba (desarrollo)

```bash
npm run db:seed
```

Crea usuarios y 8 leads ficticios. Usuarios de desarrollo (contraseña de todos: `vidaytu-dev-2026`):

| Email | Rol | Centros |
|---|---|---|
| direccion@test.com | direccion | todos |
| horizonte@test.com | admisiones | Horizonte |
| equipo@test.com | admisiones | Eclipse, Bellamar y bandeja de grupo |

Estas credenciales son SOLO de desarrollo. En producción no existirán.

## Backups

Supabase hace backups diarios automáticos en los planes de pago. Para una recuperación fina se recomienda activar **Point-in-Time Recovery (PITR)**:

1. En el panel de Supabase: **Project Settings → Database → Backups** (o el add-on PITR en **Add-ons**).
2. Activa PITR y elige la ventana de retención (p. ej. 7 días). Requiere plan Pro o superior y el add-on correspondiente.
3. PITR permite restaurar la base de datos a cualquier instante dentro de la ventana, no solo al backup diario.

**Probar una restauración (hazlo al menos una vez, y de forma periódica):**

1. Crea un proyecto nuevo de Supabase de prueba (misma región UE).
2. Desde el panel del proyecto original: **Database → Backups → Restore**, elige un punto en el tiempo y restaura sobre el proyecto de prueba (o descarga el backup y aplícalo con `psql`).
3. Verifica que las tablas críticas (`leads`, `contactos`, `conversiones`, `auditoria`) tienen los datos esperados en el punto elegido.
4. Borra el proyecto de prueba.

Un backup no probado no es un backup.

## Estructura

- `src/app` — rutas (App Router). `/login` pública; todo lo demás requiere sesión.
- `src/lib/supabase` — clientes Supabase (server y browser, patrón oficial `@supabase/ssr`).
- `src/lib/database.types.ts` — tipos generados del esquema.
- `supabase/migrations` — migraciones SQL versionadas.
- `scripts/seed.ts` — seed de desarrollo (usa la service role).
- `CLAUDE.md` — contexto de negocio y reglas innegociables del proyecto.
