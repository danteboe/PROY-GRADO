import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  loadCube, applyFilters, totals, aggregateBy, aggregateByNumeric,
  fmtInt, fmtPct, DIM_LABELS,
} from './data.js'
import FilterGroup from './components/FilterGroup.jsx'
import RangeSlider from './components/RangeSlider.jsx'
import BarRanking from './components/BarRanking.jsx'
import TemporalLine from './components/TemporalLine.jsx'
import ModalityArea from './components/ModalityArea.jsx'
import DonutParticipacion from './components/DonutParticipacion.jsx'
import CompareProfile from './components/CompareProfile.jsx'
import NumericDist from './components/NumericDist.jsx'
import Kpi from './components/Kpi.jsx'

const CAT_FILTER_DIMS = [
  'nivel', 'facultad', 'programa', 'genero', 'estrato',
  'tipo_admision', 'estado', 'modalidad',
]
const SEARCHABLE = new Set(['programa', 'tipo_admision', 'estado'])

export default function App() {
  const [cube, setCube] = useState(null)
  const [error, setError] = useState(null)
  // filters = { cat: { dim: Set }, num: { dim: {min,max,includeNA,active} } }
  const [filters, setFilters] = useState({ cat: {}, num: {} })

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
  const setNum = useCallback((dim, range) => {
    setFilters((prev) => ({ ...prev, num: { ...prev.num, [dim]: range } }))
  }, [])
  const clearNum = useCallback((dim) => {
    setFilters((prev) => {
      const n = { ...prev.num }; delete n[dim]; return { ...prev, num: n }
    })
  }, [])
  const resetAll = useCallback(() => setFilters({ cat: {}, num: {} }), [])

  if (error) return <div className="empty">Error: {error}. Ejecuta <code>python -m src.export_dashboard</code> y vuelve a abrir.</div>
  if (!cube) return <div className="loading">Cargando datos…</div>

  const activeCount =
    Object.values(filters.cat).reduce((a, s) => a + (s ? s.size : 0), 0) +
    Object.values(filters.num).filter((r) => r && r.active).length

  return (
    <div className="app">
      <Sidebar
        cube={cube} filters={filters}
        toggleCat={toggleCat} clearCat={clearCat} setNum={setNum} clearNum={clearNum}
        resetAll={resetAll} activeCount={activeCount}
      />
      <Dashboard cube={cube} filters={filters} toggleCat={toggleCat} />
    </div>
  )
}

function Sidebar({ cube, filters, toggleCat, clearCat, setNum, clearNum, resetAll, activeCount }) {
  // Conteo contextual por dimensión categórica: cuenta aplicando los DEMÁS
  // filtros. Guarda {n, part}; el filtro muestra `part` (participantes).
  const countsByDim = useMemo(() => {
    const result = {}
    for (const dim of CAT_FILTER_DIMS) {
      const rows = applyFilters(cube.rows, filters, dim, cube.naSentinel)
      const m = new Map()
      for (const r of rows) {
        const c = m.get(r[dim]) || { n: 0, part: 0 }
        c.n += r.n; c.part += r.part
        m.set(r[dim], c)
      }
      result[dim] = m
    }
    return result
  }, [cube, filters])

  return (
    <aside className="sidebar">
      <h1>Participación en internacionalización</h1>
      <div className="subtitle">Explorador descriptivo · Universidad de los Andes</div>
      <button className="btn-reset" onClick={resetAll} disabled={activeCount === 0}>
        {activeCount === 0 ? 'Sin filtros activos' : `Limpiar ${activeCount} filtro(s)`}
      </button>
      <div className="sidebar-note">
        El número junto a cada opción indica estudiantes <strong>con</strong> experiencia
        de internacionalización.
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
          searchable={SEARCHABLE.has(dim)}
        />
      ))}

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

function Dashboard({ cube, filters, toggleCat }) {
  const filtered = useMemo(
    () => applyFilters(cube.rows, filters, null, cube.naSentinel),
    [cube, filters],
  )
  const t = useMemo(() => totals(filtered), [filtered])
  const base = useMemo(() => totals(cube.rows), [cube])

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

  // Composición de modalidades en el tiempo (histórico global, del cubo).
  const modalities = useMemo(
    () => [...new Set(cube.eventosModalidadAnio.map((r) => r.modalidad))],
    [cube],
  )
  const modalidadTemporal = useMemo(() => {
    const byAnio = new Map()
    for (const r of cube.eventosModalidadAnio) {
      const o = byAnio.get(r.anio) || { anio: r.anio }
      o[r.modalidad] = r.n
      byAnio.set(r.anio, o)
    }
    return [...byAnio.values()].sort((a, b) => a.anio - b.anio)
  }, [cube])

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
      <div className="main-head">
        <h2>Explorador de participación estudiantil en internacionalización</h2>
        <p>
          Herramienta descriptiva: filtra por cualquier combinación de dimensiones
          (incluye <strong>sliders de rango</strong> para las variables numéricas, con
          entrada manual en cada extremo). Todos los indicadores y gráficos se recalculan
          en vivo. Las barras muestran su valor directamente; cada gráfico de ranking indica
          el <strong>Total</strong>. Haz clic en una barra de facultad o programa para
          filtrar por ella.
        </p>
      </div>

      <div className="kpis">
        <Kpi value={fmtInt(t.n)} label="Estudiantes (selección)"
             sub={`${fmtPct(100 * t.n / base.n, 1)} del total`} />
        <Kpi value={fmtInt(t.part)} label="Con internacionalización" />
        <Kpi value={fmtPct(t.tasa)} label="Tasa de participación"
             sub={`Global: ${fmtPct(base.tasa)}`} />
        <Kpi value={fmtInt(cube.meta.n_eventos)} label="Eventos de movilidad (histórico)" />
      </div>

      <TemporalLine
        title="Evolución temporal de la movilidad"
        subtitle="Estudiantes cuyo primer evento de movilidad ocurrió en cada año (según la selección)."
        data={serieTemporal}
      />

      {/* Comparaciones participantes vs no participantes */}
      <div className="section-title">Participantes vs. no participantes</div>
      <div className="grid">
        <DonutParticipacion
          title="Composición de la selección"
          subtitle="Qué fracción de los estudiantes filtrados tuvo internacionalización."
          totals={t}
        />
        <CompareProfile
          title="Perfil por estrato social"
          subtitle="Distribución (%) dentro de cada grupo. ¿De qué estratos provienen?"
          rows={cmpEstrato}
        />
        <CompareProfile
          title="Perfil por facultad"
          subtitle="¿Se concentran los dos grupos en facultades distintas?"
          rows={cmpFacultad}
        />
        <CompareProfile
          title="Perfil por tipo de admisión"
          subtitle="Vías de ingreso de participantes vs. no participantes."
          rows={cmpAdmision}
        />
      </div>

      {/* Distribuciones numéricas con tasa de participación */}
      <div className="section-title">Distribuciones y tasa de participación</div>
      <div className="grid">
        <NumericDist title="Promedio acumulado (PGA)"
                     subtitle="Barras: estudiantes. Línea: tasa de participación."
                     data={distPga} barColor="#2563eb" />
        <NumericDist title="Semestre de avance"
                     subtitle="¿En qué momento de la carrera ocurre la movilidad?"
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

      <div className="section-title">Modalidades en el tiempo</div>
      <ModalityArea
        title="Composición de modalidades por año"
        subtitle="Eventos por modalidad desde 2010 (vista histórica global)."
        data={modalidadTemporal}
        modalities={modalities}
      />

      <p className="footnote">
        Fuente: registros académicos anonimizados de la Universidad de los Andes. La señal de
        internacionalización se deriva de cursos de movilidad en la historia académica. Los datos
        se presentan agregados; no se exponen registros individuales (principio de minimización de
        datos, Ley 1581 de 2012). Las asociaciones mostradas no implican causalidad.
      </p>
    </main>
  )
}
