import { useEffect, useState } from 'react'

// Slider de rango (doble control) con campos de entrada manual en cada extremo.
// Trabaja en UNIDADES REALES; valida que lo ingresado esté dentro de [min, max]
// y respete el paso. Al cambiar, notifica el nuevo rango al padre.
//
// Props:
//   label, meta {min,max,step,dec,unit}
//   value { min, max, includeNA, active }
//   onChange(newValue), onClear()
export default function RangeSlider({ label, meta, value, onChange, onClear }) {
  const { min, max, step } = meta
  const lo = value?.min ?? min
  const hi = value?.max ?? max
  const includeNA = value?.includeNA ?? true

  // Estado local de los inputs de texto, para permitir edición libre antes de validar.
  const [loText, setLoText] = useState(String(lo))
  const [hiText, setHiText] = useState(String(hi))
  useEffect(() => { setLoText(String(lo)) }, [lo])
  useEffect(() => { setHiText(String(hi)) }, [hi])

  const active = lo > min || hi < max || !includeNA

  const emit = (nLo, nHi, nNA) => {
    const act = nLo > min || nHi < max || !nNA
    onChange({ min: nLo, max: nHi, includeNA: nNA, active: act })
  }

  const clamp = (v) => Math.min(max, Math.max(min, v))
  const snap = (v) => Math.round(v / step) * step

  const onSliderLo = (e) => {
    let v = Number(e.target.value)
    if (v > hi) v = hi
    emit(v, hi, includeNA)
  }
  const onSliderHi = (e) => {
    let v = Number(e.target.value)
    if (v < lo) v = lo
    emit(lo, v, includeNA)
  }

  const commitLo = () => {
    const raw = Number(loText.replace(',', '.'))
    if (Number.isNaN(raw)) { setLoText(String(lo)); return }
    const v = Math.min(clamp(snap(raw)), hi)
    emit(v, hi, includeNA)
  }
  const commitHi = () => {
    const raw = Number(hiText.replace(',', '.'))
    if (Number.isNaN(raw)) { setHiText(String(hi)); return }
    const v = Math.max(clamp(snap(raw)), lo)
    emit(lo, v, includeNA)
  }

  // Posición (%) de cada manija para pintar el tramo activo.
  const pct = (v) => (100 * (v - min)) / (max - min)

  return (
    <div className="filter-group">
      <label>
        <span>{label}{meta.unit ? ` (${meta.unit})` : ''}</span>
        {active && (
          <span className="chip-count" onClick={onClear} style={{ cursor: 'pointer' }}>
            reset ✕
          </span>
        )}
      </label>

      <div className="range-inputs">
        <input
          className="range-num" type="number" min={min} max={max} step={step}
          value={loText}
          onChange={(e) => setLoText(e.target.value)}
          onBlur={commitLo}
          onKeyDown={(e) => e.key === 'Enter' && commitLo()}
          aria-label={`${label} mínimo`}
        />
        <span className="range-dash">—</span>
        <input
          className="range-num" type="number" min={min} max={max} step={step}
          value={hiText}
          onChange={(e) => setHiText(e.target.value)}
          onBlur={commitHi}
          onKeyDown={(e) => e.key === 'Enter' && commitHi()}
          aria-label={`${label} máximo`}
        />
      </div>

      <div className="dual-slider">
        <div className="slider-track" />
        <div
          className="slider-range"
          style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
        />
        <input type="range" min={min} max={max} step={step} value={lo}
               onChange={onSliderLo} className="thumb thumb-lo" />
        <input type="range" min={min} max={max} step={step} value={hi}
               onChange={onSliderHi} className="thumb thumb-hi" />
      </div>

      <label className="na-toggle">
        <input type="checkbox" checked={includeNA}
               onChange={(e) => emit(lo, hi, e.target.checked)} />
        Incluir estudiantes sin dato
      </label>
    </div>
  )
}
