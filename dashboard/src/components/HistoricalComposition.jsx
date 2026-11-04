import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { fmtInt, fmtPct } from '../data.js'

const COLORS = ['#1d4ed8', '#0f766e', '#d97706', '#9333ea', '#dc2626', '#64748b']

// Tooltip del apilado 100%: muestra el porcentaje (composición) y el conteo de
// participantes por categoría en el año. NUNCA habla de "tasa".
function Tip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const total = payload.reduce((a, p) => a + (p.payload?.[`${p.dataKey}__n`] || 0), 0)
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{label} · {fmtInt(total)} participantes</div>
      {payload.slice().reverse().map((p) => (
        p.value ? (
          <div className="tt-row" key={p.dataKey}>
            <span className="tt-k" style={{ color: p.color }}>■ {p.dataKey}</span>
            <span>{fmtPct(p.value, 1)} · {fmtInt(p.payload?.[`${p.dataKey}__n`] || 0)}</span>
          </div>
        ) : null
      ))}
    </div>
  )
}

// Área apilada al 100% de una dimensión categórica por año: COMPOSICIÓN de los
// participantes de cada año (no es tasa de participación: los no participantes
// no tienen año asignado).
//
// Props:
//   title, subtitle, note : textos de la tarjeta (framing composición, no tasa).
//   data       : filas año×categoría ya pivoteadas (0 en categorías ausentes),
//                con claves `${categoria}` (pct) y `${categoria}__n` (conteo).
//   categories : series a apilar, en orden de leyenda.
//   toggle     : nodo React opcional (botón) que se renderiza en la card-head.
export default function HistoricalComposition({ title, subtitle, data, categories, note, toggle }) {
  return (
    <div className="card wide">
      {toggle ? (
        <div className="card-head">
          <h3>{title}</h3>
          {toggle}
        </div>
      ) : (
        <h3>{title}</h3>
      )}
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart
          data={data} stackOffset="expand"
          margin={{ left: 4, right: 16, top: 8, bottom: 4 }}
          aria-label={`Composición de los participantes por categoría y año: ${title}. Áreas apiladas al 100% por año.`}
        >
          <CartesianGrid stroke="#eef2f7" />
          <XAxis dataKey="anio" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={[0, 1]}
                 tickFormatter={(v) => `${Math.round(v * 100)}%`}
                 label={{ value: 'Composición (%)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }} />
          <Tooltip content={<Tip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {categories.map((c, i) => (
            <Area key={c} type="linear" dataKey={c} stackId="1"
                  stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.78} strokeWidth={1} isAnimationActive={false}
                  dot={false} activeDot={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      {note && <p className="footnote">{note}</p>}
    </div>
  )
}
