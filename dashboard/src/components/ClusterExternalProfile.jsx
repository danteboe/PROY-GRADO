import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Cell,
} from 'recharts'
import { fmtInt } from '../data.js'

// Perfilado de los grupos con variables EXTERNAS (no usadas para agrupar):
//  (a) barras apiladas al 100% por grupo de una dimensión categórica elegible
//      (GENERO/FACULTAD/MODALIDAD_PRINCIPAL/TIPO_ADMISION/NIVEL), excluyendo
//      'Sin dato' de la base del porcentaje;
//  (b) barras de medias (ICFES/estrato/opciones/eventos) por grupo, con ejes
//      derivados de meta.escalas_perfil (mín/máx observados, NUNCA 0–100 fijo) y
//      nota de cobertura interpolada de cobertura_pct.
// SOLO lee valores precalculados en Python; no recalcula nada.

const COLORS = ['#1d4ed8', '#0f766e', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#65a30d', '#be123c', '#64748b']
const CLUSTER_COLORS = ['#1d4ed8', '#b45309', '#0f766e', '#9333ea', '#dc2626', '#0891b2']

// Dimensiones categóricas elegibles para las barras apiladas.
const DIMS = [
  { var: 'GENERO', label: 'Género' },
  { var: 'FACULTAD', label: 'Facultad' },
  { var: 'MODALIDAD_PRINCIPAL', label: 'Modalidad principal' },
  { var: 'TIPO_ADMISION', label: 'Tipo de admisión' },
  { var: 'NIVEL', label: 'Nivel' },
]

function fmtNum(x, dec = 2) {
  return x == null ? '—' : Number(x).toFixed(dec).replace('.', ',')
}

// Tooltip a medida para las barras apiladas categóricas (muestra % por categoría).
function TipCat({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{label}</div>
      {payload.slice().reverse().map((p) => (
        p.value ? (
          <div className="tt-row" key={p.dataKey}>
            <span className="tt-k" style={{ color: p.color }}>■ {p.dataKey}</span>
            <span>{fmtNum(p.value, 1)}%</span>
          </div>
        ) : null
      ))}
    </div>
  )
}

export default function ClusterExternalProfile({ clusters, meta }) {
  const [dimVar, setDimVar] = useState('GENERO')
  const [metricaVar, setMetricaVar] = useState(null)

  const escalas = meta?.escalas_perfil || {}

  // --- (a) Barras apiladas 100% por grupo para la dimensión elegida. --------
  // Reconstruye, por grupo, la distribución % de la dimensión seleccionada,
  // excluyendo 'Sin dato' de la base del porcentaje (renormalizando al resto).
  const { catData, categorias } = useMemo(() => {
    if (!clusters?.length) return { catData: [], categorias: [] }
    const catSet = new Set()
    const filas = []
    for (const cl of clusters) {
      const dim = (cl.perfil_categorico || []).find((p) => p.var === dimVar)
      const dist = (dim?.distribucion || []).filter((c) => c.categoria !== 'Sin dato')
      const base = dist.reduce((s, c) => s + c.n, 0)
      const fila = { grupo: cl.etiqueta }
      for (const c of dist) {
        fila[c.categoria] = base ? (100 * c.n) / base : 0
        catSet.add(c.categoria)
      }
      filas.push(fila)
    }
    return { catData: filas, categorias: Array.from(catSet) }
  }, [clusters, dimVar])

  // --- (b) Barras de medias por grupo para una métrica numérica externa. -----
  // Las métricas disponibles salen del perfil_numerico del primer grupo.
  const metricas = useMemo(() => {
    if (!clusters?.length) return []
    return (clusters[0].perfil_numerico || []).map((p) => ({ var: p.var, label: p.label }))
  }, [clusters])

  const metricaSel = metricaVar || metricas[0]?.var || null

  const { numData, cobertura, esEstrato, dominio } = useMemo(() => {
    if (!clusters?.length || !metricaSel) {
      return { numData: [], cobertura: [], esEstrato: false, dominio: ['auto', 'auto'] }
    }
    const filas = []
    const cob = []
    for (const cl of clusters) {
      const m = (cl.perfil_numerico || []).find((p) => p.var === metricaSel)
      filas.push({ grupo: cl.etiqueta, media: m?.media ?? null })
      cob.push({ grupo: cl.etiqueta, cobertura_pct: m?.cobertura_pct ?? null, n_con_dato: m?.n_con_dato ?? null })
    }
    const esc = escalas[metricaSel]
    const dom = esc && esc.min != null && esc.max != null ? [esc.min, esc.max] : ['auto', 'auto']
    return { numData: filas, cobertura: cob, esEstrato: metricaSel === 'ESTRATO_SOCIAL', dominio: dom }
  }, [clusters, metricaSel, escalas])

  if (!clusters?.length) {
    return (
      <div className="card wide">
        <h3>Perfilado con variables externas</h3>
        <p className="card-sub">Sin datos de perfilado disponibles.</p>
      </div>
    )
  }

  const metricaLabel = metricas.find((m) => m.var === metricaSel)?.label || ''

  return (
    <div className="card wide">
      <h3>Perfilado de los grupos con variables externas</h3>
      <p className="card-sub">
        Variables que <strong>no</strong> entraron en el agrupamiento, usadas solo para
        describir los grupos resultantes. Son asociaciones descriptivas, no causas.
      </p>

      {/* (a) Composición categórica apilada al 100% por grupo. */}
      <div className="card-head">
        <h4 style={{ margin: 0, fontSize: 13, color: '#475569' }}>Composición por grupo (100%)</h4>
        <label className="metric-toggle" style={{ marginLeft: 'auto' }}>
          <select
            className="toggle-btn"
            value={dimVar} onChange={(e) => setDimVar(e.target.value)}
            aria-label="Seleccionar dimensión categórica para la composición por grupo"
          >
            {DIMS.map((d) => <option key={d.var} value={d.var}>{d.label}</option>)}
          </select>
        </label>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(220, catData.length * 54 + 60)}>
        <BarChart data={catData} layout="vertical" stackOffset="expand"
                  margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
                  aria-label={`Composición porcentual por grupo de la dimensión seleccionada, excluyendo sin dato`}>
          <CartesianGrid horizontal={false} stroke="#eef2f7" />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
          <YAxis type="category" dataKey="grupo" width={160} tick={{ fontSize: 10 }} interval={0} />
          <Tooltip content={<TipCat />} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {categorias.map((c, i) => (
            <Bar key={c} dataKey={c} stackId="1" fill={COLORS[i % COLORS.length]}
                 isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <p className="chart-note">
        Porcentajes dentro de cada grupo, excluyendo «Sin dato» de la base. Las categorías
        con menos de 30 casos se suprimen en origen por privacidad, por lo que las barras
        pueden no sumar el total del grupo.
      </p>

      {/* (b) Medias de variables numéricas externas por grupo. */}
      <div className="card-head" style={{ marginTop: 16 }}>
        <h4 style={{ margin: 0, fontSize: 13, color: '#475569' }}>Medias por grupo</h4>
        <label className="metric-toggle" style={{ marginLeft: 'auto' }}>
          <select
            className="toggle-btn"
            value={metricaSel || ''} onChange={(e) => setMetricaVar(e.target.value)}
            aria-label="Seleccionar métrica numérica para las medias por grupo"
          >
            {metricas.map((m) => <option key={m.var} value={m.var}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, numData.length * 48 + 48)}>
        <BarChart data={numData} layout="vertical"
                  margin={{ left: 8, right: 24, top: 4, bottom: 8 }}
                  aria-label={`Media de ${metricaLabel} por grupo`}>
          <CartesianGrid horizontal={false} stroke="#eef2f7" />
          <XAxis type="number" domain={dominio} tick={{ fontSize: 11 }}
                 tickFormatter={(v) => fmtNum(v, esEstrato ? 1 : 0)}
                 label={{ value: metricaLabel, position: 'insideBottom', offset: -4, fontSize: 11, fill: '#64748b' }} />
          <YAxis type="category" dataKey="grupo" width={160} tick={{ fontSize: 10 }} interval={0} />
          <Tooltip
            cursor={{ fill: 'rgba(37,99,235,0.06)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null
              const cob = cobertura.find((c) => c.grupo === label)
              return (
                <div className="custom-tooltip">
                  <div className="tt-title">{label}</div>
                  <div className="tt-row"><span className="tt-k">{metricaLabel}</span><span>{fmtNum(payload[0].value, esEstrato ? 2 : 1)}</span></div>
                  {cob?.cobertura_pct != null && (
                    <div className="tt-row"><span className="tt-k">Cobertura</span><span>{fmtNum(cob.cobertura_pct, 1)}% ({fmtInt(cob.n_con_dato)})</span></div>
                  )}
                  {esEstrato && (
                    <div className="tt-row"><span className="tt-k" style={{ fontStyle: 'italic' }}>Indicador ordinal orientativo</span></div>
                  )}
                </div>
              )
            }}
          />
          <Bar dataKey="media" name={metricaLabel} isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {numData.map((_, i) => <Cell key={i} fill={CLUSTER_COLORS[i % CLUSTER_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="chart-note">
        Medias calculadas solo sobre quienes tienen dato en cada grupo (ver cobertura en el
        tooltip): {cobertura.map((c, i) => (
          <span key={c.grupo}>
            {i > 0 ? '; ' : ''}{c.grupo}: {c.cobertura_pct != null ? `${fmtNum(c.cobertura_pct, 1)}%` : '—'}
          </span>
        ))}. El eje usa el rango observado de la variable (no una escala 0–100 fija).
        {esEstrato && ' La media de estrato es un indicador ordinal orientativo, no una magnitud exacta.'}
      </p>
    </div>
  )
}
