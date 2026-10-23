# División del Dashboard en pestañas "Explorador" e "Insights" (pase v2)

El cambio parte el contenido de `<main>` en `App.jsx` en dos paneles accesibles con patrón tablist/tab/tabpanel. "Explorador" (activa por defecto) reúne todo lo que reacciona a los filtros —KPIs, serie temporal, perfiles participante/no participante, distribuciones numéricas, rankings por categoría y la nueva sección de oportunidad/equidad— mientras que "Insights" agrupa las vistas de histórico global (modalidades en el tiempo, modalidad por facultad, estacionalidad y resultado) que no dependen de la selección. El estado del tab se eleva a `App` junto al de `filters`, de modo que alternar de pestaña no pierde la selección, y el Sidebar recibe `tab` para mostrar una nota discreta cuando Insights está activo. Como diferencia frente al plan, `OpportunityScatter` y `Heatmap` dejaron de leer agregados globales del cubo y ahora se recalculan en cliente desde las filas filtradas (`aggregateOportunidad`/`aggregateHeatmap` en `data.js`), lo que satisface el requisito explícito de la tarea de que esas dos vistas SÍ respondan a filtros.

Este es el pase v2. El único hallazgo bloqueante del pase v1 —ausencia de evidencia de verificación— queda resuelto: los artefactos de build regenerados son posteriores a la última edición de fuentes, lo que constata que `npm run build` y la compilación LaTeX corrieron contra la versión final del diff.

Watch for:
- **Build verificado contra la versión final (confirmed)**: `dist/assets/index-*.{js,css}` quedaron en 23/10/2026 3:48:05 p. m., posteriores a la última edición de fuentes (`styles.css` 3:39:54, `App.jsx` 3:39:47); `informe_proyecto.pdf` (3:48:21) es posterior a `informe_proyecto.tex` (3:40:09). Vite y pdflatex solo emiten esos artefactos tras una compilación exitosa.
- **Doc LaTeX añadida como subsección nueva, no como `\item` (confirmed, no bloqueante)**: el plan asumía que la subsección ya existía; no existía en `main`, y el coder la creó entera antes de "Reproducibilidad del dashboard". Cumple "añadir sin borrar y en el lugar correcto".

**Verdict**: APPROVED

## High-level view

El reparto de vistas quedó correcto: las siete piezas filtrables viven en el panel Explorador y las cuatro globales en Insights, cada panel envuelto en su `<section role="tabpanel">`. Ambos paneles permanecen montados y se ocultan con el atributo `hidden`, lo que preserva el estado interno y evita recálculos al alternar.

Los contratos de props de los componentes movidos se respetan. `OpportunityScatter` sigue recibiendo `{title, subtitle, data, avgRate}` y `Heatmap` `{title, subtitle, data}`; la diferencia es de dónde sale `data` (de la selección vía los nuevos agregadores) y que `avgRate` pasó de la tasa global a `t.tasa`, coherente con que la vista ahora es filtrable. El resto de componentes solo cambió de posición en el árbol.

La accesibilidad del patrón es sólida: `role=tablist`, `role=tab` con `aria-selected`/`aria-controls`, `role=tabpanel` con `aria-labelledby`, `tabIndex` roving (0/-1) y navegación por flechas que mueve el foco. Los botones son `<button>` reales activables con Enter/Espacio.

No se añadieron librerías, la coletilla "(no responde a los filtros)" se retiró de las cuatro vistas de Insights, y toda la UI nueva está en español.

La evidencia de verificación que faltaba en v1 ahora está presente y es consistente con la versión final del diff, de modo que no quedan concerns bloqueantes.

<details>
<summary>Issues (1)</summary>

1. **Coherencia de ejes del Heatmap con el codebook (possible, no bloqueante, pre-existente)** — `Heatmap` fija el eje de estratos a `['1'..'6','Sin dato']` y `aggregateHeatmap` emite `codebooks.estrato[idx]`; si esas etiquetas no coinciden exactamente, algunas celdas quedarían vacías. Es la misma dependencia de la versión previa (fuera del alcance de este diff) y la función tiene un fallback seguro; no bloquea.

</details>

<details>
<summary>Details</summary>

### Verificación: evidencia ahora presente (resolución del hallazgo bloqueante de v1)

El pase v1 rechazó por no hallar constancia de que el proyecto compilara tras el cambio. En este pase la evidencia registrada por el coder sí es concluyente y está alineada con la versión final del diff:

```
dist/assets/index-C5T30vAV.js    23/10/2026 3:48:05 p. m.
dist/assets/index-rKQ_CphP.css   23/10/2026 3:48:05 p. m.
  vs. última edición de fuentes:
  styles.css                     23/10/2026 3:39:54 p. m.
  App.jsx                        23/10/2026 3:39:47 p. m.

informe_proyecto.pdf             23/10/2026 3:48:21 p. m.
  vs. informe_proyecto.tex       23/10/2026 3:40:09 p. m.
```

Los bundles de Vite y el PDF son posteriores a todas las fuentes correspondientes. Vite emite esos `index-*` solo cuando `npm run build` termina sin errores, y pdflatex regenera el PDF solo tras una compilación exitosa; por tanto hay constancia de que tanto el build del dashboard como la compilación LaTeX corrieron contra la versión final (con los imports y JSX nuevos). La lectura de estos timestamps es un spot-check acotado sobre evidencia ya producida por el coder, no una re-ejecución de las suites.

### Reparto de vistas filtrables vs. globales

El panel `panel-explorador` contiene, en orden: `main-head`, `kpis`, `TemporalLine`, "Participantes vs. no participantes" (`DonutParticipacion` + tres `CompareProfile`), "Distribuciones y tasa de participación" (cuatro `NumericDist`), "Participación por categorías" (siete `BarRanking`) y la sección nueva "Oportunidad y equidad (según la selección)" con `OpportunityScatter` + `Heatmap`, cerrando con la `footnote`. El panel `panel-insights` contiene el `main-head` introductorio seguido de `ModalityArea`, `StackedByFaculty`, y un `grid` con `SeasonBars` + `DonutResultado`. Coincide con lo pedido.

La desviación frente al plan es que `OpportunityScatter`/`Heatmap` ya no están en Insights leyendo `cube.oportunidad`/`cube.heatmapFacEstrato`, sino en Explorador alimentados por `oportunidadSel`/`heatmapSel`, derivados de `filtered`. El enunciado de la tarea pide explícitamente que esas dos vistas respondan a filtros; la decisión del coder sigue el enunciado, que es la autoridad.

### Accesibilidad del patrón de pestañas

```
<div role="tablist" aria-label="Vistas del tablero">
  <button role="tab" id="tab-explorador"  aria-selected aria-controls="panel-explorador" tabIndex 0/-1>
  <button role="tab" id="tab-insights"    aria-selected aria-controls="panel-insights"   tabIndex 0/-1>
<section id="panel-explorador" role="tabpanel" aria-labelledby="tab-explorador" hidden>
<section id="panel-insights"   role="tabpanel" aria-labelledby="tab-insights"   hidden>
```

El emparejamiento `aria-controls` → panel y `aria-labelledby` → tab es correcto y los IDs casan. El `onKeyDown` captura `ArrowRight`/`ArrowLeft`, cambia el tab y mueve el foco con `getElementById('tab-'+next).focus()`; el roving `tabIndex` deja un solo tab en el orden de tabulación. Enter/Espacio activan de forma nativa por ser `<button type="button">`.

### Estado elevado y persistencia de filtros

`const [tab, setTab] = useState('explorador')` vive en `App`, junto a `filters`. `Sidebar` recibe `tab`; `Dashboard` recibe `tab` y `setTab`. Ambos paneles se renderizan siempre y se ocultan con `hidden`, no se desmontan, así que `filters` (que ya era de `App`) no se toca al cambiar de pestaña. La nota contextual del Sidebar aparece solo con `tab === 'insights'` como una `.sidebar-note` adicional, sin deshabilitar los filtros.

### Contratos de props de los componentes movidos

`OpportunityScatter({title, subtitle, data, avgRate})` consume `{facultad, n, part, noPart, tasa}`, la forma que emite `aggregateOportunidad`. `Heatmap({title, subtitle, data})` consume `{facultad, estrato, n, part, tasa}` con `estrato` como string; `aggregateHeatmap` emite `estrato: codebooks.estrato[idx]`. El único acoplamiento a vigilar es que el eje fijo del Heatmap (`'1'..'6','Sin dato'`) case con los labels de `codebooks.estrato` —dependencia heredada de la versión previa, con fallback seguro en la función—. `ModalityArea`, `StackedByFaculty`, `SeasonBars` y `DonutResultado` solo cambiaron de posición; sus props no se tocaron.

### Retiro de la coletilla y textos en español

Se eliminó "(no responde a los filtros)" / "Vista histórica global" de los subtítulos de `ModalityArea`, `StackedByFaculty`, `SeasonBars` y del `card-sub` de `DonutResultado`, dejando subtítulos neutros. El encabezado introductorio de Insights explica en español que son agregados del histórico sin afirmar causalidad. Toda la UI nueva está en español.

### Documentación LaTeX

La subsección "Decisiones de diseño, accesibilidad y UX" no existía en `main` (confirmado con `git show HEAD:latex/informe_proyecto.tex`), así que el plan se equivocaba al asumir un `itemize` preexistente. El diff es puramente aditivo (solo líneas `+`, 88 inserciones / 0 borrados), inserta la subsección completa justo antes de "Reproducibilidad del dashboard" y no borra texto. El `itemize` queda balanceado; el último `\item` documenta la división en pestañas con su justificación y los atributos ARIA. Cumple el requisito de añadir sin borrar y en el lugar correcto.

### Cambios fuera del alcance de las tabs, pero dentro del pedido original

El diff trae además el buscador por umbral en filtros, los botones "Seleccionar todo"/"Ninguno", el `YearRangeSlider` de rango temporal y la conversión de las preguntas de negocio a filtrables. No forman parte del plan de tabs pero sí del pedido original del usuario (mensaje 1) y están documentados en los `\item` previos de la misma subsección LaTeX. No introducen librerías ni rompen el reparto de paneles.

</details>

<details>
<summary>Mapa de archivos</summary>

- `dashboard/src/App.jsx` — estado de tab elevado a `App`; barra de tabs accesible y dos `<section role="tabpanel">`; `OpportunityScatter`/`Heatmap` movidos a Explorador y alimentados desde la selección; coletilla retirada en Insights.
- `dashboard/src/data.js` — nuevos `aggregateOportunidad` y `aggregateHeatmap` (recálculo en cliente desde filas filtradas).
- `dashboard/src/components/FilterGroup.jsx` — botones "Seleccionar todo"/"Ninguno" y prop `onSelectAll` (fuera del alcance de tabs).
- `dashboard/src/components/YearRangeSlider.jsx` — nuevo slider de rango temporal (fuera del alcance de tabs).
- `dashboard/src/styles.css` — `.tabs/.tab/.tab.active/.tabpanel[hidden]`, acciones de filtro, estilos del slider de año y badge histórico.
- `latex/informe_proyecto.tex` — subsección "Decisiones de diseño, accesibilidad y UX" añadida completa, con `\item` de la división en pestañas.
- Diff completo: `git diff main` en `dashboard/` y `latex/`.

</details>
