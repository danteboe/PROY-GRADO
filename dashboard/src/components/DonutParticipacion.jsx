import ChartCard from './ChartCard.jsx'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { fmtInt, fmtPct } from '../data.js'

// Donut: participantes vs. no participantes en la selección actual.
export default function DonutParticipacion({ title, subtitle, totals, grupos }) {
  const data = [
    { name: grupos[0], value: totals.part, color: '#9333ea' },
    { name: grupos[1], value: totals.n - totals.part, color: '#cbd5e1' },
  ].filter((grupo) => grupo.value > 0)
  const renderTip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null
    const d = payload[0]
    const pct = totals.n ? (100 * d.value) / totals.n : 0
    return (
      <div className="custom-tooltip">
        <div className="tt-title">{d.name}</div>
        <div className="tt-row"><span className="tt-k">Estudiantes</span><span>{fmtInt(d.value)}</span></div>
        <div className="tt-row"><span className="tt-k">Porcentaje</span><span>{fmtPct(pct)}</span></div>
      </div>
    )
  }
  return (
    <ChartCard>
      <h3>{title}</h3>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      {totals.n ? (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95}
                 paddingAngle={data.length > 1 ? 2 : 0} isAnimationActive={false}
                 label={(e) => fmtPct((100 * e.value) / totals.n, 1)}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
            <Tooltip content={renderTip} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      ) : <p className="card-sub">Sin estudiantes para los filtros seleccionados.</p>}
      {totals.n > 0 && (
        <div className="donut-center-note">
          {fmtInt(totals.part)} de {fmtInt(totals.n)} estudiantes · tasa {fmtPct(totals.tasa)}
        </div>
      )}
    </ChartCard>
  )
}
