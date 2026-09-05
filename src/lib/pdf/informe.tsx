/**
 * El informe mensual, en PDF.
 *
 * Se maqueta con `@react-pdf/renderer` y no con un navegador sin cabeza: un
 * Chrome headless en una función serverless son cincuenta megas de binario,
 * arranques en frío de varios segundos y una avería que aparece justo el día 1
 * a las siete de la mañana, cuando no hay nadie mirando.
 *
 * LOS NÚMEROS NO SE CALCULAN AQUÍ. Salen de `informe-mensual.ts`, que ya
 * alimenta la pantalla y el correo. Lo único que vive dos veces es la
 * maquetación; las cifras, una sola.
 */
import path from 'node:path';
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { InformeMensual } from '@/lib/informe-mensual';

/*
 * La fuente va en el repositorio y no se descarga al generar. Una llamada a
 * fonts.gstatic.com el día 1 de mes es un punto de fallo gratuito: si falla, no
 * hay informe, y nadie se entera hasta que dirección lo echa en falta.
 */
const dirFuentes = path.join(process.cwd(), 'src', 'lib', 'pdf', 'fuentes');
Font.register({
  family: 'Kumbh Sans',
  fonts: [
    { src: path.join(dirFuentes, 'KumbhSans-400.ttf'), fontWeight: 400 },
    { src: path.join(dirFuentes, 'KumbhSans-600.ttf'), fontWeight: 600 },
    { src: path.join(dirFuentes, 'KumbhSans-700.ttf'), fontWeight: 700 },
  ],
});

const AZUL = '#384B71';
const CORAL = '#E8836F';
const TINTA = '#242B3A';
const TINTA2 = '#5A6272';
const MUTED = '#717583';
const LINEA = '#E2DFD6';
const FONDO = '#F7F6F2';

/** Los mismos colores por centro del sistema de diseño, validados para daltonismo. */
const COLOR_CENTRO: Record<string, string> = {
  horizonte: '#2F9160',
  eclipse: '#5B54C0',
  bellamar: '#6E8AF0',
  bandeja: '#C08427',
};

function colorDe(nombre: string): string {
  const n = nombre.toLowerCase();
  for (const [clave, color] of Object.entries(COLOR_CENTRO)) {
    if (n.includes(clave)) return color;
  }
  return MUTED;
}

const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    .format(n);

const e = StyleSheet.create({
  pagina: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 46, fontFamily: 'Kumbh Sans', fontSize: 9.5, color: TINTA },

  marca: { fontSize: 17, fontWeight: 700, color: AZUL },
  marcaAcento: { color: CORAL },
  grupo: { fontSize: 7.5, letterSpacing: 1.6, color: MUTED, marginTop: 2 },

  titulo: { fontSize: 26, fontWeight: 700, marginTop: 30, color: TINTA },
  subtitulo: { fontSize: 10.5, color: TINTA2, marginTop: 4 },

  seccion: { fontSize: 8, fontWeight: 700, letterSpacing: 1.2, color: MUTED, marginTop: 24, marginBottom: 8 },

  cifras: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cifra: { flex: 1, backgroundColor: FONDO, borderRadius: 6, padding: 11 },
  cifraValor: { fontSize: 18, fontWeight: 700, color: AZUL },
  cifraEtiqueta: { fontSize: 7.5, color: MUTED, marginTop: 3 },

  fila: { flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: LINEA, paddingVertical: 5.5 },
  cabecera: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: TINTA2, paddingBottom: 4 },
  th: { fontSize: 7.5, fontWeight: 700, letterSpacing: 0.6, color: MUTED },
  td: { fontSize: 9 },
  dcha: { textAlign: 'right' },

  puntoCentro: { width: 6, height: 6, borderRadius: 3, marginRight: 5, marginTop: 2 },

  pie: {
    position: 'absolute', bottom: 26, left: 46, right: 46,
    borderTopWidth: 0.6, borderTopColor: LINEA, paddingTop: 7,
    flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 7, color: MUTED,
  },

  nota: { fontSize: 7.5, color: MUTED, marginTop: 10, lineHeight: 1.5 },
});

function Cabecera() {
  return (
    <View>
      <Text style={e.marca}>
        Vidaitu <Text style={e.marcaAcento}>DATA</Text>
      </Text>
      <Text style={e.grupo}>GRUPO VIDAITU</Text>
    </View>
  );
}

function Pie({ generado }: { generado: string }) {
  return (
    <View style={e.pie} fixed>
      <Text>Vidaitu DATA · generado el {generado}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`} />
    </View>
  );
}

function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <View style={e.cifra}>
      <Text style={e.cifraValor}>{valor}</Text>
      <Text style={e.cifraEtiqueta}>{etiqueta}</Text>
    </View>
  );
}

/** Barra proporcional. Sin librería de gráficos: una barra es un rectángulo. */
function Barra({ parte, total, color }: { parte: number; total: number; color: string }) {
  const ancho = total > 0 ? Math.max(2, Math.round((parte / total) * 100)) : 0;
  return (
    <View style={{ height: 5, backgroundColor: FONDO, borderRadius: 3, marginTop: 3 }}>
      <View style={{ height: 5, width: `${ancho}%`, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

export function DocumentoInforme({
  informe,
  prevision,
  generado,
}: {
  informe: InformeMensual;
  prevision: number | null;
  generado: string;
}) {
  const maxLeadsCentro = Math.max(1, ...informe.porCentro.map((c) => c.leads));
  const maxCanal = Math.max(1, ...informe.porCanal.map(([, n]) => n));
  const tasaConversion =
    informe.leads > 0 ? Math.round((informe.conversiones / informe.leads) * 100) : 0;
  const variacion =
    informe.leadsPrevios > 0
      ? Math.round(((informe.leads - informe.leadsPrevios) / informe.leadsPrevios) * 100)
      : null;

  return (
    <Document title={`Informe ${informe.titulo} — Vidaitu`} author="Vidaitu DATA">
      <Page size="A4" style={e.pagina}>
        <Cabecera />

        <Text style={e.titulo}>{informe.titulo}</Text>
        <Text style={e.subtitulo}>
          Informe mensual del grupo · del {informe.desde} al {informe.hasta}
        </Text>

        <View style={e.cifras}>
          <Cifra valor={String(informe.leads)} etiqueta="CASOS NUEVOS" />
          <Cifra valor={String(informe.conversiones)} etiqueta="CONVERSIONES VALIDADAS" />
          <Cifra valor={euros(informe.ingresos)} etiqueta="INGRESOS VALIDADOS" />
          <Cifra valor={euros(informe.ticketMedio)} etiqueta="TICKET MEDIO" />
        </View>

        <View style={e.cifras}>
          <Cifra valor={`${tasaConversion}%`} etiqueta="TASA DE CONVERSIÓN" />
          <Cifra valor={String(informe.citas)} etiqueta="CITAS" />
          <Cifra valor={String(informe.noShows)} etiqueta="NO ACUDIERON" />
          <Cifra
            valor={variacion === null ? '—' : `${variacion > 0 ? '+' : ''}${variacion}%`}
            etiqueta="CASOS FRENTE AL MES ANTERIOR"
          />
        </View>

        {/* ---- Por centro ---- */}
        <Text style={e.seccion}>POR CENTRO</Text>
        <View style={e.cabecera}>
          <Text style={[e.th, { flex: 3 }]}>CENTRO</Text>
          <Text style={[e.th, e.dcha, { flex: 1 }]}>CASOS</Text>
          <Text style={[e.th, e.dcha, { flex: 1 }]}>CITAS</Text>
          <Text style={[e.th, e.dcha, { flex: 1.2 }]}>CONVER.</Text>
          <Text style={[e.th, e.dcha, { flex: 1.6 }]}>INGRESOS</Text>
          <Text style={[e.th, e.dcha, { flex: 1 }]}>PERDIDOS</Text>
        </View>
        {informe.porCentro.map((c) => (
          <View key={c.centro} style={e.fila}>
            <View style={{ flex: 3, flexDirection: 'row' }}>
              <View style={[e.puntoCentro, { backgroundColor: colorDe(c.centro) }]} />
              <View style={{ flex: 1 }}>
                <Text style={e.td}>{c.centro}</Text>
                <Barra parte={c.leads} total={maxLeadsCentro} color={colorDe(c.centro)} />
              </View>
            </View>
            <Text style={[e.td, e.dcha, { flex: 1 }]}>{c.leads}</Text>
            <Text style={[e.td, e.dcha, { flex: 1 }]}>{c.citas}</Text>
            <Text style={[e.td, e.dcha, { flex: 1.2 }]}>{c.conversiones}</Text>
            <Text style={[e.td, e.dcha, { flex: 1.6 }]}>{euros(c.ingresos)}</Text>
            <Text style={[e.td, e.dcha, { flex: 1 }]}>{c.perdidos}</Text>
          </View>
        ))}

        <Text style={e.nota}>
          Los ingresos son de conversiones validadas por dirección. Las registradas y aún sin
          validar no cuentan aquí, para que este número no dependa de quién se apresure a anotar.
        </Text>

        <Pie generado={generado} />
      </Page>

      <Page size="A4" style={e.pagina}>
        <Cabecera />

        {/* ---- Canales ---- */}
        <Text style={e.seccion}>DE DÓNDE LLEGAN</Text>
        {informe.porCanal.length === 0 ? (
          <Text style={e.nota}>Ningún caso nuevo este mes.</Text>
        ) : (
          informe.porCanal.map(([canal, n]) => (
            <View key={canal} style={e.fila}>
              <View style={{ flex: 4 }}>
                <Text style={e.td}>{canal}</Text>
                <Barra parte={n} total={maxCanal} color={AZUL} />
              </View>
              <Text style={[e.td, e.dcha, { flex: 1 }]}>{n}</Text>
            </View>
          ))
        )}

        <Text style={e.nota}>
          La bandeja de grupo aportó {informe.bandeja} caso(s) este mes. Son los que entran sin
          centro claro —sobre todo por el Instagram de Lolo Drago— y se reparten después.
        </Text>

        {/* ---- Pérdidas ---- */}
        <Text style={e.seccion}>POR QUÉ SE PIERDEN</Text>
        {informe.motivosPerdida.length === 0 ? (
          <Text style={e.nota}>Ningún caso cerrado como perdido este mes.</Text>
        ) : (
          informe.motivosPerdida.map(([motivo, n]) => (
            <View key={motivo} style={e.fila}>
              <Text style={[e.td, { flex: 4 }]}>{motivo}</Text>
              <Text style={[e.td, e.dcha, { flex: 1 }]}>{n}</Text>
            </View>
          ))
        )}

        {/* ---- Previsión ---- */}
        <Text style={e.seccion}>PREVISIÓN DEL MES ENTRANTE</Text>
        {prevision === null ? (
          <Text style={e.nota}>Sin presupuestos vivos suficientes para estimar.</Text>
        ) : (
          <>
            <Text style={{ fontSize: 22, fontWeight: 700, color: AZUL }}>{euros(prevision)}</Text>
            <Text style={e.nota}>
              Suma de los presupuestos vivos de cada caso abierto, multiplicados por la probabilidad
              de cierre de su etapa. Es una estimación con las probabilidades configuradas, no una
              promesa: mientras no haya histórico propio suficiente, esos porcentajes son una
              hipótesis.
            </Text>
          </>
        )}

        <Text style={e.seccion}>ÁREA CLÍNICA</Text>
        <Text style={e.td}>{informe.pacientesAlta} paciente(s) dados de alta este mes.</Text>

        <Text style={[e.nota, { marginTop: 26 }]}>
          Documento interno del Grupo Vidaitu. No contiene datos identificativos de ninguna persona
          atendida: solo recuentos agregados.
        </Text>

        <Pie generado={generado} />
      </Page>
    </Document>
  );
}

/** El PDF como bytes, listo para guardar o adjuntar. */
export async function generarPdfInforme(
  informe: InformeMensual,
  prevision: number | null,
  generado: string,
): Promise<Buffer> {
  return renderToBuffer(
    <DocumentoInforme informe={informe} prevision={prevision} generado={generado} />,
  );
}
