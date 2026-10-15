import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LabelList,
} from 'recharts'
import { fmtInt, fmtPct } from '../data.js'

// Distribución de una variable numérica: barras = n.º de estudiantes por valor,
// línea = tasa de participación (%). Doble eje. Las barras muestran su valor.
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

export default function NumericDist({ title, subtitle, data, barColor = '#2563eb' }) {
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
          <Bar yAxisId="l" dataKey="n" name="Estudiantes" fill={barColor}
               radius={[3, 3, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="n" position="top" formatter={fmtInt}
                       style={{ fontSize: 9, fill: '#334155' }} />
          </Bar>
          <Line yAxisId="r" dataKey="tasa" name="Tasa %" stroke="#d97706"
                strokeWidth={2.2} dot={{ r: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
