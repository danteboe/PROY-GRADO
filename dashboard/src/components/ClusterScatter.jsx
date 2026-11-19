import ChartCard from './ChartCard.jsx'
import { useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from 'recharts'

// Dispersión 2D de la submuestra de clustering: cada punto es un participante de
// la submuestra (<=3000) producida en Python (clustering.scatter_muestra),
// coloreado por su grupo (cluster). Dos <select> eligen qué feature va en cada
// eje, entre las 5 usadas para agrupar. SOLO lee la submuestra ya agregada; no
// recalcula nada ni expone identificadores. Las 5 features llegan en unidades
// ORIGINALES (ver FEAT-001).

// Mismo orden de colores que ClusterExternalProfile (CLUSTER_COLORS) para que un
// grupo mantenga su color en toda la sección de clustering.
const CLUSTER_COLORS = ['#1d4ed8', '#b45309', '#0f766e', '#9333ea', '#dc2626', '#0891b2']

// Las 5 features del clustering con etiquetas legibles (claves de scatter_muestra).
const FEATURES = [
  { key: 'PGA_ULTIMO', label: 'PGA (último)' },
  { key: 'PERCENTIL_PGA_PROGRAMA', label: 'Percentil de PGA (programa)' },
  { key: 'SEMESTRE_AVANCE', label: 'Semestre de avance' },
  { key: 'PCT_CREDITOS_APROBADOS', label: 'Proporción de créditos aprobados' },
  { key: 'EDAD', label: 'Edad' },
]

function fmtNum(x, dec = 2) {
  return x == null ? '—' : Number(x).toFixed(dec).replace('.', ',')
}
function labelDe(key) {
  return FEATURES.find((f) => f.key === key)?.label || key
}

export default function ClusterScatter({ muestra, clusters }) {
  const [ejeX, setEjeX] = useState('PGA_ULTIMO')
  const [ejeY, setEjeY] = useState('EDAD')

  // Nombre de cada grupo por id de cluster (si viene en `clusters`); si no, se
  // muestra "Grupo N". Permite una leyenda legible y colores consistentes.
  const nombreGrupo = useMemo(() => {
    const m = new Map()
    for (const cl of clusters || []) {
      if (cl.id != null) m.set(cl.id, cl.etiqueta || `Grupo ${cl.id}`)
    }
    return m
  }, [clusters])

  // Agrupa los puntos de la submuestra por id de cluster para una serie por grupo
  // (así la leyenda y el color por grupo funcionan de forma nativa en Recharts).
  const porGrupo = useMemo(() => {
    const m = new Map()
    for (const p of muestra || []) {
      const arr = m.get(p.cluster) || []
      arr.push(p)
      m.set(p.cluster, arr)
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [muestra])

  if (!muestra || !muestra.length) {
    return (
      <div className="card wide">
        <h3>Mapa de los grupos (dispersión 2D)</h3>
        <p className="card-sub">Sin submuestra de dispersión disponible.</p>
      </div>
    )
  }

  const Tip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null
    const d = payload[0].payload
    const nombre = nombreGrupo.get(d.cluster) || `Grupo ${d.cluster}`
    return (
      <div className="custom-tooltip">
        <div className="tt-title">{nombre}</div>
        <div className="tt-row"><span className="tt-k">{labelDe(ejeX)}</span><span>{fmtNum(d[ejeX])}</span></div>
        <div className="tt-row"><span className="tt-k">{labelDe(ejeY)}</span><span>{fmtNum(d[ejeY])}</span></div>
      </div>
    )
  }

  return (
    <ChartCard wide>
      <div className="card-head">
        <h3>Mapa de los grupos (dispersión 2D)</h3>
        <label className="metric-toggle" style={{ marginLeft: 'auto' }}>
          <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>Eje X</span>
          <select className="toggle-btn" value={ejeX}
                  onChange={(e) => setEjeX(e.target.value)}
                  aria-label="Seleccionar variable del eje X">
            {FEATURES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
        <label className="metric-toggle">
          <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>Eje Y</span>
          <select className="toggle-btn" value={ejeY}
                  onChange={(e) => setEjeY(e.target.value)}
                  aria-label="Seleccionar variable del eje Y">
            {FEATURES.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
      </div>
      <p className="card-sub">
        Cada punto es un participante de una <strong>submuestra</strong> (hasta 3000) de
        los participantes de pregrado del clustering; el color indica su grupo. No son
        microdatos individuales identificables, sino una muestra agregada para visualizar
        cómo se separan los grupos en dos rasgos a la vez.
      </p>
      <ul className="cluster-legend" aria-label="Grupos">
        {porGrupo.map(([cid]) => (
          <li key={cid}>
            <span aria-hidden="true" style={{ background: CLUSTER_COLORS[cid % CLUSTER_COLORS.length] }} />
            {nombreGrupo.get(cid) || `Grupo ${cid}`}
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ left: 14, right: 24, top: 10, bottom: 30 }}>
          <CartesianGrid stroke="#eef2f7" />
          <XAxis type="number" dataKey={ejeX} name={labelDe(ejeX)}
                 tick={{ fontSize: 11 }} domain={['auto', 'auto']}
                 label={{ value: labelDe(ejeX), position: 'bottom', fontSize: 11, fill: '#64748b' }} />
          <YAxis type="number" dataKey={ejeY} name={labelDe(ejeY)}
                 tick={{ fontSize: 11 }} domain={['auto', 'auto']} width={64}
                 label={{ value: labelDe(ejeY), angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }} />
          <Tooltip content={<Tip />} cursor={{ strokeDasharray: '3 3' }} />
          {porGrupo.map(([cid, puntos]) => (
            <Scatter key={cid} data={puntos} isAnimationActive={false}
                     name={nombreGrupo.get(cid) || `Grupo ${cid}`}
                     fill={CLUSTER_COLORS[cid % CLUSTER_COLORS.length]} fillOpacity={0.55}>
              {puntos.map((_, i) => (
                <Cell key={i} fill={CLUSTER_COLORS[cid % CLUSTER_COLORS.length]} />
              ))}
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
