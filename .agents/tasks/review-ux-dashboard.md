# Revisión — Mejoras UX/accesibilidad del dashboard + documentación LaTeX

Veredicto: **APPROVED** (sin hallazgos bloqueantes)

## Alcance revisado
Diff sin commitear sobre `main` (working tree). Archivos:
`dashboard/src/App.jsx`, `dashboard/src/components/FilterGroup.jsx`,
`dashboard/src/components/YearRangeSlider.jsx` (nuevo), `dashboard/src/data.js`,
`dashboard/src/styles.css`, `latex/informe_proyecto.tex` (+ PDF regenerado).
No se detectan cambios en `.parquet`, `data.json` ni `src/export_dashboard.py`.
No hay commit (cambios unstaged), conforme al requisito.

## Evidencia de verificación (no se re-ejecutó la suite)
No existe un archivo de reporte textual del coder, pero sí artefactos de build
reproducibles y coherentes con el diff final:
- `dashboard/dist/assets/index-*.js` y `index-*.css` con `LastWriteTime` 23/10/2026
  3:28:32 p. m., **posterior** a la última edición de fuentes (`App.jsx` 3:28:15 p. m.).
  Vite solo emite estos artefactos cuando `npm run build` termina sin errores, de modo
  que el build pasó contra la versión final del diff.
- `latex/informe_proyecto.pdf` aparece regenerado en el diff, evidencia de compilación
  exitosa con pdflatex.
Se consideró la evidencia suficiente; no fue necesario re-ejecutar builds. Spot-check
de contratos de props realizado por lectura directa de los componentes consumidores.

## Tarea 1 — "Seleccionar todo" / "Ninguno"
- `FilterGroup.jsx`: dos `<button type="button" className="filter-action-btn">`
  accesibles con `aria-label` en español. "Seleccionar todo" llama
  `onSelectAll(dim, items.map(it => it.idx))` usando el array memoizado `items`, que
  está filtrado por `it.n > 0 || selected.has(it.idx)` y por el texto `q` → opera solo
  sobre items visibles. "Ninguno" llama `onClear(dim)` y queda `disabled` cuando
  `selected.size === 0`. El chip `N ✕` se conserva. No se usan `<span onClick>`.
- `App.jsx`: `selectAllCat` agrega índices a un `new Set(prev.cat[dim] || [])` sin
  perder los ya seleccionados; se pasa como `onSelectAll={selectAllCat}` a cada
  `FilterGroup` vía props de `Sidebar`. Correcto.
- Nota menor no bloqueante: el comentario dice "con part>0" mientras el filtro real es
  `it.n > 0`; es solo imprecisión de comentario, el comportamiento coincide con lo
  aprobado ("q + it.n>0").

## Tarea 2 — Searchbar por umbral
- `const UMBRAL_BUSQUEDA = 8` + `const SIN_BUSQUEDA = new Set(['genero','nivel','estrato'])`.
  `esBuscable(dim) = !SIN_BUSQUEDA.has(dim) && cube.codebooks[dim].length > 8`.
  genero/nivel/estrato NO muestran buscador (prioridad de exclusión aunque nivel tenga
  10 entradas). Buscador activo en facultad/programa/tipo_admision/estado. Conforme.

## Tarea 3 — Slider de rango temporal (año de movilidad)
- `YearRangeSlider.jsx` deriva años de `codebook` (`anio_mov`), separa numéricos de N/A.
  Traduce `[desde,hasta]` a Set de índices del codebook (`emit`), con regla "sin filtro"
  (Set vacío) cuando cubre todo el rango e incluye N/A. Checkbox "Incluir sin año/N/A"
  (`.na-toggle`) controla la inclusión de índices no numéricos. Inputs de rango con
  `aria-label` "Año desde"/"Año hasta". Chip de reset visible cuando `active`.
- Integrado en `Sidebar` bajo `<div className="sidebar-section">Rango temporal…</div>`
  encima de "Variables numéricas", con `onChange={(set) => setCatSet('anio_mov', set)}`
  y `onClear={() => clearCat('anio_mov')}`. `anio_mov` NO está en `CAT_FILTER_DIMS`.
- `applyFilters` aplica genéricamente los dims categóricos activos (`set.has(row[dim])`),
  por lo que `anio_mov` filtra correctamente las filas. KPIs (`t = totals(filtered)`),
  `serieTemporal` (`aggregateBy(filtered,'anio_mov',…)`), rankings (`porFacultad`, etc.)
  derivan de `filtered = applyFilters(cube.rows, filters, …)`. `resetAll` hace
  `setFilters({cat:{}, num:{}})`, limpiando también este filtro. Conforme.

## Tarea 4 — Preguntas de negocio
- Contratos de props verificados leyendo los consumidores:
  - `OpportunityScatter` consume `{facultad, n, part, noPart, tasa}` + `avgRate`.
    `aggregateOportunidad(filtered, cube.codebooks)` emite exactamente esos campos;
    `avgRate={t.tasa}` (tasa de la selección). Sin ruptura de contrato.
  - `Heatmap` consume `{facultad, estrato, n, part, tasa}` con `estrato` como label
    string (`['1'..'6','Sin dato']`). `aggregateHeatmap` emite `estrato: codebooks.estrato[idx]`
    (labels string) y filtra a nivel Pregrado con fallback seguro si no existe el label.
    Sin ruptura de contrato.
- `StackedByFaculty`, `ModalityArea`, `SeasonBars` y `DonutResultado` conservan sus datos
  globales del cubo y muestran la nota explícita "Vista histórica global (no responde a
  los filtros)" en su subtítulo/`card-sub`. El plan permitía expresar la nota vía
  `subtitle` o badge; la clase `.badge-historico` se añadió al CSS aunque la nota se
  entregó como texto de subtítulo — ambas opciones estaban aprobadas, no es bloqueante.

## Tarea 5 — LaTeX
- `\subsection{Decisiones de diseño, accesibilidad y UX}` insertada dentro de
  `\section{Diseño e implementación del dashboard}` (`sec:dashboard`), DESPUÉS de
  "Componentes de visualización" y ANTES de "Reproducibilidad del dashboard". No se
  elimina contenido. En español, con el estilo del documento (`itemize[leftmargin=*]`,
  `\texttt`, `\emph`, `\textbf`). Cubre los cinco puntos: botones seleccionar todo/ninguno;
  searchbar por umbral + exclusión; slider de rango temporal; preguntas de negocio
  filtrables vs. vistas históricas globales (con `avgRate` y umbral n>=50); accesibilidad
  transversal (aria-label, foco por teclado, contraste, etiquetas/tooltips).

## Otros requisitos
- Textos visibles en español. Sin librerías nuevas (solo React hooks y Recharts ya
  presentes). Sin cambios a datos ni al exportador Python. Sin commit.

## Conclusión
El cambio cumple el plan aprobado y la solicitud original del usuario. No se encontraron
fallas de corrección, seguridad o datos alcanzables. Las dos observaciones menores
(comentario "part>0" y clase badge sin usar) no alteran comportamiento y no bloquean.
