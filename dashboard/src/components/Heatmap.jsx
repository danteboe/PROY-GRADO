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
  for (const d of data) {
    cell.set(`${d.facultad}|${d.estrato}`, d)
  }

  // Punto de saturación de la escala de color. Usar el máximo absoluto hace que
  // una sola celda atípica —p. ej. "Sin dato" con 100% apoyada en muy pocos
  // estudiantes— estire la escala y deje todas las demás celdas lavadas. En su
  // lugar saturamos en un percentil 95 PONDERADO POR VOLUMEN (n): así las celdas
  // con mucho peso definen el dominio y las cohortes diminutas no lo dominan.
  // Las celdas por encima del punto de saturación quedan recortadas al color más
  // intenso (clamp), conservando la lectura de "muy alta" sin aplanar el resto.
  const weightedPercentile = (rows, p) => {
    const pts = rows
      .filter((d) => d && d.n > 0 && d.tasa != null)
      .map((d) => ({ v: d.tasa, w: d.n }))
      .sort((a, b) => a.v - b.v)
    if (pts.length === 0) return 0
    const totalW = pts.reduce((s, x) => s + x.w, 0)
    const target = p * totalW
    let acc = 0
    for (const x of pts) {
      acc += x.w
      if (acc >= target) return x.v
    }
    return pts[pts.length - 1].v
  }
  // Dominio: p98 ponderado, con un piso para que no colapse si el percentil
  // queda muy bajo. Una sola celda atípica (p. ej. "Sin dato" al 100% sobre
  // pocos estudiantes) no define el extremo porque pesa poco en el percentil.
  const satTasa = Math.max(weightedPercentile(data, 0.98), 10)

  // Rampa de UN SOLO TONO (blanco -> morado profundo) interpolada en el espacio
  // RGB de forma suave. Evitamos la rampa de dos tramos anterior, que producía
  // morados medios "embarrados" donde ni el texto oscuro ni el blanco se leían.
  const RAMP_LIGHT = [245, 243, 252] // #f5f3fc  casi blanco con tinte morado
  const RAMP_DARK = [76, 29, 149]    // #4c1d95  morado profundo (no negro)
  const colorRgb = (t) => {
    if (t == null) return [241, 245, 249] // #f1f5f9 gris para celdas sin dato
    // Raíz cuadrada: expande el extremo bajo de la escala para que tasas
    // pequeñas (6-9%) ya tengan un morado perceptible en lugar de casi blanco.
    const x = Math.sqrt(Math.min(1, t / satTasa))
    return RAMP_LIGHT.map((a, i) => Math.round(a + (RAMP_DARK[i] - a) * x))
  }
  const colorFor = (t) => {
    const [r, g, b] = colorRgb(t)
    return `rgb(${r},${g},${b})`
  }
  // Color de texto por celda según la luminancia relativa (WCAG) del fondo:
  // texto blanco sobre fondos oscuros, texto oscuro sobre fondos claros. Así el
  // número siempre contrasta, sin depender de un único umbral que dejaba los
  // morados medios ilegibles.
  const textColorFor = (t) => {
    const [r, g, b] = colorRgb(t)
    const lin = (c) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return L > 0.4 ? '#1e293b' : '#ffffff'
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
                        style={{ background: colorFor(d?.tasa), color: d ? textColorFor(d.tasa) : '#94a3b8' }}
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
