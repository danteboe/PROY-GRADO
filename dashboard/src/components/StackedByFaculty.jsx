import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { fmtInt, fmtPct } from '../data.js'

const COLORS = ['#1d4ed8', '#0f766e', '#d97706', '#9333ea', '#dc2626', '#64748b']

// Composición de modalidades por facultad (barras apiladas al 100%).
// Responde: ¿qué facultades prefieren qué tipo de movilidad?
function Tip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{label}</div>
      {payload.slice().reverse().map((p) => (
        p.value ? (
          <div className="tt-row" key={p.dataKey}>
            <span className="tt-k" style={{ color: p.color }}>■ {p.dataKey}</span>
            <span>{fmtPct(p.value, 0)}</span>
          </div>
        ) : null
      ))}
    </div>
  )
}

export default function StackedByFaculty({ title, subtitle, data, modalities }) {
  return (
    <div className="card wide">
      <h3>{title}</h3>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={Math.max(260, data.length * 34)}>
        <BarChart data={data} layout="vertical" stackOffset="expand"
                  margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#eef2f7" />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
          <YAxis type="category" dataKey="facultad" width={150} tick={{ fontSize: 10 }} interval={0} />
          <Tooltip content={<Tip />} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {modalities.map((m, i) => (
            <Bar key={m} dataKey={m} stackId="1" fill={COLORS[i % COLORS.length]}
                 isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
