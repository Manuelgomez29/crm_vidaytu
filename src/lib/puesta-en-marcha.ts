import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { estadoDelMotor } from '@/lib/salud-motor';
import { hoyMadrid } from '@/lib/fechas';

type Cliente = SupabaseClient<Database>;

/**
 * Qué falta para poder trabajar de verdad.
 *
 * Antes de meter el primer caso real hay una lista de cosas que decidir, y
 * ninguna avisa por su cuenta: si no hay proveedor de correo, las campañas se
 * redactan y no salen; si quedan casos de prueba, las métricas del primer mes
 * salen sucias; si la dirección tiene un solo móvil con el segundo factor y lo
 * pierde, no entra nadie. Todo eso se sabe mirando la base, así que se mira
 * aquí en vez de dejarlo en la cabeza de alguien.
 *
 * Dos reglas para que esto sirva de algo:
 *
 *   · No se inventa nada. Cada punto se comprueba de verdad —una consulta o una
 *     variable de entorno— y el que no se pueda comprobar NO sale. Una lista de
 *     verificación con casillas que nadie ha mirado es peor que no tenerla,
 *     porque se marca entera y se cree.
 *
 *   · Se distingue lo que IMPIDE trabajar de lo que conviene. Si todo pesa
 *     igual, no se atiende nada.
 */

export type Gravedad = 'bloquea' | 'conviene';

export type Punto = {
  clave: string;
  titulo: string;
  /** Qué pasa si se deja así. En consecuencias, no en abstracto. */
  porQue: string;
  hecho: boolean;
  /** El dato concreto que se ha mirado, para que se pueda contrastar. */
  detalle: string;
  gravedad: Gravedad;
  donde?: { texto: string; href: string };
};

const hay = (v: string | undefined | null) => typeof v === 'string' && v.trim().length > 0;

/**
 * «hace 6 días», no «hace 9169 minutos».
 *
 * La cifra exacta en minutos obliga a dividir mentalmente para saber si esto es
 * de esta mañana o de la semana pasada, que es lo unico que hay que decidir.
 */
function haceCuanto(minutos: number | null): string {
  if (minutos === null) return 'nunca';
  if (minutos < 90) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 36) return horas === 1 ? 'hace una hora' : `hace ${horas} horas`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'hace un día' : `hace ${dias} días`;
}

export async function puestaEnMarcha(supabase: Cliente, admin: Cliente): Promise<Punto[]> {
  const mesActual = hoyMadrid().slice(0, 7);

  const [
    { data: centros },
    { count: fuentesActivas },
    { data: config },
    motor,
    { count: objetivosDelMes },
    { data: direcciones },
    { count: profesionalesConHorario },
  ] = await Promise.all([
    admin
      .from('centros')
      .select('id, nombre, url_resena_google, es_bandeja_grupo, activo, horario_atencion'),
    admin.from('fuentes_captacion').select('id', { count: 'exact', head: true }).eq('activa', true),
    admin.from('configuracion').select('clave, valor').in('clave', ['ia_activa']),
    estadoDelMotor(supabase),
    admin
      .from('objetivos')
      .select('id', { count: 'exact', head: true })
      .eq('mes', `${mesActual}-01`),
    admin.from('perfiles').select('id, email, rol, alcance, activo').eq('activo', true),
    admin.from('disponibilidad').select('perfil_id', { count: 'exact', head: true }),
  ]);

  /*
   * Los datos de prueba se buscan por su rastro, no por una marca: nadie va a
   * acordarse de marcarlos. Un centro con «[STAGING]» en el nombre, una cuenta
   * @test.com o un caso que empieza por «Prueba» son los tres rastros que deja
   * el sembrado de este proyecto.
   */
  const [{ count: casosDePrueba }, { count: cuentasDePrueba }] = await Promise.all([
    admin.from('leads').select('id', { count: 'exact', head: true }).ilike('nombre', 'Prueba %'),
    admin.from('perfiles').select('id', { count: 'exact', head: true }).like('email', '%@test.com'),
  ]);
  const centrosDePrueba = (centros ?? []).filter((c) => /\[STAGING\]/i.test(c.nombre)).length;
  const rastroDePrueba = (casosDePrueba ?? 0) + (cuentasDePrueba ?? 0) + centrosDePrueba;

  const iaActiva = (config ?? []).find((c) => c.clave === 'ia_activa')?.valor === true;
  const deGrupo = (direcciones ?? []).filter((p) => p.rol === 'direccion' && p.alcance === 'grupo');
  const sinResena = (centros ?? []).filter(
    (c) => c.activo && !c.es_bandeja_grupo && !hay(c.url_resena_google),
  );

  const urlApp = (process.env.NEXT_PUBLIC_URL_APP ?? '').trim();

  /*
   * SIN DECIDIR no es lo mismo que 24/7.
   *
   * Las dos cuentan el SLA 24 horas al dia, pero una es un olvido y la otra es
   * una decision: Bellamar tiene admisiones 24/7/365 y esta puesto asi a
   * proposito. La primera version miraba `esVeinticuatroSiete()`, que dice que
   * si en los dos casos, y por eso reclamaba a Bellamar un horario que ya
   * tenia. Una lista que pide algo que esta bien se deja de mirar entera.
   *
   * Lo que falta de verdad es lo que nadie ha tocado: `horario_atencion` nulo.
   */
  const sinDecidir = (centros ?? []).filter(
    (c) => c.activo && !c.es_bandeja_grupo && c.horario_atencion === null,
  );

  const puntos: Punto[] = [
    {
      clave: 'motor',
      titulo: 'El motor de automatizaciones está corriendo',
      porQue:
        'Es lo que reparte los leads sin dueño, avisa del SLA, mueve la cadencia y manda los recordatorios de cita. Parado, el trabajo no se pierde: se queda esperando, y nadie se entera.',
      hecho: !motor.parado && !motor.nuncaHaCorrido,
      detalle: motor.nuncaHaCorrido
        ? 'no ha corrido nunca'
        : motor.parado
          ? `la última pasada buena fue ${haceCuanto(motor.minutosDesdeBuena)}`
          : `última pasada ${haceCuanto(motor.minutosDesdeBuena)}`,
      gravedad: 'bloquea',
      donde: { texto: 'Ver el motor', href: '/admin/motor' },
    },
    {
      clave: 'url',
      titulo: 'La dirección pública de la aplicación es la de verdad',
      porQue:
        'Con ella se construye el enlace de BAJA de los correos de marketing, el de invitación de los usuarios nuevos y los de los avisos. Si apunta a otro sitio, la baja en un clic no funciona — y eso es el RGPD, no una molestia.',
      hecho: /^https:\/\//.test(urlApp) && !/localhost/.test(urlApp),
      detalle: urlApp ? `NEXT_PUBLIC_URL_APP = ${urlApp}` : 'NEXT_PUBLIC_URL_APP está vacía',
      gravedad: 'bloquea',
    },
    {
      clave: 'prueba',
      titulo: 'No quedan datos de prueba',
      porQue:
        'Mientras estén, las métricas del primer mes salen sucias y una cuenta de pruebas es una puerta abierta con contraseña conocida.',
      hecho: rastroDePrueba === 0,
      detalle:
        rastroDePrueba === 0
          ? 'ni casos «Prueba», ni cuentas @test.com, ni centros [STAGING]'
          : [
              casosDePrueba ? `${casosDePrueba} caso(s) «Prueba …»` : null,
              cuentasDePrueba ? `${cuentasDePrueba} cuenta(s) @test.com` : null,
              centrosDePrueba ? `${centrosDePrueba} centro(s) [STAGING]` : null,
            ]
              .filter(Boolean)
              .join(' · '),
      gravedad: 'bloquea',
      donde: { texto: 'Usuarios', href: '/admin/equipo' },
    },
    {
      clave: 'relevo',
      titulo: 'Hay más de una dirección de grupo',
      porQue:
        'Solo la dirección de grupo crea usuarios, cambia roles y toca los ajustes comunes. Con una sola, una baja, unas vacaciones o un móvil perdido dejan la administración cerrada.',
      hecho: deGrupo.length >= 2,
      detalle:
        deGrupo.length === 1
          ? 'solo una: ' + (deGrupo[0]?.email ?? '')
          : `${deGrupo.length} direcciones de grupo`,
      gravedad: 'conviene',
      donde: { texto: 'Usuarios', href: '/admin/equipo' },
    },
    {
      clave: 'correo',
      titulo: 'Hay proveedor de correo saliente',
      porQue:
        'Sin él se pueden redactar campañas y programarlas, pero no sale ninguna. Tampoco salen las invitaciones a usuarios nuevos ni los avisos por email.',
      hecho: hay(process.env.RESEND_API_KEY) && hay(process.env.EMAIL_REMITENTE),
      detalle: [
        hay(process.env.RESEND_API_KEY) ? 'RESEND_API_KEY ✓' : 'falta RESEND_API_KEY',
        hay(process.env.EMAIL_REMITENTE) ? 'EMAIL_REMITENTE ✓' : 'falta EMAIL_REMITENTE',
      ].join(' · '),
      gravedad: 'conviene',
    },
    {
      clave: 'fuentes',
      titulo: 'Las landings entran por su propia fuente',
      porQue:
        'Cada landing con su token: así el centro y el canal los decide esta plataforma y no lo que envíe la página. Además es lo que permite ver cuál trae más y avisar cuando una deja de traer.',
      hecho: (fuentesActivas ?? 0) > 0,
      detalle:
        (fuentesActivas ?? 0) > 0
          ? `${fuentesActivas} fuente(s) activa(s)`
          : 'ninguna: lo que entre usará el secreto global y dirá su centro en el cuerpo',
      gravedad: 'conviene',
      donde: { texto: 'Captación', href: '/admin/captacion' },
    },
    {
      clave: 'avisos',
      titulo: 'Los avisos al móvil están configurados',
      porQue:
        'Sin las claves VAPID no llega ninguna notificación al teléfono, y media plantilla trabaja desde el móvil.',
      hecho: hay(process.env.VAPID_PRIVATE_KEY) && hay(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      detalle: hay(process.env.VAPID_PRIVATE_KEY)
        ? 'claves VAPID presentes'
        : 'faltan VAPID_PRIVATE_KEY y/o NEXT_PUBLIC_VAPID_PUBLIC_KEY',
      gravedad: 'conviene',
    },
    {
      clave: 'horarios',
      titulo: 'Cada centro tiene su horario de atención',
      porQue:
        'Es el reloj del SLA: los 60 minutos de primera respuesta se cuentan solo mientras el centro está abierto (regla 9). Sin horario se cuentan 24 h al día, así que un caso que entre de madrugada sale fuera de plazo antes de que nadie pueda leerlo — y «cumplimiento del SLA» pasa a ser un objetivo imposible.',
      hecho: sinDecidir.length === 0,
      detalle:
        sinDecidir.length === 0
          ? 'los tres lo tienen decidido (Bellamar, 24/7 a propósito)'
          : 'sin decidir, cuentan 24/7 por defecto: ' + sinDecidir.map((c) => c.nombre).join(', '),
      gravedad: 'conviene',
      donde: { texto: 'Centros', href: '/admin/centros' },
    },
    {
      clave: 'resenas',
      titulo: 'Cada centro tiene su enlace de reseña',
      porQue:
        'Sin enlace no se propone pedir reseña a quien termina bien: la tarea existiría sin sitio donde dejarla.',
      hecho: sinResena.length === 0,
      detalle:
        sinResena.length === 0
          ? 'todos los centros lo tienen'
          : 'sin enlace: ' + sinResena.map((c) => c.nombre).join(', '),
      gravedad: 'conviene',
      donde: { texto: 'Centros', href: '/admin/centros' },
    },
    {
      clave: 'objetivos',
      titulo: 'Hay objetivos para este mes',
      porQue:
        'Sin ellos el panel enseña lo que se ha hecho, pero no si es suficiente. Es la diferencia entre un informe y una herramienta.',
      hecho: (objetivosDelMes ?? 0) > 0,
      detalle:
        (objetivosDelMes ?? 0) > 0
          ? `${objetivosDelMes} objetivo(s) para ${mesActual}`
          : `ninguno para ${mesActual}`,
      gravedad: 'conviene',
      donde: { texto: 'Usuarios y objetivos', href: '/admin/equipo' },
    },
    {
      clave: 'horarios',
      titulo: 'El equipo tiene franjas de disponibilidad',
      porQue:
        'La agenda propone huecos a partir de ellas. Sin franjas, hay que ir a mano y se pisan citas.',
      hecho: (profesionalesConHorario ?? 0) > 0,
      detalle:
        (profesionalesConHorario ?? 0) > 0
          ? `${profesionalesConHorario} franja(s) semanales definidas`
          : 'ninguna franja definida',
      gravedad: 'conviene',
      donde: { texto: 'Disponibilidad', href: '/admin/equipo' },
    },
    {
      clave: 'ia',
      titulo: 'El asistente de IA está encendido',
      porQue:
        'Es lo que resume un caso en tres líneas y responde preguntas sobre los datos con los permisos de quien pregunta. Apagado, esas pantallas están pero no hacen nada.',
      hecho: iaActiva && hay(process.env.ANTHROPIC_API_KEY),
      detalle:
        `interruptor \`ia_activa\`: ${iaActiva ? 'encendido' : 'APAGADO'}` +
        ` · ANTHROPIC_API_KEY: ${hay(process.env.ANTHROPIC_API_KEY) ? 'presente' : 'ausente'}`,
      gravedad: 'conviene',
      donde: { texto: 'Parámetros', href: '/admin/parametros' },
    },
  ];

  return puntos;
}

export function resumen(puntos: Punto[]) {
  const pendientes = puntos.filter((p) => !p.hecho);
  return {
    bloquean: pendientes.filter((p) => p.gravedad === 'bloquea'),
    convienen: pendientes.filter((p) => p.gravedad === 'conviene'),
    hechos: puntos.filter((p) => p.hecho).length,
    total: puntos.length,
  };
}
