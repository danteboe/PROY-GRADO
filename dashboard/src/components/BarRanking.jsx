import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  LabelList,
} from 'recharts'
import ChartTooltip from './ChartTooltip.jsx'
import { fmtInt, fmtPct } from '../data.js'

// Gráfico de ranking horizontal con alternancia entre conteo (n), participantes
// (part) y tasa (%). Cada barra muestra SIEMPRE su valor como etiqueta (no solo
// en hover). En la esquina se muestra el TOTAL (suma de todas las barras).
export default function BarRanking({
  title, subtitle, data, topN = 12, defaultMetric = 'n',
  colorN = '#2563eb', colorT = '#0f766e', colorP = '#9333ea',
  onBarClick, selectedKeys, metrics = ['n', 'part', 'tasa'],
}) {
  const [metric, setMetric] = useState(defaultMetric)
  const [hover, setHover] = useState(null)

  const sorted = [...data].sort((a, b) => b[metric] - a[metric]).slice(0, topN)
  const color = metric === 'tasa' ? colorT : metric === 'part' ? colorP : colorN
  const isPct = metric === 'tasa'

  // Totales (sobre TODAS las categorías, no solo las top mostradas).
  const totN = data.reduce((a, d) => a + d.n, 0)
  const totPart = data.reduce((a, d) => a + d.part, 0)
  const totTasa = totN ? (100 * totPart) / totN : 0
  const totalTxt =
    metric === 'tasa' ? fmtPct(totTasa)
      : metric === 'part' ? fmtInt(totPart)
        : fmtInt(totN)

  const labelFmt = (v) => (isPct ? fmtPct(v, 1) : fmtInt(v))

  const METRIC_LABELS = { n: 'Estudiantes', part: 'Con internac.', tasa: 'Tasa %' }

  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <div className="metric-toggle">
          {metrics.map((m) => (
            <button key={m} className={`toggle-btn ${metric === m ? 'active' : ''}`}
                    onClick={() => setMetric(m)}>
              {METRIC_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="card-sub-row">
        {subtitle && <p className="card-sub">{subtitle}</p>}
        <span className="total-badge" title="Suma de todas las categorías">
          Total: <strong>{totalTxt}</strong>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(240, sorted.length * 30)}>
        <BarChart data={sorted} layout="vertical"
                  margin={{ left: 8, right: 54, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#eef2f7" />
          <XAxis type="number" tick={{ fontSize: 11 }}
                 tickFormatter={(v) => (isPct ? `${v}%` : fmtInt(v))} />
          <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11 }}
                 interval={0} />
          <Tooltip content={<ChartTooltip labelKey="label" />} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
          <Bar dataKey={metric} radius={[0, 4, 4, 0]} isAnimationActive={false}
               onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)}
               onClick={(d) => onBarClick && onBarClick(d.key)} cursor={onBarClick ? 'pointer' : 'default'}>
            {sorted.map((d, i) => {
              const isSel = selectedKeys && selectedKeys.has(d.key)
              const op = hover === null ? 1 : hover === i ? 1 : 0.55
              return <Cell key={i} fill={isSel ? '#f59e0b' : color} fillOpacity={op} />
            })}
            <LabelList dataKey={metric} position="right" formatter={labelFmt}
                       style={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
