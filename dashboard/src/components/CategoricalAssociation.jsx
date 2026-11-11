import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, LabelList, Cell,
} from 'recharts'
import { fmtInt } from '../data.js'

// Asociación categórica: para una variable (selector), muestra la tasa de
// participación (%) por categoría en barras, con una línea de referencia en la
// tasa base de pregrado y una insignia con la V de Cramér y su magnitud. SOLO lee
// valores precalculados de comparativo.categoricas (nada se recomputa aquí).

// Paleta cualitativa para distinguir cada categoría (antes todas eran azules).
const PALETTE = [
  '#2563eb', '#0f766e', '#d97706', '#9333ea', '#dc2626', '#0891b2',
  '#65a30d', '#db2777', '#4f46e5', '#ca8a04', '#059669', '#e11d48',
]

function fmtPct1(x) {
  return x == null ? '—' : `${x.toFixed(2).replace('.', ',')}%`
}
function fmtV(x) {
  return x == null ? '—' : x.toFixed(2).replace('.', ',')
}

function Tip({ active, payload, tasaBase }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{d.categoria}</div>
      <div className="tt-row"><span className="tt-k">Estudiantes</span><span>{fmtInt(d.n)}</span></div>
      <div className="tt-row"><span className="tt-k">Con internac.</span><span>{fmtInt(d.n_part)}</span></div>
      <div className="tt-row"><span className="tt-k">Tasa</span><span>{fmtPct1(d.tasa_pct)}</span></div>
      <div className="tt-row"><span className="tt-k">Tasa base</span><span>{fmtPct1(tasaBase)}</span></div>
    </div>
  )
}

export default function CategoricalAssociation({ data, tasaBase }) {
  const categoricas = useMemo(
    () => (data || []).filter((d) => d.tabla && d.tabla.length),
    [data],
  )
  const [sel, setSel] = useState(
    (categoricas[0] && categoricas[0].var) || '',
  )

  if (!categoricas.length) {
    return (
      <div className="card">
        <h3>Tasa de participación por categoría</h3>
        <p className="card-sub">Sin datos comparativos.</p>
      </div>
    )
  }

  const variable = categoricas.find((d) => d.var === sel) || categoricas[0]
  // La tabla ya viene ordenada por tasa_pct desc desde Python; se respeta.
  // Se ocultan las categorías "Sin dato"/"Sin información": no aportan a la lectura
  // de la asociación y distorsionan el eje (p. ej. estrato "Sin dato" al 100%).
  const SIN_DATO = new Set(['Sin dato', 'Sin información', 'Sin informacion', 'N/A', 'NA'])
  const filas = variable.tabla.filter((f) => !SIN_DATO.has(String(f.categoria)))

  return (
    <div className="card wide">
      <div className="card-head">
        <h3>Tasa de participación por categoría</h3>
        {variable.cramers_v != null && (
          <span
            className="badge-historico badge-help"
            tabIndex={0}
            title={
              'V de Cramér: mide la FUERZA de la asociación entre esta variable y la ' +
              'participación, en una escala de 0 a 1.\n' +
              '0 = sin asociación; 1 = asociación perfecta.\n' +
              'Guía: <0,1 insignificante · 0,1–0,3 pequeña · 0,3–0,5 media · >0,5 grande.\n' +
              'No indica dirección ni causa, solo cuánto se relacionan.'
            }
          >
            V de Cramér: {fmtV(variable.cramers_v)} ({variable.magnitud_v}) ⓘ
          </span>
        )}
        <label className="metric-toggle" style={{ marginLeft: 'auto' }}>
          <select
            className="range-num" style={{ width: 'auto', textAlign: 'left' }}
            value={variable.var} onChange={(e) => setSel(e.target.value)}
            aria-label="Seleccionar variable categórica"
          >
            {categoricas.map((d) => (
              <option key={d.var} value={d.var}>{d.label}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="card-sub">
        Tasa de participación (%) por categoría de {variable.label}. La línea punteada
        marca la tasa base de pregrado ({fmtPct1(tasaBase)}).
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={filas} margin={{ left: 4, right: 12, top: 18, bottom: 40 }}
          aria-label={`Tasa de participación por categoría de ${variable.label}, con línea de tasa base`}
        >
          <CartesianGrid stroke="#eef2f7" />
          <XAxis dataKey="categoria" tick={{ fontSize: 10 }} interval={0}
                 angle={-25} textAnchor="end" height={56} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`}
                 domain={[0, 'auto']} allowDataOverflow={false} />
          <Tooltip content={<Tip tasaBase={tasaBase} />} cursor={{ fill: '#f1f5f9' }} />
          {tasaBase != null && (
            <ReferenceLine y={tasaBase} stroke="#d97706" strokeDasharray="4 3"
              ifOverflow="extendDomain"
              label={{ value: `base ${fmtPct1(tasaBase)}`, position: 'insideTopRight',
                       fontSize: 9, fill: '#d97706' }} />
          )}
          <Bar dataKey="tasa_pct" name="Tasa %"
               radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {filas.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
            <LabelList dataKey="tasa_pct" position="top"
                       formatter={(v) => fmtPct1(v)}
                       style={{ fontSize: 9, fill: '#334155' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
