import { fmtInt, fmtPct } from '../data.js'

// Tooltip personalizado para hover: muestra estudiantes, participantes y tasa.
export default function ChartTooltip({ active, payload, label, labelKey }) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  return (
    <div className="custom-tooltip">
      <div className="tt-title">{d[labelKey] ?? label}</div>
      {d.n != null && (
        <div className="tt-row"><span className="tt-k">Estudiantes</span><span>{fmtInt(d.n)}</span></div>
      )}
      {d.part != null && (
        <div className="tt-row"><span className="tt-k">Participantes</span><span>{fmtInt(d.part)}</span></div>
      )}
      {d.tasa != null && (
        <div className="tt-row"><span className="tt-k">Tasa</span><span>{fmtPct(d.tasa)}</span></div>
      )}
      {d.eventos != null && (
        <div className="tt-row"><span className="tt-k">Eventos</span><span>{fmtInt(d.eventos)}</span></div>
      )}
    </div>
  )
}
