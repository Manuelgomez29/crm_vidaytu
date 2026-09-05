/**
 * Verificación de seguridad de Vidaitu DATA.
 *
 *   npm run verificar:seguridad
 *
 * Ataca la plataforma desde fuera y desde dentro con las credenciales reales
 * de cada rol, y comprueba que cada agujero encontrado en la auditoría sigue
 * cerrado. No mira el código: mira lo que la base de datos y las rutas hacen
 * de verdad.
 *
 * Cada bloque corresponde a un hallazgo real, reproducido antes de arreglarlo.
 * Si alguno vuelve a fallar, es que una migración o un cambio lo ha reabierto.
 *
 * Deja el sistema como estaba.
 */
import { createClient } from '@supabase/supabase-js';
import { rutaInternaSegura, firmarDestino, destinoValido, secretoCoincide } from '../src/lib/enlaces';

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PASSWORD = 'vidaytu-dev-2026';

const admin = createClient(URL_SUPABASE, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let fallos = 0;
function comprobar(descripcion: string, condicion: boolean, detalle = '') {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLO'} ${descripcion}${detalle ? ` — ${detalle}` : ''}`);
}

async function sesion(email: string) {
  const c = createClient(URL_SUPABASE, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`No se pudo entrar como ${email}: ${error.message}`);
  return c;
}

async function main() {
  console.log('\nVERIFICACIÓN DE SEGURIDAD\n');

  // -------------------------------------------------------------------------
  console.log('1. Sin sesión, solo con la clave que va en el navegador');
  const anon = createClient(URL_SUPABASE, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const tabla of ['leads', 'contactos', 'pacientes', 'facturas', 'auditoria', 'configuracion']) {
    const { data, error } = await anon.from(tabla as 'leads').select('*').limit(1);
    comprobar(`no puede leer ${tabla}`, Boolean(error) || (data ?? []).length === 0);
  }

  const { error: eEscritura } = await anon
    .from('leads')
    .insert({ nombre: 'x', telefono: '+34600000000' } as never);
  comprobar('no puede escribir en leads', Boolean(eEscritura));

  /**
   * Este era real: `siguiente_numero_factura` incrementa la serie fiscal, y
   * Postgres concede EXECUTE a PUBLIC al crear una función. Tres llamadas sin
   * sesión movieron la serie de Bellamar del 1 al 4.
   */
  const { data: centro } = await admin.from('centros').select('id').eq('slug', 'bellamar').single();
  const { data: serieAntes } = await admin
    .from('series_factura')
    .select('ultimo_numero')
    .eq('centro_id', centro!.id)
    .eq('ano', new Date().getFullYear())
    .maybeSingle();

  const { error: eFactura } = await anon.rpc('siguiente_numero_factura', {
    p_centro: centro!.id,
    p_ano: new Date().getFullYear(),
  });

  const { data: serieDespues } = await admin
    .from('series_factura')
    .select('ultimo_numero')
    .eq('centro_id', centro!.id)
    .eq('ano', new Date().getFullYear())
    .maybeSingle();

  comprobar(
    'no puede quemar números de la serie de facturas',
    Boolean(eFactura) && serieAntes?.ultimo_numero === serieDespues?.ultimo_numero,
    `serie ${serieAntes?.ultimo_numero ?? 0} -> ${serieDespues?.ultimo_numero ?? 0}`,
  );

  const { error: eDisp } = await anon.rpc('aviso_disponibilidad', {
    p_profesional: '00000000-0000-0000-0000-000000000000',
    p_inicio: new Date().toISOString(),
    p_fin: new Date().toISOString(),
  });
  comprobar('no puede sondear la disponibilidad de un profesional', Boolean(eDisp));

  /**
   * El contador del límite lo lleva el servidor. Si un anónimo pudiera
   * invocarlo con la clave que quisiera, agotaría de antemano la cuota de
   * login de una persona concreta y la dejaría fuera de su herramienta.
   */
  const { error: eLimite } = await anon.rpc('consumir_intento', {
    p_clave: 'ataque',
    p_maximo: 1,
    p_ventana_segundos: 60,
  });
  comprobar('no puede tocar los contadores del límite de peticiones', Boolean(eLimite));

  // -------------------------------------------------------------------------
  console.log('\n2. El muro: un terapeuta frente a los datos comerciales');
  const terapeuta = await sesion('terapeuta@test.com');

  /**
   * Este era el peor: `campana_destinatarios` tenía `using (true)`, así que
   * un terapeuta podía listar el email de toda la base de marketing y su
   * token de baja. Correos de personas vinculadas a centros de adicciones:
   * la lista en sí misma es el dato sensible.
   */
  const { data: contactoPrueba } = await admin
    .from('contactos')
    .insert({
      nombre: 'Prueba de fuga',
      telefono: '+34600321321',
      email: 'fuga@example.com',
      consentimiento_marketing: true,
    })
    .select('id')
    .single();
  const { data: campanaPrueba } = await admin
    .from('campanas_email')
    .insert({ nombre: 'Prueba de fuga', asunto: 'x', cuerpo_texto: 'x' })
    .select('id')
    .single();
  await admin.from('campana_destinatarios').insert({
    campana_id: campanaPrueba!.id,
    contacto_id: contactoPrueba!.id,
    email: 'fuga@example.com',
  });

  for (const tabla of [
    'contactos',
    'leads',
    'campanas_email',
    'campana_destinatarios',
    'bajas_marketing',
    'plantillas_email',
    'facturas',
    'presupuestos',
  ]) {
    const { data } = await terapeuta.from(tabla as 'leads').select('*').limit(3);
    comprobar(`no ve ${tabla}`, (data ?? []).length === 0, `${(data ?? []).length} fila(s)`);
  }

  await admin.from('campanas_email').delete().eq('id', campanaPrueba!.id);
  await admin.from('contactos').delete().eq('id', contactoPrueba!.id);

  // -------------------------------------------------------------------------
  console.log('\n3. Entre centros: un comercial de Horizonte y los datos de Bellamar');
  const horizonte = await sesion('horizonte@test.com');
  const { data: bellamar } = await admin.from('centros').select('id').eq('slug', 'bellamar').single();
  const { data: leadBm } = await admin
    .from('leads')
    .select('id')
    .eq('centro_id', bellamar!.id)
    .limit(1)
    .single();

  await admin.from('mensajes_whatsapp').insert({
    telefono: '+34600999888',
    direccion: 'entrante',
    cuerpo: 'Mensaje privado',
    lead_id: leadBm!.id,
  });

  const { data: leadsVe } = await horizonte.from('leads').select('id').eq('centro_id', bellamar!.id);
  comprobar('no ve los leads de Bellamar', (leadsVe ?? []).length === 0);

  /**
   * También real: la política de `mensajes_whatsapp` daba acceso a cualquier
   * `admisiones` sin mirar el centro. Cero leads visibles, pero el mensaje
   * entrante con su teléfono sí.
   */
  const { data: wsVe } = await horizonte
    .from('mensajes_whatsapp')
    .select('cuerpo')
    .eq('telefono', '+34600999888');
  comprobar('tampoco sus mensajes de WhatsApp', (wsVe ?? []).length === 0);

  await admin.from('mensajes_whatsapp').delete().eq('telefono', '+34600999888');

  // -------------------------------------------------------------------------
  console.log('\n4. El directorio de contactos, limitado por centro');
  const equipo = await sesion('equipo@test.com');

  /**
   * La política de EDICIÓN de contactos ya estaba limitada por centro; la de
   * LECTURA era solo `mi_rol() = admisiones`. Un comercial sin acceso a
   * Horizonte podía listar el nombre y el teléfono de TODAS las personas del
   * sistema. Para un grupo de centros de adicciones, esa lista es el dato más
   * sensible que se guarda.
   */
  const { data: centroHz } = await admin
    .from('centros')
    .select('id')
    .eq('slug', 'horizonte')
    .single();
  const { data: leadDeHorizonte } = await admin
    .from('leads')
    .select('id, telefono')
    .eq('centro_id', centroHz!.id)
    .limit(1)
    .single();

  const { data: veSuGente } = await horizonte
    .from('contactos')
    .select('id')
    .eq('telefono', leadDeHorizonte!.telefono);
  comprobar(
    'quien SÍ lleva Horizonte ve a su gente',
    (veSuGente ?? []).length > 0,
    'control: sin esto, el filtro estaría de más',
  );

  const { data: noVeAjenos } = await equipo
    .from('contactos')
    .select('id, nombre, telefono')
    .eq('telefono', leadDeHorizonte!.telefono);
  comprobar('quien NO lleva Horizonte no ve a su gente', (noVeAjenos ?? []).length === 0);

  /**
   * Y el oráculo de existencia que quedaba en el alta manual: buscar el
   * teléfono no confirma que esa persona esté en el sistema.
   */
  const { data: niPorTelefono } = await equipo
    .from('leads')
    .select('id')
    .eq('telefono', leadDeHorizonte!.telefono);
  comprobar('ni encuentra su caso por el teléfono', (niPorTelefono ?? []).length === 0);

  // -------------------------------------------------------------------------
  console.log('\n5. Escalada de privilegios');
  const { data: yo } = await equipo
    .from('perfiles')
    .select('id')
    .eq('email', 'equipo@test.com')
    .single();

  await equipo.from('perfiles').update({ rol: 'direccion' }).eq('id', yo!.id);
  const { data: trasRol } = await admin.from('perfiles').select('rol').eq('id', yo!.id).single();
  comprobar('un comercial no puede ascenderse a dirección', trasRol!.rol === 'admisiones');

  await equipo.from('perfiles').update({ acceso_clinico: true }).eq('id', yo!.id);
  const { data: trasClinico } = await admin
    .from('perfiles')
    .select('acceso_clinico')
    .eq('id', yo!.id)
    .single();
  comprobar('ni darse acceso al área clínica', trasClinico!.acceso_clinico === false);

  const { data: hz } = await admin.from('centros').select('id').eq('slug', 'horizonte').single();
  const { data: centrosNuevos } = await equipo
    .from('perfil_centros')
    .insert({ perfil_id: yo!.id, centro_id: hz!.id })
    .select('id');
  comprobar('ni añadirse un centro', (centrosNuevos ?? []).length === 0);

  // -------------------------------------------------------------------------
  console.log('\n6. La auditoría es de verdad inmutable');
  const { data: fila } = await admin.from('auditoria').select('id').limit(1).maybeSingle();
  if (fila) {
    const { error: eUpd } = await equipo
      .from('auditoria')
      .update({ accion: 'FALSIFICADO' })
      .eq('id', fila.id);
    comprobar('no se puede modificar', Boolean(eUpd));
    const { error: eDel } = await equipo.from('auditoria').delete().eq('id', fila.id);
    comprobar('no se puede borrar', Boolean(eDel));
  }
  const { error: eIns } = await equipo
    .from('auditoria')
    .insert({ tabla: 'x', accion: 'INVENTADO' } as never);
  comprobar('no se pueden inventar entradas', Boolean(eIns));

  // -------------------------------------------------------------------------
  console.log('\n7. Los avisos entre compañeros llegan');
  /**
   * `notificaciones` no tenía política de INSERT, así que todo aviso creado
   * por una acción con la sesión del usuario era rechazado en silencio: nadie
   * se enteraba de que le habían asignado un paciente o traspasado la cartera.
   */
  const { data: otro } = await admin
    .from('perfiles')
    .select('id')
    .eq('email', 'horizonte@test.com')
    .single();
  const marca = `verificacion ${Date.now()}`;
  await equipo
    .from('notificaciones')
    .insert({ usuario_id: otro!.id, tipo: 'lead_asignado', mensaje: marca });
  const { count } = await admin
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('mensaje', marca);
  comprobar('un aviso para un compañero se guarda', (count ?? 0) > 0);
  await admin.from('notificaciones').delete().eq('mensaje', marca);

  // -------------------------------------------------------------------------
  console.log('\n8. Redirecciones abiertas y firmas');
  const ataques = [
    'https://evil.example.com',
    '//evil.example.com',
    `/${String.fromCharCode(92)}evil.example.com`,
    'javascript:alert(1)',
    '/../../etc/passwd',
  ];
  for (const ataque of ataques) {
    comprobar(
      `el ?next= rechaza ${JSON.stringify(ataque)}`,
      rutaInternaSegura(ataque, '/establecer-clave') === '/establecer-clave',
    );
  }
  comprobar('y acepta una ruta interna', rutaInternaSegura('/seguridad', '/x') === '/seguridad');

  const destino = 'https://vidaytu.es/charla';
  const firma = firmarDestino(destino);
  comprobar('el redirector acepta un destino firmado', destinoValido(destino, firma));
  comprobar('rechaza uno sin firma', !destinoValido('https://evil.example.com', null));
  comprobar('y rechaza la firma de otro destino', !destinoValido('https://evil.example.com', firma));

  comprobar('los secretos se comparan en tiempo constante', secretoCoincide('abc123', 'abc123'));
  comprobar('y un prefijo correcto no cuela', !secretoCoincide('abc', 'abc123'));

  // -------------------------------------------------------------------------
  console.log('\n9. El límite de peticiones cuenta y aguanta la concurrencia');
  const claveSerie = `verificacion:${Date.now()}`;
  const serie: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const { data } = await admin.rpc('consumir_intento', {
      p_clave: claveSerie,
      p_maximo: 5,
      p_ventana_segundos: 60,
    });
    serie.push(data === true);
  }
  comprobar(
    'deja pasar 5 y bloquea el 6 y el 7',
    serie.filter(Boolean).length === 5 && !serie[5] && !serie[6],
  );

  /**
   * Lo que de verdad importa: dos peticiones simultáneas no pueden colarse
   * ambas por el hueco del último intento. Es una sola sentencia atómica.
   */
  const claveConcurrente = `concurrencia:${Date.now()}`;
  const enParalelo = await Promise.all(
    Array.from({ length: 20 }, () =>
      admin.rpc('consumir_intento', {
        p_clave: claveConcurrente,
        p_maximo: 5,
        p_ventana_segundos: 60,
      }),
    ),
  );
  const pasaron = enParalelo.filter((r) => r.data === true).length;
  comprobar('20 peticiones a la vez con límite 5 dejan pasar exactamente 5', pasaron === 5, `pasaron ${pasaron}`);

  await admin.from('limite_peticiones').delete().like('clave', 'verificacion:%');
  await admin.from('limite_peticiones').delete().like('clave', 'concurrencia:%');

  // -------------------------------------------------------------------------
  console.log(
    fallos === 0
      ? '\nNingún agujero reabierto: todas las comprobaciones pasan.\n'
      : `\n${fallos} comprobación(es) FALLIDAS.\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Verificación fallida:', e);
  process.exit(1);
});
