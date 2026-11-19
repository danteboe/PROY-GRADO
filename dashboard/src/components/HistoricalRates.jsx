import ChartCard from './ChartCard.jsx'
import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { fmtInt } from '../data.js'

// Paleta compartida con el resto del histórico (HistoricalComposition).
const COLORS = ['#1d4ed8', '#0f766e', '#d97706', '#9333ea', '#dc2626', '#64748b']

function fmtPct2(x) {
  return x == null ? '—' : `${x.toFixed(2).replace('.', ',')}%`
}

// Pivot PROPIO por año (NO reutiliza pivotComposicion de App): para la dimensión
// activa, una fila por año con, por categoría, la tasa (`${cat}`) y el num/den
// auxiliares (`${cat}__num`, `${cat}__den`). Donde una celda falta, la serie-año
// queda null (NO 0) para que la línea muestre el hueco con connectNulls={false}.
function pivotTasas(serie) {
  if (!serie || !serie.length) return { rows: [], categories: [] }
  const categories = [...new Set(serie.map((r) => r.categoria))]
  const byAnio = new Map()
  for (const r of serie) {
    const o = byAnio.get(r.anio) || { anio: r.anio }
    o[r.categoria] = r.tasa_pct
    o[`${r.categoria}__num`] = r.num
    o[`${r.categoria}__den`] = r.den
    byAnio.set(r.anio, o)
  }
  // Las categorías ausentes en un año quedan como undefined -> recharts las trata
  // como null (hueco); NO se rellenan con 0 a propósito.
  const rows = [...byAnio.values()].sort((a, b) => a.anio - b.anio)
  return { rows, categories }
}

// Tooltip auditable por punto: categoría, año, num (activos que iniciaron
// movilidad), den (activos del grupo) y tasa_pct. num <= den siempre visible.
function Tip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{label}</div>
      {payload.map((p) => (
        p.value == null ? null : (
          <div className="tt-row" key={p.dataKey}>
            <span className="tt-k" style={{ color: p.color }}>■ {p.dataKey}</span>
            <span>
              {fmtPct2(p.value)} · {fmtInt(p.payload?.[`${p.dataKey}__num`] || 0)}/
              {fmtInt(p.payload?.[`${p.dataKey}__den`] || 0)}
            </span>
          </div>
        )
      ))}
    </div>
  )
}

// Líneas multi-serie de la TASA DE INICIO de movilidad (%) por categoría y año,
// con selector de dimensión. SÍ es una tasa (eje distinto del histórico de
// composición): rotula tasa y muestra num/den/tasa en el tooltip. Solo LEE de
// `rates` (= cube.historicoTasas), precalculado en Python (historical_rates.py).
//
// Props:
//   rates : objeto { meta:{dimensiones, labels, nota_framing}, <dim>:[{anio,
//           categoria, num, den, tasa_pct}, ...] } del contrato data.json.
export default function HistoricalRates({ rates }) {
  const meta = rates.meta || {}
  const dimensiones = meta.dimensiones || []
  const labels = meta.labels || {}
  const [dim, setDim] = useState(dimensiones[0] || '')

  const { rows, categories } = useMemo(() => pivotTasas(rates[dim]), [rates, dim])
  const label = labels[dim] || dim

  return (
    <ChartCard wide>
      <div className="card-head">
        <h3>Tasa de inicio de movilidad por {String(label).toLowerCase()} y año</h3>
        <label className="metric-toggle" style={{ marginLeft: 'auto' }}>
          <select
            className="range-num" style={{ width: 'auto', textAlign: 'left' }}
            value={dim} onChange={(e) => setDim(e.target.value)}
            aria-label="Seleccionar dimensión de la tasa"
          >
            {dimensiones.map((d) => (
              <option key={d} value={d}>{labels[d] || d}</option>
            ))}
          </select>
        </label>
      </div>
      {meta.nota_framing && <p className="card-sub">{meta.nota_framing}</p>}
      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={rows} margin={{ left: 24, right: 16, top: 8, bottom: 4 }}
          aria-label={`Tasa de inicio de movilidad (%) por ${String(label).toLowerCase()} y año, una línea por categoría. Los años sin dato aparecen como hueco en la línea.`}
        >
          <CartesianGrid stroke="#eef2f7" />
          <XAxis dataKey="anio" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={64}
                 label={{ value: 'Tasa de inicio de movilidad (%)', angle: -90,
                          position: 'insideLeft', fontSize: 11, fill: '#64748b' }} />
          <Tooltip content={<Tip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {categories.map((c, i) => (
            <Line key={c} type="linear" dataKey={c}
                  stroke={COLORS[i % COLORS.length]} strokeWidth={2}
                  connectNulls={false} dot={{ r: 2 }} activeDot={{ r: 4 }}
                  isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <p className="footnote">flujo de inicio, no prevalencia · asociación, no causa</p>
    </ChartCard>
  )
}
