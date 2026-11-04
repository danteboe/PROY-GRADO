# Evidencia de verificación — Fix del heatmap "Brecha socioeconómica"

Este documento registra la verificación ejecutable exigida por el plan y por el
hallazgo de review (`heatmap-review.json`: "Evidencia de verificación ausente").
Todas las órdenes se ejecutaron en Windows / PowerShell.

## 1. Build de producción (`npm run build`)

Directorio: `dashboard/`. Script exacto (de `package.json`): `build = vite build`.

```
> dashboard-internacionalizacion@0.9.0 build
> vite build
vite v5.4.21 building for production...
✓ 845 modules transformed.
dist/index.html                   0.43 kB │ gzip:   0.30 kB
dist/assets/index-rKQ_CphP.css    8.41 kB │ gzip:   2.23 kB
dist/assets/index-Ccftu9dC.js   617.27 kB │ gzip: 172.24 kB
✓ built in 7.06s
```

Resultado: **exit 0, sin errores.**

## 2. Prueba numérica ejecutable (Node)

Se creó un script temporal `dashboard/_tmp_heatmap_test.mjs` (ya borrado tras la
ejecución). El script:

- Lee `dashboard/public/data.json`.
- Reconstruye `rows` exactamente como `loadCube` (decodifica índices categóricos
  y numéricos usando `meta.cat_dims` / `meta.num_dims`).
- Importa `applyFilters` y `aggregateHeatmap` reales desde `src/data.js`.
- Aplica un filtro de `nivel` que EXCLUYE "Magíster" (label real de maestría
  confirmado en el plan; índice 5 del codebook), es decir "todo menos maestría".
- Compara celdas y suma de `n` CON y SIN el filtro.

Salida obtenida:

```
Índice de Magíster: 5
SIN filtro  -> celdas: 123 | suma n: 233987
CON filtro  -> celdas: 121 | suma n: 186468
Diferencia en suma n (Magíster excluido): 47519
Celdas con estrato "Sin dato": 22 | suma n: 117277
OK: el filtro de nivel SÍ altera el heatmap (celdas distintas: true , n distinto: true ).
```

Conclusión numérica:

- El resultado **cambia** al aplicar el filtro de nivel: las celdas pasan de 123 a
  121 y la suma de `n` de 233 987 a 186 468 (diferencia 47 519, las filas de
  Magíster). Esto demuestra que el síntoma ("seleccionar todo menos maestría no
  hace nada") queda resuelto.
- La columna **"Sin dato"** del eje de estratos sí se puebla (22 celdas, n =
  117 277): las observaciones con estrato "Sin dato" (índice 6, valor legítimo del
  codebook) caen en su columna y no desaparecen. exit 0.

El script temporal se eliminó al terminar (`Remove-Item _tmp_heatmap_test.mjs`).

## 3. Documentación LaTeX (`latex/informe_proyecto.tex`)

Toolchain disponible: `pdflatex` (MiKTeX). Compilado:

```
pdflatex -interaction=nonstopmode -halt-on-error informe_proyecto.tex
Output written on informe_proyecto.pdf (27 pages, 1079571 bytes).
```

Resultado: **exit 0**, PDF generado (27 páginas). La nota sobre el nuevo
comportamiento del heatmap ya figura como `\item` dentro del `itemize` de la
subsección "Decisiones de diseño, accesibilidad y UX".

## Qué se verificó / qué NO

- Verificado (ejecutable): build de producción (exit 0), prueba numérica (el
  filtro de nivel altera el heatmap; la columna "Sin dato" se puebla), compilación
  LaTeX (exit 0).
- NO verificado en este entorno: render visual en navegador (no se ejecuta
  `npm run dev` ni se abre el tablero aquí). El comportamiento visual se infiere de
  la prueba numérica, que opera sobre las mismas funciones (`applyFilters` +
  `aggregateHeatmap`) que alimentan el componente `Heatmap`.
