import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  loadCube, applyFilters, totals, aggregateBy, fmtInt, fmtPct, DIM_LABELS,
} from './data.js'
import FilterGroup from './components/FilterGroup.jsx'
import BarRanking from './components/BarRanking.jsx'
import TemporalLine from './components/TemporalLine.jsx'
import ModalityArea from './components/ModalityArea.jsx'
import Kpi from './components/Kpi.jsx'

// Dimensiones expuestas como filtros en la barra lateral.
const FILTER_DIMS = [
  'nivel', 'facultad', 'programa', 'genero', 'estrato',
  'tipo_admision', 'estado', 'modalidad', 'pga_bin', 'avance_bin', 'icfes_bin',
]
const SEARCHABLE = new Set(['programa', 'tipo_admision', 'estado'])

export default function App() {
  const [cube, setCube] = useState(null)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({}) // { dim: Set<catIdx> }

  useEffect(() => {
    loadCube().then(setCube).catch((e) => setError(e.message))
  }, [])

  const toggle = useCallback((dim, idx) => {
    setFilters((prev) => {
      const set = new Set(prev[dim] || [])
      set.has(idx) ? set.delete(idx) : set.add(idx)
      return { ...prev, [dim]: set }
    })
  }, [])
  const clearDim = useCallback((dim) => {
    setFilters((prev) => ({ ...prev, [dim]: new Set() }))
  }, [])
  const resetAll = useCallback(() => setFilters({}), [])

  if (error) return <div className="empty">Error: {error}. Ejecuta <code>python -m src.export_dashboard</code> y vuelve a abrir.</div>
  if (!cube) return <div className="loading">Cargando datos…</div>

  const activeCount = Object.values(filters).reduce((a, s) => a + (s ? s.size : 0), 0)
  return (
    <div className="app">
      <Sidebar
        cube={cube} filters={filters} toggle={toggle}
        clearDim={clearDim} resetAll={resetAll} activeCount={activeCount}
      />
      <Dashboard cube={cube} filters={filters} toggle={toggle} />
    </div>
  )
}

function Sidebar({ cube, filters, toggle, clearDim, resetAll, activeCount }) {
  // Conteo contextual por dimensión: para cada filtro, cuenta aplicando los
  // demás filtros (así los números reflejan el cross-filtering en tiempo real).
  const countsByDim = useMemo(() => {
    const result = {}
    for (const dim of FILTER_DIMS) {
      const rows = applyFilters(cube.rows, filters, dim)
      const m = new Map()
      for (const r of rows) m.set(r[dim], (m.get(r[dim]) || 0) + r.n)
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
      <div style={{ height: 10 }} />
      {FILTER_DIMS.map((dim) => (
        <FilterGroup
          key={dim}
          dim={dim}
          label={DIM_LABELS[dim]}
          codebooks={cube.codebooks}
          counts={countsByDim[dim]}
          selected={filters[dim] || new Set()}
          onToggle={toggle}
          onClear={clearDim}
          searchable={SEARCHABLE.has(dim)}
        />
      ))}
    </aside>
  )
}

function Dashboard({ cube, filters, toggle }) {
  const filtered = useMemo(() => applyFilters(cube.rows, filters), [cube, filters])
  const t = useMemo(() => totals(filtered), [filtered])
  const base = useMemo(() => totals(cube.rows), [cube])

  const porFacultad = useMemo(() => aggregateBy(filtered, 'facultad', cube.codebooks), [filtered, cube])
  const porPrograma = useMemo(() => aggregateBy(filtered, 'programa', cube.codebooks), [filtered, cube])
  const porModalidad = useMemo(
    () => aggregateBy(filtered, 'modalidad', cube.codebooks).filter((d) => d.label !== 'No participa'),
    [filtered, cube],
  )
  const porEstrato = useMemo(() => aggregateBy(filtered, 'estrato', cube.codebooks), [filtered, cube])
  const porAvance = useMemo(() => aggregateBy(filtered, 'avance_bin', cube.codebooks), [filtered, cube])
  const porPga = useMemo(() => aggregateBy(filtered, 'pga_bin', cube.codebooks), [filtered, cube])

  // Serie temporal: eventos por año. Si hay filtros de dimensiones que afectan a
  // participantes (facultad, programa, etc.), aproximamos la serie contando
  // participantes por año de movilidad dentro del subconjunto filtrado.
  const serieTemporal = useMemo(() => {
    const anios = aggregateBy(filtered, 'anio_mov', cube.codebooks)
      .filter((d) => d.label !== 'N/A' && d.label !== 'Sin dato' && Number(d.label) >= 2002)
      .map((d) => ({ anio: Number(d.label), eventos: d.part }))
      .sort((a, b) => a.anio - b.anio)
    return anios
  }, [filtered, cube])

  // Composición por modalidad en el tiempo (desde el cubo pre-agregado global).
  const modalities = useMemo(() => {
    const s = new Set(cube.eventosModalidadAnio.map((r) => r.modalidad))
    return [...s]
  }, [cube])
  const modalidadTemporal = useMemo(() => {
    const byAnio = new Map()
    for (const r of cube.eventosModalidadAnio) {
      const o = byAnio.get(r.anio) || { anio: r.anio }
      o[r.modalidad] = r.n
      byAnio.set(r.anio, o)
    }
    return [...byAnio.values()].sort((a, b) => a.anio - b.anio)
  }, [cube])

  const facIdxSel = filters.facultad
  const progIdxSel = filters.programa

  return (
    <main className="main">
      <div className="main-head">
        <h2>Explorador de participación estudiantil en internacionalización</h2>
        <p>
          Herramienta descriptiva: usa el panel de la izquierda para filtrar por cualquier
          combinación de dimensiones. Todos los indicadores y gráficos se recalculan en vivo.
          Pasa el mouse sobre los gráficos para ver el detalle; haz clic en una barra de
          facultad o programa para filtrar por ella.
        </p>
      </div>

      <div className="kpis">
        <Kpi value={fmtInt(t.n)} label="Estudiantes (selección)"
             sub={`${fmtPct(100 * t.n / base.n, 1)} del total`} />
        <Kpi value={fmtInt(t.part)} label="Con movilidad internacional" />
        <Kpi value={fmtPct(t.tasa)} label="Tasa de participación"
             sub={`Global: ${fmtPct(base.tasa)}`} />
        <Kpi value={fmtInt(cube.meta.n_eventos)} label="Eventos de movilidad (histórico)" />
      </div>

      <TemporalLine
        title="Evolución temporal de la movilidad"
        subtitle="Estudiantes cuyo primer evento de movilidad ocurrió en cada año (según la selección)."
        data={serieTemporal}
      />

      <div className="grid">
        <BarRanking
          title="Participación por facultad"
          subtitle="Clic en una barra para filtrar. Alterna entre número y tasa."
          data={porFacultad}
          onBarClick={(key) => toggle('facultad', key)}
          selectedKeys={facIdxSel}
        />
        <BarRanking
          title="Participación por programa"
          subtitle="Top programas de la selección. Clic para filtrar."
          data={porPrograma}
          topN={14}
          onBarClick={(key) => toggle('programa', key)}
          selectedKeys={progIdxSel}
        />
        <BarRanking
          title="Modalidades de movilidad"
          subtitle="Composición de la participación por tipo de experiencia."
          data={porModalidad}
          defaultMetric="n"
          topN={8}
          colorN="#9333ea"
        />
        <BarRanking
          title="Participación por estrato social"
          subtitle="Lectura de equidad (asociación, no causa)."
          data={porEstrato}
          defaultMetric="tasa"
          topN={7}
        />
        <BarRanking
          title="Participación por semestre de avance"
          subtitle="¿En qué momento de la carrera ocurre la movilidad?"
          data={porAvance}
          defaultMetric="tasa"
          topN={7}
          colorT="#d97706"
        />
        <BarRanking
          title="Participación por rango de PGA"
          subtitle="Relación entre desempeño y participación."
          data={porPga}
          defaultMetric="tasa"
          topN={6}
        />
      </div>

      <div style={{ height: 16 }} />
      <ModalityArea
        title="Composición de modalidades en el tiempo"
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
