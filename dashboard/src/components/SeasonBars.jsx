import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { fmtInt } from '../data.js'

// Estacionalidad: eventos por año separando primer y segundo semestre.
// Responde: ¿hay un semestre preferido para salir de movilidad?
function Tip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const total = payload.reduce((a, p) => a + (p.value || 0), 0)
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{label} · {fmtInt(total)} eventos</div>
      {payload.map((p) => (
        <div className="tt-row" key={p.dataKey}>
          <span className="tt-k" style={{ color: p.color }}>■ {p.name}</span>
          <span>{fmtInt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function SeasonBars({ title, subtitle, data }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={270}>
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid stroke="#eef2f7" />
          <XAxis dataKey="anio" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtInt} />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Primer semestre" fill="#1d4ed8" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="Segundo semestre" fill="#d97706" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
