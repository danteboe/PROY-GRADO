import { useMemo, useState } from 'react'
import {
  ComposedChart, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Customized,
} from 'recharts'

// Boxplots comparativos participantes vs. no participantes para una variable
// numérica. Las cajas (q1-q3), la mediana y los bigotes de Tukey se dibujan a
// partir de los CINCO números precalculados por grupo (whisker_low, q1, mediana,
// q3, whisker_high) que vienen en comparativo.numericas. NO se recomputan
// cuantiles ni se añade ninguna librería: el diagrama se pinta a mano con
// <Customized> usando las escalas que Recharts expone en xAxisMap/yAxisMap.

const COLOR_PART = '#2563eb' // participantes
const COLOR_NO = '#64748b'   // no participantes

function fmt2(x) {
  return x == null ? '—' : x.toFixed(2).replace('.', ',')
}

// Construye las dos "cajas" (participa / no participa) de la variable seleccionada.
function cajasDe(d) {
  if (!d) return []
  const cajas = []
  if (d.q1_part != null) {
    cajas.push({
      grupo: 'Participantes', color: COLOR_PART,
      whisker_low: d.whisker_low_part, q1: d.q1_part, mediana: d.mediana_part,
      q3: d.q3_part, whisker_high: d.whisker_high_part, n: d.n_part,
    })
  }
  if (d.q1_no != null) {
    cajas.push({
      grupo: 'No participantes', color: COLOR_NO,
      whisker_low: d.whisker_low_no, q1: d.q1_no, mediana: d.mediana_no,
      q3: d.q3_no, whisker_high: d.whisker_high_no, n: d.n_no,
    })
  }
  return cajas
}

// Dibuja las cajas y bigotes usando las escalas de Recharts. Recibe las props que
// Recharts inyecta a un componente <Customized> (xAxisMap/yAxisMap/offset).
function Cajas({ xAxisMap, yAxisMap, offset, cajas }) {
  const xAxis = xAxisMap[Object.keys(xAxisMap)[0]]
  const yAxis = yAxisMap[Object.keys(yAxisMap)[0]]
  const xScale = xAxis.scale
  const yScale = yAxis.scale
  const banda = xScale.bandwidth ? xScale.bandwidth() : 60
  const anchoCaja = Math.min(70, banda * 0.5)

  return (
    <g>
      {cajas.map((c, i) => {
        const cx = xScale(c.grupo) + banda / 2
        const x0 = cx - anchoCaja / 2
        const yQ1 = yScale(c.q1)
        const yQ3 = yScale(c.q3)
        const yMed = yScale(c.mediana)
        const yLow = yScale(c.whisker_low)
        const yHigh = yScale(c.whisker_high)
        return (
          <g key={i}>
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
          </g>
        )
      })}
    </g>
  )
}

function Tip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  const c = payload[0].payload
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{label}</div>
      <div className="tt-row"><span className="tt-k">Bigote sup.</span><span>{fmt2(c.whisker_high)}</span></div>
      <div className="tt-row"><span className="tt-k">Q3</span><span>{fmt2(c.q3)}</span></div>
      <div className="tt-row"><span className="tt-k">Mediana</span><span>{fmt2(c.mediana)}</span></div>
      <div className="tt-row"><span className="tt-k">Q1</span><span>{fmt2(c.q1)}</span></div>
      <div className="tt-row"><span className="tt-k">Bigote inf.</span><span>{fmt2(c.whisker_low)}</span></div>
    </div>
  )
}

export default function ComparativeBoxplots({ data, initialVar }) {
  const numericas = useMemo(
    () => (data || []).filter((d) => d.q1_part != null || d.q1_no != null),
    [data],
  )
  const [sel, setSel] = useState(
    initialVar || (numericas[0] && numericas[0].var) || '',
  )

  if (!numericas.length) {
    return (
      <div className="card">
        <h3>Distribución comparada (boxplots)</h3>
        <p className="card-sub">Sin datos comparativos.</p>
      </div>
    )
  }

  const variable = numericas.find((d) => d.var === sel) || numericas[0]
  const cajas = cajasDe(variable)

  // Dominio vertical con un pequeño margen por encima y por debajo de los bigotes.
  const vals = cajas.flatMap((c) => [c.whisker_low, c.whisker_high])
  const vmin = Math.min(...vals)
  const vmax = Math.max(...vals)
  const margen = (vmax - vmin) * 0.08 || 1

  return (
    <div className="card wide">
      <div className="card-head">
        <h3>Distribución comparada por grupo (boxplots)</h3>
        <label className="metric-toggle" style={{ marginLeft: 'auto' }}>
          <select
            className="range-num" style={{ width: 'auto', textAlign: 'left' }}
            value={variable.var} onChange={(e) => setSel(e.target.value)}
            aria-label="Seleccionar variable numérica para el boxplot"
          >
            {numericas.map((d) => (
              <option key={d.var} value={d.var}>{d.label}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="card-sub">
        Cajas de cuartiles (Q1-Q3), mediana y bigotes de Tukey para {variable.label}.
        Azul: participantes; gris: no participantes.
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={cajas} margin={{ left: 8, right: 16, top: 12, bottom: 8 }}
          aria-label={`Diagramas de caja de ${variable.label} para participantes frente a no participantes`}
        >
          <CartesianGrid stroke="#eef2f7" />
          <XAxis dataKey="grupo" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 10 }} domain={[vmin - margen, vmax + margen]}
                 tickFormatter={fmt2} />
          <Tooltip content={<Tip />} cursor={{ fill: '#f1f5f9' }} />
          <Customized component={(props) => <Cajas {...props} cajas={cajas} />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
