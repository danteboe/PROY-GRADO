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

// Rango FÍSICO válido de cada variable, para acotar el eje y evitar que el margen
// del dominio sugiera valores imposibles (p. ej. un boxplot de ICFES por área
// nunca debe mostrar más de 100). Los componentes del ICFES (mate/lectura/inglés)
// van de 0 a 100; el puntaje total histórico, de 0 a 500. Las que no están aquí
// usan el dominio automático calculado a partir de los bigotes.
const RANGO_VALIDO = {
  ICFES_MATEMATICAS: [0, 100],
  ICFES_LECTURA_CRITICA: [0, 100],
  ICFES_INGLES: [0, 100],
  ICFES_PUNTAJE_TOTAL: [0, 500],
  PGA_ULTIMO: [0, 5],
  PGA_PROMEDIO_HIST: [0, 5],
  PCT_CREDITOS_APROBADOS: [0, 100],
  PCT_AVANCE_CREDITOS: [0, 100],
  PERCENTIL_PGA_PROGRAMA: [0, 100],
  PERCENTIL_PGA_NIVEL: [0, 100],
}

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

// Dibuja las cajas y bigotes usando la escala Y de Recharts para los valores y
// repartiendo las columnas de grupo manualmente dentro del área de trazado.
// Recibe las props que Recharts inyecta a <Customized> (yAxisMap + offset, que
// describe el rectángulo del área de trazado: left/top/width/height). No usamos
// la escala X de Recharts: en un ComposedChart sin series cartesianas visibles
// no siempre expone un band scale con bandwidth(), lo que descolocaba las cajas.
function Cajas({ yAxisMap, offset, cajas }) {
  const yAxis = yAxisMap[Object.keys(yAxisMap)[0]]
  const yScale = yAxis.scale
  // Reparto uniforme de columnas dentro del área de trazado.
  const nCol = cajas.length || 1
  const banda = offset.width / nCol
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
            {/* Etiqueta del grupo, centrada bajo su propia caja. La dibujamos
                aquí (no con un XAxis de categorías) para que coincida exactamente
                con la posición de la caja y no se corte ni se vaya a los extremos. */}
            <text x={cx} y={offset.top + offset.height + 16} textAnchor="middle"
                  fontSize={11} fill={c.color} fontWeight={600}>
              {c.grupo}
            </text>
            <text x={cx} y={offset.top + offset.height + 29} textAnchor="middle"
                  fontSize={9} fill="#94a3b8">
              n={new Intl.NumberFormat('es-CO').format(c.n)}
            </text>
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

  // Dominio vertical con un pequeño margen por encima y por debajo de los bigotes,
  // pero RECORTADO al rango físico válido de la variable (si se conoce), para no
  // sugerir valores imposibles como un ICFES por área mayor a 100.
  const vals = cajas.flatMap((c) => [c.whisker_low, c.whisker_high])
  const rango = RANGO_VALIDO[variable.var]
  const datoMin = Math.min(...vals)
  const datoMax = Math.max(...vals)
  const margen = (datoMax - datoMin) * 0.08 || 1
  let vmin = datoMin - margen
  let vmax = datoMax + margen
  if (rango) {
    vmin = Math.max(rango[0], vmin)
    vmax = Math.min(rango[1], vmax)
  }

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
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={cajas} margin={{ left: 16, right: 16, top: 12, bottom: 44 }}
          aria-label={`Diagramas de caja de ${variable.label} para participantes frente a no participantes`}
        >
          <CartesianGrid stroke="#eef2f7" vertical={false} />
          {/* XAxis solo para establecer la banda de categorías; ocultamos sus
              marcas porque las etiquetas de grupo las dibujamos en <Cajas> para
              que queden centradas bajo cada boxplot. */}
          <XAxis dataKey="grupo" type="category" tick={false} axisLine={false}
                 tickLine={false} height={1} interval={0}
                 padding={{ left: 0, right: 0 }} />
          <YAxis type="number" tick={{ fontSize: 10 }}
                 domain={[vmin, vmax]} tickFormatter={fmt2}
                 label={{ value: variable.label, angle: -90, position: 'insideLeft',
                          style: { fontSize: 11, fill: '#475569', textAnchor: 'middle' } }} />
          <Tooltip content={<Tip />} cursor={{ fill: '#f1f5f9' }} />
          <Customized component={(props) => <Cajas {...props} cajas={cajas} />} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
