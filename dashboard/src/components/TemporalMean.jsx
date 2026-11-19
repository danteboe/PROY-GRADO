import ChartCard from './ChartCard.jsx'
import { useState } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { fmtInt } from '../data.js'

// Metadatos de cada métrica del perfil académico medio por año. `dec` es la
// precisión de presentación (coherente con el redondeo de historical_stats).
// NO se incluye franja COVID: es una serie de medias académicas, no de eventos.
const METRICAS = {
  pga: { label: 'Promedio acumulado (PGA)', eje: 'PGA (0–5)', dec: 2 },
  icfes: { label: 'Puntaje ICFES', eje: 'Puntaje ICFES', dec: 1 },
  avance: { label: 'Semestre de avance', eje: 'Semestre de avance', dec: 1 },
}

const fmtNum = (x, dec) =>
  x == null ? '—' : new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(x)

function MeanTip({ active, payload, label, dec }) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0]?.payload || {}
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{label} · {fmtInt(row.n || 0)} participantes</div>
      <div className="tt-row"><span className="tt-k">Media</span><span>{fmtNum(row.media, dec)}</span></div>
      <div className="tt-row"><span className="tt-k">Mediana</span><span>{fmtNum(row.mediana, dec)}</span></div>
      <div className="tt-row"><span className="tt-k">Q1–Q3</span><span>{fmtNum(row.q1, dec)} – {fmtNum(row.q3, dec)}</span></div>
    </div>
  )
}

// Perfil académico medio de las cohortes de participantes por año: línea de media
// + banda Q1–Q3, con selector de métrica (PGA / ICFES / avance). NO es tasa.
//
// Props:
//   title, subtitle : textos de la tarjeta (framing perfil medio, no tasa).
//   series : { pga:[{anio,n,media,mediana,q1,q3}], icfes:[...], avance:[...] }.
export default function TemporalMean({ title, subtitle, series }) {
  const disponibles = Object.keys(METRICAS).filter((k) => series && series[k] && series[k].length)
  const [metric, setMetric] = useState(disponibles[0] || 'pga')
  const meta = METRICAS[metric] || METRICAS.pga
  const data = (series && series[metric]) || []

  // La banda Q1–Q3 se dibuja como base invisible (q1) + grosor (q3 - q1) apilados.
  const plot = data.map((d) => ({
    ...d,
    _q1: d.q1,
    _banda: d.q1 != null && d.q3 != null ? d.q3 - d.q1 : null,
  }))

  return (
    <ChartCard wide>
      <div className="card-head">
        <h3>{title}</h3>
        <label className="metric-toggle" style={{ marginLeft: 'auto' }}>
          <select
            value={metric} onChange={(e) => setMetric(e.target.value)}
            aria-label="Métrica del perfil académico medio por año"
            className="toggle-btn"
          >
            {disponibles.map((k) => (
              <option key={k} value={k}>{METRICAS[k].label}</option>
            ))}
          </select>
        </label>
      </div>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={plot} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}
          aria-label={`Perfil académico medio de las cohortes de participantes por año: ${meta.label}. Línea de media y banda de cuartiles Q1 a Q3.`}
        >
          <CartesianGrid stroke="#eef2f7" />
          <XAxis dataKey="anio" tick={{ fontSize: 11 }}
                 label={{ value: 'Año del primer evento de movilidad', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']}
                 label={{ value: meta.eje, angle: -90, position: 'insideLeft', fontSize: 11, fill: '#64748b' }} />
          <Tooltip content={<MeanTip dec={meta.dec} />} />
          {/* Banda Q1–Q3: base transparente + grosor sombreado. */}
          <Area dataKey="_q1" stackId="band" stroke="none" fill="none"
                isAnimationActive={false} activeDot={false} />
          <Area dataKey="_banda" stackId="band" stroke="none" fill="#1d4ed8"
                fillOpacity={0.14} isAnimationActive={false} activeDot={false} name="Q1–Q3" />
          <Line type="monotone" dataKey="media" stroke="#1d4ed8" strokeWidth={2.4}
                dot={{ r: 2.5 }} activeDot={{ r: 5 }} isAnimationActive={false} name="Media" />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
