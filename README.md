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

## Alertas automáticas y resumen diario

`POST /api/tareas-programadas` (cabecera `x-cron-secret` o `?token=`) ejecuta el motor de disciplina comercial. Conviene llamarlo cada 15–30 minutos desde un cron (Vercel Cron, GitHub Actions, cron-job.org…). Es **idempotente**: cada aviso lleva una clave única, así que ejecutarlo de más no duplica nada.

Qué hace en cada pasada, todo con los parámetros de `configuracion`:

- **SLA de primera respuesta** incumplido → avisa al propietario.
- **Cadencia de contacto**: mira los intentos ya registrados y avisa de cuál toca (alternando llamada y WhatsApp). Al agotarlos **propone** marcarlo como perdido «no respondió» — nunca cierra un lead por su cuenta.
- **Presupuestos sin respuesta** pasados los días configurados.
- **Tareas vencidas** y **citas de las próximas 24 h**.
- **Resumen diario** a cada cuenta de dirección.

Un comercial de vacaciones o de baja no recibe alertas: sus avisos van a dirección (regla 10).

Para lanzarlo a mano con el servidor arrancado:

```bash
npm run alertas
```

**Correo (opcional).** Si defines `RESEND_API_KEY` y `EMAIL_REMITENTE`, los avisos se envían también por email y se marca `email_enviado_at`. Sin esas variables la plataforma funciona igual: los avisos se quedan en la campana. Ningún correo menciona el motivo de consulta (regla 12), ni siquiera los internos.

## Bandeja de tareas

`/tareas` tiene dos pestañas:

- **Pendientes**, agrupadas en vencidas / para hoy / próximas.
- **Completadas**, el historial de los últimos 30 días, 90 días o un año, con quién cerró cada tarea, cuándo, y si lo hizo **en plazo o fuera de plazo**. El porcentaje dentro de plazo aparece en la cabecera: es el indicador de disciplina comercial (regla 9), y por eso se ve aquí y no escondido en el panel de dirección.

Una tarea cerrada por error se puede **reabrir**: vuelve a pendientes sin inventar una tarea nueva, que rompería el rastro de lo que pasó de verdad. La ficha del caso muestra lo mismo en su lista de tareas.

Dirección alterna además entre «Mías» y «Del equipo».

Quien cierra una tarea no siempre es su responsable (dirección puede cerrar la de alguien ausente, o un traspaso cambia el responsable después), así que se guardan las dos personas.

## Navegación

Todas las pantallas de la aplicación llevan un botón **Atrás** junto al título. Vuelve a la pantalla anterior real, no a una ruta fija: si llegas a una ficha desde la búsqueda, vuelves a la búsqueda. No está en el login, el segundo factor ni el alta de contraseña, donde retroceder solo llevaría a una sesión muerta o sacaría del alta obligatoria del segundo factor.

## Panel de administración

`/admin` (solo dirección) hace realidad el «nada cableado»: cinco pestañas donde vive todo lo que la plataforma lee en tiempo de ejecución.

- **Equipo**: alta de usuarios por **invitación por email** (eligen su propia contraseña) o con contraseña inicial cuando aún no hay SMTP propio; rol y centros; activar o desactivar; disponibilidad semanal, ausencias y objetivos mensuales; retirada del segundo factor. Incluye el **traspaso de cartera en bloque** para vacaciones, bajas o salidas: cada caso queda anotado en su historial y quien los recibe es avisado. No permite quedarse sin ninguna cuenta de dirección activa.

  > La invitación usa el correo integrado de Supabase, que está muy limitado. Para producción hay que configurar SMTP propio en el proyecto (Authentication → Emails).
- **Centros**: crear y editar; no se borran (su historial depende de ellos), se desactivan.
- **Catálogos**: canales, modalidades, motivos de pérdida y adicciones, más **qué modalidades ofrece cada centro** (el ingreso residencial es de Bellamar, los pisos tutelados de Eclipse). Desactivar retira del formulario sin tocar los casos que ya lo usan.
- **Pipelines**: etapas con su estado de sistema, que es lo que mantiene comparables las métricas entre pipelines. Una etapa con leads dentro no se puede borrar.
- **Parámetros**: SLA de primera respuesta, cadencia de contacto, alerta de presupuesto y plantilla del recordatorio. La plantilla se rechaza si menciona el motivo de consulta (regla 12).

Cada acción vuelve a comprobar el rol en el servidor: la interfaz nunca es la única barrera.

## Panel de dirección

`/panel` reúne las métricas del área comercial, con periodos predefinidos (este mes, mes anterior, 3 meses, año) o rango libre, y filtro por centro.

- **Titulares**: leads nuevos, conversiones **validadas** (regla 7: las pendientes de validar se cuentan aparte y no suman), ingresos validados y cumplimiento del SLA de primera respuesta leído de `configuracion`.
- **Disciplina**: leads sin asignar del periodo y leads abiertos sin próxima acción (estos, en todo momento).
- **Embudo** por estado, **origen** por canal, y tabla **por centro** con su tasa de conversión.
- **Equipo comercial**: leads, citas, conversiones e ingresos de cada comercial frente a sus objetivos del mes (`objetivos`).
- **Calidad del proceso**: tiempo medio de primera respuesta contra el SLA, tasa de no-shows, días de lead a conversión y ticket medio.
- **Composición de la demanda**: quién contacta (familiar / afectado / prescriptor), modalidad de interés y adicción.
- **Pérdidas y movimientos**: motivos de pérdida del periodo, casos estancados en valoración más de dos semanas, derivaciones internas entre centros y leads nacidos en la bandeja de grupo — el valor comercial de la marca personal, en números.

Cada rol ve lo que le permite RLS: dirección todo, admisiones solo sus centros. El terapeuta no tiene acceso.

## Agenda

`/agenda` tiene tres vistas — **Mes**, **Semana** y **Fechas** (rango libre) — con navegación entre periodos y filtros por centro y por profesional que se conservan al cambiar de vista. En la vista mensual cada día enlaza a su detalle. Las citas se crean desde la ficha del caso (sección Citas) y se marcan como realizadas, no presentadas o canceladas desde ambos sitios.

- **Recordatorios discretos**: la plantilla vive en `configuracion.plantilla_recordatorio_cita` y jamás menciona adicciones ni motivos clínicos. Va al contacto CON QUIEN se agendó la cita, con enlace directo a WhatsApp.
- **Avisos, nunca bloqueos**: al agendar se comprueba la disponibilidad del profesional, sus ausencias y los solapes; si algo no cuadra la cita se crea igual y se avisa.
- **Rol terapeuta**: solo ve las citas en las que es el profesional, y de ellas solo el nombre y el teléfono del lead (nunca las notas ni la ficha). La agenda se sirve con la función `agenda_citas()`, que aplica esa regla en la base de datos.

## Adjuntos y exportaciones

**Adjuntos por caso** — desde la ficha se suben capturas de WhatsApp, justificantes de pago o informes (imágenes y PDF, hasta 10 MB). Van al bucket privado `adjuntos-casos`, con la ruta `<lead_id>/<archivo>`: la política de Storage usa esa carpeta para dar acceso exactamente a quien puede ver el caso. La descarga pasa por `/api/adjuntos/[id]`, que comprueba permisos y firma una URL de un minuto — el fichero nunca se expone directamente. Subir y borrar quedan anotados en el historial del caso.

**Exportaciones** — `GET /api/exportar?que=leads|contactos|conversiones|citas` (con `desde`/`hasta` opcionales) devuelve CSV listo para Excel en español (punto y coma y BOM). Solo dirección, y **cada descarga se registra en la auditoría** con quién, qué y cuántas filas (regla 11). Está en el botón «Exportar» de la barra superior.

## Verificación en dos pasos (obligatoria)

La plataforma trata datos de categoría especial, así que el 2FA no es opcional: sin él no se entra.

- **Primer acceso**: tras la contraseña, la plataforma lleva a `/seguridad` para dar de alta el segundo factor. Se escanea un QR con cualquier app de autenticación (Google Authenticator, Authy, 1Password…) o se copia la clave a mano, y se confirma con un código de seis dígitos.
- **Accesos siguientes**: contraseña y después el código de la app.
- **Móvil perdido o cambiado**: dirección retira el factor desde **Administración → Equipo** («Retirar su verificación en dos pasos»); en el siguiente acceso el usuario lo da de alta otra vez.

Lo impone el middleware, no la interfaz: quien no tenga factor solo puede llegar a la pantalla de alta, y quien lo tenga no ve nada hasta superarlo.

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
