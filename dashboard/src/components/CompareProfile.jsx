import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  LabelList,
} from 'recharts'
import { fmtPct, fmtInt } from '../data.js'

// Comparación del PERFIL de participantes vs no participantes sobre una dimensión.
// Para cada categoría muestra qué % de cada grupo cae en ella (barras agrupadas),
// de modo que se vea en qué se diferencian los dos grupos.
function CompareTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{label}</div>
      {payload.map((p) => (
        <div className="tt-row" key={p.dataKey}>
          <span className="tt-k">{p.name}</span><span>{fmtPct(p.value, 1)}</span>
        </div>
      ))}
    </div>
  )
}

export default function CompareProfile({ title, subtitle, rows }) {
  // rows: [{ label, pctPart, pctNo }]  (porcentajes dentro de cada grupo)
  return (
    <div className="card">
      <h3>{title}</h3>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={Math.max(240, rows.length * 42)}>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 46, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#eef2f7" />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} interval={0} />
          <Tooltip content={<CompareTip />} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="pctPart" name="Con internac." fill="#9333ea" radius={[0, 3, 3, 0]} isAnimationActive={false}>
            <LabelList dataKey="pctPart" position="right" formatter={(v) => fmtPct(v, 0)}
                       style={{ fontSize: 10, fill: '#6b21a8' }} />
          </Bar>
          <Bar dataKey="pctNo" name="Sin internac." fill="#94a3b8" radius={[0, 3, 3, 0]} isAnimationActive={false}>
            <LabelList dataKey="pctNo" position="right" formatter={(v) => fmtPct(v, 0)}
                       style={{ fontSize: 10, fill: '#475569' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
