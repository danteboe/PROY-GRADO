import { useEffect, useMemo, useState, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import {
  loadCube, applyFilters, totals, aggregateBy, aggregateByNumeric,
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
import SeasonBars from './components/SeasonBars.jsx'
import Kpi from './components/Kpi.jsx'

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

  if (error) return <div className="empty">Error: {error}. Ejecuta <code>python -m src.export_dashboard</code> y vuelve a abrir.</div>
  if (!cube) return <div className="loading">Cargando datos…</div>

  const activeCount =
    Object.values(filters.cat).reduce((a, s) => a + (s ? s.size : 0), 0) +
    Object.values(filters.num).filter((r) => r && r.active).length

  return (
    <div className="app">
      <Sidebar
        cube={cube} filters={filters}
        toggleCat={toggleCat} clearCat={clearCat} selectAllCat={selectAllCat}
        setCatSet={setCatSet} setNum={setNum} clearNum={clearNum}
        resetAll={resetAll} activeCount={activeCount} tab={tab}
      />
      <Dashboard cube={cube} filters={filters} toggleCat={toggleCat} tab={tab} setTab={setTab} />
    </div>
  )
}

function Sidebar({ cube, filters, toggleCat, clearCat, selectAllCat, setCatSet, setNum, clearNum, resetAll, activeCount, tab }) {
  // El buscador se muestra si la dimensión supera el umbral de opciones y no está
  // en la lista de exclusión (ver UMBRAL_BUSQUEDA / SIN_BUSQUEDA).
  const esBuscable = (dim) =>
    !SIN_BUSQUEDA.has(dim) && cube.codebooks[dim].length > UMBRAL_BUSQUEDA
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

      {tab === 'insights' && (
        <div className="sidebar-note">
          Los filtros aplican a la pestaña <strong>Explorador</strong>. La pestaña Insights
          muestra hallazgos globales del histórico completo.
        </div>
      )}

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
        />
      ))}

      <div className="sidebar-section">Rango temporal (año de movilidad)</div>
      <YearRangeSlider
        label={DIM_LABELS.anio_mov}
        codebook={cube.codebooks.anio_mov}
        selected={filters.cat.anio_mov || new Set()}
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

function Dashboard({ cube, filters, toggleCat, tab, setTab }) {
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
    // Rellenar con 0 las modalidades ausentes en cada año: sin esto, el área
    // apilada interpreta los valores faltantes como huecos y se ve distorsionada.
    const out = [...byAnio.values()].sort((a, b) => a.anio - b.anio)
    for (const row of out) {
      for (const m of modalities) if (row[m] == null) row[m] = 0
    }
    return out
  }, [cube, modalities])

  // ---- Preguntas de negocio recalculadas en cliente desde la selección ----
  // Matriz de oportunidad por facultad (n, part, noPart, tasa) y mapa de calor
  // facultad x estrato en pregrado, ambos derivados de `filtered`.
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

      {/* Oportunidad y equidad, recalculadas desde la selección activa */}
      <div className="section-title">Oportunidad y equidad (según la selección)</div>
      <OpportunityScatter
        title="¿Dónde está el mayor potencial de crecimiento? (por facultad)"
        subtitle="Según la selección. Volumen de estudiantes vs. tasa de participación; tamaño = estudiantes que aún no participan. Se omiten facultades con menos de 50 estudiantes salvo que la selección total sea pequeña. La línea de media es la tasa de la selección."
        data={oportunidadSel}
        avgRate={t.tasa}
      />
      <Heatmap
        title="Brecha socioeconómica dentro de cada facultad"
        subtitle="Según la selección. Tasa de participación (%) por facultad y estrato, en pregrado."
        data={heatmapSel}
      />

      <p className="footnote">
        Fuente: registros académicos anonimizados de la Universidad de los Andes. La señal de
        internacionalización se deriva de cursos de movilidad en la historia académica. Los datos
        se presentan agregados; no se exponen registros individuales (principio de minimización de
        datos, Ley 1581 de 2012). Las asociaciones mostradas no implican causalidad.
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
          Resumen los hallazgos principales del proyecto.
        </p>
      </div>

      <div className="section-title">Modalidades en el tiempo</div>
      <ModalityArea
        title="Composición de modalidades por año"
        subtitle="Eventos por modalidad desde 2010."
        data={modalidadTemporal}
        modalities={modalities}
      />

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
        Estacionalidad y resultado de la experiencia
      </div>
      <div className="grid">
        <SeasonBars
          title="Estacionalidad: ¿en qué semestre se sale más?"
          subtitle="Eventos por año, separando primer y segundo semestre."
          data={seasonData}
        />
        <DonutResultado resultado={cube.resultadoMov} />
      </div>
      </section>
    </main>
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
    <div className="card">
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
    </div>
  )
}
