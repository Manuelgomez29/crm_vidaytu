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

## Procesos de venta

`/leads/procesos` (área comercial). Cada equipo puede tener su propio recorrido, y las métricas se calculan igual con todos: **cada etapa se asocia a un estado de sistema**. Un caso pasa por «Primera llamada» en un proceso y por «Contacto inicial» en otro, y el embudo del panel sale igual. Las etapas se renombran al lenguaje de cada equipo sin romper nada.

Los crean **dirección y los comerciales** (regla 6). Cada uno maneja los que ha creado; los de los demás los ve —hacen falta para poder mover un caso a ellos— pero no los toca. Crear uno copiando otro es lo normal: «como el estándar, pero con una etapa más antes de la cita».

**Un caso se mueve de un proceso a otro** desde su ficha, eligiendo en qué etapa entra. Sin eso, un proceso nuevo nacería vacío y se quedaría vacío. El historial, las tareas y las citas se quedan como están: cambia el recorrido, no el caso.

**Qué proceso recibe los casos nuevos lo decide dirección.** Crear recorridos es libre; redirigir la entrada de un centro entero, no. Antes se elegía «el primero que encaje, por antigüedad», y con los comerciales creando procesos eso era una trampa: el día que alguien creara uno para un centro que no tenía el suyo, todos los casos nuevos de ese centro habrían empezado a caer ahí sin que nadie lo decidiera.

Un proceso o una etapa con casos dentro **no se borra**: lo impide la base de datos, no la pantalla. Se desactiva, o se mueven los casos primero.

## Bandeja de tareas

`/tareas` es donde cada uno apunta su trabajo y lo cierra.

**Se crean a mano desde ahí**, y el caso es **opcional**. Un comercial tiene trabajo que no cuelga de ningún caso —llamar a un prescriptor, preparar la reunión del lunes—, y sin sitio donde apuntarlo acaba en un post-it: no aparece en ninguna métrica ni lo cubre nadie cuando esa persona está de baja. La regla 9 no cambia: un caso abierto sigue necesitando su próxima acción con fecha.

Una tarea suelta se crea **para uno mismo**. Encargarle algo suelto a otra persona sin un caso de por medio es una vía para molestar sin rastro; si hay caso, ese caso ya deja el rastro. Dirección sí puede asignar a cualquiera.

Cada tarea se puede **aplazar con un clic** (+1, +3, +7 días), que es lo que más se hace con una tarea. Aplazar cuenta desde hoy si ya venció: aplazar «3 días» algo vencido hace dos semanas lo pone dentro de tres días, no lo deja igual de vencido.

Tiene dos pestañas:

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

## Backups y recuperación

La organización está en plan **Pro**: copias diarias de ambos proyectos con 7
días de retención, tomadas de madrugada (sobre las 01:30 UTC). **PITR no está
contratado**, así que la pérdida máxima ante un desastre es de un día de
trabajo; la decisión y sus motivos están documentados.

**El procedimiento completo está en [docs/recuperacion.md](docs/recuperacion.md)**:
cuándo restaurar y cuándo no, los pasos exactos, qué reconstruir después y qué
no cubre una copia.

Dos cosas que conviene saber antes de necesitarlo:

- **Restaurar sustituye, no añade.** Devuelve el proyecto al estado de la copia
  y descarta todo lo posterior. No se puede restaurar sobre otro proyecto.
- **No se puede hacer por API.** Supabase solo permite la restauración desde el
  panel, a propósito.

El procedimiento se ensayó sobre staging el 5 de septiembre de 2026 y funcionó:
restauración, reaplicación de las 25 migraciones, siembra y las cuatro baterías
de verificación pasando. Un backup no probado no es un backup.

## El muro entre las dos áreas

La plataforma tiene dos áreas separadas en la **base de datos**, no en la pantalla:

- **Área comercial** — del lead a la conversión. La usan dirección y admisiones.
- **Área clínica** — del inicio del tratamiento en adelante. La usan los terapeutas y dirección.

Un comercial que consulte `pacientes` recibe **cero filas**, no un error: ninguna política del área clínica menciona el rol `admisiones`. Un terapeuta no ve pipeline, presupuestos ni dinero. Cada terapeuta ve únicamente los pacientes de los que es **referente**, y dirección lo ve todo.

Una persona puede tener los dos accesos (`perfiles.acceso_clinico`, que dirección concede en **Equipo**) y entonces ve las dos áreas — pero en la clínica sigue viendo solo sus pacientes.

```bash
npm run verificar:muro
```

Inicia sesión de verdad con cada usuario de prueba y consulta las tablas directamente. Que una pantalla redirija no demuestra nada: lo que importa es que la consulta devuelva cero filas aunque alguien la haga a mano. Comprueba también el aislamiento **entre terapeutas**, que es lo que de verdad protege al paciente.

## Área clínica

`/clinica` (terapeutas y dirección).

- **Ficha de paciente** en cuatro bloques: datos y proceso · sesiones y evolución con notas clínicas · familia y contactos de emergencia · documentos cifrados con descarga por enlace que caduca.
- **Fases del método**: siete, con nombres genéricos hasta que dirección les ponga los reales en **Configuración → Clínica**. La plataforma no inventa contenido clínico.
- **Chat interno** con mensajes en vivo, vinculable a un paciente. Saca la comunicación clínica del WhatsApp personal, que hoy está fuera de todo control RGPD. Los mensajes **no se editan ni se borran**.
- **Ocupación residencial**: habitaciones, plazas libres e ingresos. Si una plaza la ocupa un paciente que no es tuyo, ves la plaza pero no el nombre.
- **Cuestionarios** periódicos con puntuación y **gráfica de evolución** por cuestionario. SVG plano, sin librería de gráficos: el texto de las cifras va en tinta y hay puntos además de la línea, para que se lea igual sin distinguir bien los colores.
- **Seguimiento post-alta** a 1, 3, 6 y 12 meses: la fase 7 del método, programada sola.
- **Aviso de riesgo** tras dos faltas consecutivas a sesión. Es una señal para el terapeuta referente, no un diagnóstico.

### El paciente nace de la conversión

Al validar una conversión se crea la ficha con un **traspaso limpio**: pasan los datos básicos (nombre, centro, modalidad, adicción), no pasa nada del historial comercial — ni presupuestos, ni notas de la negociación, ni cuánto se regateó.

Dos detalles que importan: si el caso registra una persona afectada distinta de quien llamó, **la ficha es de ella**; y el teléfono solo viaja si era el suyo, porque el de un familiar es del familiar.

La ficha nace **sin terapeuta referente** y aparece destacada hasta que dirección se lo asigna, igual que un lead sin propietario.

## Asistente de IA

`/clinica/asistente`, en dos modos: **consultar datos** y **apoyo profesional** (preparar sesiones, redactar borradores de informe).

La garantía central es estructural, no una promesa: **el contexto se lee siempre con la sesión de quien pregunta**, nunca con la service role. Si un terapeuta pregunta por un paciente que no es suyo, la base de datos no devuelve la fila, así que ese dato **jamás llega al modelo**. No hay instrucción del sistema que pueda saltárselo, porque no es una instrucción: es que el dato no existe en la petición.

Toda consulta queda en `ia_consultas` (quién, qué, con qué ámbito). Ni la pregunta ni la respuesta viajan por la URL: un query string acaba en el historial del navegador, en los registros del servidor y en cualquier captura.

Hay tres sitios donde aparece:

- `/clinica/asistente` — consultar datos clínicos y apoyo profesional al terapeuta.
- `/panel/asistente` — el **copiloto de dirección**: el dashboard en lenguaje natural, con los números del grupo y sin datos personales.
- **Resumen del caso** en la ficha de un lead: tres líneas con quién es, qué ha pasado y qué está pendiente. Se pide con un botón, no al abrir cada ficha — llamar al modelo cada vez que alguien mira un caso cuesta dinero y tarda, y casi siempre el comercial ya sabe de qué va porque el caso es suyo. Esto es para cuando **no** lo es: un traspaso de cartera, una baja, una guardia de fin de semana.

Requiere `ANTHROPIC_API_KEY` en el servidor y encenderlo en **Parámetros**. Enciéndelo solo tras firmar el acuerdo de tratamiento de datos con el proveedor.

## Email marketing

`/marketing` (solo dirección). Campañas escritas dentro de la plataforma, en texto o HTML, a listas estáticas o segmentos dinámicos.

Tres barreras que la interfaz no puede saltarse:

1. **Consentimiento.** La lista de destinatarios la construye el código, no la pantalla, y solo entran contactos con consentimiento registrado y email. No hay otra forma de crearla.
2. **Discreción (regla 12).** El asunto y el cuerpo se revisan contra un catálogo de términos clínicos configurable. Si aparece uno, la campaña no se puede ni revisar ni programar, y el mensaje dice **qué palabra** lo bloqueó. Un correo se reenvía, se lee en una pantalla compartida o lo abre quien no debe.
3. **Baja en un clic.** El pie con el enlace de baja lo añade el código, no quien redacta, así que ninguna campaña puede salir sin él. La baja se ejecuta al abrir el enlace, sin pedir confirmación: exigir un segundo clic para dejar de recibir correos es poner obstáculos.

La **vista previa** enseña el correo tal y como lo verá quien lo reciba, con el pie de baja ya puesto y el nombre sustituido. El HTML se pinta en un iframe aislado: el cuerpo de un correo es contenido pegado, y no tiene por qué ejecutar nada.

El envío va **por lotes** desde el motor, no de golpe: un envío de 3.000 personas no depende de que una sola petición aguante. Las tasas de apertura son orientativas por diseño — quien bloquea imágenes no cuenta y algunos gestores abren solos — y sirven para comparar campañas entre sí.

## Automatizaciones

Todas corren en la misma pasada de `/api/tareas-programadas`, todas son idempotentes y todas **proponen, no deciden**:

- **Lead scoring** (0–100) con pesos configurables. Prioriza la cola cuando entran veinte leads a la vez; no oculta ni cierra nada. Un 12 se llama igual que un 90, solo que más tarde.
- **Etiquetado automático** de las reglas de Contactos. Solo **añade** etiquetas, nunca las retira: quien llegó por Instagram llegó por Instagram, y borrarlo reescribiría la historia. Retirar una etiqueta es decisión humana.
- **Reactivación** de los perdidos por «no es el momento» a los 90 días. Un «ahora no» no es un no.
- **Petición de reseña** tras conversión validada. Crea una **tarea**, no un envío: la plataforma nunca escribe sola a un paciente.
- **Riesgo de recaída** y **seguimiento post-alta** en el área clínica.
- **Informe mensual** el día 1 a dirección, con enlace a `/panel/informe`.
- **Recordatorio de cita** por email 24 h antes, al contacto con quien se agendó — no al contacto principal: si la cita la pidió la madre, el recordatorio es para ella. El asunto es solo «Confirmación de tu cita»: se lee en la bandeja de entrada sin abrir nada. Apagado por defecto.
- **Reparto automático** de los leads sin propietario, al comercial disponible de ese centro con menos carga y nunca a alguien ausente. Apagado por defecto: mientras el equipo se rueda, la autoasignación con un clic funciona mejor, porque el comercial ve el caso antes de cogerlo.

## Facturación

`/facturacion` (dirección y el rol `administracion`, que ve el dinero de los tres centros pero **no** el área clínica ni las notas de los casos).

- La factura nace de un **presupuesto aceptado**, para que nunca se facture algo que nadie propuso.
- El número de serie (`VYT-BM-2026-0001`) se consume al **emitir**, no al crear el borrador: una serie con huecos es un problema con la gestoría.
- Una factura emitida **no se edita**: se anula y se hace otra. Anular **conserva el número**.
- Cuando los cobros cubren el total, la factura pasa sola a «cobrada».
- El NIF del cliente vive solo aquí. El área comercial sigue sin pedir DNI (regla 11).
- `/facturacion/informe` da facturado, cobrado y pendiente por centro, para la gestoría.

Los PDF salen del «Imprimir → Guardar como PDF» del navegador. Sin librería a propósito: el navegador ya lo hace bien y es una dependencia menos que mantener.

## Integraciones

`/admin/integraciones`. **Ninguna clave ni token se guarda en base de datos**: van en variables de entorno del servidor, porque una fila acaba en una copia de seguridad o en una exportación. Aquí solo viven identificadores de cuenta y el estado.

- **WhatsApp Business API** — webhook en `/api/whatsapp` con **firma HMAC verificada** en tiempo constante. Aplica las mismas reglas que todo lo demás: caso abierto se anota, caso cerrado se **reabre**, teléfono desconocido nace en la bandeja de grupo. En campañas click-to-WhatsApp, Meta manda qué anuncio trajo a la persona. Sin `WHATSAPP_APP_SECRET` la ruta rechaza todo: un webhook abierto que crea leads es una puerta para llenar el CRM de basura.
- **Importación CSV** (Clientify, Zerochats, cualquier hoja): deduplica por teléfono y **nunca pisa** lo que ya hay, solo rellena huecos. El consentimiento de marketing solo se marca si la columna lo dice explícitamente; sin ella todo entra **sin consentimiento**.
- **Gasto publicitario**: Meta y Google Ads no se conectan (haría falta acceso a las cuentas). Se anota el gasto por campaña y la plataforma lo cruza con la `utm_campaign` de cada lead para dar coste por lead y por conversión en el Dashboard. Una campaña con gasto y cero leads sale en rojo.

## Aplicación móvil (PWA)

La plataforma es instalable en el móvil y recibe avisos aunque esté cerrada.

```bash
npm run push:claves
```

Genera el par VAPID una vez y lo guarda en `.env.local` y en producción. Cambiarlas invalida todas las suscripciones: cada dispositivo tendría que reactivar los avisos.

El permiso se pide **al pulsar el botón** en `/seguridad`, no al cargar la página: un navegador que pregunta nada más entrar consigue que la gente diga «no» por reflejo, y ese «no» cuesta revertirlo.

Los textos de las notificaciones son deliberadamente sosos («Caso asignado», «Tarea vencida»): se leen en la pantalla de bloqueo, y el teléfono lo puede coger cualquiera. Cada aviso se marca al enviarse, y los de más de seis horas se descartan sin enviar — nadie quiere veinte notificaciones de golpe al volver de un fin de semana con el motor parado.

## Retención y anonimización (RGPD)

`/admin/retencion` (solo dirección). **Apagado por defecto y a propósito**: el plazo de conservación es una decisión jurídica del grupo, no técnica. Los 12 meses que vienen puestos son una propuesta de partida que confirma vuestro asesor.

La pantalla enseña **primero qué se anonimizaría** —con el número de casos y personas, y la lista— y solo después ofrece el botón. Una acción irreversible sobre datos de personas se mira antes de hacerse, y «12 meses» en abstracto no dice lo mismo que «estos 47 casos».

**Anonimiza, no borra.** Las filas se quedan sin datos personales, así que las métricas históricas siguen cuadrando —cuántos leads entraron en 2026 por Instagram, cuántos se perdieron por precio— sin conservar a quién pertenecían. Borrar destruiría el histórico del negocio para proteger algo que se puede proteger sin destruirlo.

Solo afecta a casos **perdidos** y **no válidos**. Nunca a abiertos ni convertidos: detrás de una conversión hay una relación contractual con su propio plazo, y ese no lo decide esta pantalla. Un contacto se anonimiza solo si **todos** sus casos son anonimizables: la misma persona puede haber vuelto por otro caso que sigue vivo.

El reloj corre desde `leads.cerrado_at`, no desde `updated_at`: si contara desde la última modificación, un caso cerrado hace un año en el que alguien corrigiera una coma volvería a empezar de cero y no se anonimizaría nunca.

```bash
npm run verificar:retencion
```

Crea un caso perdido antiguo, lo anonimiza y comprueba las dos mitades: qué se va y qué se queda. Deja la base de datos como estaba.

## Monitorización de errores

Sentry está integrado en `src/instrumentation.ts` e **inerte sin `SENTRY_DSN`**: mientras no haya DSN no se inicializa nada y no sale ni un byte del servidor. El día que contratéis el servicio, basta con la variable.

Cuando se active, filtra cookies, cabeceras de autorización, secretos de webhook y query strings, y `sendDefaultPii` se queda en false. Un informe de error de esta plataforma puede arrastrar el nombre y el teléfono de alguien que llamó a un centro de adicciones, y eso no puede acabar en un servicio de terceros por accidente.

## Seguridad

```bash
npm run verificar:seguridad
```

Ataca la plataforma desde fuera y desde dentro con las credenciales reales de cada rol, y comprueba que cada agujero encontrado en la auditoría sigue cerrado. No mira el código: mira lo que la base de datos y las rutas hacen de verdad. **43 comprobaciones.** Si alguna falla, es que una migración o un cambio lo ha reabierto.

Cubre: acceso anónimo a tablas y funciones, el muro entre áreas, el aislamiento entre centros, el alcance del directorio de contactos, la escalada de privilegios, la inmutabilidad de la auditoría, la entrega de avisos, las redirecciones abiertas, las firmas de enlace y el límite de peticiones bajo concurrencia.

### Decisiones de seguridad

**RLS no es la única barrera.** `anon` no tiene ningún permiso de tabla en el esquema `public`, ni por defecto en lo que se cree a partir de ahora. Si una migración futura olvidara `enable row level security`, esa tabla seguiría sin ser accesible desde internet. `TRUNCATE` está retirado a `authenticated`: RLS no se aplica a TRUNCATE, y sin eso la auditoría «imborrable» se podía vaciar entera.

**Las funciones no las ejecuta cualquiera.** Postgres concede `EXECUTE` a PUBLIC al crear una función, y un `grant` a `authenticated` no lo revoca. Todas están retiradas de `anon` salvo `darse_de_baja`, que la llama el enlace del correo de alguien que por definición no tiene cuenta. Además, `siguiente_numero_factura` comprueba el rol por dentro: consumir un número de serie es un acto contable.

**Nada de redirecciones abiertas.** El `?next=` de las invitaciones solo acepta rutas internas —ni `//evil.com`, ni `/\evil.com`, ni esquemas—, y el redirector de clics de las campañas exige una firma HMAC del servidor. Sin eso, el dominio desde el que el grupo envía correo sería una herramienta de phishing con su propia marca delante.

**Los secretos se comparan en tiempo constante.** `!==` corta en el primer carácter distinto y filtra cuántos acertaste.

**Cabeceras.** CSP que limita a dónde puede hablar el navegador (solo la app y Supabase), `frame-ancestors 'none'` contra clickjacking sobre botones como «validar conversión», HSTS en producción, y sin cabecera de versión del framework.

**Almacenamiento.** Los dos buckets son privados, con límite de 20 MB y lista de tipos permitidos **en el propio bucket**: el almacenamiento de Supabase es accesible directamente desde el navegador, así que un límite que solo esté en la acción del servidor es una sugerencia. La lista de tipos importa más que el tamaño — un `.html` subido como documento se sirve con su content-type y ejecutaría javascript en el dominio del almacenamiento.

**La IA trata su contexto como datos.** Buena parte viene de formularios que rellena cualquiera desde internet. Las instrucciones del sistema dicen explícitamente que si dentro del contexto aparece algo con forma de orden, es texto de un tercero y no se obedece.

**El directorio de contactos va por centro.** Un comercial ve a una persona si participa en algún caso de sus centros, o si la dio de alta él. La regla 5 sigue en pie —la persona es global y la deduplicación cruza centros— pero eso lo hace el servidor: navegar el directorio es otra cosa. Antes, quien no veía ni un caso de Horizonte podía listar el nombre y el teléfono de todo el mundo.

**Nadie averigua si un teléfono está en otro centro.** El alta manual solo deduplica contra lo que quien la hace puede ver. Si eso crea un duplicado entre centros, el motor lo detecta y avisa a dirección, que sí ve los dos casos, para unirlos o derivar. Se cambia una fuga por un duplicado temporal que alguien con la visión completa resuelve.

**Límite de peticiones en la base de datos**, no en memoria del proceso: en un despliegue sin servidor cada petición cae en una instancia distinta y un contador en memoria no ve lo que hacen las demás. Cubre el login (por cuenta y por IP), los dos webhooks, el enlace de baja, el alta de dispositivos y las consultas a la IA, que además cuestan dinero. La función que lleva la cuenta solo la puede invocar el servidor: si un anónimo pudiera llamarla, agotaría de antemano la cuota de login de una persona concreta.

Los límites viven en `configuracion` como todo lo demás, y **fallan abiertos**: si la consulta del límite se cae, se deja pasar. Un límite roto que bloquea el login deja al equipo fuera de su propia herramienta, y si la base de datos no responde la plataforma no funciona igualmente.

### Lo que sigue abierto

Nada con arreglo en el código. Queda una recomendación de despliegue: **poner también un límite en la capa de red** (Vercel o Cloudflare). El de la base de datos frena el abuso de las rutas, pero una inundación de peticiones sigue llegando al servidor y consumiendo su tiempo antes de que nadie la cuente.

## Estructura

- `src/app` — rutas (App Router). `/login` pública; todo lo demás requiere sesión.
- `src/lib/supabase` — clientes Supabase (server y browser, patrón oficial `@supabase/ssr`).
- `src/lib/database.types.ts` — tipos generados del esquema.
- `supabase/migrations` — migraciones SQL versionadas.
- `scripts/seed.ts` — seed de desarrollo (usa la service role).
- `scripts/verificar-muro.mjs` — comprueba el muro entre áreas contra la base de datos real.
- `scripts/verificar-retencion.mjs` — comprueba qué se va y qué se queda al anonimizar.
- `scripts/verificar-seguridad.ts` — 43 comprobaciones de seguridad contra la base de datos real.
- `src/lib/limites.ts` — límite de peticiones, con el contador en la base de datos.
- `src/lib/enlaces.ts` — defensas contra redirecciones abiertas y comparación de secretos.
- `src/instrumentation.ts` — Sentry, inerte sin DSN.
- `CLAUDE.md` — contexto de negocio y reglas innegociables del proyecto.
