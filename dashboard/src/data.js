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
  icfes_mate: 'ICFES Matemáticas',
  icfes_lectura: 'ICFES Lectura crítica',
  icfes_ingles: 'ICFES Inglés',
  resultado: 'Resultado de la experiencia',
}

// Orden sugerido de categorías para dimensiones ordinales.
const ORDINAL_ORDER = {
  estrato: ['1', '2', '3', '4', '5', '6', 'Sin dato'],
  resultado: ['APROBADO', 'NO TERMINADO', 'REPROBADO', 'RETIRADO', 'PENDIENTE', 'INCOMPLETO', 'SIN INFORMACION', 'No participa'],
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
    // Bloque comparativo participantes vs. no participantes (pregrado). Es un
    // objeto {meta, numericas, categoricas, logistica} precalculado en Python
    // (src/comparative_stats.py); los componentes de Insights solo LEEN de aquí.
    comparativo: raw.comparativo || null,
    // Bloque histórico: evolución temporal de la COMPOSICIÓN de los participantes
    // por año (estrato/género/facultad/modalidad) y perfil académico medio
    // (PGA/ICFES/avance). Precalculado en Python (src/historical_stats.py); los
    // componentes solo LEEN de aquí. No es tasa de participación.
    historico: raw.historico || null,
    // Bloque histórico de TASAS: a diferencia de `historico` (composición), esto
    // SÍ es una tasa (tasa de inicio de movilidad por grupo y año = activos que
    // iniciaron movilidad ese año / activos del grupo ese año). Eje distinto del
    // histórico de composición. Precalculado en Python (src/historical_rates.py);
    // los componentes solo LEEN de aquí.
    historicoTasas: raw.historico_tasas || null,
    poblacionActiva: raw.poblacion_activa || null,
    actividad: raw.actividad || null,
    // Bloque de clustering (K-means sobre participantes de pregrado): perfiles
    // internos descriptivos. Objeto {meta, curvas, clusters, narrativa}
    // precalculado en Python (src/clustering_participantes.py); los componentes
    // solo LEEN de aquí. No se recalcula K-means en el cliente.
    clustering: raw.clustering || null,
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
//   num: { dim: { min, max, includeNA } }  // min/max en unidades REALES (las emite RangeSlider)
// }
// Devuelve las filas que satisfacen todos los filtros activos.
// `exceptDim` excluye una dimensión (para el conteo contextual de ese filtro).
// `numMeta` (cube.numMeta) se usa para convertir filters.num.{min,max}, que vienen
// en unidades REALES, a las unidades INTERNAS del cubo (entero = real * scale) antes
// de comparar contra row[dim] (entero interno). Si numMeta es null, no se convierte
// (compatibilidad defensiva: se asume que min/max ya están en unidades internas).
export function applyFilters(rows, filters, exceptDim = null, naSentinel = -1, numMeta = null) {
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
      const sc = numMeta && numMeta[dim] ? numMeta[dim].scale : 1
      const lo = Math.round(r.min * sc)
      const hi = Math.round(r.max * sc)
      if (v < lo || v > hi) return false
    }
    return true
  })
}

export function totals(rows) {
  let n = 0, part = 0
  for (const r of rows) { n += r.n; part += r.part }
  return { n, part, tasa: n ? (100 * part) / n : 0 }
}

export function filasActivas(cube, seleccion) {
  if (!cube?.actividad || !seleccion?.size) return null

  const { rows, codebooks, catDims, numDims, naSentinel, actividad } = cube
  const anios = new Set(Array.from(seleccion, (idx) => Number(codebooks.anio_mov[idx])))
  const aniosPorPatron = actividad.anios.map((patron) => new Set(patron.filter((anio) => anios.has(anio))))
  const inicioPorPerfil = rows.map((row) => Number(codebooks.anio_mov[row.anio_mov]))
  // El índice 0 corresponde a estudiantes del historial sin perfil analítico.
  const activos = new Float64Array(rows.length + 1)
  const inicios = new Float64Array(rows.length + 1)
  for (const [perfil, patron, n] of actividad.conteos) {
    const aniosActivos = aniosPorPatron[patron]
    if (!aniosActivos.size) continue
    activos[perfil + 1] += n
    if (aniosActivos.has(inicioPorPerfil[perfil])) inicios[perfil + 1] += n
  }

  const sinMovilidad = {
    anio_mov: codebooks.anio_mov.indexOf('N/A'),
    modalidad: codebooks.modalidad.indexOf('No participa'),
    resultado: codebooks.resultado.indexOf('No participa'),
    part: 0,
  }
  const sinPerfil = {
    ...Object.fromEntries(catDims.map((dim) => [dim, codebooks[dim].indexOf('Sin dato')])),
    ...Object.fromEntries(numDims.map((dim) => [dim, naSentinel])),
  }
  const filtradas = []
  if (activos[0]) filtradas.push({ ...sinPerfil, ...sinMovilidad, n: activos[0] })
  rows.forEach((row, perfil) => {
    const inicio = inicios[perfil + 1]
    const resto = activos[perfil + 1] - inicio
    if (inicio) filtradas.push({ ...row, n: inicio, part: inicio })
    if (resto) filtradas.push({ ...row, ...sinMovilidad, n: resto })
  })
  return filtradas
}

export function poblacionPorRango(poblacion, codebook, selected) {
  if (!poblacion) return null
  const { desde: primerAnio, hasta: ultimoAnio, rangos } = poblacion
  const anios = Array.from(selected || [], (idx) => Number(codebook[idx]))
    .filter(Number.isFinite)
  const desde = anios.length ? Math.min(...anios) : primerAnio
  const hasta = anios.length ? Math.max(...anios) : ultimoAnio
  const total = rangos[desde - primerAnio]?.[hasta - desde]
  if (total == null) return null
  const serie = rangos.slice(desde - primerAnio, hasta - primerAnio + 1)
    .map(([activos], idx) => ({ anio: desde + idx, activos }))
  return { desde, hasta, total, serie }
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

// Recalcula en cliente la "matriz de oportunidad" por facultad a partir de filas
// ya filtradas -> [{ facultad, n, part, noPart, tasa }].
// Umbral de volumen: se descartan facultades con menos de `minN` estudiantes para
// evitar tasas ruidosas de cohortes diminutas. Excepción: si la selección total es
// pequeña (`n` total < 200), se omite el umbral para no vaciar el gráfico.
export function aggregateOportunidad(rows, codebooks, { minN = 50 } = {}) {
  const facs = codebooks.facultad
  const map = new Map()
  let totalN = 0
  for (const r of rows) {
    const k = r.facultad
    const cur = map.get(k) || { n: 0, part: 0 }
    cur.n += r.n
    cur.part += r.part
    map.set(k, cur)
    totalN += r.n
  }
  const aplicarUmbral = totalN >= 200
  const out = []
  for (const [k, v] of map.entries()) {
    if (aplicarUmbral && v.n < minN) continue
    out.push({
      facultad: facs[k],
      n: v.n,
      part: v.part,
      noPart: v.n - v.part,
      tasa: v.n ? (100 * v.part) / v.n : 0,
    })
  }
  return out.sort((a, b) => b.n - a.n)
}

// Recalcula en cliente el mapa de calor facultad x estrato a partir de filas ya
// filtradas -> [{ facultad, estrato, n, part, tasa }].
// El heatmap RESPETA todos los filtros del sidebar (incluido `nivel`): agrega sobre
// exactamente las filas de `filtered` que recibe, sin recortar a pregrado ni a
// ningún nivel por su cuenta. Así, cambiar el filtro de nivel (p. ej. "todo menos
// maestría") sí altera el resultado.
// `estrato` se emite como label string (`codebooks.estrato`, que es
// ['1'..'6','Sin dato']) para casar con el eje fijo de Heatmap. La columna "Sin
// dato" es un índice legítimo del codebook (índice 6), NO el naSentinel numérico:
// esas filas deben caer en la columna 'Sin dato', no excluirse. Solo se descarta
// `estrato === naSentinel`, reservado para NA numérico genuino.
export function aggregateHeatmap(rows, codebooks, naSentinel = -1) {
  const facs = codebooks.facultad
  const estratos = codebooks.estrato
  const map = new Map()
  for (const r of rows) {
    if (r.estrato === naSentinel) continue
    const key = `${r.facultad}|${r.estrato}`
    const cur = map.get(key) || { facIdx: r.facultad, estIdx: r.estrato, n: 0, part: 0 }
    cur.n += r.n
    cur.part += r.part
    map.set(key, cur)
  }
  const out = []
  for (const v of map.values()) {
    out.push({
      facultad: facs[v.facIdx],
      estrato: estratos[v.estIdx],
      n: v.n,
      part: v.part,
      tasa: v.n ? (100 * v.part) / v.n : 0,
    })
  }
  return out
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
