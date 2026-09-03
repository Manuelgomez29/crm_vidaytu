# Vida y Tu DATA — CRM del Grupo Vida y Tu

Plataforma propia del Grupo Vida y Tu. Next.js 15 (App Router) + TypeScript + Tailwind + Supabase (Postgres, Auth, RLS, Storage, Realtime). Interfaz solo en castellano. Uso real mitad móvil / mitad ordenador: responsive siempre. El nombre de la app es **Vida y Tu DATA** en título, login y toda la interfaz.

## 1. Contexto del negocio

Vida y Tu es el grupo matriz de tres centros de tratamiento de adicciones en España:

| Centro | Ubicación | Recursos | Notas |
|---|---|---|---|
| Horizonte | Jerez de la Frontera | Ambulatorio, centro de día, online | Teléfono hasta 21:00, abre sábados |
| Eclipse | Reus y Tarragona (2 sedes) | Ambulatorio, centro de día, pisos tutelados | Deriva ingresos residenciales a Bellamar |
| Bellamar | Tarragona | Ingreso residencial | Admisiones 24/7/365 |

Detrás de los centros está la marca personal del CEO (**Lolo Drago**, divulgador fuerte en Instagram/Facebook, con Instagram conectado a la herramienta Zerochats), que genera muchos contactos a nivel de grupo.

### Visión completa: dos áreas separadas por un MURO de permisos de doble sentido

- **ÁREA COMERCIAL** (lo primero que se construye): gestión de leads desde que llegan (Meta Ads de llamada/WhatsApp, formularios WordPress, Google Ads, landings Clientify, Instagram de Lolo Drago vía Zerochats, prescriptores, recomendación) hasta que convierten en tratamiento. Kanban con pipelines personalizables, directorio de Contactos con etiquetas/listas/segmentos, agenda con recordatorios, dashboard de dirección, panel de administración self-service. Más adelante: email marketing con consentimiento, WhatsApp Business API, importaciones de Zerochats y Clientify.
- **ÁREA CLÍNICA** (fase posterior — NO construir todavía, pero ningún diseño debe estorbarla): fichas de paciente por terapeuta referente (cada terapeuta ve SOLO sus pacientes; dirección todo), sesiones, familiares, documentos, chat interno clínico y un asistente de IA que consulta con los permisos del usuario que pregunta. Al convertir un lead se creará una ficha de paciente vinculada; ningún área ve la otra.

### Roadmap de prompts

\#1 setup+BD+login (hecho aquí) → #2 kanban y ficha de caso → #3 ingesta de formularios web → #4 agenda → #5 dashboard → #6 panel de administración → #7 emails y resumen diario → Fase 2 (email marketing, WhatsApp API, etiquetado automático, Google Calendar, importaciones) → Fase 3 (área clínica) → Fase 4 (facturación).

## 2. Reglas de negocio innegociables

1. **Centros y permisos:** todo lead pertenece a un centro (reasignable). Admisiones solo ve sus centros asignados; dirección lo ve todo. Modelo real del equipo: todos los comerciales tendrán Eclipse, Bellamar y la bandeja de grupo; Horizonte restringido a UNA persona (más el CEO).
2. **Bandeja de grupo:** pseudo-centro donde nacen los leads sin centro claro — sobre todo los del Instagram de Lolo Drago. Asignarlos a un centro NO es una derivación: es un cambio de `centro_id` auditado.
3. **Derivación** (típico: Eclipse → Bellamar para ingreso): NO duplica el lead — mismo registro, historial de derivación, atribución al centro de origen.
4. **El lead es un CASO, no una persona:** por una misma situación pueden contactar la madre, la pareja y el propio afectado. El lead tiene lista de contactos, uno principal. Duplicados detectados por teléfono contra TODOS los contactos. Si un teléfono conocido vuelve meses después NO se crea lead nuevo: se REABRE el mismo (estado `reabierto`) con todo su historial, y vuelve a su propietario anterior — o al administrador general si aquel ya no está activo.
5. **La persona es GLOBAL:** directorio único de contactos deduplicado por teléfono/email, con etiquetas manuales y automáticas (por reglas), listas estáticas y segmentos dinámicos. Sobre ellos habrá email marketing (fase posterior) escrito desde la propia app (texto o HTML): SOLO con consentimiento explícito registrado (fecha y origen), baja en un clic, y contenido que JAMÁS revele la condición de salud del destinatario.
6. **Pipelines personalizables:** dirección y comerciales crean procesos de venta con etapas propias; cada etapa se mapea a un estado de sistema (`nuevo`, `contactado`, `cita_agendada`, `cita_realizada`, `en_valoracion`, `convertido`, `derivado`, `perdido`, `no_valido`, `reabierto`) para que las métricas se calculen igual con cualquier pipeline. Movimiento de tarjetas LIBRE: avisos, nunca bloqueos.
7. **Conversión = hito económico:** el lead convierte cuando paga la reserva o el primer pago. El comercial la registra (queda `pendiente_validacion`) y DIRECCIÓN valida el pago. Las métricas cuentan solo validadas. El precio es un presupuesto personalizado por caso; cada propuesta se guarda como historial.
8. **Propiedad:** todo lead debe acabar teniendo un propietario comercial. Autoasignación SOLO de leads sin propietario (política de base de datos); cambiar un propietario existente, solo dirección. Lead sin propietario = destacado "sin asignar". Los traspasos pasan siempre por el CRM, auditados.
9. **Disciplina comercial:** ningún lead abierto sin "próxima acción" con fecha. Cadencia: 5 intentos en ~2 semanas (día 0, 1, 3, 7, 14) alternando llamada y WhatsApp; tras el 5º sin respuesta se propone perdido "no respondió". Perdido exige motivo de catálogo. SLA de primera respuesta: 60 min en horario del centro. Presupuesto sin respuesta: alerta a los 3 días. Flujo: primera llamada/videollamada (comercial propietario) → cita presencial con terapeuta/psicólogo.
10. **Ausencias y objetivos:** un comercial ausente (vacaciones/baja) no recibe asignaciones ni alertas y sus leads avisan "propietario ausente". Dirección define objetivos mensuales por comercial (citas, conversiones, ingresos).
11. **RGPD categoría especial:** minimización (solo nombre y teléfono obligatorios; nada de DNI ni diagnósticos en el área comercial), cifrado, base de datos en la UE, auditoría append-only. Borrado de leads: SOLO dirección (cuenta máster), excepcional y auditado; lo normal es `no_valido` + anonimización. Exportaciones: solo dirección, cada una auditada.
12. **DISCRECIÓN:** ningún mensaje saliente a paciente/familia menciona adicciones ni motivos clínicos. Recordatorio tipo: "Hola [nombre], te confirmamos tu cita el [día] a las [hora] en [dirección]. Un saludo, [nombre de pila]". El recordatorio va al contacto CON QUIEN se agendó la cita.
13. **NADA CABLEADO:** usuarios, roles, centros, disponibilidades, ausencias, catálogos, etiquetas, reglas, pipelines y parámetros (SLA, cadencia, alertas, horarios) viven en base de datos, gestionables desde un futuro panel de administración. Nada de esto hardcodeado.
14. **Roles v1:** `direccion` (todo), `admisiones` (sus centros), `terapeuta` (SOLO sus citas, y de ellas solo nombre y teléfono del lead).

## Sistema de diseño (v1)

Tema claro único. Tipografía **Kumbh Sans** (la que ya comparten Eclipse y Bellamar), con números tabulares en cifras, tablas y KPIs. Los tokens viven en `src/app/globals.css` (`@theme`) y las clases de componente (`.chip`, `.panel`, `.tarjeta`, `.btn`, `.campo`, `.tabla`, `.avatar`, `.via`) en su capa `components`.

- Superficies: fondo `#F7F6F2` · superficie `#FFFFFF` · superficie 2 `#EFEDE6` · líneas `#E2DFD6`/`#CBC7BB`.
- Tinta: `#242B3A` · secundaria `#5A6272` · muted `#8A8FA0`.
- Primario `#384B71` (azul institucional del grupo): barra lateral, botones de acción, enlaces.
- Acento coral `#E8836F`: CTA principal, destacados, avatar propio.
- Semánticos: éxito `#2F9160` · aviso `#C08427` · peligro `#C4483F`, siempre con su fondo suave.
- **Color por centro** en chips y borde izquierdo de tarjeta: Horizonte `#2E5C48`/`#E3EDE6`, Eclipse `#4E506B`/`#E7E7F0`, Bellamar `#384B71`/`#E4EAF8`, Bandeja de grupo `#8A5F14`/`#F4E9D4`.
- **Paleta de gráficos** por centro (validada para daltonismo): Horizonte `#2F9160` · Eclipse `#5B54C0` · Bellamar `#6E8AF0` · Bandeja `#C08427`. El color sigue al centro, nunca al ranking; leyenda siempre que haya dos o más series; el texto va en tinta, nunca en el color de la serie.

Estructura: barra lateral azul con gradiente (`#2C3C5C`→`#384B71`) agrupada en Área comercial / Gestión / Centros, con el área clínica visible pero bloqueada («Fase 3»); topbar con búsqueda global por nombre o teléfono, notificaciones y CTA coral «+ Nuevo lead»; cabecera de página con título y subtítulo.

## Convenciones técnicas

- Dominio en español (snake_case) / infraestructura en inglés.
- Migraciones SQL versionadas en `supabase/migrations`; JAMÁS cambios manuales en la base de datos.
- RLS activado en toda tabla de dominio.
- Teléfonos en formato E.164 (`+34...`).
- `timestamptz` siempre; el negocio opera en Europe/Madrid.
- `updated_at` mantenido por trigger.
- Commits pequeños y en español.
- Previstos dos entornos (staging/producción) y Sentry.
- La lógica lee parámetros de la tabla `configuracion`, nunca de constantes en código.
- Tipos de BD generados en `src/lib/database.types.ts` con `npm run db:types` (no editar a mano).
- Credenciales solo en `.env.local` (jamás commiteado); `SUPABASE_SERVICE_ROLE_KEY` solo en scripts de servidor.
