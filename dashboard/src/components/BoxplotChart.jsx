import { useState } from 'react'
import { CartesianGrid, ComposedChart, Customized, ResponsiveContainer, Text, XAxis, YAxis } from 'recharts'
import { fmtInt, fmtPct } from '../data.js'

function fmt2(x) {
  return x == null ? '—' : x.toFixed(2).replace('.', ',')
}

function Cajas({ yAxisMap, offset, cajas, onHover }) {
  const yAxis = yAxisMap[Object.keys(yAxisMap)[0]]
  const yScale = yAxis.scale
  // Reparto uniforme de columnas dentro del área de trazado.
  const banda = offset.width / cajas.length
  const anchoCaja = Math.min(70, banda * 0.5)

  return (
    <g>
      {cajas.map((c, i) => {
        const cx = offset.left + banda * (i + 0.5)
        const x0 = cx - anchoCaja / 2
        const yQ1 = yScale(c.q1)
        const yQ3 = yScale(c.q3)
        const yMed = yScale(c.mediana)
        const yLow = yScale(c.whisker_low)
        const yHigh = yScale(c.whisker_high)
        return (
          <g key={c.grupo}
             onMouseMove={(e) => onHover(c, e)}
             onMouseLeave={() => onHover(null)}>
            {/* Bigote superior e inferior */}
            <line x1={cx} x2={cx} y1={yHigh} y2={yQ3} stroke={c.color} strokeWidth={1.5} />
            <line x1={cx} x2={cx} y1={yQ1} y2={yLow} stroke={c.color} strokeWidth={1.5} />
            {/* Topes de los bigotes */}
            <line x1={cx - anchoCaja / 4} x2={cx + anchoCaja / 4} y1={yHigh} y2={yHigh}
                  stroke={c.color} strokeWidth={1.5} />
            <line x1={cx - anchoCaja / 4} x2={cx + anchoCaja / 4} y1={yLow} y2={yLow}
                  stroke={c.color} strokeWidth={1.5} />
            {/* Caja q1-q3 */}
            <rect x={x0} y={yQ3} width={anchoCaja} height={Math.max(1, yQ1 - yQ3)}
                  fill={c.color} fillOpacity={0.18} stroke={c.color} strokeWidth={1.5} />
            {/* Mediana */}
            <line x1={x0} x2={x0 + anchoCaja} y1={yMed} y2={yMed}
                  stroke={c.color} strokeWidth={2.4} />
            {/* Rectángulo transparente sobre toda la columna para capturar el
                hover de forma fiable (incluido el espacio entre bigotes). */}
            <rect x={x0} y={Math.min(yHigh, yLow) - 5} width={anchoCaja}
                  height={Math.abs(yLow - yHigh) + 10}
                  fill="transparent" />
            <Text x={cx} y={offset.top + offset.height + 9} width={banda - 6}
                  textAnchor="middle" verticalAnchor="start" lineHeight="12px"
                  fontSize={11} fill={c.color} fontWeight={600}>
              {c.grupo}
            </Text>
            <text x={cx} y={offset.top + offset.height + 41} textAnchor="middle"
                  fontSize={9} fill="#64748b">
              n={fmtInt(c.n)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

// Tooltip propio (HTML) para una caja: muestra los cinco números y el n. Se
// posiciona con coordenadas relativas al contenedor del gráfico.
function CajaTooltip({ caja, x, y, flip }) {
  if (!caja) return null
  return (
    <div className="custom-tooltip boxplot-tip"
         style={{ left: x, top: y, transform: flip ? 'translateX(-100%)' : undefined }}>
      <div className="tt-title" style={{ color: caja.color }}>{caja.grupo}</div>
      <div className="tt-row"><span className="tt-k">Bigote sup.</span><span>{fmt2(caja.whisker_high)}</span></div>
      <div className="tt-row"><span className="tt-k">Q3</span><span>{fmt2(caja.q3)}</span></div>
      <div className="tt-row"><span className="tt-k">Mediana</span><span>{fmt2(caja.mediana)}</span></div>
      <div className="tt-row"><span className="tt-k">Q1</span><span>{fmt2(caja.q1)}</span></div>
      <div className="tt-row"><span className="tt-k">Bigote inf.</span><span>{fmt2(caja.whisker_low)}</span></div>
      <div className="tt-row"><span className="tt-k">n</span><span>{fmtInt(caja.n)}</span></div>
      {caja.cobertura_pct != null && (
        <div className="tt-row"><span className="tt-k">Cobertura</span><span>{fmtPct(caja.cobertura_pct, 1)}</span></div>
      )}
    </div>
  )
}

export default function BoxplotChart({ cajas, label, rango, descripcion }) {
  const [hover, setHover] = useState(null)
  const onHover = (caja, event) => {
    if (!caja) {
      setHover(null)
      return
    }
    const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect()
    const x = event.clientX - rect.left
    const flip = x > rect.width / 2
    setHover({ caja, x: x + (flip ? -10 : 10), y: event.clientY - rect.top + 10, flip })
  }

  if (!cajas.length) return <p className="card-sub">No hay datos suficientes para dibujar las cajas.</p>

  const valores = cajas.flatMap((caja) => [caja.whisker_low, caja.whisker_high])
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const margen = (max - min) * 0.08 || 1
  const dominio = [
    Math.max(rango?.[0] ?? -Infinity, min - margen),
    Math.min(rango?.[1] ?? Infinity, max + margen),
  ]

  return (
    <div className="boxplot-chart">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={cajas} margin={{ left: 16, right: 16, top: 12, bottom: 50 }}
                       aria-label={descripcion}>
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="grupo" tick={false} axisLine={false} tickLine={false} height={1} />
          <YAxis type="number" tick={{ fontSize: 10 }} domain={dominio} tickFormatter={fmt2}
                 label={{ value: label, angle: -90, position: 'insideLeft',
                          style: { fontSize: 11, fill: '#475569', textAnchor: 'middle' } }} />
          <Customized component={<Cajas cajas={cajas} onHover={onHover} />} />
        </ComposedChart>
      </ResponsiveContainer>
      {hover && <CajaTooltip {...hover} />}
    </div>
  )
}
