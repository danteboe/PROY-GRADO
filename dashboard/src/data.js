// Lógica de datos del cliente: decodificación del cubo, filtrado y agregación.
//
// El cubo llega codificado. Cada fila es:
//   [idx_cat_0, ..., idx_cat_k, num_0, ..., num_m, n, part]
// donde los índices categóricos apuntan a los catálogos (`codebooks`) y los
// valores numéricos ya son enteros en la rejilla definida por el exportador
// (p. ej. PGA viene multiplicado por 100). El valor NA_SENTINEL marca "sin dato".

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
  pga: 'Promedio (PGA)',
  avance: 'Semestre de avance',
  icfes: 'Puntaje ICFES',
  edad: 'Edad',
}

// Orden sugerido de categorías para dimensiones ordinales.
const ORDINAL_ORDER = {
  estrato: ['1', '2', '3', '4', '5', '6', 'Sin dato'],
}

export async function loadCube() {
  const resp = await fetch(`${import.meta.env.BASE_URL}data.json`)
  if (!resp.ok) throw new Error('No se pudo cargar data.json')
  const raw = await resp.json()
  const catDims = raw.meta.cat_dims
  const numDims = raw.meta.num_dims
  const nCat = catDims.length
  const nNum = numDims.length

  const rows = raw.rows.map((r) => {
    const o = { n: r[nCat + nNum], part: r[nCat + nNum + 1] }
    for (let i = 0; i < nCat; i++) o[catDims[i]] = r[i]
    for (let j = 0; j < nNum; j++) o[numDims[j]] = r[nCat + j]
    return o
  })

  return {
    meta: raw.meta,
    catDims,
    numDims,
    numMeta: raw.meta.num_meta, // { dim: {scale, step, min, max, dec, unit} }
    naSentinel: raw.meta.na_sentinel,
    codebooks: raw.codebooks,
    rows,
    eventosModalidadAnio: raw.eventos_modalidad_anio,
    // Vistas agregadas adicionales (globales, para preguntas de negocio).
    oportunidad: raw.oportunidad || [],
    heatmapFacEstrato: raw.heatmap_fac_estrato || [],
    modalidadFacultad: raw.modalidad_facultad || [],
    estacionalidad: raw.estacionalidad || [],
    estacionalidadTotal: raw.estacionalidad_total || [],
    resultadoMov: raw.resultado_mov || [],
  }
}

// Convierte un valor en unidades reales a su representación interna del cubo.
export function toInternal(dim, numMeta, realValue) {
  return Math.round(realValue * numMeta[dim].scale)
}
// Convierte el valor interno del cubo a unidades reales.
export function toReal(dim, numMeta, internal) {
  return internal / numMeta[dim].scale
}

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

// filters: {
//   cat: { dim: Set<catIndex> },
//   num: { dim: { min, max, includeNA } }  // min/max en unidades INTERNAS del cubo
// }
// Devuelve las filas que satisfacen todos los filtros activos.
// `exceptDim` excluye una dimensión (para el conteo contextual de ese filtro).
export function applyFilters(rows, filters, exceptDim = null, naSentinel = -1) {
  const cat = filters.cat || {}
  const num = filters.num || {}
  const activeCat = Object.entries(cat).filter(
    ([dim, set]) => set && set.size > 0 && dim !== exceptDim,
  )
  const activeNum = Object.entries(num).filter(
    ([dim, r]) => r && dim !== exceptDim && r.active,
  )
  if (activeCat.length === 0 && activeNum.length === 0) return rows
  return rows.filter((row) => {
    for (const [dim, set] of activeCat) if (!set.has(row[dim])) return false
    for (const [dim, r] of activeNum) {
      const v = row[dim]
      if (v === naSentinel) { if (!r.includeNA) return false; else continue }
      if (v < r.min || v > r.max) return false
    }
    return true
  })
}

export function totals(rows) {
  let n = 0, part = 0
  for (const r of rows) { n += r.n; part += r.part }
  return { n, part, tasa: n ? (100 * part) / n : 0 }
}

// Agrega por una dimensión categórica -> [{ key, label, n, part, tasa }]
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

// Agrega por una dimensión numérica (en unidades reales) -> histograma ordenado.
export function aggregateByNumeric(rows, dim, numMeta, naSentinel = -1) {
  const map = new Map()
  for (const r of rows) {
    const k = r[dim]
    if (k === naSentinel) continue
    const cur = map.get(k) || { n: 0, part: 0 }
    cur.n += r.n
    cur.part += r.part
    map.set(k, cur)
  }
  const sc = numMeta[dim].scale
  const out = []
  for (const [k, v] of map.entries()) {
    out.push({
      value: k / sc,
      label: fmtReal(k / sc, numMeta[dim]),
      n: v.n, part: v.part, tasa: v.n ? (100 * v.part) / v.n : 0,
    })
  }
  return out.sort((a, b) => a.value - b.value)
}

export function fmtReal(x, meta) {
  const s = x.toFixed(meta.dec)
  return meta.unit ? `${s} ${meta.unit}` : s
}
export function fmtInt(x) {
  return new Intl.NumberFormat('es-CO').format(Math.round(x))
}
export function fmtPct(x, d = 2) {
  return `${x.toFixed(d)}%`
}
