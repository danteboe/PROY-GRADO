import { useState } from 'react'
import { fmtInt } from '../data.js'

// Mapa de calor clusters x features de z-scores de los centroides. Cada celda es
// el valor estandarizado (z) de un rasgo en el centroide de un grupo: z<0 (por
// debajo de la media global) y z>0 (por encima) se pintan con tonos opuestos y el
// 0 queda neutro (rampa DIVERGENTE). SOLO lee valores precalculados en Python
// (clusters[].centroide_z, clusters[].centroide); no recalcula nada.
//
// No reutiliza Heatmap.jsx (está cableado a facultad x estrato con rampa de un
// solo tono). El helper de contraste WCAG por luminancia (textColorFor) se replica
// aquí para que el número siempre contraste con el fondo.

// Formatea z con signo explícito y coma decimal española.
function fmtZ(z) {
  if (z == null) return '—'
  const s = Math.abs(z).toFixed(2).replace('.', ',')
  const signo = z > 0 ? '+' : z < 0 ? '−' : ''
  return `${signo}${s}`
}
// Formatea el valor en unidades originales con coma decimal.
function fmtVal(v) {
  if (v == null) return '—'
  return Number(v).toFixed(2).replace('.', ',')
}

// Extremos de la rampa divergente:
//  z<0 -> azul/teal; z=0 -> neutro casi blanco; z>0 -> ámbar/rojo.
const NEG = [15, 118, 110]   // #0f766e teal
const MID = [245, 245, 245]  // #f5f5f5 neutro
const POS = [180, 83, 9]     // #b45309 ámbar

// Interpola linealmente entre dos colores RGB.
function mix(a, b, t) {
  return a.map((x, i) => Math.round(x + (b[i] - x) * t))
}

export default function ClusterHeatmap({ clusters, meta }) {
  const [hover, setHover] = useState(null)

  if (!clusters || !clusters.length || !meta?.features?.length) {
    return (
      <div className="card wide">
        <h3>Perfil de los grupos: rasgos estandarizados (z)</h3>
        <p className="card-sub">Sin datos de centroides disponibles.</p>
      </div>
    )
  }

  const features = meta.features // [{var, label, unidad}]

  // Punto de saturación de la escala: máximo |z| observado entre todas las celdas
  // (con un piso para no colapsar si todo es muy pequeño). Así la rampa usa todo
  // su rango sin que un atípico aplane el resto.
  let maxAbsZ = 0
  for (const cl of clusters) {
    for (const cz of cl.centroide_z || []) {
      if (cz.z != null) maxAbsZ = Math.max(maxAbsZ, Math.abs(cz.z))
    }
  }
  const sat = Math.max(maxAbsZ, 0.5)

  const colorRgb = (z) => {
    if (z == null) return [241, 245, 249] // gris sin dato
    const t = Math.min(1, Math.abs(z) / sat)
    return z >= 0 ? mix(MID, POS, t) : mix(MID, NEG, t)
  }
  const colorFor = (z) => {
    const [r, g, b] = colorRgb(z)
    return `rgb(${r},${g},${b})`
  }
  // Contraste WCAG por luminancia relativa (replicado de Heatmap.jsx textColorFor):
  // texto blanco sobre fondos oscuros, texto oscuro sobre fondos claros.
  const textColorFor = (z) => {
    const [r, g, b] = colorRgb(z)
    const lin = (c) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    return L > 0.4 ? '#1e293b' : '#ffffff'
  }

  // Índice rápido z y valor por (clusterId, var).
  const zMap = new Map()
  const valMap = new Map()
  for (const cl of clusters) {
    for (const cz of cl.centroide_z || []) zMap.set(`${cl.id}|${cz.var}`, cz.z)
    for (const cv of cl.centroide || []) valMap.set(`${cl.id}|${cv.var}`, cv.valor)
  }

  return (
    <div className="card wide">
      <h3>Perfil de los grupos: rasgos estandarizados (z)</h3>
      <p className="card-sub">
        Cada celda es el valor estandarizado (z) del rasgo en el centroide del grupo:
        z = 0 es la media global; tonos ámbar indican por encima de la media y tonos
        teal por debajo. Permite leer de un vistazo qué distingue a cada grupo.
      </p>
      <div className="heatmap-scroll">
        <table className="heatmap">
          <thead>
            <tr>
              <th className="hm-corner">Grupo \ Rasgo</th>
              {features.map((f) => <th key={f.var} title={f.label}>{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {clusters.map((cl) => (
              <tr key={cl.id}>
                <td className="hm-rowlabel" title={`${cl.etiqueta} · ${fmtInt(cl.n)} (${fmtVal(cl.pct)}%)`}>
                  {cl.etiqueta}
                  <span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>
                    {fmtInt(cl.n)} ({fmtVal(cl.pct)}%)
                  </span>
                </td>
                {features.map((f) => {
                  const z = zMap.get(`${cl.id}|${f.var}`)
                  const val = valMap.get(`${cl.id}|${f.var}`)
                  const key = `${cl.id}|${f.var}`
                  const titulo = z != null
                    ? `${cl.etiqueta} · ${f.label}\n${f.label}: ${fmtVal(val)}${f.unidad ? ' (' + f.unidad + ')' : ''}; z = ${fmtZ(z)}`
                    : 'Sin dato'
                  return (
                    <td key={f.var}
                        className="hm-cell"
                        style={{ background: colorFor(z), color: z != null ? textColorFor(z) : '#94a3b8' }}
                        onMouseEnter={() => setHover(key)}
                        onMouseLeave={() => setHover(null)}
                        title={titulo}>
                      {z != null ? fmtZ(z) : '·'}
                      {hover === key && z != null && (
                        <div className="hm-tip">
                          <strong>{cl.etiqueta} · {f.label}</strong><br />
                          {f.label}: {fmtVal(val)}{f.unidad ? ` (${f.unidad})` : ''}<br />
                          z = {fmtZ(z)}
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
        Valores estandarizados (media 0, desviación 1) de los rasgos que alimentaron el
        agrupamiento. Son diferencias descriptivas entre grupos, no categorías oficiales
        ni relaciones causales.
      </p>
    </div>
  )
}
