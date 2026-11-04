# Plan de implementación — Fix del heatmap "Brecha socioeconómica dentro de cada facultad"

Idioma del proyecto: español (UI y documentación en español). No añadir librerías nuevas. No hacer commits salvo que el usuario lo pida. Trabajar directamente en el repo (sin worktree).

## Contexto del proyecto (verificado durante la exploración)

- Proyecto: `dashboard/` — React 18 + Vite 5 + Recharts 2 (`dashboard/package.json`). No hay dependencias de test; scripts disponibles: `dev` (`vite`), `build` (`vite build`), `preview` (`vite preview`).
- No existe framework de pruebas configurado ni archivos `*.test.*` propios del proyecto, ni docs de contribución (README/AGENTS/CONTRIBUTING/.kiro/steering) con reglas de build/test específicas. **Verificación = `npm run build` (debe compilar sin errores) + validación manual en `npm run dev`.** La baseline actual compila OK (`✓ built in ~11s`).
- Flujo de datos del heatmap (verificado en código):
  - `dashboard/src/App.jsx`: `filtered = useMemo(() => applyFilters(cube.rows, filters, null, cube.naSentinel), [cube, filters])` y luego `heatmapSel = useMemo(() => aggregateHeatmap(filtered, cube.codebooks, cube.naSentinel), [filtered, cube])`. `filtered` SÍ refleja el filtro de `nivel` del usuario.
  - `dashboard/src/data.js` → `aggregateHeatmap(rows, codebooks, naSentinel)` agrega facultad × estrato.
  - `dashboard/src/components/Heatmap.jsx`: eje fijo de estratos `['1','2','3','4','5','6','Sin dato']`; espera `data: [{facultad, estrato, n, part, tasa}]` con `estrato` como string.

## Valores EXACTOS del codebook (leídos de `dashboard/public/data.json`)

- `meta.na_sentinel` = `-1`.
- `meta.cat_dims` = `["nivel","facultad","programa","genero","estrato","tipo_admision","estado","anio_mov","modalidad"]`.
- `codebooks.nivel` (10 valores, por índice):
  `["Doctorado","Educación continua","Especialización","Extensión","INTERMEDIO","Magíster","NO DECLARADO","Nivelatorio posgrado","Pregrado","Sin información"]`
  - `'Pregrado'` existe EXACTAMENTE en el índice **8**. El label de maestría es **`"Magíster"`** (índice 5), NO "Maestría".
- `codebooks.estrato` (7 valores, por índice):
  `["1","2","3","4","5","6","Sin dato"]`
  - Coincide EXACTAMENTE con el eje fijo de `Heatmap.jsx`. `'Sin dato'` es el índice **6** del codebook.
- Conteo de filas por índice de `estrato` en `rows`: `{0:2752, 1:5967, 2:9384, 3:11589, 4:9729, 5:10549, 6:35251}`. **El `naSentinel` (-1) NO se usa para estrato**; "Sin dato" se codifica como índice 6 del codebook.
- Conteo de filas por índice de `nivel`: `{..., 5(Magíster):21560, 8(Pregrado):50319, ...}`. Total 85221 filas.

## Confirmación/refutación de causas raíz

- **Causa raíz #1 — CONFIRMADA.** En `aggregateHeatmap`, `const idxPregrado = codebooks.nivel.indexOf('Pregrado')` da **8** (≠ -1), y el bucle ejecuta `if (idxPregrado >= 0 && r.nivel !== idxPregrado) continue`, descartando SIEMPRE las ~34.902 filas no-pregrado sin importar el filtro del usuario. Por eso "seleccionar todo menos maestría" no cambia nada: Magíster (y el resto de posgrados) ya estaban excluidos de forma incondicional. El heatmap ignora de facto el filtro de `nivel`.
- **Causa raíz #2 — REFUTADA.** El label real es exactamente `'Pregrado'`, así que `idxPregrado` nunca cae en el fallback -1 y no hay mezcla accidental de niveles. No se requiere ninguna normalización de label de nivel. (Documentar esto en el plan basta; no hay cambio de código por #2.)
- **Hallazgo adicional sobre estrato (benigno).** La línea `if (r.estrato === naSentinel) continue` nunca se dispara porque estrato nunca vale -1; "Sin dato" (índice 6) fluye y se mapea a `estratos[6] = 'Sin dato'`, que casa con la columna fija del Heatmap. Por tanto NO hay desajuste de labels de estrato ni celdas con datos fuera de la grilla. No se requiere normalización de estrato. El guard por `naSentinel` puede conservarse como defensa inocua.

## Decisión de diseño

Quitar el recorte incondicional a pregrado de `aggregateHeatmap` para que el heatmap respete el filtro de `nivel` del usuario (igual que el resto del dashboard, que deriva todo de `filtered`). Razón: la selección de niveles ya la controla el usuario en el sidebar vía `applyFilters`; el heatmap debe reflejar exactamente esa selección, no imponer un subconjunto oculto. Con esto, "quitar filtro" = todos los niveles, y "todo menos maestría" = excluye Magíster y se nota en el heatmap. Se actualiza el subtítulo para que deje de afirmar "en pregrado" (ahora el heatmap muestra lo que el usuario seleccione).

## Pasos

- [ ] 1. Quitar el recorte incondicional a pregrado en `aggregateHeatmap`.
      Eliminar la línea `const idxPregrado = codebooks.nivel.indexOf('Pregrado')` y la condición `if (idxPregrado >= 0 && r.nivel !== idxPregrado) continue` del bucle. Dejar que el heatmap agregue sobre TODAS las filas de `filtered` (que ya respeta el filtro de `nivel`). Conservar el guard `if (r.estrato === naSentinel) continue` como defensa inocua. Actualizar el comentario de cabecera de la función (y el comentario en `App.jsx` sobre "en pregrado") para quitar la mención de "solo pregrado" y de "fallback por nivel", dejando claro que ahora respeta la selección activa.
      Files: `dashboard/src/data.js` (y el comentario de `dashboard/src/App.jsx` líneas ~243-244 que dice "en pregrado").
      Verify: `npm run build` compila sin errores. En `npm run dev`, abrir la pestaña "Explorador": sin filtros el heatmap muestra todos los niveles; al filtrar `nivel` = "todo menos Magíster" (o quitar Pregrado) las celdas/tasas del heatmap CAMBIAN de forma visible. Las columnas del eje `1..6` y `Sin dato` siguen poblándose correctamente.

- [ ] 2. Actualizar el subtítulo del Heatmap en `App.jsx` para quitar/aclarar "pregrado".
      Cambiar `subtitle="Según la selección. Tasa de participación (%) por facultad y estrato, en pregrado."` por un texto que refleje que el heatmap respeta la selección de niveles, p. ej. `subtitle="Según la selección (incluye el filtro de nivel académico). Tasa de participación (%) por facultad y estrato."`. Texto en español.
      Files: `dashboard/src/App.jsx` (bloque `<Heatmap ... />`, línea ~473).
      Verify: `npm run build` compila. En `npm run dev`, el subtítulo del heatmap ya no dice "en pregrado" y es coherente con el comportamiento del paso 1.

- [ ] 3. (Sin cambios en `Heatmap.jsx`) Confirmar que el eje fijo sigue siendo correcto.
      No se requiere tocar `dashboard/src/components/Heatmap.jsx`: el eje `['1','2','3','4','5','6','Sin dato']` coincide exactamente con `codebooks.estrato`, así que ninguna celda con datos queda fuera de la grilla tras el fix. Este paso es solo verificación, no edición.
      Files: ninguno.
      Verify: En `npm run dev`, con y sin filtros de nivel, todas las facultades con datos aparecen y las 7 columnas de estrato (incluida "Sin dato") muestran valores cuando existen; no aparecen estratos "huérfanos" fuera de la grilla.

## Notas / supuestos

- No se añade ningún test automatizado porque el proyecto no tiene framework de pruebas y la restricción es no añadir librerías nuevas; la verificación es `npm run build` + validación manual en `dev`.
- No se toca `FilterGroup.jsx` ni el texto del botón de filtros ("Quitar filtro"): ya lo cambió el orquestador.
- La documentación LaTeX de "decisiones de diseño/accesibilidad/UX" no forma parte de esta tarea acotada; si el loop decide documentar el cambio, dejar constancia de que el heatmap ahora respeta el filtro de nivel y ya no se limita a pregrado.
