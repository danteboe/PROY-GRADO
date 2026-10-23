# Plan de implementación — Mejoras UX/accesibilidad del dashboard + documentación LaTeX

Proyecto: dashboard React (Vite + Recharts), JS/JSX, idioma español. Se trabaja
directamente sobre el repo (sin worktree). NO hacer commit.

## Contratos verificados durante la exploración (respetarlos exactamente)

- `filters = { cat: { dim: Set<catIndex> }, num: { dim: {min,max,includeNA,active} } }`.
- Callbacks existentes en `App.jsx`: `toggleCat(dim, idx)`, `clearCat(dim)`,
  `setNum(dim, range)`, `clearNum(dim)`, `resetAll()`. `resetAll` hace
  `setFilters({ cat: {}, num: {} })`, por lo que limpia cualquier filtro categórico
  nuevo (incluido `anio_mov`).
- `data.js`: `applyFilters(rows, filters, exceptDim=null, naSentinel=-1)`,
  `totals(rows) -> {n, part, tasa}`, `aggregateBy(rows, dim, codebooks) -> [{key,label,n,part,tasa}]`,
  `orderedCategories(dim, cats)` (ya tiene rama especial para `anio_mov`:
  ordena numérico y manda `'N/A'` al final), `fmtInt`, `fmtPct`.
- Codebooks reales (de `dashboard/public/data.json`):
  - `anio_mov`: labels string de años `"1998","2000"…"2026"` y `"N/A"` (29 entradas).
  - `nivel`: incluye `"Pregrado"` (el label exacto a buscar es `"Pregrado"`).
  - `estrato`: `["1","2","3","4","5","6","Sin dato"]`.
  - `genero` (3), `estrato` (7), `nivel` (10), `modalidad` (6), `facultad` (22),
    `tipo_admision` (23), `estado` (31), `programa` (325), `anio_mov` (29).
  - `na_sentinel = -1`.
- `FilterGroup` props actuales: `{ dim, label, codebooks, counts, selected, onToggle, onClear, searchable=false }`.
  `counts` es un `Map<idx,{n,part}>`. Los items visibles se construyen con
  `orderedCategories` y se filtran por `it.n > 0 || selected.has(it.idx)` y por el
  texto `q`.
- `OpportunityScatter` consume `data: [{ facultad, n, part, noPart, tasa }]` y prop
  `avgRate` (número). El tamaño de burbuja usa `noPart`.
- `Heatmap` consume `data: [{ facultad, estrato, n, part, tasa }]`. Internamente usa
  `estratos = ['1','2','3','4','5','6','Sin dato']` y agrupa por `facultad|estrato`;
  `estrato` debe ser el **label string** (no el índice).
- Vistas NO derivables de `cube.rows` (dependen de eventos): `StackedByFaculty`
  (modalidad×facultad, vía `modFacData`/`cube.modalidadFacultad`), `ModalityArea`
  (`modalidadTemporal`/`cube.eventosModalidadAnio`), `SeasonBars`
  (`seasonData`/`cube.estacionalidad`), `DonutResultado` (`cube.resultadoMov`).
- `styles.css`: variables `--accent` (azul), `--muted` (gris), `--line`, `--ink`,
  `--accent-soft`, `--shadow`. Clases existentes reutilizables: `.filter-group`,
  `.filter-group > label`, `.chip-count`, `.options`, `.opt`, `.search-box`,
  `.dual-slider`, `.slider-track`, `.slider-range`, `.thumb`, `.na-toggle`,
  `.sidebar-section`, `.range-inputs`, `.range-num`, `.range-dash`.
- Comando de verificación del dashboard (único; no hay test runner):
  `npm run build` dentro de `dashboard/` (build Vite, hoy en verde).
- LaTeX: compilable con `pdflatex` (MiKTeX disponible). Doc en español
  (`babel`), usa `\section`/`\subsection`, `itemize`/`description` con
  `[leftmargin=*]`, `\texttt`, `\emph`, `\textbf`. La sección del dashboard es
  `\section{Diseño e implementación del dashboard}` con `\label{sec:dashboard}`
  y subsecciones: Arquitectura, Dimensiones de filtrado, Componentes de
  visualización, Reproducibilidad del dashboard.

## Decisiones de diseño (tomadas aquí, a documentar en LaTeX)

1. **Umbral del searchbar.** Se habilita el buscador cuando
   `cube.codebooks[dim].length > UMBRAL_BUSQUEDA` **o** la dimensión está en un
   conjunto base. El requisito dice explícitamente que `genero`, `nivel` y
   `estrato` NO deben mostrar buscador. Pero `nivel` tiene 10 opciones, así que un
   `UMBRAL = 8` lo activaría indebidamente. **Decisión:** `UMBRAL_BUSQUEDA = 8` para
   cumplir el enunciado, combinado con un conjunto de exclusión explícito
   `SIN_BUSQUEDA = new Set(['genero','nivel','estrato'])` que tiene prioridad. Así
   quedan con buscador: `facultad, programa, tipo_admision, estado, anio_mov`
   (si se usara `anio_mov` como FilterGroup, que NO es el caso: ver tarea 3), y sin
   buscador `genero, nivel, estrato, modalidad`. Con esto se respeta al pie de la
   letra el enunciado y se mantiene el espíritu del umbral. Documentar el porqué del
   conjunto de exclusión (nivel supera el umbral pero tiene pocas opciones reales).
2. **`anio_mov` NO entra en `CAT_FILTER_DIMS`.** Se filtra mediante el nuevo
   `YearRangeSlider`, que traduce el rango a `filters.cat.anio_mov` (Set de índices).
   Así no aparece como lista de checkboxes y no necesita searchbar.
3. **Umbral de volumen en `OpportunityScatter` recalculado:** sin umbral fijo de
   `n>=500` (global); en cliente se usa `n >= 50` por facultad, y si la selección
   total es pequeña (`totalN < 200`) se elimina el umbral para no vaciar el gráfico.
   `avgRate` pasa a ser la tasa de la selección (`t.tasa`), coherente con que todo
   lo demás responde a filtros. Documentar.
4. **`Heatmap` recalculado** solo sobre filas de `nivel == idx(Pregrado)`; si el
   codebook no tuviera `"Pregrado"`, no se filtra por nivel (fallback seguro).

---

# Implementation Plan

- [ ] 1. Añadir estilos para los nuevos controles de acciones de filtro y el slider de años en `styles.css`.
      Agregar (siguiendo paleta/convenciones existentes): una fila de acciones
      `.filter-actions` (flex, gap pequeño, margen inferior ~6px) y botones
      `.filter-action-btn` (botón plano, `color: var(--accent)`, `font-size: 11px`,
      sin fondo, cursor pointer, foco visible con `outline`/`:focus-visible`);
      un contenedor `.year-slider` que reutilice la mecánica visual de
      `.dual-slider` (puede reaprovechar `.slider-track`, `.slider-range`, `.thumb`),
      más `.year-range-labels` (flex space-between, `font-size: 11px`,
      `color: var(--muted)`, `font-variant-numeric: tabular-nums`) para mostrar
      [desde]–[hasta]. Un badge `.badge-historico` (inline, fondo `--accent-soft`,
      texto pequeño, `color: var(--accent)`, border-radius) para marcar las vistas
      históricas globales.
      Files: dashboard/src/styles.css
      Verify: `cd dashboard && npm run build` compila sin errores (CSS válido).

- [ ] 2. Tarea 1 (Seleccionar todo / Ninguno) — extender `FilterGroup.jsx` con acciones accesibles por dimensión.
      Añadir prop `onSelectAll(dim, indices)` y prop `onClear` ya existente.
      Debajo del `search-box` (o bajo el `<label>` si no es searchable) renderizar una
      fila `.filter-actions` con dos `<button type="button" className="filter-action-btn">`:
      "Seleccionar todo" (llama `onSelectAll(dim, items.map(it => it.idx))` — usa los
      items YA visibles, es decir tras aplicar `q` e `it.n > 0`) y "Ninguno" (llama
      `onClear(dim)`). Ambos botones con texto claro en español; el de "Ninguno" se
      deshabilita (`disabled`) cuando `selected.size === 0`. No usar `<span onClick>`.
      El chip `N ✕` existente se mantiene. `items` ya está memoizado con `useMemo`;
      asegurar que "Seleccionar todo" use exactamente ese array.
      Files: dashboard/src/components/FilterGroup.jsx
      Verify: `cd dashboard && npm run build` compila; (manual) al escribir en el
      buscador y pulsar "Seleccionar todo" solo se marcan las coincidencias visibles.

- [ ] 3. Tarea 1 (callback) — implementar `selectAllCat` en `App.jsx` y pasarlo a cada `FilterGroup`.
      Añadir `const selectAllCat = useCallback((dim, indices) => setFilters(prev => {
      const set = new Set(prev.cat[dim] || []); for (const i of indices) set.add(i);
      return { ...prev, cat: { ...prev.cat, [dim]: set } }; }), [])`. Pasar
      `onSelectAll={selectAllCat}` al `FilterGroup` dentro del `.map` de
      `CAT_FILTER_DIMS` en `Sidebar`. `selectAllCat` debe recibirse como prop de
      `Sidebar` desde `App` (añadir a la lista de props de `Sidebar` y a la llamada
      `<Sidebar ... />`).
      Files: dashboard/src/App.jsx
      Verify: `cd dashboard && npm run build` compila; (manual) "Seleccionar todo"
      agrega índices al Set y los KPIs/gráficos se recalculan.

- [ ] 4. Tarea 2 (searchbar por umbral) — reemplazar el `SEARCHABLE` fijo por lógica de umbral + exclusión en `App.jsx`.
      Sustituir `const SEARCHABLE = new Set([...])` por
      `const UMBRAL_BUSQUEDA = 8;` y
      `const SIN_BUSQUEDA = new Set(['genero', 'nivel', 'estrato']);`.
      Crear helper `const esBuscable = (dim) => !SIN_BUSQUEDA.has(dim) &&
      cube.codebooks[dim].length > UMBRAL_BUSQUEDA;` (definido dentro de `Sidebar`,
      donde `cube` está disponible). En el `.map` de `CAT_FILTER_DIMS` pasar
      `searchable={esBuscable(dim)}`. Añadir un comentario que documente la decisión
      (umbral 8 + exclusión explícita de dims con pocas opciones reales como `nivel`).
      Resultado esperado: buscador en facultad, programa, tipo_admision, estado; sin
      buscador en nivel, genero, estrato, modalidad.
      Files: dashboard/src/App.jsx
      Verify: `cd dashboard && npm run build` compila; (manual) facultad/programa/
      tipo_admision/estado muestran buscador; genero/estrato/nivel/modalidad no.

- [ ] 5. Tarea 3 — crear el componente `YearRangeSlider.jsx` (slider de rango temporal por año).
      Nuevo componente basado en la mecánica de doble control de `RangeSlider.jsx`
      pero trabajando sobre **años enteros** derivados del codebook, no sobre
      unidades internas. Props sugeridas:
      `{ label, codebook /* cube.codebooks.anio_mov */, selected /* Set<idx> actual */,
      onChange(nextSet), onClear() }`.
      Comportamiento:
      - Derivar `years = codebook.map((lbl, idx) => ({ idx, year: Number(lbl) }))`
        separando numéricos (`Number.isFinite`) de no-numéricos (`'N/A'`). Los
        extremos del slider salen de `min/max` de los años numéricos.
      - Estado de rango `[desde, hasta]` (inicial = [min, max]); dos `<input type="range">`
        con `aria-label` ("Año desde" / "Año hasta"), reutilizando clases
        `.dual-slider`/`.thumb`/`.slider-range`/`.slider-track` o las nuevas
        `.year-slider`. Mostrar los años seleccionados en `.year-range-labels`.
      - Checkbox `.na-toggle` "Incluir sin año/N/A" (análogo a `includeNA`): decide si
        los índices no-numéricos se incluyen en el Set emitido.
      - Al cambiar rango o checkbox, construir el Set de índices cuyos años caen en
        `[desde, hasta]` (más los índices no-numéricos si el checkbox está activo) y
        llamar `onChange(nuevoSet)`. Si el rango cubre todo y el checkbox incluye N/A,
        emitir `new Set()` (equivale a "sin filtro") para no sobre-filtrar.
      - Chip de reset (reusar `.chip-count`) visible cuando el filtro está activo, que
        llame `onClear()`.
      Files: dashboard/src/components/YearRangeSlider.jsx
      Verify: `cd dashboard && npm run build` compila sin errores de import/JSX.

- [ ] 6. Tarea 3 (integración) — montar `YearRangeSlider` en la `Sidebar` y cablear el filtro `anio_mov`.
      En `App.jsx`: importar `YearRangeSlider`. En `Sidebar`, añadir una sección
      propia con `<div className="sidebar-section">Rango temporal (año de movilidad)</div>`
      ubicada encima de "Variables numéricas", y renderizar
      `<YearRangeSlider label={DIM_LABELS.anio_mov} codebook={cube.codebooks.anio_mov}
      selected={filters.cat.anio_mov || new Set()} onChange={(set) => setCatSet('anio_mov', set)}
      onClear={() => clearCat('anio_mov')} />`.
      Añadir en `App` un callback `const setCatSet = useCallback((dim, set) =>
      setFilters(prev => ({ ...prev, cat: { ...prev.cat, [dim]: set } })), [])` y
      pasarlo a `Sidebar`. NO añadir `anio_mov` a `CAT_FILTER_DIMS` (sigue fuera de
      los checkboxes). `resetAll` ya limpia `filters.cat` completo, así que también
      limpia este filtro.
      Files: dashboard/src/App.jsx
      Verify: `cd dashboard && npm run build` compila; (manual) mover el slider
      cambia KPIs, `TemporalLine` y rankings (todo deriva de `applyFilters`).

- [ ] 7. Tarea 4 (data.js) — añadir dos helpers de recálculo en cliente a partir de filas filtradas.
      En `data.js` exportar:
      - `aggregateOportunidad(rows, codebooks, { minN = 50 } = {})`: agrupa por índice
        de `facultad`, suma `n` y `part`, calcula `tasa = n? 100*part/n : 0`,
        `noPart = n - part`, y emite `[{ facultad: codebooks.facultad[idx], n, part,
        noPart, tasa }]`. Aplicar el umbral `minN` salvo que el total de `n` de la
        selección sea pequeño (`< 200`), en cuyo caso no filtrar (documentar).
      - `aggregateHeatmap(rows, codebooks, naSentinel)`: localizar
        `idxPregrado = codebooks.nivel.indexOf('Pregrado')`; si `>= 0`, filtrar filas a
        ese nivel; agrupar por `facultad`×`estrato` (ambos traducidos a label vía
        `codebooks.facultad[idx]` y `codebooks.estrato[idx]`), sumar `n`/`part`,
        `tasa = n?100*part/n:0`, y emitir `[{ facultad, estrato, n, part, tasa }]`.
        El campo `estrato` debe ser el label string (p.ej. "1".."6","Sin dato") para
        casar con `estratos` interno de `Heatmap.jsx`.
      Mantener el estilo funcional/puro de los helpers existentes (`aggregateBy`).
      Files: dashboard/src/data.js
      Verify: `cd dashboard && npm run build` compila; (manual) los arrays producidos
      tienen exactamente los campos que esperan `OpportunityScatter`/`Heatmap`.

- [ ] 8. Tarea 4 (App.jsx) — conectar `OpportunityScatter` y `Heatmap` a datos filtrados.
      En `Dashboard`, importar los dos helpers nuevos y reemplazar:
      - `data={cube.oportunidad}` → `data={oportunidadSel}` donde
        `const oportunidadSel = useMemo(() => aggregateOportunidad(filtered, cube.codebooks), [filtered, cube])`.
      - `avgRate={avgRate}` (hoy `base.tasa`) → `avgRate={t.tasa}` (tasa de la
        selección). Eliminar o reutilizar `avgRate` según corresponda.
      - `data={cube.heatmapFacEstrato}` → `data={heatmapSel}` donde
        `const heatmapSel = useMemo(() => aggregateHeatmap(filtered, cube.codebooks, cube.naSentinel), [filtered, cube])`.
      Actualizar los subtítulos para reflejar que ahora responden a la selección.
      Files: dashboard/src/App.jsx
      Verify: `cd dashboard && npm run build` compila; (manual) al filtrar, el scatter
      de oportunidad y el heatmap cambian.

- [ ] 9. Tarea 4 (badges "histórico global") — marcar las vistas NO filtrables.
      En `App.jsx`, en los subtítulos de `ModalityArea` ("Composición de modalidades
      por año"), `StackedByFaculty` ("¿Qué modalidad prefiere cada facultad?"),
      `SeasonBars` ("Estacionalidad…") y `DonutResultado`, añadir una nota/badge
      visible en español: "Vista histórica global (no responde a los filtros)".
      Preferir pasar la nota vía la prop `subtitle` existente (añadiendo el texto) o,
      si se requiere estilo de badge, anteponer un `<span className="badge-historico">`.
      Para `DonutResultado` (componente local en App.jsx) añadir la nota en su
      `card-sub`. No inventar datos a nivel de evento.
      Files: dashboard/src/App.jsx
      Verify: `cd dashboard && npm run build` compila; (manual) las cuatro vistas
      muestran la etiqueta de "histórica global".

- [ ] 10. Tarea 5 — añadir la subsección LaTeX "Decisiones de diseño, accesibilidad y UX".
      En `latex/informe_proyecto.tex`, dentro de `\section{Diseño e implementación del
      dashboard}` (`\label{sec:dashboard}`), añadir una nueva `\subsection{Decisiones
      de diseño, accesibilidad y UX}` DESPUÉS de `\subsection{Componentes de
      visualización}` y ANTES de `\subsection{Reproducibilidad del dashboard}`.
      No eliminar contenido existente. Seguir el estilo del documento (prosa +
      `itemize`/`description` con `[leftmargin=*]`, `\texttt`, `\emph`, `\textbf`).
      Documentar en viñetas:
      - Botón "Seleccionar todo"/"Ninguno" en filtros categóricos: eficiencia para
        selecciones amplias y respeto al buscador (solo lo visible); accesibilidad con
        `<button>` reales enfocables por teclado (no `<span onClick>`).
      - Searchbar en filtros con muchas categorías: umbral de 8 opciones + exclusión
        explícita de dimensiones con pocas opciones reales (genero, estrato y nivel)
        para reducir ruido visual y carga cognitiva.
      - Slider de rango temporal (año de movilidad): por qué un control de rango de
        doble manija es más usable que marcar años con checkboxes; traducción del
        rango a índices del codebook; opción "Incluir sin año/N/A".
      - Preguntas de negocio: qué gráficas ahora responden a los filtros (oportunidad
        por facultad, heatmap facultad×estrato) y cuáles permanecen como vista
        histórica global y POR QUÉ (dependen de datos a nivel de evento de movilidad
        que no están en el cubo agregado a nivel estudiante; minimización de datos y
        coherencia estadística). Mencionar la elección de `avgRate` = tasa de la
        selección y el umbral `n>=50`.
      - Accesibilidad transversal: `aria-label` en inputs de rango, controles
        enfocables por teclado, contraste de color (paleta azul/gris), etiquetas
        claras y tooltips informativos.
      Files: latex/informe_proyecto.tex
      Verify: compilar con `cd latex && pdflatex -interaction=nonstopmode informe_proyecto.tex`
      y confirmar que termina sin errores y genera el PDF (misma estructura, con la
      nueva subsección).

## Notas y supuestos

- No hay test runner en `dashboard/`; la verificación de código es `npm run build`
  (hoy en verde). Donde se indica "(manual)" es validación funcional recomendada al
  implementador; no bloquea el build.
- `pdflatex` (MiKTeX) está disponible para verificar la compilación del `.tex`. Si en
  el entorno de ejecución faltara, dejar constancia y considerar verificado el cambio
  por revisión del diff (no eliminar contenido, solo añadir la subsección).
- No tocar `.parquet`, `data.json` generado ni `src/export_dashboard.py`. La tarea 4
  se resuelve 100% en cliente (`App.jsx` + helpers en `data.js`).
- No añadir librerías nuevas; todo con React hooks (`useMemo`/`useCallback`) y
  Recharts ya presentes. Textos visibles en español.
- NO hacer commit.
