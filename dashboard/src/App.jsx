import ChartCard from './components/ChartCard.jsx'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  loadCube, applyFilters, totals, filasActivas, poblacionPorRango, aggregateBy, aggregateByNumeric,
  aggregateOportunidad, aggregateHeatmap,
  fmtInt, fmtPct, DIM_LABELS,
} from './data.js'
import FilterGroup from './components/FilterGroup.jsx'
import RangeSlider from './components/RangeSlider.jsx'
import YearRangeSlider from './components/YearRangeSlider.jsx'
import BarRanking from './components/BarRanking.jsx'
import TemporalLine from './components/TemporalLine.jsx'
import ModalityArea from './components/ModalityArea.jsx'
import DonutParticipacion from './components/DonutParticipacion.jsx'
import CompareProfile from './components/CompareProfile.jsx'
import NumericDist from './components/NumericDist.jsx'
import OpportunityScatter from './components/OpportunityScatter.jsx'
import Heatmap from './components/Heatmap.jsx'
import StackedByFaculty from './components/StackedByFaculty.jsx'
import HistoricalComposition from './components/HistoricalComposition.jsx'
import HistoricalRates from './components/HistoricalRates.jsx'
import TemporalMean from './components/TemporalMean.jsx'
import SeasonBars from './components/SeasonBars.jsx'
import Kpi from './components/Kpi.jsx'
import CohenDChart from './components/CohenDChart.jsx'
import ComparativeBoxplots from './components/ComparativeBoxplots.jsx'
import CategoricalAssociation from './components/CategoricalAssociation.jsx'
import LogisticOddsRatios from './components/LogisticOddsRatios.jsx'
import ClusteringInsights from './components/ClusteringInsights.jsx'

const CAT_FILTER_DIMS = [
  'nivel', 'facultad', 'programa', 'genero', 'estrato',
  'tipo_admision', 'estado', 'modalidad',
]
// El buscador se habilita cuando una dimensión tiene más de UMBRAL_BUSQUEDA
// opciones, SALVO las dimensiones de SIN_BUSQUEDA (que tienen prioridad). `nivel`
// supera el umbral (10 entradas en el codebook) pero en la práctica tiene pocas
// opciones reales, así que se excluye explícitamente para no añadir ruido visual.
const UMBRAL_BUSQUEDA = 8
const SIN_BUSQUEDA = new Set(['genero', 'nivel', 'estrato'])

// Dimensiones de la tarjeta unificada de composición histórica (CAMBIO 1): una
// sola tarjeta con <select> que conmuta entre estrato/género/facultad/modalidad,
// reutilizando las series de cube.historico. `serie` es la clave dentro de
// cube.historico y `campo` la columna de categoría dentro de esa serie.
const DIMENSIONES_COMPOSICION = [
  { key: 'estrato', label: 'Estrato social', serie: 'composicion_estrato', campo: 'estrato' },
  { key: 'genero', label: 'Género', serie: 'composicion_genero', campo: 'genero' },
  { key: 'facultad', label: 'Facultad', serie: 'composicion_facultad', campo: 'facultad' },
  { key: 'modalidad', label: 'Modalidad', serie: 'composicion_modalidad', campo: 'modalidad' },
]

export default function App() {
  const [cube, setCube] = useState(null)
  const [error, setError] = useState(null)
  // filters = { cat: { dim: Set }, num: { dim: {min,max,includeNA,active} } }
  const [filters, setFilters] = useState({ cat: {}, num: {} })
  // Pestaña activa del tablero: 'explorador' (filtrable) o 'insights' (global).
  // El estado se eleva a App para que Sidebar pueda mostrar la nota contextual
  // y para que `filters` no se pierda al alternar de pestaña.
  const [tab, setTab] = useState('explorador')

  useEffect(() => {
    loadCube().then(setCube).catch((e) => setError(e.message))
  }, [])

  const toggleCat = useCallback((dim, idx) => {
    setFilters((prev) => {
      const set = new Set(prev.cat[dim] || [])
      set.has(idx) ? set.delete(idx) : set.add(idx)
      return { ...prev, cat: { ...prev.cat, [dim]: set } }
    })
  }, [])
  const clearCat = useCallback((dim) => {
    setFilters((prev) => ({ ...prev, cat: { ...prev.cat, [dim]: new Set() } }))
  }, [])
  const selectAllCat = useCallback((dim, indices) => {
    setFilters((prev) => {
      const set = new Set(prev.cat[dim] || [])
      for (const i of indices) set.add(i)
      return { ...prev, cat: { ...prev.cat, [dim]: set } }
    })
  }, [])
  const setCatSet = useCallback((dim, set) => {
    setFilters((prev) => ({ ...prev, cat: { ...prev.cat, [dim]: set } }))
  }, [])
  const setNum = useCallback((dim, range) => {
    setFilters((prev) => ({ ...prev, num: { ...prev.num, [dim]: range } }))
  }, [])
  const clearNum = useCallback((dim) => {
    setFilters((prev) => {
      const n = { ...prev.num }; delete n[dim]; return { ...prev, num: n }
    })
  }, [])
  const resetAll = useCallback(() => setFilters({ cat: {}, num: {} }), [])

  const aniosSeleccionados = filters.cat.anio_mov
  const filasDelPeriodo = useMemo(
    () => filasActivas(cube, aniosSeleccionados),
    [cube, aniosSeleccionados],
  )
  const porActividad = filasDelPeriodo !== null
  const filtrosPoblacion = useMemo(() => {
    if (!porActividad) return filters
    const { anio_mov, ...cat } = filters.cat
    return { ...filters, cat }
  }, [filters, porActividad])

  if (error) return <div className="empty">Error: {error}. Ejecuta <code>python -m src.export_dashboard</code> y vuelve a abrir.</div>
  if (!cube) return <div className="loading">Cargando datos…</div>

  const activeCount =
    Object.entries(filters.cat).reduce((a, [dim, set]) => {
      const count = set?.size || 0
      return a + (dim === 'anio_mov' ? Math.min(count, 1) : count)
    }, 0) +
    Object.values(filters.num).filter((r) => r && r.active).length

  // En la pestaña Insights NO se muestra el sidebar de filtros: sus gráficas son
  // globales y no reaccionan a los filtros, así que exponerlos daría la falsa
  // impresión de que modifican esas vistas. El Explorador sí lo muestra.
  const mostrarSidebar = tab !== 'insights'

  return (
    <div className={mostrarSidebar ? 'app' : 'app app--sin-sidebar'}>
      {mostrarSidebar && (
        <Sidebar
          cube={cube} rows={filasDelPeriodo ?? cube.rows} filters={filtrosPoblacion}
          aniosSeleccionados={aniosSeleccionados} porActividad={porActividad}
          toggleCat={toggleCat} clearCat={clearCat} selectAllCat={selectAllCat}
          setCatSet={setCatSet} setNum={setNum} clearNum={clearNum}
          resetAll={resetAll} activeCount={activeCount}
        />
      )}
      <Dashboard cube={cube} rows={filasDelPeriodo ?? cube.rows} filters={filtrosPoblacion}
                 aniosSeleccionados={aniosSeleccionados} porActividad={porActividad}
                 toggleCat={toggleCat} tab={tab} setTab={setTab} />
    </div>
  )
}

function Sidebar({ cube, rows, filters, aniosSeleccionados, porActividad,
                   toggleCat, clearCat, selectAllCat, setCatSet, setNum, clearNum, resetAll, activeCount }) {
  // El buscador se muestra si la dimensión supera el umbral de opciones y no está
  // en la lista de exclusión (ver UMBRAL_BUSQUEDA / SIN_BUSQUEDA).
  const esBuscable = (dim) =>
    !SIN_BUSQUEDA.has(dim) && cube.codebooks[dim].length > UMBRAL_BUSQUEDA
  // Conteo contextual por dimensión categórica: cuenta aplicando los DEMÁS
  // filtros. Guarda {n, part}; el filtro muestra `part` (participantes).
  const countsByDim = useMemo(() => {
    const result = {}
    for (const dim of CAT_FILTER_DIMS) {
      const seleccion = applyFilters(rows, filters, dim, cube.naSentinel, cube.numMeta)
      const m = new Map()
      for (const r of seleccion) {
        const c = m.get(r[dim]) || { n: 0, part: 0 }
        c.n += r.n; c.part += r.part
        m.set(r[dim], c)
      }
      result[dim] = m
    }
    return result
  }, [cube, rows, filters])

  return (
    <aside className="sidebar">
      <h1>Participación en internacionalización</h1>
      <div className="subtitle">Explorador descriptivo · Universidad de los Andes</div>
      <button className="btn-reset" onClick={resetAll} disabled={activeCount === 0}>
        {activeCount === 0 ? 'Sin filtros activos' : `Limpiar ${activeCount} filtro(s)`}
      </button>
      <div className="sidebar-note">
        El número junto a cada opción indica {porActividad
          ? 'estudiantes que iniciaron movilidad en el periodo.'
          : 'estudiantes con experiencia de internacionalización.'}
      </div>

      {CAT_FILTER_DIMS.map((dim) => (
        <FilterGroup
          key={dim}
          dim={dim}
          label={DIM_LABELS[dim]}
          codebooks={cube.codebooks}
          counts={countsByDim[dim]}
          selected={filters.cat[dim] || new Set()}
          onToggle={toggleCat}
          onClear={clearCat}
          onSelectAll={selectAllCat}
          searchable={esBuscable(dim)}
          porActividad={porActividad}
        />
      ))}

      <div className="sidebar-section">Rango temporal</div>
      <YearRangeSlider
        label={cube.actividad ? 'Año de actividad académica' : DIM_LABELS.anio_mov}
        codebook={cube.codebooks.anio_mov}
        selected={aniosSeleccionados || new Set()}
        academic={Boolean(cube.actividad)}
        onChange={(set) => setCatSet('anio_mov', set)}
        onClear={() => clearCat('anio_mov')}
      />

      <div className="sidebar-section">Variables numéricas</div>
      {cube.numDims.map((dim) => (
        <RangeSlider
          key={dim}
          label={DIM_LABELS[dim]}
          meta={cube.numMeta[dim]}
          value={filters.num[dim]}
          onChange={(r) => setNum(dim, r)}
          onClear={() => clearNum(dim)}
        />
      ))}
    </aside>
  )
}

function Dashboard({ cube, rows, filters, aniosSeleccionados, porActividad, toggleCat, tab, setTab }) {
  // Dimensión activa de la tarjeta unificada de composición histórica (CAMBIO 1).
  const [dimComp, setDimComp] = useState('estrato')
  // Navegación por teclado entre pestañas (flechas izquierda/derecha).
  const onTabKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = tab === 'explorador' ? 'insights' : 'explorador'
    setTab(next)
    const el = document.getElementById(`tab-${next}`)
    if (el) el.focus()
  }
  const filtered = useMemo(
    () => applyFilters(rows, filters, null, cube.naSentinel, cube.numMeta),
    [cube, rows, filters],
  )
  const t = useMemo(() => totals(filtered), [filtered])
  const base = useMemo(() => totals(cube.rows), [cube])
  const poblacion = useMemo(
    () => poblacionPorRango(cube.poblacionActiva, cube.codebooks.anio_mov, aniosSeleccionados),
    [cube, aniosSeleccionados],
  )
  const movilidadPorAnio = Boolean(aniosSeleccionados?.size)
  const rangoPoblacion = poblacion && (
    poblacion.desde === poblacion.hasta ? poblacion.desde : `${poblacion.desde}–${poblacion.hasta}`
  )
  const grupos = porActividad
    ? ['Iniciaron movilidad', 'Sin inicio de movilidad']
    : ['Con internacionalización', 'Sin internacionalización']

  const porFacultad = useMemo(() => aggregateBy(filtered, 'facultad', cube.codebooks), [filtered, cube])
  const porPrograma = useMemo(() => aggregateBy(filtered, 'programa', cube.codebooks), [filtered, cube])
  const porModalidad = useMemo(
    () => aggregateBy(filtered, 'modalidad', cube.codebooks).filter((d) => d.label !== 'No participa'),
    [filtered, cube],
  )
  const porEstrato = useMemo(() => aggregateBy(filtered, 'estrato', cube.codebooks), [filtered, cube])
  const porTipoAdm = useMemo(() => aggregateBy(filtered, 'tipo_admision', cube.codebooks), [filtered, cube])
  const porGenero = useMemo(() => aggregateBy(filtered, 'genero', cube.codebooks), [filtered, cube])
  const porNivel = useMemo(() => aggregateBy(filtered, 'nivel', cube.codebooks), [filtered, cube])

  // Distribuciones numéricas (barras + tasa).
  const distPga = useMemo(() => aggregateByNumeric(filtered, 'pga', cube.numMeta, cube.naSentinel), [filtered, cube])
  const distAvance = useMemo(() => aggregateByNumeric(filtered, 'avance', cube.numMeta, cube.naSentinel), [filtered, cube])
  const distIcfes = useMemo(() => aggregateByNumeric(filtered, 'icfes', cube.numMeta, cube.naSentinel), [filtered, cube])
  const distEdad = useMemo(() => aggregateByNumeric(filtered, 'edad', cube.numMeta, cube.naSentinel), [filtered, cube])

  // Serie temporal: estudiantes cuyo primer evento ocurrió en cada año.
  const serieTemporal = useMemo(() => {
    return aggregateBy(filtered, 'anio_mov', cube.codebooks)
      .filter((d) => d.label !== 'N/A' && d.label !== 'Sin dato' && Number(d.label) >= 2002)
      .map((d) => ({ anio: Number(d.label), eventos: d.part }))
      .sort((a, b) => a.anio - b.anio)
  }, [filtered, cube])

  // Lista de modalidades del histórico global (del cubo), usada por el gráfico de
  // modalidad por facultad (StackedByFaculty) en Insights.
  const modalities = useMemo(
    () => [...new Set(cube.eventosModalidadAnio.map((r) => r.modalidad))],
    [cube],
  )

  // Composición de modalidades por año DERIVADA de la selección (Explorador):
  // pivotea anio_mov x modalidad sobre `part` (cuenta ESTUDIANTES: modalidad
  // principal y año del primer evento, no eventos). Excluye el año 'N/A'/'Sin dato'
  // y la categoría de modalidad 'No participa'. Reacciona a todos los filtros.
  const modalidadesSel = useMemo(() => {
    const cats = cube.codebooks.modalidad
    return cats
      .map((label, idx) => ({ label, idx }))
      .filter((m) => m.label !== 'No participa')
  }, [cube])
  const modalidadTemporalSel = useMemo(() => {
    const anios = cube.codebooks.anio_mov
    const mods = cube.codebooks.modalidad
    const byAnio = new Map()
    for (const r of filtered) {
      if (!r.part) continue
      const anioLabel = anios[r.anio_mov]
      if (anioLabel == null || anioLabel === 'N/A' || anioLabel === 'Sin dato') continue
      const modLabel = mods[r.modalidad]
      if (modLabel === 'No participa') continue
      const anioNum = Number(anioLabel)
      if (!Number.isFinite(anioNum)) continue
      const o = byAnio.get(anioNum) || { anio: anioNum }
      o[modLabel] = (o[modLabel] || 0) + r.part
      byAnio.set(anioNum, o)
    }
    const out = [...byAnio.values()].sort((a, b) => a.anio - b.anio)
    for (const row of out) {
      for (const m of modalidadesSel) if (row[m.label] == null) row[m.label] = 0
    }
    return out
  }, [filtered, cube, modalidadesSel])

  // Resultado de la experiencia DERIVADO de la selección (Explorador): agrega la
  // dim categórica 'resultado' (resultado del PRIMER evento por estudiante) y
  // excluye 'No participa'. Reacciona a todos los filtros.
  const resultadoSel = useMemo(
    () => aggregateBy(filtered, 'resultado', cube.codebooks)
      .filter((d) => d.label !== 'No participa')
      .map((d) => ({ resultado: d.label, n: d.n })),
    [filtered, cube],
  )

  // ---- Preguntas de negocio recalculadas en cliente desde la selección ----
  // Matriz de oportunidad por facultad (n, part, noPart, tasa) y mapa de calor
  // facultad x estrato, ambos derivados de `filtered` (respetan todos los filtros,
  // incluido el de nivel académico).
  const oportunidadSel = useMemo(
    () => aggregateOportunidad(filtered, cube.codebooks),
    [filtered, cube],
  )
  const heatmapSel = useMemo(
    () => aggregateHeatmap(filtered, cube.codebooks, cube.naSentinel),
    [filtered, cube],
  )

  // ---- Vistas históricas globales (dependen de datos a nivel de evento) ----
  const modFacData = useMemo(() => {
    // modalidad x facultad -> [{facultad, <mod>:n, ...}] con todas las modalidades
    const byFac = new Map()
    for (const r of cube.modalidadFacultad) {
      const o = byFac.get(r.facultad) || { facultad: r.facultad, _tot: 0 }
      o[r.modalidad] = r.n; o._tot += r.n
      byFac.set(r.facultad, o)
    }
    const arr = [...byFac.values()].sort((a, b) => b._tot - a._tot)
    for (const row of arr) for (const m of modalities) if (row[m] == null) row[m] = 0
    return arr
  }, [cube, modalities])

  const seasonData = useMemo(() => {
    const byAnio = new Map()
    for (const r of cube.estacionalidad) {
      const o = byAnio.get(r.anio) || { anio: r.anio }
      o[r.sem] = r.n
      byAnio.set(r.anio, o)
    }
    const arr = [...byAnio.values()].sort((a, b) => a.anio - b.anio)
    for (const row of arr) {
      if (row['Primer semestre'] == null) row['Primer semestre'] = 0
      if (row['Segundo semestre'] == null) row['Segundo semestre'] = 0
    }
    return arr
  }, [cube])

  // ---- Vistas históricas de COMPOSICIÓN (cube.historico, del exportador) ----
  // Pivotea una serie [{anio, <dimKey>, n, pct}, ...] a filas de recharts
  // {anio, <categoria>:pct, <categoria>__n:n}, rellenando 0 las categorías
  // ausentes por año (mismo patrón que modalidadTemporal/seasonData). Devuelve
  // { rows, categories }. El pct llega 0..100 desde Python; recharts stackOffset
  // 'expand' renormaliza, así que basta con pasar el pct tal cual.
  const pivotComposicion = (serie, dimKey) => {
    if (!serie || !serie.length) return { rows: [], categories: [] }
    const categories = [...new Set(serie.map((r) => r[dimKey]))]
    const byAnio = new Map()
    for (const r of serie) {
      const o = byAnio.get(r.anio) || { anio: r.anio }
      o[r[dimKey]] = r.pct
      o[`${r[dimKey]}__n`] = r.n
      byAnio.set(r.anio, o)
    }
    const rows = [...byAnio.values()].sort((a, b) => a.anio - b.anio)
    for (const row of rows) {
      for (const c of categories) {
        if (row[c] == null) row[c] = 0
        if (row[`${c}__n`] == null) row[`${c}__n`] = 0
      }
    }
    return { rows, categories }
  }

  // Tarjeta unificada de composición (CAMBIO 1): una sola serie derivada de la
  // dimensión activa del <select>, pivoteada con el pivotComposicion EXISTENTE.
  const dimCompActiva = DIMENSIONES_COMPOSICION.find((d) => d.key === dimComp)
    || DIMENSIONES_COMPOSICION[0]
  const histComp = useMemo(
    () => pivotComposicion(cube.historico?.[dimCompActiva.serie], dimCompActiva.campo),
    [cube, dimComp],
  )
  const histNumerico = cube.historico?.resumen_numerico || null
  const tieneHistorico = cube.historico != null

  // Perfil comparado participantes vs no participantes sobre una dimensión:
  // qué % de cada grupo cae en cada categoría.
  const compareOn = (dim, topN = 6) => {
    const agg = aggregateBy(filtered, dim, cube.codebooks)
    const totPart = agg.reduce((a, d) => a + d.part, 0)
    const totNo = agg.reduce((a, d) => a + (d.n - d.part), 0)
    return agg
      .map((d) => ({
        label: d.label,
        _vol: d.n,
        pctPart: totPart ? (100 * d.part) / totPart : 0,
        pctNo: totNo ? (100 * (d.n - d.part)) / totNo : 0,
      }))
      .sort((a, b) => b._vol - a._vol)
      .slice(0, topN)
  }
  const cmpEstrato = useMemo(() => {
    const r = compareOn('estrato', 7)
    const ord = ['1', '2', '3', '4', '5', '6', 'Sin dato']
    return r.sort((a, b) => ord.indexOf(a.label) - ord.indexOf(b.label))
  }, [filtered, cube])
  const cmpFacultad = useMemo(() => compareOn('facultad', 8), [filtered, cube])
  const cmpAdmision = useMemo(() => compareOn('tipo_admision', 6), [filtered, cube])

  const facIdxSel = filters.cat.facultad
  const progIdxSel = filters.cat.programa

  return (
    <main className="main">
      <div className="tabs" role="tablist" aria-label="Vistas del tablero">
        <button
          type="button" role="tab" id="tab-explorador"
          className={tab === 'explorador' ? 'tab active' : 'tab'}
          aria-selected={tab === 'explorador'} aria-controls="panel-explorador"
          tabIndex={tab === 'explorador' ? 0 : -1}
          onClick={() => setTab('explorador')} onKeyDown={onTabKeyDown}
        >
          Explorador
        </button>
        <button
          type="button" role="tab" id="tab-insights"
          className={tab === 'insights' ? 'tab active' : 'tab'}
          aria-selected={tab === 'insights'} aria-controls="panel-insights"
          tabIndex={tab === 'insights' ? 0 : -1}
          onClick={() => setTab('insights')} onKeyDown={onTabKeyDown}
        >
          Insights
        </button>
      </div>

      <section
        id="panel-explorador" role="tabpanel" aria-labelledby="tab-explorador"
        className="tabpanel" hidden={tab !== 'explorador'}
      >
      <div className="main-head">
        <h2>Explorador de participación estudiantil en internacionalización</h2>
        <p>
          Herramienta descriptiva: filtra por cualquier combinación de dimensiones
          (incluye <strong>sliders de rango</strong> para las variables numéricas, con
          entrada manual en cada extremo). Todos los indicadores y gráficos se recalculan
          en vivo. Las barras muestran su valor directamente; cada gráfico de ranking indica
          el <strong>Total</strong>. Haz clic en una barra de facultad o programa para
          filtrar por ella. Las vistas globales del histórico están en la pestaña
          <strong> Insights</strong>.
        </p>
        {porActividad && (
          <p>
            Cada estudiante con actividad registrada en el rango cuenta una vez. La tasa mide
            qué proporción inició movilidad en un año en que también registró actividad académica.
            Los atributos de perfil corresponden al registro consolidado de cada estudiante.
          </p>
        )}
      </div>

      <div className="kpis">
        {poblacion && !porActividad && (
          <Kpi value={fmtInt(poblacion.total)} label="Total de estudiantes activos"
               sub={`${rangoPoblacion} · toda la Universidad`} />
        )}
        {porActividad ? (
          <Kpi value={fmtInt(t.n)} label="Estudiantes activos (selección)"
               sub={`Periodo ${rangoPoblacion}`} />
        ) : (!movilidadPorAnio || !poblacion) && (
          <Kpi value={fmtInt(t.n)} label="Estudiantes (selección)"
               sub={`${fmtPct(100 * t.n / base.n, 1)} del total`} />
        )}
        <Kpi value={fmtInt(t.part)}
             label={movilidadPorAnio ? 'Primeras movilidades (selección)' : 'Con internacionalización'} />
        {porActividad ? (
          <Kpi value={t.n ? fmtPct(t.tasa) : '—'} label="Tasa de inicio en el periodo" />
        ) : !movilidadPorAnio && (
          <Kpi value={fmtPct(t.tasa)} label="Tasa de participación"
               sub={`Global: ${fmtPct(base.tasa)}`} />
        )}
        <Kpi value={fmtInt(cube.meta.n_eventos)} label="Eventos de movilidad (histórico)" />
      </div>

      <TemporalLine
        title="Evolución temporal de la movilidad"
        subtitle="Estudiantes cuyo primer evento de movilidad ocurrió en cada año (según la selección)."
        data={serieTemporal}
        dataKey="eventos" seriesLabel="Primeras movilidades" pandemic
      />
      {poblacion && (
        <TemporalLine
          title="Estudiantes activos por año"
          subtitle={`Toda la Universidad. ${fmtInt(poblacion.total)} estudiantes únicos en ${rangoPoblacion}. Cada punto cuenta a quienes registraron actividad académica ese año.`}
          data={poblacion.serie}
          dataKey="activos" seriesLabel="Estudiantes activos"
        />
      )}

      {/* Comparaciones participantes vs no participantes */}
      <div className="section-title">{porActividad ? 'Inicio de movilidad en el periodo' : 'Participantes vs. no participantes'}</div>
      <div className="grid">
        <DonutParticipacion
          title="Composición de la selección"
          subtitle={porActividad
            ? 'Qué fracción de los estudiantes activos de la selección inició movilidad en el periodo.'
            : 'Qué fracción de los estudiantes filtrados tuvo internacionalización.'}
          totals={t}
          grupos={grupos}
        />
        <CompareProfile
          title="Perfil por estrato social"
          subtitle="Distribución (%) dentro de cada grupo. ¿De qué estratos provienen?"
          rows={cmpEstrato}
          grupos={grupos}
        />
        <CompareProfile
          title="Perfil por facultad"
          subtitle="¿Se concentran los dos grupos en facultades distintas?"
          rows={cmpFacultad}
          grupos={grupos}
        />
        <CompareProfile
          title="Perfil por tipo de admisión"
          subtitle="Distribución de las vías de ingreso dentro de cada grupo."
          rows={cmpAdmision}
          grupos={grupos}
        />
      </div>

      {/* Distribuciones numéricas con tasa de participación */}
      <div className="section-title">Distribuciones y tasa de participación</div>
      <div className="grid">
        <NumericDist title="Promedio acumulado (PGA)"
                     subtitle="Barras: estudiantes. Línea: tasa de participación."
                     data={distPga} barColor="#2563eb" />
        <NumericDist title="Semestre de avance"
                     subtitle="Distribución del semestre de avance registrado."
                     data={distAvance} barColor="#0f766e" />
        <NumericDist title="Puntaje ICFES"
                     subtitle="Relación entre puntaje de ingreso y participación."
                     data={distIcfes} barColor="#9333ea" />
        <NumericDist title="Edad"
                     subtitle="Distribución etaria y participación."
                     data={distEdad} barColor="#d97706" />
      </div>

      {/* Rankings categóricos */}
      <div className="section-title">Participación por categorías</div>
      <div className="grid">
        <BarRanking
          title="Participación por facultad"
          subtitle="Clic en una barra para filtrar."
          data={porFacultad}
          onBarClick={(key) => toggleCat('facultad', key)}
          selectedKeys={facIdxSel}
        />
        <BarRanking
          title="Participación por programa"
          subtitle="Top programas de la selección. Clic para filtrar."
          data={porPrograma}
          topN={14}
          onBarClick={(key) => toggleCat('programa', key)}
          selectedKeys={progIdxSel}
        />
        <BarRanking
          title="Modalidades de movilidad"
          subtitle="Composición de la participación por tipo de experiencia."
          data={porModalidad}
          defaultMetric="part"
          metrics={['part', 'n']}
          topN={8}
        />
        <BarRanking
          title="Participación por estrato social"
          subtitle="Lectura de equidad (asociación, no causa)."
          data={porEstrato}
          defaultMetric="tasa"
          topN={7}
        />
        <BarRanking
          title="Participación por tipo de admisión"
          subtitle="Vía de ingreso a la Universidad."
          data={porTipoAdm}
          defaultMetric="tasa"
          topN={8}
        />
        <BarRanking
          title="Participación por género"
          subtitle="Número y tasa por género."
          data={porGenero}
          defaultMetric="tasa"
          topN={3}
        />
        <BarRanking
          title="Participación por nivel académico"
          subtitle="Pregrado, maestría, especialización, etc."
          data={porNivel}
          defaultMetric="part"
          metrics={['part', 'n', 'tasa']}
          topN={8}
        />
      </div>

      {/* Oportunidad y equidad, recalculadas desde la selección activa */}
      <div className="section-title">Oportunidad y equidad (según la selección)</div>
      <OpportunityScatter
        title="¿Dónde está el mayor potencial de crecimiento? (por facultad)"
        subtitle={porActividad
          ? 'Volumen de estudiantes activos vs. tasa de inicio. El tamaño indica cuántos no iniciaron movilidad en el periodo.'
          : 'Volumen de estudiantes vs. tasa de participación. El tamaño indica cuántos estudiantes aún no participan.'}
        data={oportunidadSel}
        avgRate={t.tasa}
        sinParticiparLabel={porActividad ? 'Sin inicio en el periodo' : 'No participan'}
      />
      <Heatmap
        title="Brecha socioeconómica dentro de cada facultad"
        subtitle="Tasa de participación (%) por facultad y estrato, según la selección actual (incluye el filtro de nivel académico)."
        data={heatmapSel}
      />

      {/* Modalidad por año y Resultado, movidos desde Insights al Explorador para
          que respondan a los filtros (item 15 de FEAT-002). */}
      <div className="section-title">Modalidad y resultado (según la selección)</div>
      <ModalityArea
        title="Composición de modalidades por año"
        subtitle="Según la selección. Cuenta ESTUDIANTES por su modalidad principal y el año de su primer evento de movilidad (no eventos). Excluye el año sin dato."
        data={modalidadTemporalSel}
        modalities={modalidadesSel.map((m) => m.label)}
      />
      <div className="grid">
        <DonutResultado resultado={resultadoSel} />
      </div>

      <p className="footnote">
        Fuente: registros académicos anonimizados de la Universidad de los Andes. La señal de
        internacionalización se deriva de cursos de movilidad en la historia académica. Los datos
        se presentan agregados; no se exponen registros individuales (principio de minimización de
        datos, Ley 1581 de 2012). Las asociaciones mostradas no implican causalidad.
        <br />
        Nota: no se dispone de datos del <strong>destino</strong> del convenio de movilidad
        (país o institución de acogida), por lo que el Explorador no incluye un filtro ni un
        ranking geográfico. Capturar esa información sería un siguiente paso valioso.
      </p>
      </section>

      <section
        id="panel-insights" role="tabpanel" aria-labelledby="tab-insights"
        className="tabpanel" hidden={tab !== 'insights'}
      >
      <div className="main-head">
        <h2>Insights: hallazgos del histórico completo</h2>
        <p>
          Estas vistas son <strong>agregados del histórico completo</strong> de eventos de
          movilidad y <strong>no se ven afectadas por los filtros</strong> del Explorador.
          Resumen los hallazgos principales del proyecto. Las series temporales describen la{' '}
          <strong>composición de los participantes</strong> de cada año y el{' '}
          <strong>perfil académico medio</strong> (PGA/ICFES/avance) de esas cohortes; no son
          tasas de participación (los no participantes no tienen año asignado).
        </p>
      </div>

      {/* Bloque comparativo participantes vs. no participantes (pregrado). Lee
          valores precalculados de cube.comparativo; es independiente de los
          filtros, igual que el resto de la pestaña Insights. */}
      <ComparativoInsights comparativo={cube.comparativo} />

      {/* Evolución temporal: composición de los participantes de cada año y
          perfil académico medio de esas cohortes. NO es tasa de participación
          (los no participantes no tienen año asignado). */}
      <div className="section-title">Evolución de los participantes en el tiempo</div>
      {tieneHistorico ? (
        <>
          <HistoricalComposition
            title="Composición de los participantes por año — no es proporción de participación"
            subtitle={
              `De los participantes cuyo primer evento de movilidad ocurrió en cada año, qué fracción corresponde a cada categoría de ${dimCompActiva.label.toLowerCase()}. Composición de la cohorte de participantes, no proporción de participación por grupo.` +
              (dimCompActiva.key === 'modalidad'
                ? ''
                : " Excluye 'Sin dato' y cada año renormaliza a 100%.")
            }
            data={histComp.rows}
            categories={histComp.categories}
            note="Composición de los participantes de cada año (no es proporción de participación: los no participantes no tienen año asignado). Asociación observada, no causa."
            toggle={
              <label className="metric-toggle" style={{ marginLeft: 'auto' }}>
                <select
                  className="toggle-btn"
                  value={dimComp} onChange={(e) => setDimComp(e.target.value)}
                  aria-label="Seleccionar dimensión de composición"
                >
                  {DIMENSIONES_COMPOSICION.map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
              </label>
            }
          />
          <TemporalMean
            title="Perfil académico medio de los participantes por año — no es tasa de participación"
            subtitle="Media y banda de cuartiles (Q1–Q3) del perfil académico de las cohortes de participantes, por año de su primer evento de movilidad. Describe cómo cambia el perfil medio, no la proporción de participación."
            series={histNumerico}
          />
        </>
      ) : (
        <div className="card wide">
          <p className="card-sub" style={{ margin: 0 }}>
            Sin datos históricos disponibles. Ejecuta <code>python -m src.export_dashboard</code> para
            regenerar <code>data.json</code> con la clave <code>historico</code>.
          </p>
        </div>
      )}

      {/* Tasa de inicio de movilidad por grupo y año (CAMBIO 2): SÍ es una tasa
          (eje distinto del histórico de composición). Lee cube.historicoTasas,
          precalculado en Python (src/historical_rates.py). */}
      <div className="section-title">Participación relativa en el tiempo (tasa de inicio por año)</div>
      {cube.historicoTasas ? (
        <HistoricalRates rates={cube.historicoTasas} />
      ) : (
        <div className="card wide">
          <p className="card-sub">
            Sin datos de tasas. Ejecuta <code>python -m src.export_dashboard</code> para regenerar
            data.json con la clave <code>historico_tasas</code>.
          </p>
        </div>
      )}

      {/* Perfiles internos de los participantes (K-means). Lee cube.clustering,
          precalculado en Python (src/clustering_participantes.py); los componentes
          solo LEEN de aquí. No se recalcula K-means en el cliente. */}
      <div className="section-title">Perfiles de los participantes (clustering)</div>
      <ClusteringInsights clustering={cube.clustering} />

      <div className="section-title">Panorama histórico de la movilidad</div>

      <div className="section-title">
        ¿Qué modalidad prefiere cada facultad?
      </div>
      <StackedByFaculty
        title="¿Qué modalidad prefiere cada facultad?"
        subtitle="Composición (%) de los eventos de movilidad por facultad."
        data={modFacData}
        modalities={modalities}
      />

      <div className="section-title">
        Estacionalidad de la experiencia
      </div>
      <div className="grid">
        <SeasonBars
          title="Estacionalidad: ¿en qué semestre se sale más?"
          subtitle="Eventos por año, separando primer y segundo semestre."
          data={seasonData}
        />
      </div>
      <p className="card-sub" style={{ marginTop: 8 }}>
        La composición de modalidades por año y el resultado de la experiencia se
        movieron a la pestaña <strong>Explorador</strong>, donde ahora responden a los
        filtros.
      </p>
      </section>
    </main>
  )
}

// Bloque de Insights que responde "¿qué diferencia a quienes participan?" para
// pregrado. Reúne el resumen narrativo precalculado, el gráfico de d de Cohen, los
// boxplots comparativos, las tasas por categoría (con V de Cramér) y, cuando está
// disponible, el forest-plot de la regresión logística. Si `comparativo` es null,
// muestra un placeholder sin romper el resto de la pestaña.
function ComparativoInsights({ comparativo }) {
  if (!comparativo) {
    return (
      <>
        <div className="section-title">
          ¿Qué diferencia a quienes participan? (pregrado)
        </div>
        <div className="card wide"><p className="card-sub" style={{ margin: 0 }}>Sin datos comparativos.</p></div>
      </>
    )
  }

  const meta = comparativo.meta || {}
  // El resumen narrativo es prosa en español sin lenguaje causal, interpolada en
  // Python desde las mismas cifras del contrato. Si faltara, se degrada a un
  // párrafo neutral sin números.
  const narrativa = meta.resumen_narrativo ||
    'En pregrado se comparan participantes y no participantes de internacionalización ' +
    'sobre variables académicas, demográficas y socioeconómicas. Las diferencias se ' +
    'reportan como asociaciones, no como relaciones de causa a efecto.'

  return (
    <>
      <div className="section-title">
        ¿Qué diferencia a quienes participan? (pregrado)
      </div>
      <div className="card wide">
        <p className="card-sub" style={{ margin: 0, lineHeight: 1.55 }}>{narrativa}</p>
      </div>
      <CohenDChart data={comparativo.numericas} />
      <ComparativeBoxplots data={comparativo.numericas} />
      <CategoricalAssociation
        data={comparativo.categoricas}
        tasaBase={meta.tasa_base_pct}
      />
      <LogisticOddsRatios data={comparativo.logistica} />
    </>
  )
}

// Donut del resultado académico de la experiencia de movilidad.
function DonutResultado({ resultado }) {
  const COLORS = {
    'APROBADO': '#0f766e', 'NO TERMINADO': '#d97706', 'REPROBADO': '#dc2626',
    'RETIRADO': '#9333ea', 'SIN INFORMACION': '#94a3b8', 'PENDIENTE': '#64748b',
    'INCOMPLETO': '#cbd5e1',
  }
  const total = resultado.reduce((a, r) => a + r.n, 0)
  const data = resultado.map((r) => ({ name: r.resultado, value: r.n, color: COLORS[r.resultado] || '#94a3b8' }))
  const aprob = resultado.find((r) => r.resultado === 'APROBADO')
  const pctAprob = aprob && total ? (100 * aprob.n) / total : 0
  const tip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null
    const d = payload[0]
    return (
      <div className="custom-tooltip">
        <div className="tt-title">{d.name}</div>
        <div className="tt-row"><span className="tt-k">Eventos</span><span>{fmtInt(d.value)}</span></div>
        <div className="tt-row"><span className="tt-k">Porcentaje</span><span>{fmtPct(total ? 100 * d.value / total : 0)}</span></div>
      </div>
    )
  }
  return (
    <ChartCard>
      <h3>¿Terminan bien la experiencia?</h3>
      <p className="card-sub">Resultado académico del curso de movilidad.</p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}
               paddingAngle={2} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip content={tip} />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center-note">{fmtPct(pctAprob, 1)} de las experiencias se aprueban</div>
    </ChartCard>
  )
}
