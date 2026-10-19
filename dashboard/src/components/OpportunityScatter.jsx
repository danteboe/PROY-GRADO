import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell, LabelList,
} from 'recharts'
import { fmtInt, fmtPct } from '../data.js'

// Matriz de oportunidad: ¿dónde conviene invertir para crecer?
//   eje X = número de estudiantes (tamaño del público potencial)
//   eje Y = tasa de participación (%)
//   tamaño de burbuja = estudiantes que NO participan (oportunidad absoluta)
// Cuadrante "abajo-derecha" (muchos estudiantes, baja tasa) = mayor potencial.
function Tip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{d.facultad}</div>
      <div className="tt-row"><span className="tt-k">Estudiantes</span><span>{fmtInt(d.n)}</span></div>
      <div className="tt-row"><span className="tt-k">Participan</span><span>{fmtInt(d.part)}</span></div>
      <div className="tt-row"><span className="tt-k">No participan</span><span>{fmtInt(d.noPart)}</span></div>
      <div className="tt-row"><span className="tt-k">Tasa</span><span>{fmtPct(d.tasa)}</span></div>
    </div>
  )
}

const PALETTE = [
  '#1d4ed8', '#0f766e', '#d97706', '#9333ea', '#dc2626', '#0891b2',
  '#65a30d', '#db2777', '#4f46e5', '#ca8a04', '#059669', '#e11d48',
]

export default function OpportunityScatter({ title, subtitle, data, avgRate }) {
  const maxN = Math.max(...data.map((d) => d.n), 1)
  return (
    <div className="card wide">
      <h3>{title}</h3>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ left: 10, right: 30, top: 10, bottom: 30 }}>
          <CartesianGrid stroke="#eef2f7" />
          <XAxis type="number" dataKey="n" name="Estudiantes"
                 tick={{ fontSize: 11 }} tickFormatter={fmtInt}
                 label={{ value: 'Estudiantes (tamaño del público)', position: 'bottom', fontSize: 11, fill: '#64748b' }} />
          <YAxis type="number" dataKey="tasa" name="Tasa"
                 tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`}
                 label={{ value: 'Tasa %', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }} />
          <ZAxis type="number" dataKey="noPart" range={[80, 1200]} name="No participan" />
          {avgRate != null && (
            <ReferenceLine y={avgRate} stroke="#94a3b8" strokeDasharray="4 4"
                           label={{ value: `media ${fmtPct(avgRate, 1)}`, fontSize: 10, fill: '#64748b', position: 'right' }} />
          )}
          <Tooltip content={<Tip />} cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.72} />)}
            <LabelList dataKey="facultad" position="top"
                       style={{ fontSize: 9, fill: '#475569' }}
                       formatter={(v) => (v && v.length > 16 ? v.slice(0, 15) + '…' : v)} />
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <p className="chart-note">
        Burbujas grandes y bajas (muchos estudiantes, poca participación) señalan el
        mayor potencial de crecimiento. El tamaño representa el número de estudiantes
        que aún no participan.
      </p>
    </div>
  )
}
