import { useState } from 'react'
import { fmtInt, fmtPct } from '../data.js'

// Mapa de calor facultad x estrato (color = tasa de participación).
// Responde: ¿la brecha socioeconómica es igual en todas las facultades?
// Props: data [{facultad, estrato, n, part, tasa}]
export default function Heatmap({ title, subtitle, data }) {
  const [hover, setHover] = useState(null)

  const estratos = ['1', '2', '3', '4', '5', '6', 'Sin dato']
  // Facultades ordenadas por tasa media descendente.
  const facStats = {}
  for (const d of data) {
    (facStats[d.facultad] ||= { n: 0, part: 0 })
    facStats[d.facultad].n += d.n
    facStats[d.facultad].part += d.part
  }
  const facs = Object.keys(facStats)
    .sort((a, b) => (facStats[b].part / facStats[b].n) - (facStats[a].part / facStats[a].n))

  const cell = new Map()
  let maxTasa = 0
  for (const d of data) {
    cell.set(`${d.facultad}|${d.estrato}`, d)
    if (d.tasa > maxTasa) maxTasa = d.tasa
  }

  const colorFor = (t) => {
    if (t == null) return '#f1f5f9'
    const x = Math.min(1, t / maxTasa)
    // interpola de claro (#eef2ff) a morado fuerte (#6d28d9)
    const lerp = (a, b) => Math.round(a + (b - a) * x)
    return `rgb(${lerp(238, 109)},${lerp(242, 40)},${lerp(255, 217)})`
  }

  return (
    <div className="card wide">
      <h3>{title}</h3>
      {subtitle && <p className="card-sub">{subtitle}</p>}
      <div className="heatmap-scroll">
        <table className="heatmap">
          <thead>
            <tr>
              <th className="hm-corner">Facultad \ Estrato</th>
              {estratos.map((e) => <th key={e}>{e}</th>)}
            </tr>
          </thead>
          <tbody>
            {facs.map((f) => (
              <tr key={f}>
                <td className="hm-rowlabel" title={f}>{f}</td>
                {estratos.map((e) => {
                  const d = cell.get(`${f}|${e}`)
                  const key = `${f}|${e}`
                  return (
                    <td key={e}
                        className="hm-cell"
                        style={{ background: colorFor(d?.tasa), color: (d && d.tasa > maxTasa * 0.55) ? '#fff' : '#334155' }}
                        onMouseEnter={() => setHover(key)}
                        onMouseLeave={() => setHover(null)}
                        title={d ? `${f} · estrato ${e}\n${fmtPct(d.tasa)} (${fmtInt(d.part)} de ${fmtInt(d.n)})` : 'Sin datos suficientes'}>
                      {d ? d.tasa.toFixed(1) : '·'}
                      {hover === key && d && (
                        <div className="hm-tip">
                          <strong>{f} · estrato {e}</strong><br />
                          {fmtPct(d.tasa)} · {fmtInt(d.part)}/{fmtInt(d.n)}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="chart-note">
        Cada celda es la tasa de participación (%) de esa facultad y estrato. El color
        más intenso = mayor tasa. Permite ver si la brecha por estrato se repite dentro
        de cada facultad.
      </p>
    </div>
  )
}
