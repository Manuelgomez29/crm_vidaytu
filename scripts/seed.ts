/**
 * Seed de DESARROLLO para Vidaitu DATA.
 * Crea 3 usuarios de prueba, sus centros y disponibilidades, y 8 leads
 * ficticios obvios con contactos, actividades y una tarea.
 *
 * Usa la SERVICE ROLE (salta RLS): ejecutar solo contra entornos de desarrollo.
 *   npm run db:seed
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD_DEV = 'vidaytu-dev-2026';

function fallar(contexto: string, error: { message: string } | null): asserts error is null {
  if (error) {
    console.error(`Error en ${contexto}:`, error.message);
    process.exit(1);
  }
}

async function asegurarUsuario(email: string, nombre: string, rol: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD_DEV,
    email_confirm: true,
  });

  let userId = data?.user?.id;
  if (error) {
    // Probablemente ya existe: lo buscamos.
    const { data: lista, error: errorLista } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    fallar(`listar usuarios buscando ${email}`, errorLista);
    userId = lista.users.find((u) => u.email === email)?.id;
    if (!userId) {
      console.error(`No se pudo crear ni encontrar el usuario ${email}: ${error.message}`);
      process.exit(1);
    }
  }

  const { error: errorPerfil } = await admin
    .from('perfiles')
    .upsert({ id: userId, nombre, email, rol, activo: true });
  fallar(`perfil de ${email}`, errorPerfil);

  return userId!;
}

async function main() {
  console.log('— Usuarios de prueba…');
  const direccionId = await asegurarUsuario('direccion@test.com', 'Dirección (prueba)', 'direccion');
  const horizonteId = await asegurarUsuario('horizonte@test.com', 'Comercial Horizonte (prueba)', 'admisiones');
  const equipoId = await asegurarUsuario('equipo@test.com', 'Comercial Equipo (prueba)', 'admisiones');
  const terapeutaId = await asegurarUsuario('terapeuta@test.com', 'Terapeuta (prueba)', 'terapeuta');

  console.log('— Catálogos…');
  const { data: centros, error: errorCentros } = await admin.from('centros').select('id, slug');
  fallar('leer centros', errorCentros);
  const centro = Object.fromEntries(centros.map((c) => [c.slug, c.id]));

  const { data: canales, error: errorCanales } = await admin.from('canales').select('id, slug');
  fallar('leer canales', errorCanales);
  const canal = Object.fromEntries(canales.map((c) => [c.slug, c.id]));

  const { data: pipeline, error: errorPipeline } = await admin
    .from('pipelines')
    .select('id')
    .eq('nombre', 'Estándar Vidaitu')
    .single();
  fallar('leer pipeline estándar', errorPipeline);

  const { data: etapas, error: errorEtapas } = await admin
    .from('pipeline_etapas')
    .select('id, estado_sistema')
    .eq('pipeline_id', pipeline.id);
  fallar('leer etapas', errorEtapas);
  const etapa = Object.fromEntries(etapas.map((e) => [e.estado_sistema, e.id]));

  console.log('— Centros por comercial…');
  const asignaciones = [
    { perfil_id: horizonteId, centro_id: centro['horizonte'] },
    { perfil_id: equipoId, centro_id: centro['eclipse'] },
    { perfil_id: equipoId, centro_id: centro['bellamar'] },
    { perfil_id: equipoId, centro_id: centro['bandeja-grupo'] },
    { perfil_id: terapeutaId, centro_id: centro['eclipse'] },
  ];
  const { error: errorAsig } = await admin
    .from('perfil_centros')
    .upsert(asignaciones, { onConflict: 'perfil_id,centro_id', ignoreDuplicates: true });
  fallar('perfil_centros', errorAsig);

  console.log('— Disponibilidades…');
  await admin.from('disponibilidad').delete().in('perfil_id', [horizonteId, equipoId, terapeutaId]);
  const disponibilidad = [
    // Horizonte: L–V mañana y tarde (teléfono hasta 21:00) + sábado por la mañana
    ...[1, 2, 3, 4, 5].flatMap((dia) => [
      { perfil_id: horizonteId, dia_semana: dia, hora_inicio: '09:30', hora_fin: '14:00' },
      { perfil_id: horizonteId, dia_semana: dia, hora_inicio: '16:00', hora_fin: '21:00' },
    ]),
    { perfil_id: horizonteId, dia_semana: 6, hora_inicio: '10:00', hora_fin: '14:00' },
    // Equipo (Eclipse + Bellamar): L–V jornada continua
    ...[1, 2, 3, 4, 5].map((dia) => ({
      perfil_id: equipoId,
      dia_semana: dia,
      hora_inicio: '09:00',
      hora_fin: '17:00',
    })),
    // Terapeuta: consulta de tarde, martes a viernes
    ...[2, 3, 4, 5].map((dia) => ({
      perfil_id: terapeutaId,
      dia_semana: dia,
      hora_inicio: '15:00',
      hora_fin: '20:00',
    })),
  ];
  const { error: errorDisp } = await admin.from('disponibilidad').insert(disponibilidad);
  fallar('disponibilidad', errorDisp);

  console.log('— Limpiando leads de seed anteriores…');
  const { error: errorLimpiar } = await admin.from('leads').delete().eq('origen_sistema', 'seed');
  fallar('limpiar leads de seed', errorLimpiar);

  console.log('— Contactos…');
  const contactosSeed = [
    { nombre: 'Prueba Uno', telefono: '+34600000001', zona: 'Jerez de la Frontera' },
    { nombre: 'Prueba Dos', telefono: '+34600000002', zona: 'Cádiz' },
    { nombre: 'Prueba Tres', telefono: '+34600000003', zona: 'Reus' },
    { nombre: 'Prueba Cuatro', telefono: '+34600000004', zona: 'Tarragona' },
    { nombre: 'Prueba Cinco', telefono: '+34600000005', zona: 'Tarragona' },
    { nombre: 'Prueba Seis', telefono: '+34600000006', zona: 'Salou' },
    { nombre: 'Prueba Siete', telefono: '+34600000007', zona: 'Barcelona' },
    { nombre: 'Prueba Ocho', telefono: '+34600000008', zona: 'Madrid' },
    // Contacto extra del caso 4 (familiar + afectado en el mismo caso)
    { nombre: 'Prueba Cuatro Bis', telefono: '+34600000104', zona: 'Tarragona' },
  ];
  const { data: contactos, error: errorContactos } = await admin
    .from('contactos')
    .upsert(contactosSeed, { onConflict: 'telefono' })
    .select('id, telefono');
  fallar('contactos', errorContactos);
  const contacto = Object.fromEntries(contactos.map((c) => [c.telefono, c.id]));

  console.log('— Leads…');
  const leadsSeed = [
    // 2 de Horizonte
    {
      ref: 'lead-1', telefonoPrincipal: '+34600000001', tipoPrincipal: 'afectado',
      lead: {
        centro_id: centro['horizonte'], propietario_id: horizonteId,
        nombre: 'Prueba Uno', telefono: '+34600000001', quien_contacta: 'afectado',
        canal_id: canal['telefono'], estado: 'contactado', etapa_id: etapa['contactado'],
        urgencia: 'media', zona: 'Jerez de la Frontera', created_by: direccionId,
      },
    },
    {
      ref: 'lead-2', telefonoPrincipal: '+34600000002', tipoPrincipal: 'familiar',
      lead: {
        centro_id: centro['horizonte'], propietario_id: null,
        nombre: 'Prueba Dos', telefono: '+34600000002', quien_contacta: 'familiar',
        relacion_con_afectado: 'madre', nombre_afectado: 'Hijo de Prueba Dos',
        canal_id: canal['formulario_web'], estado: 'nuevo', etapa_id: etapa['nuevo'],
        urgencia: 'alta', zona: 'Cádiz', created_by: direccionId,
      },
    },
    // 2 de Eclipse
    {
      ref: 'lead-3', telefonoPrincipal: '+34600000003', tipoPrincipal: 'afectado',
      lead: {
        centro_id: centro['eclipse'], propietario_id: equipoId,
        nombre: 'Prueba Tres', telefono: '+34600000003', quien_contacta: 'afectado',
        canal_id: canal['meta_ads'], subcanal: 'Campaña llamadas',
        utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'seed-demo',
        estado: 'cita_agendada', etapa_id: etapa['cita_agendada'],
        urgencia: 'media', zona: 'Reus', created_by: direccionId,
      },
    },
    {
      ref: 'lead-4', telefonoPrincipal: '+34600000004', tipoPrincipal: 'familiar',
      lead: {
        centro_id: centro['eclipse'], propietario_id: null,
        nombre: 'Prueba Cuatro', telefono: '+34600000004', quien_contacta: 'familiar',
        relacion_con_afectado: 'pareja', nombre_afectado: 'Prueba Cuatro Bis',
        canal_id: canal['google_ads'], estado: 'nuevo', etapa_id: etapa['nuevo'],
        urgencia: 'alta', zona: 'Tarragona', created_by: direccionId,
      },
    },
    // 2 de Bellamar
    {
      ref: 'lead-5', telefonoPrincipal: '+34600000005', tipoPrincipal: 'familiar',
      lead: {
        centro_id: centro['bellamar'], propietario_id: equipoId,
        nombre: 'Prueba Cinco', telefono: '+34600000005', quien_contacta: 'familiar',
        relacion_con_afectado: 'hermano', canal_id: canal['whatsapp'],
        estado: 'en_valoracion', etapa_id: etapa['en_valoracion'],
        urgencia: 'alta', zona: 'Tarragona', created_by: direccionId,
      },
    },
    {
      ref: 'lead-6', telefonoPrincipal: '+34600000006', tipoPrincipal: 'prescriptor',
      lead: {
        centro_id: centro['bellamar'], propietario_id: null,
        nombre: 'Prueba Seis', telefono: '+34600000006', quien_contacta: 'prescriptor',
        prescriptor_nombre: 'Psicólogo de prueba', canal_id: canal['prescriptor'],
        estado: 'nuevo', etapa_id: etapa['nuevo'],
        zona: 'Salou', created_by: direccionId,
      },
    },
    // 2 de la bandeja de grupo
    {
      ref: 'lead-7', telefonoPrincipal: '+34600000007', tipoPrincipal: 'afectado',
      lead: {
        centro_id: centro['bandeja-grupo'], propietario_id: null,
        nombre: 'Prueba Siete', telefono: '+34600000007', quien_contacta: 'afectado',
        canal_id: canal['instagram'], subcanal: 'Instagram Lolo Drago',
        estado: 'nuevo', etapa_id: etapa['nuevo'],
        zona: 'Barcelona', created_by: direccionId,
      },
    },
    {
      ref: 'lead-8', telefonoPrincipal: '+34600000008', tipoPrincipal: 'familiar',
      lead: {
        centro_id: centro['bandeja-grupo'], propietario_id: equipoId,
        nombre: 'Prueba Ocho', telefono: '+34600000008', quien_contacta: 'familiar',
        relacion_con_afectado: 'padre', canal_id: canal['recomendacion'],
        estado: 'contactado', etapa_id: etapa['contactado'],
        zona: 'Madrid', created_by: direccionId,
      },
    },
  ];

  for (const item of leadsSeed) {
    const { data: lead, error: errorLead } = await admin
      .from('leads')
      .insert({
        ...item.lead,
        pipeline_id: pipeline.id,
        origen_sistema: 'seed',
        origen_ref: item.ref,
      })
      .select('id')
      .single();
    fallar(`lead ${item.ref}`, errorLead);

    const vinculos = [
      {
        lead_id: lead.id,
        contacto_id: contacto[item.telefonoPrincipal],
        tipo: item.tipoPrincipal,
        es_principal: true,
      },
    ];
    if (item.ref === 'lead-4') {
      vinculos.push({
        lead_id: lead.id,
        contacto_id: contacto['+34600000104'],
        tipo: 'afectado',
        es_principal: false,
      });
    }
    const { error: errorVinculos } = await admin.from('lead_contactos').insert(vinculos);
    fallar(`lead_contactos de ${item.ref}`, errorVinculos);
  }

  console.log('— Actividades y tareas de ejemplo…');
  const { data: leadUno, error: errorLeadUno } = await admin
    .from('leads')
    .select('id, propietario_id')
    .eq('origen_ref', 'lead-1')
    .eq('origen_sistema', 'seed')
    .single();
  fallar('recuperar lead-1', errorLeadUno);

  const { data: leadTres, error: errorLeadTres } = await admin
    .from('leads')
    .select('id, propietario_id')
    .eq('origen_ref', 'lead-3')
    .eq('origen_sistema', 'seed')
    .single();
  fallar('recuperar lead-3', errorLeadTres);

  const { error: errorActividades } = await admin.from('actividades').insert([
    {
      lead_id: leadUno.id,
      tipo: 'llamada',
      contenido: 'Primera llamada: interesado en horario de tarde. (Dato ficticio de seed)',
      usuario_id: horizonteId,
    },
    {
      lead_id: leadUno.id,
      tipo: 'whatsapp',
      contenido: 'Enviada información general por WhatsApp. (Dato ficticio de seed)',
      usuario_id: horizonteId,
    },
    {
      lead_id: leadTres.id,
      tipo: 'nota',
      contenido: 'Prefiere que le llamemos después de las 18:00. (Dato ficticio de seed)',
      usuario_id: equipoId,
    },
  ]);
  fallar('actividades', errorActividades);

  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  manana.setHours(10, 0, 0, 0);

  const { error: errorTarea } = await admin.from('tareas').insert({
    lead_id: leadTres.id,
    titulo: 'Confirmar asistencia a la cita (dato ficticio de seed)',
    vence_at: manana.toISOString(),
    responsable_id: equipoId,
  });
  fallar('tarea', errorTarea);

  console.log('— Citas de ejemplo…');
  await admin.from('citas').delete().in('lead_id', [leadTres.id, leadUno.id]);

  const { data: contactoTres } = await admin
    .from('lead_contactos')
    .select('contacto_id')
    .eq('lead_id', leadTres.id)
    .eq('es_principal', true)
    .maybeSingle();

  // Próxima cita: martes que viene a las 17:00 (dentro de la disponibilidad del terapeuta)
  const proxima = new Date();
  proxima.setDate(proxima.getDate() + ((2 - proxima.getDay() + 7) % 7 || 7));
  proxima.setHours(17, 0, 0, 0);
  const finProxima = new Date(proxima.getTime() + 60 * 60 * 1000);

  const anterior = new Date();
  anterior.setDate(anterior.getDate() - 3);
  anterior.setHours(11, 0, 0, 0);

  const { error: errorCitas } = await admin.from('citas').insert([
    {
      lead_id: leadTres.id,
      centro_id: centro['eclipse'],
      profesional_id: terapeutaId,
      tipo: 'primera_cita',
      modalidad_cita: 'presencial',
      inicio: proxima.toISOString(),
      fin: finProxima.toISOString(),
      estado: 'programada',
      contacto_id: contactoTres?.contacto_id ?? null,
      notas: 'Primera visita presencial (dato ficticio de seed)',
    },
    {
      lead_id: leadUno.id,
      centro_id: centro['horizonte'],
      profesional_id: horizonteId,
      tipo: 'primera_llamada',
      modalidad_cita: 'telefonica',
      inicio: anterior.toISOString(),
      fin: new Date(anterior.getTime() + 30 * 60 * 1000).toISOString(),
      estado: 'realizada',
      notas: 'Llamada de contacto (dato ficticio de seed)',
    },
  ]);
  fallar('citas', errorCitas);

  console.log('— Conversión validada y objetivos…');
  const { data: leadCinco, error: errorLeadCinco } = await admin
    .from('leads')
    .select('id')
    .eq('origen_sistema', 'seed')
    .eq('origen_ref', 'lead-5')
    .single();
  fallar('recuperar lead-5', errorLeadCinco);

  const { data: modalidades, error: errorModalidades } = await admin
    .from('modalidades')
    .select('id, slug');
  fallar('leer modalidades', errorModalidades);
  const modalidad = Object.fromEntries(modalidades.map((m) => [m.slug, m.id]));

  // Un caso ya convertido y validado por dirección, para que el panel tenga datos.
  await admin
    .from('leads')
    .update({ estado: 'convertido', etapa_id: etapa['convertido'] })
    .eq('id', leadCinco.id);

  const { data: presupuesto, error: errorPresupuesto } = await admin
    .from('presupuestos')
    .insert({
      lead_id: leadCinco.id,
      importe: 4200,
      modalidad_id: modalidad['ingreso_residencial'],
      descripcion: 'Programa de ingreso, primer mes (dato ficticio de seed)',
      estado: 'aceptado',
      creado_por: equipoId,
    })
    .select('id')
    .single();
  fallar('presupuesto', errorPresupuesto);

  const { error: errorConversion } = await admin.from('conversiones').insert({
    lead_id: leadCinco.id,
    fecha_inicio: new Date().toISOString().slice(0, 10),
    modalidad_id: modalidad['ingreso_residencial'],
    centro_id: centro['bellamar'],
    importe_primer_pago: 1500,
    presupuesto_id: presupuesto.id,
    estado: 'validada',
    registrada_por: equipoId,
    validada_por: direccionId,
    validada_at: new Date().toISOString(),
  });
  fallar('conversion', errorConversion);

  // Objetivos del mes en curso para los dos comerciales.
  // El mes se calcula en Madrid y NO con toISOString(): en UTC+2, el dia 1 a
  // las 00:30 locales es el ultimo dia del mes anterior en UTC, y la columna
  // exige dia 1.
  const hoyEnMadrid = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
  const mes = `${hoyEnMadrid.slice(0, 7)}-01`;
  const { error: errorObjetivos } = await admin.from('objetivos').upsert(
    [
      { perfil_id: equipoId, mes, meta_citas: 20, meta_conversiones: 4, meta_ingresos: 12000, created_by: direccionId },
      { perfil_id: horizonteId, mes, meta_citas: 15, meta_conversiones: 3, meta_ingresos: 9000, created_by: direccionId },
    ],
    { onConflict: 'perfil_id,mes' },
  );
  fallar('objetivos', errorObjetivos);

  // -------------------------------------------------------------------------
  // AREA CLINICA (fase 3)
  //
  // Un paciente de cada situacion, para poder ver la pantalla con datos: uno
  // en tratamiento con sesiones, y uno de alta con su seguimiento programado.
  // -------------------------------------------------------------------------
  const { data: fases } = await admin
    .from('fases_metodo')
    .select('id, orden')
    .order('orden');
  const faseInicial = fases?.[0]?.id ?? null;
  const faseFinal = fases?.[fases.length - 1]?.id ?? null;

  const { data: bellamar } = await admin
    .from('centros')
    .select('id')
    .eq('slug', 'bellamar')
    .maybeSingle();
  const { data: eclipse } = await admin
    .from('centros')
    .select('id')
    .eq('slug', 'eclipse')
    .maybeSingle();

  if (bellamar && eclipse) {
    const hace2Meses = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    const hace8Meses = new Date(Date.now() - 240 * 86_400_000).toISOString().slice(0, 10);
    const hace1Mes = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

    // `pacientes` no tiene clave unica por telefono a proposito (dos personas
    // pueden compartir el numero de casa), asi que el seed comprueba antes de
    // insertar en lugar de apoyarse en un ON CONFLICT.
    const { data: yaHay } = await admin
      .from('pacientes')
      .select('id')
      .like('nombre', '%dato ficticio de seed%')
      .limit(1);

    const { error: errorPacientes } = yaHay && yaHay.length > 0
      ? { error: null }
      : await admin
      .from('pacientes')
      .insert(
        [
          {
            centro_id: bellamar.id,
            terapeuta_id: terapeutaId,
            nombre: 'Paciente Uno (dato ficticio de seed)',
            telefono: '+34600900001',
            fase_id: faseInicial,
            estado: 'activo',
            fecha_ingreso: hace2Meses,
            created_by: direccionId,
          },
          {
            centro_id: eclipse.id,
            terapeuta_id: terapeutaId,
            nombre: 'Paciente Dos (dato ficticio de seed)',
            telefono: '+34600900002',
            fase_id: faseFinal,
            estado: 'alta',
            fecha_ingreso: hace8Meses,
            fecha_alta: hace1Mes,
            created_by: direccionId,
          },
        ],
      );

    fallar('pacientes', errorPacientes);

    const { data: todosPacientes } = await admin
      .from('pacientes')
      .select('id, estado, nombre')
      .like('nombre', '%dato ficticio de seed%');

    const enTratamiento = (todosPacientes ?? []).find((p) => p.estado === 'activo');
    const deAlta = (todosPacientes ?? []).find((p) => p.estado === 'alta');

    if (enTratamiento) {
      // Sesiones: dos realizadas y una programada.
      const { data: sesionesExistentes } = await admin
        .from('sesiones')
        .select('id')
        .eq('paciente_id', enTratamiento.id)
        .limit(1);

      if (!sesionesExistentes || sesionesExistentes.length === 0) {
      await admin.from('sesiones').insert(
        [-1, -8, 7].map((dias, i) => ({
          paciente_id: enTratamiento.id,
          terapeuta_id: terapeutaId,
          tipo: (i === 2 ? 'familiar' : 'individual') as 'individual' | 'familiar',
          estado: (dias < 0 ? 'realizada' : 'programada') as 'realizada' | 'programada',
          inicio: new Date(Date.now() + dias * 86_400_000).toISOString(),
          fin: new Date(Date.now() + dias * 86_400_000 + 3_600_000).toISOString(),
          notas_clinicas: dias < 0 ? 'Nota de sesion ficticia del seed.' : null,
          created_by: direccionId,
        })),
      );

      await admin.from('familiares').insert({
        paciente_id: enTratamiento.id,
        nombre: 'Familiar de prueba',
        telefono: '+34600900003',
        relacion: 'Madre',
        es_contacto_emergencia: true,
      });
      }

      // Una habitacion en Bellamar con este paciente dentro.
      const { data: habitacion } = await admin
        .from('habitaciones')
        .upsert(
          [
            { centro_id: bellamar.id, nombre: 'Habitacion 1', plazas: 2 },
            { centro_id: bellamar.id, nombre: 'Habitacion 2', plazas: 2 },
          ],
          { onConflict: 'centro_id,nombre', ignoreDuplicates: true },
        )
        .select('id');

      const { data: primeraHabitacion } = await admin
        .from('habitaciones')
        .select('id')
        .eq('centro_id', bellamar.id)
        .order('nombre')
        .limit(1)
        .maybeSingle();

      if (primeraHabitacion) {
        const { data: yaOcupa } = await admin
          .from('ocupaciones')
          .select('id')
          .eq('paciente_id', enTratamiento.id)
          .is('hasta', null)
          .maybeSingle();
        if (!yaOcupa) {
          await admin.from('ocupaciones').insert({
            habitacion_id: primeraHabitacion.id,
            paciente_id: enTratamiento.id,
            desde: hace2Meses,
            created_by: direccionId,
          });
        }
      }
      void habitacion;
    }

    if (deAlta) {
      // Los hitos de seguimiento los programa el motor; aqui se deja el
      // primero para que la pantalla no salga vacia.
      await admin.from('seguimientos_post_alta').upsert(
        [
          {
            paciente_id: deAlta.id,
            hito_meses: 1,
            fecha_prevista: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10),
          },
        ],
        { onConflict: 'paciente_id,hito_meses', ignoreDuplicates: true },
      );
    }
  }

  // -------------------------------------------------------------------------
  // MARKETING (fase 2): un segmento y una plantilla, para poder abrir la
  // pantalla y probar el flujo sin escribir nada.
  // -------------------------------------------------------------------------
  const { data: plantillasExistentes } = await admin
    .from('plantillas_email')
    .select('id')
    .limit(1);

  if (!plantillasExistentes || plantillasExistentes.length === 0) {
  await admin.from('plantillas_email').insert(
    [
      {
        nombre: 'Charla divulgativa (ejemplo)',
        asunto: 'Te esperamos en la charla del jueves',
        cuerpo_texto:
          'Hola {nombre},\n\nEl jueves a las 19:00 hacemos una charla abierta sobre habitos y bienestar. Si te apetece venir, responde a este correo y te guardamos sitio.\n\nUn saludo,\nEquipo de Vidaitu',
        created_by: direccionId,
      },
    ],
  );
  }

  console.log('');
  console.log('Seed completado. Usuarios de prueba (contraseña: ' + PASSWORD_DEV + '):');
  console.log('  direccion@test.com  → dirección (ve todo)');
  console.log('  horizonte@test.com  → admisiones, solo Horizonte');
  console.log('  equipo@test.com     → admisiones, Eclipse + Bellamar + bandeja de grupo');
  console.log('  terapeuta@test.com  → terapeuta, SOLO sus citas y sus pacientes');
  console.log('');
  console.log('Tambien hay 2 fichas de paciente, sesiones, una habitacion ocupada');
  console.log('y una plantilla de email, todas marcadas como datos ficticios.');
}

main().catch((e) => {
  console.error('Seed fallido:', e);
  process.exit(1);
});
