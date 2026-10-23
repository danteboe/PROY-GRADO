import { useMemo } from 'react'

// Slider de rango temporal (doble manija) para el año de movilidad.
// A diferencia de RangeSlider (que opera sobre unidades internas del cubo), este
// control trabaja sobre AÑOS ENTEROS derivados del codebook `anio_mov` y traduce
// el rango [desde, hasta] al Set de índices del codebook que caen dentro de él.
//
// Props:
//   label       : etiqueta visible.
//   codebook    : cube.codebooks.anio_mov (array de labels string: "1998"…"2026","N/A").
//   selected    : Set<idx> actual del filtro cat.anio_mov.
//   onChange    : (nextSet) => void  — nuevo Set de índices.
//   onClear     : () => void         — limpia el filtro.
export default function YearRangeSlider({ label, codebook, selected, onChange, onClear }) {
  // Separa índices numéricos (años) de los no numéricos (p. ej. "N/A").
  const { nums, naIdx, minYear, maxYear } = useMemo(() => {
    const nums = []
    const naIdx = []
    for (let idx = 0; idx < codebook.length; idx++) {
      const y = Number(codebook[idx])
      if (Number.isFinite(y)) nums.push({ idx, year: y })
      else naIdx.push(idx)
    }
    const years = nums.map((d) => d.year)
    return {
      nums,
      naIdx,
      minYear: years.length ? Math.min(...years) : 0,
      maxYear: years.length ? Math.max(...years) : 0,
    }
  }, [codebook])

  // Reconstruye el estado [desde, hasta, includeNA] a partir del Set seleccionado.
  // Si el Set está vacío => sin filtro (rango completo + N/A incluido).
  const { desde, hasta, includeNA } = useMemo(() => {
    if (!selected || selected.size === 0) {
      return { desde: minYear, hasta: maxYear, includeNA: true }
    }
    let lo = Infinity
    let hi = -Infinity
    for (const d of nums) {
      if (selected.has(d.idx)) {
        if (d.year < lo) lo = d.year
        if (d.year > hi) hi = d.year
      }
    }
    if (!Number.isFinite(lo)) { lo = minYear; hi = maxYear }
    const na = naIdx.some((i) => selected.has(i))
    return { desde: lo, hasta: hi, includeNA: na }
  }, [selected, nums, naIdx, minYear, maxYear])

  const active = desde > minYear || hasta < maxYear || !includeNA

  // Construye y emite el Set de índices para un rango y preferencia de N/A dados.
  // Si el rango cubre todo y se incluye N/A, emite un Set vacío (= sin filtro).
  const emit = (lo, hi, na) => {
    if (lo <= minYear && hi >= maxYear && na) {
      onChange(new Set())
      return
    }
    const set = new Set()
    for (const d of nums) if (d.year >= lo && d.year <= hi) set.add(d.idx)
    if (na) for (const i of naIdx) set.add(i)
    onChange(set)
  }

  const onSliderLo = (e) => {
    let v = Number(e.target.value)
    if (v > hasta) v = hasta
    emit(v, hasta, includeNA)
  }
  const onSliderHi = (e) => {
    let v = Number(e.target.value)
    if (v < desde) v = desde
    emit(desde, v, includeNA)
  }

  // Posición (%) de cada manija para pintar el tramo activo.
  const span = maxYear - minYear || 1
  const pct = (v) => (100 * (v - minYear)) / span

  return (
    <div className="filter-group">
      <label>
        <span>{label}</span>
        {active && (
          <span className="chip-count" onClick={onClear} style={{ cursor: 'pointer' }}>
            reset ✕
          </span>
        )}
      </label>

      <div className="year-range-labels">
        <strong>{desde}</strong>
        <strong>{hasta}</strong>
      </div>

      <div className="dual-slider year-slider">
        <div className="slider-track" />
        <div
          className="slider-range"
          style={{ left: `${pct(desde)}%`, right: `${100 - pct(hasta)}%` }}
        />
        <input type="range" min={minYear} max={maxYear} step={1} value={desde}
               onChange={onSliderLo} className="thumb thumb-lo" aria-label="Año desde" />
        <input type="range" min={minYear} max={maxYear} step={1} value={hasta}
               onChange={onSliderHi} className="thumb thumb-hi" aria-label="Año hasta" />
      </div>

      <label className="na-toggle">
        <input type="checkbox" checked={includeNA}
               onChange={(e) => emit(desde, hasta, e.target.checked)} />
        Incluir sin año/N/A
      </label>
    </div>
  )
}
