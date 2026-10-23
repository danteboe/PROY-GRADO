import { useMemo, useState } from 'react'
import { fmtInt, orderedCategories } from '../data.js'

// Grupo de filtro multi-selección (checkboxes) para una dimensión.
// Junto a cada categoría muestra el número de estudiantes **con experiencia de
// internacionalización** (participantes) que resultaría bajo el resto de filtros
// activos (conteo contextual). El total de estudiantes se muestra como título
// (tooltip) de cada opción.
export default function FilterGroup({
  dim, label, codebooks, counts, selected, onToggle, onClear, onSelectAll, searchable = false,
}) {
  const [q, setQ] = useState('')
  const cats = codebooks[dim]

  const items = useMemo(() => {
    const ordered = orderedCategories(dim, cats)
    return ordered
      .map((name) => {
        const idx = cats.indexOf(name)
        const c = counts.get(idx) || { n: 0, part: 0 }
        return { idx, name, n: c.n, part: c.part }
      })
      .filter((it) => it.n > 0 || selected.has(it.idx))
      .filter((it) => !q || it.name.toLowerCase().includes(q.toLowerCase()))
  }, [dim, cats, counts, selected, q])

  return (
    <div className="filter-group">
      <label>
        <span>{label}</span>
        {selected.size > 0 && (
          <span className="chip-count" onClick={() => onClear(dim)} style={{ cursor: 'pointer' }}>
            {selected.size} ✕
          </span>
        )}
      </label>
      {searchable && (
        <input
          className="search-box"
          placeholder={`Buscar ${label.toLowerCase()}...`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <div className="filter-actions">
        {/* Selecciona solo los items visibles (tras filtro de texto y con part>0). */}
        <button
          type="button"
          className="filter-action-btn"
          onClick={() => onSelectAll(dim, items.map((it) => it.idx))}
          disabled={items.length === 0}
          aria-label={`Seleccionar todas las opciones visibles de ${label}`}
        >
          Seleccionar todo
        </button>
        <button
          type="button"
          className="filter-action-btn"
          onClick={() => onClear(dim)}
          disabled={selected.size === 0}
          aria-label={`Quitar filtro de ${label} (equivale a mostrar todas las opciones)`}
        >
          Quitar filtro
        </button>
      </div>
      <div className="options">
        {items.map((it) => (
          <label
            className="opt"
            key={it.idx}
            title={`${it.name}\n${fmtInt(it.part)} con internacionalización de ${fmtInt(it.n)} estudiantes`}
          >
            <input
              type="checkbox"
              checked={selected.has(it.idx)}
              onChange={() => onToggle(dim, it.idx)}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.name}
            </span>
            <span className="opt-n" title="Estudiantes con internacionalización">
              {fmtInt(it.part)}
            </span>
          </label>
        ))}
        {items.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>Sin coincidencias</div>}
      </div>
    </div>
  )
}
