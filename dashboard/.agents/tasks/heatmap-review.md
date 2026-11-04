# El heatmap de brecha socioeconómica ahora respeta el filtro de nivel

El cambio elimina el recorte incondicional a pregrado dentro de `aggregateHeatmap` (`dashboard/src/data.js`), causa raíz de que "seleccionar todo menos maestría" no moviera el heatmap: la función descartaba todas las filas no-pregrado sin importar lo que el usuario filtrara. Tras el fix, el heatmap agrega sobre exactamente las filas `filtered` que recibe, de modo que respeta el filtro de `nivel` (y los demás del panel), igual que el resto del tablero. Se conserva el guard `estrato === naSentinel` como defensa inocua, se actualiza el subtítulo en `App.jsx` para que deje de afirmar "en pregrado", y se documenta la decisión en la subsección de diseño/accesibilidad/UX del informe LaTeX. `FilterGroup.jsx`, `Heatmap.jsx` y los manifiestos de dependencias quedan intactos.

Esta es la segunda pasada. El único hallazgo de la pasada anterior —evidencia de verificación ausente— quedó resuelto: el coder registró en `dashboard/.agents/tasks/heatmap-verification.md` la salida de `npm run build` (exit 0) y una prueba numérica que demuestra que el filtro de nivel altera el heatmap y que la columna "Sin dato" se puebla.

**Watch for:** nada bloqueante. La única limitación declarada por el coder es que el render visual en navegador no se ejecutó en el entorno (confirmed, por `heatmap-verification.md` §"Qué se verificó / qué NO"); el comportamiento se infiere de la prueba numérica sobre las mismas funciones (`applyFilters` + `aggregateHeatmap`) que alimentan el componente.

**Verdict**: APPROVED

## High-level view

El fix es de una línea de comportamiento: se quita `const idxPregrado = ...` y el `continue` que descartaba filas no-pregrado, dejando que el heatmap refleje `filtered`. Esto ataca directamente la causa raíz confirmada en el plan y hace que el filtro de nivel por fin cambie la vista.

El eje de estratos del Heatmap (`['1','2','3','4','5','6','Sin dato']`) casa exactamente con `codebooks.estrato`, y la función emite `estrato: estratos[v.estIdx]`, así que cada celda con datos cae en su columna; "Sin dato" (índice 6, valor legítimo del catálogo) se muestra en su columna y solo se descarta el `naSentinel` numérico. No hay celdas huérfanas fuera de la grilla.

El subtítulo en `App.jsx` pasa a reflejar la selección actual e incluye explícitamente el filtro de nivel, coherente con el nuevo comportamiento. El comentario de cabecera de `aggregateHeatmap` y el de `App.jsx` se reescriben para quitar la mención de "solo pregrado". La nota LaTeX se añade como un `\item` nuevo dentro del `itemize` existente de "Decisiones de diseño, accesibilidad y UX" (subsección en la línea 780), sin borrar lo anterior.

La restricción de "no tocar el botón de FilterGroup" y "no añadir librerías" se cumple: `git diff main --name-only` solo lista `App.jsx`, `data.js` y los dos artefactos LaTeX. La verificación exigida por el plan está ahora documentada con salida de build y prueba numérica.

<details>
<summary>Issues (0)</summary>

Sin hallazgos bloqueantes. El hallazgo de la pasada anterior ("Evidencia de verificación ausente") está resuelto.

</details>

<details>
<summary>Details</summary>

### Quitar el recorte a pregrado

El diff elimina las dos piezas que anclaban el heatmap a pregrado: la declaración `const idxPregrado = codebooks.nivel.indexOf('Pregrado')` y el `if (idxPregrado >= 0 && r.nivel !== idxPregrado) continue` del bucle. Con `'Pregrado'` presente en el codebook (índice 8), ese `continue` se disparaba para toda fila no-pregrado en cada render, de modo que el filtro de nivel del sidebar no tenía efecto observable sobre esta vista. Al quitarlo, el bucle agrega sobre `filtered`, que `App.jsx` ya calcula vía `applyFilters` respetando `nivel`, así que "todo menos Magíster" excluye esas filas de forma visible.

### Estrato 'Sin dato' y correspondencia con el eje fijo

```js
const estratos = codebooks.estrato            // ['1','2','3','4','5','6','Sin dato']
...
if (r.estrato === naSentinel) continue
...
out.push({ ..., estrato: estratos[v.estIdx], ... })
```

El label emitido viene de `codebooks.estrato`, idéntico al eje fijo de `Heatmap.jsx`, que indexa cada celda por `${f}|${e}` sobre ese mismo arreglo; por eso ninguna celda con datos queda fuera de la grilla. "Sin dato" es el índice 6 del catálogo (valor real, no el centinela) y el guard `estrato === naSentinel` solo elimina el NA numérico genuino (-1), que según el plan no se usa para estrato.

### Evidencia de verificación (resuelto en esta pasada)

El plan fija la verificación en `npm run build` sin errores más validación, dado que el proyecto no tiene framework de pruebas. En esta pasada existe `dashboard/.agents/tasks/heatmap-verification.md` con: build de producción (`vite build`, exit 0, `✓ built in 7.06s`) y una prueba numérica en Node que reconstruye `rows` como `loadCube`, importa `applyFilters` y `aggregateHeatmap` reales, y compara con y sin "todo menos Magíster". El resultado registrado —celdas 123→121, suma de `n` 233 987→186 468 (diferencia 47 519, las filas de Magíster), y columna "Sin dato" poblada con 22 celdas (n = 117 277)— demuestra tanto que el filtro de nivel ya altera el heatmap como que las observaciones "Sin dato" caen en su columna. También consta la compilación LaTeX (exit 0). Lo no verificado (render en navegador) queda explícitamente declarado y es una limitación de entorno, no un defecto del cambio. Por instrucción de esta revisión se lee esta evidencia sin re-ejecutar las suites.

</details>

<details>
<summary>Mapa de archivos</summary>

- `dashboard/src/data.js` — se elimina el recorte incondicional a pregrado en `aggregateHeatmap` y se reescribe el comentario de cabecera.
- `dashboard/src/App.jsx` — subtítulo del Heatmap sin "pregrado" y comentario del bloque de agregación actualizado.
- `latex/informe_proyecto.tex` — nuevo `\item` en la subsección de decisiones de diseño/accesibilidad/UX documentando el fix, sin borrar lo existente.
- `latex/informe_proyecto.pdf` — artefacto recompilado (no es contenido de revisión).

Diff completo: `git diff main -- dashboard/src/data.js dashboard/src/App.jsx latex/informe_proyecto.tex`

</details>
