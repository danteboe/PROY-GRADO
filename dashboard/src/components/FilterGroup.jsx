import { useMemo, useState } from 'react'
import { fmtInt, orderedCategories } from '../data.js'

// Grupo de filtro multi-selección (checkboxes) para una dimensión.
// Muestra, junto a cada categoría, el conteo de estudiantes que resultaría
// bajo el resto de filtros activos (conteo contextual).
export default function FilterGroup({
  dim, label, codebooks, counts, selected, onToggle, onClear, searchable = false,
}) {
  const [q, setQ] = useState('')
  const cats = codebooks[dim]

  const items = useMemo(() => {
    const ordered = orderedCategories(dim, cats)
    return ordered
      .map((name) => ({ idx: cats.indexOf(name), name, n: counts.get(cats.indexOf(name)) || 0 }))
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
      <div className="options">
        {items.map((it) => (
          <label className="opt" key={it.idx} title={it.name}>
            <input
              type="checkbox"
              checked={selected.has(it.idx)}
              onChange={() => onToggle(dim, it.idx)}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.name}
            </span>
            <span className="opt-n">{fmtInt(it.n)}</span>
          </label>
        ))}
        {items.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12 }}>Sin coincidencias</div>}
      </div>
    </div>
  )
}
