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
| terapeuta@test.com | terapeuta | solo sus citas |

Estas credenciales son SOLO de desarrollo. En producción no existirán.

## Agenda

`/agenda` muestra la semana en curso con navegación entre semanas y filtro por profesional. Las citas se crean desde la ficha del caso (sección Citas) y se marcan como realizadas, no presentadas o canceladas desde ambos sitios.

- **Recordatorios discretos**: la plantilla vive en `configuracion.plantilla_recordatorio_cita` y jamás menciona adicciones ni motivos clínicos. Va al contacto CON QUIEN se agendó la cita, con enlace directo a WhatsApp.
- **Avisos, nunca bloqueos**: al agendar se comprueba la disponibilidad del profesional, sus ausencias y los solapes; si algo no cuadra la cita se crea igual y se avisa.
- **Rol terapeuta**: solo ve las citas en las que es el profesional, y de ellas solo el nombre y el teléfono del lead (nunca las notas ni la ficha). La agenda se sirve con la función `agenda_citas()`, que aplica esa regla en la base de datos.

## Directorio de contactos

`/contactos` es el directorio único de personas, deduplicado por teléfono (E.164) y global: una persona existe una sola vez aunque aparezca en varios casos y centros.

- **Búsqueda** por nombre, teléfono (con o sin prefijo) o email, y filtros por etiqueta, lista y consentimiento.
- **Ficha de contacto** (`/contactos/[id]`): datos, etiquetas, listas y los casos en los que participa — solo los que permita RLS al usuario.
- **Consentimiento de marketing**: se registra siempre con fecha y origen; retirarlo los limpia. Sin consentimiento, el contacto queda fuera de cualquier envío (fase posterior).
- **Etiquetas** (`/contactos/etiquetas`): crear, renombrar, dar color, activar/desactivar y borrar, con el número de contactos de cada una. Pueden ser manuales (con autor) o automáticas por regla (`aplicada_por` nulo, motor pendiente). Cada usuario gestiona las suyas; dirección, todas.
- **Listas y segmentos** (`/contactos/listas`): crear y editar. Las listas estáticas guardan miembros; los segmentos dinámicos guardan criterios en `filtro` (jsonb) y se recalculan al consultarlos. Los criterios son siempre comerciales — etiqueta, zona, consentimiento, email — nunca clínicos.

Minimización RGPD: en el área comercial no se guardan diagnósticos ni documentos de identidad.

## Ingesta de formularios web

`POST /api/formularios` crea leads desde formularios externos (WordPress, Google Ads, landings Clientify). Autenticación por secreto compartido (`FORMULARIOS_WEBHOOK_SECRET` en `.env.local`), enviado en la cabecera `x-webhook-secret` o como `?token=`.

Campos: `nombre` y `telefono` obligatorios; opcionales `email`, `mensaje`, `centro` (slug: `horizonte`, `eclipse`, `bellamar`; sin centro → bandeja de grupo), `canal` (slug, por defecto `formulario_web`), `subcanal`, `adiccion` (slug), `modalidad` (slug), `quien_contacta` (`familiar|afectado|prescriptor|otro`), `relacion_con_afectado`, `nombre_afectado`, `urgencia` (`alta|media|baja`), `zona`, `utm_source`, `utm_medium`, `utm_campaign`, `landing_url`, `origen_sistema`, `origen_ref` (idempotencia: el mismo par no crea dos leads).

Comportamiento: teléfono nuevo → lead nuevo con contacto principal, nota del formulario y tarea de primera llamada según el SLA de `configuracion`. Teléfono conocido → **reabre** su último caso (estado `reabierto`, propietario anterior o administrador general) y avisa al propietario. Respuesta: `{ accion: "creado" | "reabierto" | "duplicado", lead_id }`.

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/formularios -H "content-type: application/json" -H "x-webhook-secret: $FORMULARIOS_WEBHOOK_SECRET" -d '{"nombre":"Ejemplo","telefono":"600123123","mensaje":"Quiero información","landing_url":"https://ejemplo.com/gracias","origen_ref":"wp-123"}'
```

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
