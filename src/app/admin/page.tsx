import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { fecha, hoyMadrid } from '@/lib/fechas';
import { estadoDelMotor } from '@/lib/salud-motor';
import { quienEstaDentro } from '@/lib/accesos';
import { exigirDireccion } from './guard';

function Seccion({
  href,
  icono,
  titulo,
  dato,
  descripcion,
}: {
  href: string;
  icono: string;
  titulo: string;
  dato: string;
  descripcion: string;
}) {
  return (
    <Link href={href} className="panel block p-4 transition hover:border-primary/40">
      <p className="flex items-center gap-2 text-[11.5px] text-ink2">
        <span aria-hidden>{icono}</span> {titulo}
      </p>
      <b className="mt-1 block text-[17px] font-bold">{dato}</b>
      <p className="mt-0.5 text-[13px] text-ink2">{descripcion}</p>
    </Link>
  );
}

export default async function AdminPortada() {
  const { supabase, user, perfil } = await exigirDireccion();
  const esDeGrupo = perfil?.alcance === 'grupo';
  const hoy = hoyMadrid();

  const [
    { count: usuariosActivos },
    { data: ausenciasHoy },
    { count: pipelines },
    { count: etiquetas },
    { count: etiquetasAuto },
    { count: centros },
    { data: config },
    { data: auditoria },
    motor,
    presencia,
    { count: fuentes },
    { count: integraciones },
    { count: fases },
    { data: retencion },
  ] = await Promise.all([
    supabase.from('perfiles').select('id', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('ausencias').select('perfil_id').lte('desde', hoy).gte('hasta', hoy),
    supabase.from('pipelines').select('id', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('etiquetas').select('id', { count: 'exact', head: true }).eq('activa', true),
    supabase
      .from('reglas_etiquetado')
      .select('id', { count: 'exact', head: true })
      .eq('activa', true),
    supabase.from('centros').select('id', { count: 'exact', head: true }).eq('activo', true),
    supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'sla_primera_respuesta_minutos')
      .maybeSingle(),
    supabase
      .from('auditoria')
      .select('tabla, accion, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    estadoDelMotor(supabase),
    quienEstaDentro(supabase),
    supabase
      .from('fuentes_captacion')
      .select('id', { count: 'exact', head: true })
      .eq('activa', true),
    supabase.from('integraciones').select('id', { count: 'exact', head: true }).eq('activa', true),
    supabase.from('fases_metodo').select('id', { count: 'exact', head: true }),
    supabase.from('configuracion').select('valor').eq('clave', 'retencion_meses').maybeSingle(),
  ]);

  const ausencias = (ausenciasHoy ?? []).length;

  return (
    <AppShell
      seccion="admin"
      titulo="Administración"
      descripcion="Todo gestionable sin tocar código · cada cambio queda auditado"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Seccion
          href="/admin/equipo"
          icono="👥"
          titulo="Usuarios y roles"
          dato={`${usuariosActivos ?? 0} activos`}
          descripcion="Alta, rol, centros asignados y objetivos"
        />
        <Seccion
          href="/admin/equipo"
          icono="🕐"
          titulo="Disponibilidad y ausencias"
          dato={ausencias === 1 ? '1 ausencia hoy' : `${ausencias} ausencias hoy`}
          descripcion="Franjas semanales, vacaciones y bajas"
        />
        {esDeGrupo && (
          <Seccion
            href="/admin/centros"
            icono="🏥"
            titulo="Centros"
            dato={`${centros ?? 0} activos`}
            descripcion="Incluida la bandeja de grupo"
          />
        )}
        {esDeGrupo && (
          <Seccion
            href="/admin/pipelines"
            icono="▦"
            titulo="Pipelines"
            dato={`${pipelines ?? 0} ${pipelines === 1 ? 'proceso' : 'procesos'}`}
            descripcion="Etapas mapeadas a estados de sistema"
          />
        )}
        {esDeGrupo && (
          <Seccion
            href="/contactos/etiquetas"
            icono="🏷"
            titulo="Etiquetas y reglas"
            dato={`${etiquetas ?? 0} · ${etiquetasAuto ?? 0} automáticas`}
            descripcion="Organización del directorio de contactos"
          />
        )}
        {esDeGrupo && (
          <Seccion
            href="/admin/catalogos"
            icono="📦"
            titulo="Catálogos"
            dato="4 catálogos"
            descripcion="Canales, modalidades, motivos y adicciones"
          />
        )}
        {esDeGrupo && (
          <Seccion
            href="/admin/parametros"
            icono="⚙"
            titulo="Parámetros"
            dato={`SLA ${Number(config?.valor) || 60} min`}
            descripcion="Cadencia, alertas y plantilla del recordatorio"
          />
        )}
        {esDeGrupo && (
          <Seccion
            href="/admin/motor"
            icono="🔁"
            titulo="Motor de automatizaciones"
            dato={motor.nuncaHaCorrido ? 'Sin arrancar' : motor.parado ? 'Parado' : 'Funcionando'}
            descripcion="Reparto, alertas, cadencia y recordatorios: si corre y para qué sirve"
          />
        )}
        {esDeGrupo && (
          <Seccion
            href="/admin/accesos"
            icono="🔑"
            titulo="Accesos y presencia"
            dato={`${presencia.gente.filter((p) => p.ahora).length} dentro ahora`}
            descripcion="Quién ha entrado, quién lo ha intentado sin conseguirlo"
          />
        )}
        {/*
          Estas cuatro estaban en el menú lateral pero no aquí, y esta pantalla
          se presenta como el mapa de la administración: quien entrase por aquí
          concluiría que no existen. Las de grupo no se le enseñan a la
          dirección de un centro, que no puede tocarlas.
        */}
        {esDeGrupo && (
          <Seccion
            href="/admin/captacion"
            icono="🎯"
            titulo="Captación"
            dato={`${fuentes ?? 0} ${fuentes === 1 ? 'fuente activa' : 'fuentes activas'}`}
            descripcion="Las landings y formularios que traen leads, y si siguen trayendo"
          />
        )}
        {esDeGrupo && (
          <Seccion
            href="/admin/integraciones"
            icono="🔌"
            titulo="Integraciones"
            dato={`${integraciones ?? 0} ${integraciones === 1 ? 'activa' : 'activas'}`}
            descripcion="WhatsApp, Zerochats, Google y el gasto publicitario por campaña"
          />
        )}
        {esDeGrupo && (
          <Seccion
            href="/admin/clinica"
            icono="✚"
            titulo="Área clínica"
            dato={`${fases ?? 0} ${fases === 1 ? 'fase' : 'fases'} del método`}
            descripcion="Fases, habitaciones y cuestionarios"
          />
        )}
        {esDeGrupo && (
          <Seccion
            href="/admin/retencion"
            icono="🗄"
            titulo="Retención de datos"
            dato={`${Number(retencion?.valor ?? 12)} meses`}
            descripcion="Cuánto se guarda y qué se anonimiza al vencer (RGPD)"
          />
        )}
      </div>

      {/*
        Lo que ve quien dirige un centro es distinto, y no por cortesia: las
        politicas de la base no le dejan leer pipelines, motor, accesos ni
        auditoria, asi que esas tarjetas le salian a cero. «0 procesos» y «motor
        sin arrancar» no eran una vista reducida: eran mentira, y de las que se
        creen porque el numero esta ahi puesto.
      */}
      {!esDeGrupo && (
        <p className="mt-4 max-w-[76ch] rounded-xl bg-surface2 p-4 text-[13px] text-ink2">
          Administras <b className="text-ink">tu centro</b>: tu gente, sus objetivos, su
          disponibilidad y sus ausencias. Lo que comparten los tres centros —catálogos, procesos de
          venta, parámetros, centros y captación— lo lleva la dirección de grupo, para que un cambio
          hecho aquí no se le aplique a los demás sin saberlo.
        </p>
      )}

      {esDeGrupo && (
        <section className="panel mt-4 p-4">
          <h3 className="mb-2.5 text-[11px] uppercase tracking-[0.1em] text-muted">
            Últimos cambios auditados
          </h3>
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {(auditoria ?? []).map((a, i) => (
              <li
                key={i}
                className="flex justify-between gap-3 border-b border-dashed border-line pb-1.5 last:border-0"
              >
                <span className="text-ink2">
                  {a.accion} en <b className="text-ink">{a.tabla}</b>
                </span>
                <span className="num shrink-0 text-muted">{fecha(a.created_at)}</span>
              </li>
            ))}
            {(auditoria ?? []).length === 0 && (
              <li className="text-muted">Todavía no hay movimientos registrados.</li>
            )}
          </ul>
          <p className="mt-2 text-xs text-muted">
            La auditoría es de solo lectura y no se puede modificar ni borrar, tampoco desde aquí.
          </p>
        </section>
      )}

      <p className="mt-3 text-xs text-muted">Sesión de {user.email}</p>
    </AppShell>
  );
}
