import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LabelList, ReferenceLine,
} from 'recharts'
import { fmtInt, fmtPct } from '../data.js'

// Color de la línea de tasa: fijo y contrastante con TODAS las paletas de barras
// usadas (#2563eb, #0f766e, #9333ea, #d97706). Se eligió #dc2626 (rojo) para que
// no se confunda con la barra ámbar de la distribución de edad (barColor #d97706).
const TASA_COLOR = '#dc2626'
const BASELINE_COLOR = '#475569'

// Distribución de una variable numérica: barras = n.º de estudiantes por valor,
// línea = tasa de participación (%). Doble eje. Las barras muestran su valor. Una
// línea punteada horizontal en el eje derecho marca la tasa baseline (promedio de
// la selección), como referencia visual para comparar cada valor contra la media.
function Tip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{d.label}</div>
      <div className="tt-row"><span className="tt-k">Estudiantes</span><span>{fmtInt(d.n)}</span></div>
      <div className="tt-row"><span className="tt-k">Con internac.</span><span>{fmtInt(d.part)}</span></div>
      <div className="tt-row"><span className="tt-k">Tasa</span><span>{fmtPct(d.tasa)}</span></div>
    </div>
  )
}

export default function NumericDist({ title, subtitle, data, barColor = '#2563eb', baseline }) {
  // Si no se recibe baseline por prop, se calcula como la tasa promedio de la
  // selección: 100 * sum(part) / sum(n) sobre los valores mostrados.
  let base = baseline
  if (base == null && data && data.length) {
    let n = 0, part = 0
    for (const d of data) { n += d.n; part += d.part }
    base = n ? (100 * part) / n : null
  }
  return (
    <div className="card">
      <h3>{title}</h3>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={270}>
        <ComposedChart data={data} margin={{ left: 4, right: 8, top: 14, bottom: 4 }}>
          <CartesianGrid stroke="#eef2f7" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-25}
                 textAnchor="end" height={48} />
          <YAxis yAxisId="l" tick={{ fontSize: 10 }} tickFormatter={fmtInt} />
          <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }}
                 tickFormatter={(v) => `${v}%`} />
          <Tooltip content={<Tip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {base != null && (
            <ReferenceLine yAxisId="r" y={base} stroke={BASELINE_COLOR}
              strokeDasharray="5 4" ifOverflow="extendDomain"
              label={{ value: `base ${fmtPct(base, 1)}`, position: 'insideBottomRight',
                       fontSize: 9, fill: BASELINE_COLOR }} />
          )}
          <Bar yAxisId="l" dataKey="n" name="Estudiantes" fill={barColor}
               radius={[3, 3, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="n" position="top" formatter={fmtInt}
                       style={{ fontSize: 9, fill: '#334155' }} />
          </Bar>
          <Line yAxisId="r" dataKey="tasa" name="Tasa %" stroke={TASA_COLOR}
                strokeWidth={2.2} dot={{ r: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
