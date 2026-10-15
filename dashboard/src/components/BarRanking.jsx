import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'
import ChartTooltip from './ChartTooltip.jsx'
import { fmtInt } from '../data.js'

// Gráfico de ranking horizontal con alternancia entre conteo (n) y tasa (%).
// Al pasar el mouse resalta la barra; clic opcional para filtrar (onBarClick).
export default function BarRanking({
  title, subtitle, data, topN = 12, defaultMetric = 'n',
  colorN = '#2563eb', colorT = '#0f766e', onBarClick, selectedKeys,
}) {
  const [metric, setMetric] = useState(defaultMetric)
  const [hover, setHover] = useState(null)

  const sorted = [...data].sort((a, b) => b[metric] - a[metric]).slice(0, topN)
  const color = metric === 'n' ? colorN : colorT

  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <div className="metric-toggle">
          <button className={`toggle-btn ${metric === 'n' ? 'active' : ''}`} onClick={() => setMetric('n')}>
            N.º
          </button>
          <button className={`toggle-btn ${metric === 'tasa' ? 'active' : ''}`} onClick={() => setMetric('tasa')}>
            Tasa %
          </button>
        </div>
      </div>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={Math.max(240, sorted.length * 26)}>
        <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#eef2f7" />
          <XAxis type="number" tick={{ fontSize: 11 }}
                 tickFormatter={(v) => (metric === 'tasa' ? `${v}%` : fmtInt(v))} />
          <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11 }}
                 interval={0} />
          <Tooltip content={<ChartTooltip labelKey="label" />} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
          <Bar dataKey={metric} radius={[0, 4, 4, 0]}
               onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)}
               onClick={(d) => onBarClick && onBarClick(d.key)} cursor={onBarClick ? 'pointer' : 'default'}>
            {sorted.map((d, i) => {
              const isSel = selectedKeys && selectedKeys.has(d.key)
              const op = hover === null ? 1 : hover === i ? 1 : 0.55
              return <Cell key={i} fill={isSel ? '#f59e0b' : color} fillOpacity={op} />
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
