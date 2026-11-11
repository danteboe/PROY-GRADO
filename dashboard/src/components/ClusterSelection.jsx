import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell, Scatter, ComposedChart,
} from 'recharts'

// Curvas de selección del número de grupos (k) del K-means: inercia (método del
// codo) y silueta, ambas leídas de clustering.curvas. El k elegido
// (meta.k_elegido) se resalta con una línea de referencia vertical. SOLO lee
// valores precalculados en Python (src/clustering_participantes.py); no recalcula
// nada en el cliente.
//
// IMPORTANTE: NO usa ChartTooltip.jsx (solo renderiza n/part/tasa/eventos, campos
// ausentes aquí -> tooltip vacío). Usa un Tip local a medida (patrón del Tip de
// CohenDChart.jsx) con formato español (coma decimal).

const COLOR_INERCIA = '#0f766e'
const COLOR_SILUETA = '#b45309'
const COLOR_K = '#7c3aed'

// Formatea un número con coma decimal española y los decimales indicados.
function fmt(x, dec = 2) {
  return x == null ? '—' : Number(x).toFixed(dec).replace('.', ',')
}

// Tip a medida para la curva de inercia (método del codo).
function TipInercia({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="custom-tooltip">
      <div className="tt-title">k = {d.k}</div>
      <div className="tt-row"><span className="tt-k">Inercia (WCSS)</span><span>{fmt(d.inercia, 0)}</span></div>
      <div className="tt-row"><span className="tt-k">% del grupo menor</span><span>{fmt(d.min_cluster_pct, 1)}%</span></div>
    </div>
  )
}

// Tip a medida para la curva de silueta.
function TipSilueta({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="custom-tooltip">
      <div className="tt-title">k = {d.k}</div>
      <div className="tt-row"><span className="tt-k">Silueta media</span><span>{fmt(d.silueta, 3)}</span></div>
      <div className="tt-row"><span className="tt-k">% del grupo menor</span><span>{fmt(d.min_cluster_pct, 1)}%</span></div>
    </div>
  )
}

export default function ClusterSelection({ curvas, meta }) {
  if (!curvas || !curvas.length) {
    return (
      <div className="card wide">
        <h3>Selección del número de grupos (k)</h3>
        <p className="card-sub">Sin curvas de selección disponibles.</p>
      </div>
    )
  }

  const kElegido = meta?.k_elegido ?? null
  // Puntos destacados (k elegido) para cada curva, dibujados como Scatter encima
  // de la línea para que se vean resaltados.
  const puntoInercia = curvas.filter((c) => c.k === kElegido).map((c) => ({ k: c.k, inercia: c.inercia }))
  const puntoSilueta = curvas.filter((c) => c.k === kElegido).map((c) => ({ k: c.k, silueta: c.silueta }))

  return (
    <div className="card wide">
      <h3>Selección del número de grupos (k)</h3>
      <p className="card-sub">
        Método del codo (inercia o suma de distancias intra-grupo) y silueta media por
        número de grupos. Se eligió <strong>k = {kElegido ?? '—'}</strong>
        {meta?.criterio_k ? ` (${meta.criterio_k}).` : '.'} La línea morada marca el k elegido.
      </p>
      <div className="grid">
        <div>
          <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#475569' }}>Inercia vs. k (codo)</h4>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={curvas} margin={{ left: 8, right: 16, top: 8, bottom: 24 }}
              aria-label="Curva de inercia (método del codo) frente al número de grupos k, con el k elegido resaltado"
            >
              <CartesianGrid stroke="#eef2f7" />
              <XAxis dataKey="k" type="number" domain={[2, 10]}
                     ticks={[2, 3, 4, 5, 6, 7, 8, 9, 10]}
                     allowDecimals={false} tick={{ fontSize: 10 }}
                     label={{ value: 'Número de grupos (k)', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(v, 0)}
                     width={56} domain={['auto', 'auto']}
                     label={{ value: 'Inercia', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }} />
              <Tooltip content={<TipInercia />} />
              {kElegido != null && (
                <ReferenceLine x={kElegido} stroke={COLOR_K} strokeDasharray="4 3"
                  label={{ value: `k=${kElegido}`, position: 'top', fontSize: 10, fill: COLOR_K }} />
              )}
              <Line type="monotone" dataKey="inercia" name="Inercia" stroke={COLOR_INERCIA}
                    strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Scatter dataKey="inercia" data={puntoInercia} isAnimationActive={false}>
                {puntoInercia.map((_, i) => <Cell key={i} fill={COLOR_K} />)}
              </Scatter>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#475569' }}>Silueta vs. k</h4>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={curvas} margin={{ left: 8, right: 16, top: 8, bottom: 24 }}
              aria-label="Curva de silueta media frente al número de grupos k, con el k elegido resaltado"
            >
              <CartesianGrid stroke="#eef2f7" />
              <XAxis dataKey="k" type="number" domain={[2, 10]}
                     ticks={[2, 3, 4, 5, 6, 7, 8, 9, 10]}
                     allowDecimals={false} tick={{ fontSize: 10 }}
                     label={{ value: 'Número de grupos (k)', position: 'insideBottom', offset: -12, fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(v, 2)}
                     width={56} domain={['auto', 'auto']}
                     label={{ value: 'Silueta', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }} />
              <Tooltip content={<TipSilueta />} />
              {kElegido != null && (
                <ReferenceLine x={kElegido} stroke={COLOR_K} strokeDasharray="4 3"
                  label={{ value: `k=${kElegido}`, position: 'top', fontSize: 10, fill: COLOR_K }} />
              )}
              <Line type="monotone" dataKey="silueta" name="Silueta" stroke={COLOR_SILUETA}
                    strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Scatter dataKey="silueta" data={puntoSilueta} isAnimationActive={false}>
                {puntoSilueta.map((_, i) => <Cell key={i} fill={COLOR_K} />)}
              </Scatter>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
      {meta?.silueta_nota && (
        <p className="chart-note">{meta.silueta_nota}</p>
      )}
    </div>
  )
}
