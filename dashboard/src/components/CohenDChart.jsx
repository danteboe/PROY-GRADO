import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from 'recharts'

// Gráfico de d de Cohen: barras horizontales del tamaño del efecto por variable
// numérica, ordenadas por |d| descendente. El color codifica el signo (verde si
// el valor favorece a participantes, ámbar/rojo si favorece a no participantes).
// Las líneas de referencia en ±0,2/±0,5/±0,8 marcan los umbrales pequeño/mediano/
// grande de Cohen. SOLO lee valores precalculados de comparativo.numericas.

const COLOR_POS = '#0f766e' // efecto a favor de participantes
const COLOR_NEG = '#b45309' // efecto a favor de no participantes

// Formatea un número con coma decimal española y 2 decimales.
function fmtD(x) {
  return x == null ? '—' : x.toFixed(2).replace('.', ',')
}

function Tip({ active, payload }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  const favorece = d.cohen_d >= 0 ? 'Participantes' : 'No participantes'
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{d.label}</div>
      <div className="tt-row"><span className="tt-k">d de Cohen</span><span>{fmtD(d.cohen_d)}</span></div>
      <div className="tt-row"><span className="tt-k">Magnitud</span><span>{d.magnitud_d}</span></div>
      <div className="tt-row"><span className="tt-k">Favorece a</span><span>{favorece}</span></div>
      <div className="tt-row"><span className="tt-k">Dif. de medias</span><span>{fmtD(d.dif_medias)}</span></div>
      <div className="tt-row"><span className="tt-k">IC 95%</span><span>[{fmtD(d.ic95_low)}; {fmtD(d.ic95_high)}]</span></div>
    </div>
  )
}

export default function CohenDChart({ data }) {
  if (!data || !data.length) {
    return (
      <div className="card">
        <h3>Tamaño del efecto (d de Cohen)</h3>
        <p className="card-sub">Sin datos comparativos.</p>
      </div>
    )
  }

  // Conservar solo las variables con d calculable y ordenar por |d| desc.
  const rows = data
    .filter((d) => d.cohen_d != null)
    .map((d) => ({ ...d }))
    .sort((a, b) => Math.abs(b.cohen_d) - Math.abs(a.cohen_d))

  // Altura proporcional al número de barras para que las etiquetas no se amontonen.
  const alto = Math.max(260, rows.length * 26 + 60)

  return (
    <div className="card wide">
      <h3>Tamaño del efecto (d de Cohen) por variable</h3>
      <p className="card-sub">
        Diferencia estandarizada entre participantes y no participantes, ordenada por
        magnitud. Verde: a favor de participantes; ámbar: a favor de no participantes.
        Líneas de referencia en 0,2 (pequeño), 0,5 (mediano) y 0,8 (grande).
      </p>
      <ResponsiveContainer width="100%" height={alto}>
        <BarChart
          layout="vertical" data={rows}
          margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
          aria-label="Gráfico de barras horizontales del tamaño del efecto d de Cohen por variable, ordenado por magnitud"
        >
          <CartesianGrid stroke="#eef2f7" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }}
                 tickFormatter={(v) => fmtD(v)} domain={['auto', 'auto']} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }}
                 width={168} interval={0} />
          <Tooltip content={<Tip />} />
          <ReferenceLine x={0} stroke="#94a3b8" />
          {[-0.8, -0.5, -0.2, 0.2, 0.5, 0.8].map((x) => (
            <ReferenceLine key={x} x={x} stroke="#cbd5e1" strokeDasharray="3 3"
              label={{ value: fmtD(x), position: 'top', fontSize: 9, fill: '#94a3b8' }} />
          ))}
          <Bar dataKey="cohen_d" name="d de Cohen" isAnimationActive={false}
               radius={[2, 2, 2, 2]}>
            {rows.map((d, i) => (
              <Cell key={i} fill={d.cohen_d >= 0 ? COLOR_POS : COLOR_NEG} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
