import {
  ComposedChart, Scatter, ErrorBar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'

// Forest-plot de razones de probabilidad (odds ratios) del modelo logístico:
// cada punto es el OR de un predictor y la barra de error representa su IC 95%
// (asimétrico sobre la escala de OR). La línea de referencia en OR=1 separa
// aumento (>1) de reducción (<1) de la probabilidad de participar. SOLO lee
// valores precalculados de comparativo.logistica; maneja los modos no_disponible
// y predictores vacíos con un aviso.

function fmt2(x) {
  return x == null ? '—' : x.toFixed(2).replace('.', ',')
}

function Tip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{d.label}</div>
      <div className="tt-row"><span className="tt-k">Odds ratio</span><span>{fmt2(d.odds_ratio)}</span></div>
      <div className="tt-row"><span className="tt-k">IC 95%</span><span>[{fmt2(d.ic95_low)}; {fmt2(d.ic95_high)}]</span></div>
    </div>
  )
}

export default function LogisticOddsRatios({ data }) {
  const meta = data && data.meta_modelo
  const predictores = (data && data.predictores) || []
  const noDisponible = !data || meta?.modo === 'no_disponible' || !predictores.length

  if (noDisponible) {
    return (
      <div className="card wide">
        <h3>Modelo logístico multivariado</h3>
        <p className="card-sub">Modelo logístico no disponible.</p>
      </div>
    )
  }

  // Preparar filas para el forest-plot: posición Y categórica (etiqueta), punto en
  // odds_ratio y barra de error asimétrica [bajo, alto] sobre la escala de OR.
  const rows = predictores.map((p) => ({
    label: p.label,
    odds_ratio: p.odds_ratio,
    ic95_low: p.ic95_low,
    ic95_high: p.ic95_high,
    // ErrorBar espera [distancia hacia abajo, distancia hacia arriba].
    err: [p.odds_ratio - p.ic95_low, p.ic95_high - p.odds_ratio],
  }))

  const alto = Math.max(240, rows.length * 42 + 80)
  // Dominio horizontal: cubrir todos los IC más un pequeño margen, incluyendo 1.
  const vals = rows.flatMap((r) => [r.ic95_low, r.ic95_high]).concat([1])
  const vmin = Math.min(...vals)
  const vmax = Math.max(...vals)
  const margen = (vmax - vmin) * 0.1 || 0.2

  return (
    <div className="card wide">
      <h3>Modelo logístico: razones de probabilidad (odds ratios)</h3>
      <p className="card-sub">
        OR de cada predictor estandarizado con su IC 95% (bootstrap). Un OR &gt; 1 se
        asocia con mayor probabilidad de participar; &lt; 1, con menor. La línea
        vertical marca OR = 1 (sin asociación).
      </p>
      <ResponsiveContainer width="100%" height={alto}>
        <ComposedChart
          layout="vertical" data={rows}
          margin={{ left: 20, right: 24, top: 8, bottom: 8 }}
          aria-label="Forest-plot de razones de probabilidad del modelo logístico con intervalos de confianza del 95%"
        >
          <CartesianGrid stroke="#eef2f7" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} domain={[vmin - margen, vmax + margen]}
                 tickFormatter={fmt2} height={48}
                 label={{ value: 'Razón de probabilidad (OR) — escala; 1 = sin asociación',
                          position: 'insideBottom', offset: -2,
                          style: { fontSize: 11, fill: '#475569', textAnchor: 'middle' } }} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }}
                 width={200} interval={0}
                 label={{ value: 'Predictor (estandarizado)', angle: -90,
                          position: 'insideLeft', offset: 10,
                          style: { fontSize: 11, fill: '#475569', textAnchor: 'middle' } }} />
          <Tooltip content={<Tip />} />
          <ReferenceLine x={1} stroke="#d97706" strokeDasharray="4 3"
            label={{ value: 'OR = 1', position: 'insideTopRight',
                     fontSize: 9, fill: '#d97706' }} />
          <Scatter dataKey="odds_ratio" fill="#1d4ed8" isAnimationActive={false}>
            <ErrorBar dataKey="err" direction="x" width={5} strokeWidth={1.6}
                      stroke="#1d4ed8" />
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
      <p className="chart-note">
        OR aproximados; IC por bootstrap; asociación, no causa.
      </p>
    </div>
  )
}
