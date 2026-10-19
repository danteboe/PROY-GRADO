import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { fmtInt } from '../data.js'

const COLORS = ['#1d4ed8', '#0f766e', '#d97706', '#9333ea', '#dc2626', '#64748b']

// Tooltip con el desglose por modalidad y el total del año.
function AreaTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const total = payload.reduce((a, p) => a + (p.value || 0), 0)
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{label} · {fmtInt(total)} eventos</div>
      {payload.slice().reverse().map((p) => (
        p.value ? (
          <div className="tt-row" key={p.dataKey}>
            <span className="tt-k" style={{ color: p.color }}>■ {p.dataKey}</span>
            <span>{fmtInt(p.value)}</span>
          </div>
        ) : null
      ))}
    </div>
  )
}

// Composición de eventos por modalidad a lo largo del tiempo (área apilada).
// `data` debe traer todas las modalidades presentes en cada año (0 si no hay),
// de lo contrario el apilado muestra huecos.
export default function ModalityArea({ title, subtitle, data, modalities }) {
  return (
    <div className="card wide">
      <h3>{title}</h3>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid stroke="#eef2f7" />
          <XAxis dataKey="anio" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtInt} />
          <Tooltip content={<AreaTip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {modalities.map((m, i) => (
            <Area key={m} type="linear" dataKey={m} stackId="1"
                  stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.78} strokeWidth={1} isAnimationActive={false}
                  connectNulls dot={false} activeDot={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
