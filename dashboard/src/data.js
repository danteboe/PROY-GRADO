// Lógica de datos del cliente: decodificación del cubo, filtrado y agregación.
//
// El cubo llega codificado: cada fila es [idx_dim0, ..., idx_dimK, n, part],
// donde los índices apuntan a los catálogos (`codebooks`). Al cargar lo
// decodificamos a un arreglo de objetos ligeros (enteros) y guardamos la lista
// de categorías por dimensión para construir los filtros.

export const DIM_LABELS = {
  nivel: 'Nivel académico',
  facultad: 'Facultad',
  programa: 'Programa',
  genero: 'Género',
  estrato: 'Estrato social',
  tipo_admision: 'Tipo de admisión',
  estado: 'Estado académico',
  anio_mov: 'Año de movilidad',
  modalidad: 'Modalidad',
  pga_bin: 'Rango de PGA',
  avance_bin: 'Semestre de avance',
  icfes_bin: 'Puntaje ICFES',
}

// Orden sugerido de categorías para dimensiones ordinales.
const ORDINAL_ORDER = {
  estrato: ['1', '2', '3', '4', '5', '6', 'Sin dato'],
  pga_bin: ['<3.0', '3.0-3.5', '3.5-4.0', '4.0-4.5', '4.5-5.0', 'Sin dato'],
  avance_bin: ['0-2', '2-4', '4-6', '6-8', '8-10', '10+', 'Sin dato'],
  icfes_bin: ['<300', '300-350', '350-400', '400+', 'Sin dato'],
}

export async function loadCube() {
  const resp = await fetch(`${import.meta.env.BASE_URL}data.json`)
  if (!resp.ok) throw new Error('No se pudo cargar data.json')
  const raw = await resp.json()
  const dims = raw.meta.dims
  const nCat = dims.length

  // Decodificar filas en objetos: { dimIdx: int, ..., n, part }
  const rows = raw.rows.map((r) => {
    const o = { n: r[nCat], part: r[nCat + 1] }
    for (let i = 0; i < nCat; i++) o[dims[i]] = r[i]
    return o
  })

  return {
    meta: raw.meta,
    dims,
    codebooks: raw.codebooks, // { dim: [cat0, cat1, ...] }
    rows,
    eventosAnio: raw.eventos_anio,
    eventosModalidadAnio: raw.eventos_modalidad_anio,
  }
}

// Ordena las categorías de una dimensión (ordinal si aplica, por nombre si no).
export function orderedCategories(dim, cats) {
  if (ORDINAL_ORDER[dim]) {
    const order = ORDINAL_ORDER[dim]
    return [...cats].sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  }
  if (dim === 'anio_mov') {
    return [...cats].sort((a, b) => {
      if (a === 'N/A') return 1
      if (b === 'N/A') return -1
      return Number(a) - Number(b)
    })
  }
  return [...cats].sort((a, b) => a.localeCompare(b, 'es'))
}

// filters: { dim: Set<catIndex> }. Una dimensión sin selección = sin filtrar.
// Devuelve las filas que satisfacen todos los filtros activos.
export function applyFilters(rows, filters, exceptDim = null) {
  const active = Object.entries(filters).filter(
    ([dim, set]) => set && set.size > 0 && dim !== exceptDim,
  )
  if (active.length === 0) return rows
  return rows.filter((row) =>
    active.every(([dim, set]) => set.has(row[dim])),
  )
}

// Suma n y part en un conjunto de filas.
export function totals(rows) {
  let n = 0, part = 0
  for (const r of rows) { n += r.n; part += r.part }
  return { n, part, tasa: n ? (100 * part) / n : 0 }
}

// Agrega por una dimensión -> [{ key, label, n, part, tasa }]
export function aggregateBy(rows, dim, codebooks) {
  const cats = codebooks[dim]
  const map = new Map()
  for (const r of rows) {
    const k = r[dim]
    const cur = map.get(k) || { n: 0, part: 0 }
    cur.n += r.n
    cur.part += r.part
    map.set(k, cur)
  }
  const out = []
  for (const [k, v] of map.entries()) {
    out.push({ key: k, label: cats[k], n: v.n, part: v.part, tasa: v.n ? (100 * v.part) / v.n : 0 })
  }
  return out
}

export function fmtInt(x) {
  return new Intl.NumberFormat('es-CO').format(Math.round(x))
}
export function fmtPct(x, d = 2) {
  return `${x.toFixed(d)}%`
}
