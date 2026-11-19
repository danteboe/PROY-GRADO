import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, Text,
} from 'recharts'
import BoxplotChart from './BoxplotChart.jsx'
import ChartCard from './ChartCard.jsx'

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

export default function ClusterExternalProfile({ clusters }) {
  const [dimVar, setDimVar] = useState('GENERO')
  const [metricaVar, setMetricaVar] = useState(null)

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

  const metricas = (clusters?.[0]?.perfil_numerico || []).map((perfil) => ({
    var: perfil.var,
    label: perfil.label.replace(/ \(media\)$/, ''),
  }))
  const metrica = metricas.find((m) => m.var === metricaVar) || metricas[0]
  const cajas = (clusters || []).flatMap((cl) => {
    const perfil = cl.perfil_numerico?.find((p) => p.var === metrica?.var)
    if (!perfil?.caja) return []
    return [{
      ...perfil.caja,
      grupo: cl.etiqueta,
      color: CLUSTER_COLORS[cl.id % CLUSTER_COLORS.length],
      n: perfil.n_con_dato,
      cobertura_pct: perfil.cobertura_pct,
    }]
  })

  if (!clusters?.length) {
    return (
      <div className="card wide">
        <h3>Perfilado con variables externas</h3>
        <p className="card-sub">Sin datos de perfilado disponibles.</p>
      </div>
    )
  }

  return (
    <>
      <ChartCard wide>
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
        <p className="card-sub">Composición de los grupos según una variable categórica externa.</p>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={catData} stackOffset="expand"
                    margin={{ left: 8, right: 16, top: 4, bottom: 24 }}
                    aria-label={`Composición porcentual por grupo de la dimensión seleccionada, excluyendo sin dato`}>
            <CartesianGrid vertical={false} stroke="#eef2f7" />
            <XAxis type="category" dataKey="grupo" interval={0} height={40} tick={({ x, y, payload, width }) => (
                     <Text x={x} y={y + 2} width={Math.min(130, width / catData.length - 8)}
                           textAnchor="middle" verticalAnchor="start" lineHeight="12px"
                           fontSize={10} fill="#475569">
                       {payload.value}
                     </Text>
                   )} />
            <YAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
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

      </ChartCard>

      <ChartCard wide>
        <div className="card-head">
          <h3>Distribución por grupo (boxplots)</h3>
          <label className="metric-toggle">
            <select className="toggle-btn" value={metrica?.var || ''}
                    onChange={(event) => setMetricaVar(event.target.value)}
                    aria-label="Seleccionar variable numérica para la distribución por grupo">
              {metricas.map((m) => <option key={m.var} value={m.var}>{m.label}</option>)}
            </select>
          </label>
        </div>
        <p className="card-sub">
          Distribución de una variable externa entre quienes tienen dato en cada grupo.
          Las cajas muestran Q1, mediana y Q3. Los bigotes de Tukey llegan a los extremos
          dentro de 1,5 veces el rango intercuartílico desde cada cuartil.
          {metrica?.var === 'ESTRATO_SOCIAL' && ' El estrato se interpreta como una escala ordinal.'}
        </p>
        <BoxplotChart key={metrica?.var} cajas={cajas} label={metrica?.label}
                      rango={metrica?.var === 'ESTRATO_SOCIAL' ? [1, 6] : [0, Infinity]}
                      descripcion={`Diagramas de caja de ${metrica?.label || 'la variable seleccionada'} por grupo`} />
      </ChartCard>
    </>
  )
}
