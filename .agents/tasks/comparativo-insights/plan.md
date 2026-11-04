# Plan de implementación — comparativo-insights

Plan ordenado por dependencia a partir del diseño **aprobado** (`diseno.md`), su revisión
(`design-review.md`), los requisitos (`requisitos.md`) y el entorno (`entorno.md`). No se re-decide la
arquitectura: se secuencia la implementación fielmente. Se incorporan además, como ítems explícitos y
con criterios de aceptación verificables, los **dos hallazgos MEDIUM** que el orquestador marcó como no
resueltos (M1: consistencia web↔informe sobre los `.tex` realmente renderizados; M2: cero cifras a mano
en el `.tex` de la nueva sección).

Convenciones de entorno (de `entorno.md`, verificadas en esta sesión):
- Intérprete Python: `C:\Python312\python.exe` (3.12.4). `scipy` 1.16.3 y `scikit-learn` 1.7.2 presentes;
  `statsmodels` AUSENTE. No se instalan dependencias (RNF-2).
- `pdflatex` disponible (`C:\Users\...\pdflatex.exe`, MiKTeX 23.4). `npm` disponible.
- Comandos reales: `python -m src.export_dashboard`, `python build_notebooks.py 06`,
  `cd dashboard; npm run build`, `pdflatex` sobre `latex/informe_proyecto.tex`.
- Rutas absolutas base: raíz = `c:\Users\JUAN DAVID\Documents\UNIANDES\8VO SEMESTRE\PROY GRADO 2026-2\TRAVAIL\PROY-GRADO`.

---

- [ ] 1. Crear el módulo de cálculo puro `src/comparative_stats.py` (fuente única de verdad, RF-1/RF-2).
      Exponer: `RANDOM_SEED = config.RANDOM_SEED`; `DECIMALES` (dict de precisión por campo, base de M1,
      ver §3/§5.4 del diseño y la nota M1 de la revisión); `faculty_name_map()` (lógica trasladada de
      `export_dashboard._faculty_name_map`); `numeric_comparison(df, var, label)` (Welch + Mann-Whitney
      `method="asymptotic"` + d de Cohen con `sd_pooled` + IC95% de la diferencia de medias por
      Welch–Satterthwaite + resumen boxplot Tukey; una sola definición de `sd` con `ddof=1`);
      `categorical_comparison(df, var, label, min_n=30)` (chi² + V de Cramér + tabla de tasas con
      supresión n<30 y normalización `.astype(str)`/`fillna("Sin dato")` idéntica al cubo, N3 de la
      revisión); `bh_fdr(pvalues)` (Benjamini-Hochberg con numpy); `logistic_model(df, predictors,
      n_boot=1000, seed=RANDOM_SEED)` (LogisticRegression `penalty=None, class_weight="balanced"`,
      caso completo, z-score recomputado por réplica, OR=exp(coef), IC95% bootstrap percentil, estados
      no-felices `multivariado|fallback_tabla_2x2|no_disponible`); y `compute_comparative(df,
      scope="pregrado")` que orquesta todo y devuelve el dict EXACTO de §3 del diseño (incluye
      `meta.generado = pd.Timestamp.now().strftime("%Y-%m-%d")`). Funciones puras, sin E/S. Comentarios
      en español (RNF-4). Variables y familias FDR exactamente como §2.6/§2.9.
      Archivos: `src/comparative_stats.py`
      Verify: `C:\Python312\python.exe -c "from src import comparative_stats as cs; import pandas as pd, numpy as np; a=np.array([1.0,2,3,4,5]); b=np.array([2.0,3,4,5,6]); print(cs.bh_fdr([0.01,0.2,0.03])); d=pd.DataFrame({'PARTICIPA':[1,1,0,0,1],'ES_PREGRADO':[True]*5,'PGA_ULTIMO':[4.1,4.2,3.5,3.6,4.0]}); print(cs.numeric_comparison(d,'PGA_ULTIMO','PGA')['cohen_d'])"` — importa sin error, `bh_fdr` devuelve 3 valores monótonos, y `cohen_d` es un float con signo positivo (media_part > media_no).

- [ ] 2. Integrar el módulo en `src/export_dashboard.py` (entregable A): refactorizar
      `_faculty_name_map` para delegar en `comparative_stats.faculty_name_map()` (misma lógica), y en
      `build_cube()` añadir `out["comparativo"] = comparative_stats.compute_comparative(df, "pregrado")`
      justo antes del `return out`. Asegurar serialización JSON segura (numpy→nativo; `NaN`/`inf`→`null`,
      ver §7 del diseño). No alterar ninguna otra vista ni el fix del Heatmap (RNF-7).
      Archivos: `src/export_dashboard.py`
      Verify: `C:\Python312\python.exe -m src.export_dashboard` termina sin error e imprime el tamaño;
      luego `C:\Python312\python.exe -c "import json; d=json.load(open(r'dashboard/public/data.json',encoding='utf-8')); c=d['comparativo']; assert {'meta','numericas','categoricas','logistica'} <= set(c); pga=[x for x in c['numericas'] if x['var']=='PGA_ULTIMO'][0]; assert pga['media_part']>pga['media_no']; assert pga['cohen_d']>0; print('PGA media_part',pga['media_part'],'media_no',pga['media_no'],'d',pga['cohen_d'])"` — la sección `comparativo` existe con valores plausibles (media_part de PGA > media_no; d de Cohen positivo = signo correcto).

- [ ] 3. Verificación de números clave del brief sobre `data.json` (reporte obligatorio).
      Leer de `dashboard/public/data.json` y reportar por consola: d de Cohen de `PGA_ULTIMO`,
      `ICFES_PUNTAJE_TOTAL` y `SEMESTRE_AVANCE`; V de Cramér de `ESTRATO_SOCIAL` y `GENERO`; `n_part`,
      `n_no` y `tasa_base_pct` de `meta`. No modifica código; es un control de plausibilidad.
      Archivos: (ninguno; comando de verificación)
      Verify: `C:\Python312\python.exe -c "import json; c=json.load(open(r'dashboard/public/data.json',encoding='utf-8'))['comparativo']; num={x['var']:x for x in c['numericas']}; cat={x['var']:x for x in c['categoricas']}; print('d PGA',num['PGA_ULTIMO']['cohen_d'],'| d ICFES',num['ICFES_PUNTAJE_TOTAL']['cohen_d'],'| d AVANCE',num['SEMESTRE_AVANCE']['cohen_d']); print('V estrato',cat['ESTRATO_SOCIAL']['cramers_v'],'| V genero',cat['GENERO']['cramers_v']); print('n_part',c['meta']['n_part'],'n_no',c['meta']['n_no'],'tasa',c['meta']['tasa_base_pct'])"` — imprime todos los números clave; valores finitos y en rangos plausibles (d de PGA > 0; V de estrato ~0,10–0,20).

- [ ] 4. Añadir el notebook `06_comparativo_inferencial` a `notebook_defs.py` (entregable C, generación
      de artefactos). El notebook: (a) `BOOTSTRAP`; (b) carga el parquet y llama a
      `comparative_stats.compute_comparative(df, "pregrado")` — MISMO cálculo, sin recomputar nada
      (RF-1/RF-14); (c) dibuja las 3 PNG con matplotlib a partir del dict (`fig_comparativo_boxplots.png`
      vía `ax.bxp` con los 5 números Tukey precalculados, `fig_comparativo_cohend.png`,
      `fig_comparativo_cramersv.png`) y las guarda con `utils.save_fig`; (d) define
      `df_to_latex_booktabs` (formateador de presentación, vive en el notebook / `nb_helpers.py`, NO en
      `comparative_stats.py` — N1 de la revisión) que usa el MISMO dict `DECIMALES` del módulo para
      fijar decimales por campo; (e) escribe los CSV en `reports/tables/` y los `.tex` booktabs en
      `latex/tablas/` (directorio NUEVO) con rutas absolutas desde `config.ROOT_DIR`; (f) copia las PNG
      a `latex/figuras/` con `shutil.copy2` y rutas absolutas (§5.3). Registrar la entrada en el dict
      `NOTEBOOKS` con la clave `06_comparativo_inferencial`.
      Archivos: `notebook_defs.py`, `nb_helpers.py` (si `df_to_latex_booktabs` va allí)
      Verify: `C:\Python312\python.exe build_notebooks.py 06` termina en `[ok] 06_comparativo_inferencial.ipynb`; luego confirmar que existen `reports/figures/fig_comparativo_boxplots.png`, `fig_comparativo_cohend.png`, `fig_comparativo_cramersv.png`, los tres CSV en `reports/tables/comparativo_*.csv`, y los `.tex` en `latex/tablas/comparativo_*.tex` + las 3 PNG copiadas en `latex/figuras/`.

- [ ] 5. **[M1]** Añadir al notebook `06` una celda de verificación de consistencia que falle el build si
      divergen. La celda: (1) llama a `compute_comparative`; (2) carga `dashboard/public/data.json`;
      (3) parsea los CSV generados (`reports/tables/comparativo_numericas.csv` y
      `comparativo_categoricas.csv`, sin coma decimal); (4) `assert` de que, para al menos 2–3 cifras
      clave — **media de PGA por grupo**, **d de Cohen de PGA** y **V de Cramér de estrato** — los
      valores de `data.json`, del dict de `compute_comparative` y del CSV/.tex renderizado coinciden tras
      aplicar el redondeo común de `DECIMALES`. Es la verificación primaria de RNF-1 (no requiere pytest,
      NIT 7). Esto cierra M1: la coincidencia se comprueba sobre lo que el informe REALMENTE renderiza
      (los `.tex`/CSV), no solo sobre `data.json`.
      Archivos: `notebook_defs.py` (celda final del notebook 06)
      Verify: `C:\Python312\python.exe build_notebooks.py 06` termina en verde (si las cifras divergieran, la celda lanzaría `AssertionError` y el build fallaría). Criterio de aceptación M1: al menos 3 cifras (media de PGA part/no, d de Cohen de PGA, V de Cramér de estrato) son IDÉNTICAS a la precisión publicada entre `data.json` y el `.tex`/CSV.

- [ ] 6. **[M2]** Generar la narrativa con cifras interpoladas desde Python (cero números a mano en el
      `.tex`). En el notebook `06`, emitir `latex/tablas/comparativo_narrativa.tex` donde cada magnitud
      citada (p. ej. `d = {d:.2f}` de las 3–4 variables de mayor |d|, V de Cramér de estrato/género,
      tasas por estrato) se interpola desde el dict de `compute_comparative` usando `DECIMALES`. Emitir
      también `comparativo.resumen_narrativo` en `data.json` (texto con las mismas cifras interpoladas)
      para la web. La prosa fija del `.tex` NO contiene números tecleados a mano en afirmaciones
      cuantitativas nuevas; todo número proviene de `\input` o de las tablas autogeneradas.
      Archivos: `notebook_defs.py` (celda del notebook 06), `src/comparative_stats.py` (campo
      `resumen_narrativo` en el dict, si se decide generarlo en el módulo)
      Verify: `C:\Python312\python.exe build_notebooks.py 06` regenera `latex/tablas/comparativo_narrativa.tex`; confirmar que el archivo existe y que sus cifras cambian si cambia el cálculo (cero literales a mano). Criterio de aceptación M2: ninguna afirmación cuantitativa nueva de la sección tiene números tecleados a mano; todas vienen de `\input`/tablas.

- [ ] 7. Añadir el accesor en `dashboard/src/data.js` (entregable B). En el objeto devuelto por
      `loadCube()` agregar `comparativo: raw.comparativo || null` (patrón existente `clave: raw.x || []`).
      No tocar el resto del decodificador.
      Archivos: `dashboard/src/data.js`
      Verify: `cd dashboard; npm run build` termina con exit 0 (sin romper el decodificador).

- [ ] 8. Crear los componentes React de la pestaña Insights en `dashboard/src/components/` (entregable B,
      RF-11). Un componente por archivo, todos leen datos PRECALCULADOS (sin recomputar cuantiles ni
      estadísticos en cliente), con `aria-label`, `Tooltip` y clases existentes (`card`, `card-sub`,
      `section-title`, `custom-tooltip`, `tt-*`) para accesibilidad y contraste (RNF-8). Componentes:
      `CohenDChart.jsx` (barras horizontales de d de Cohen ordenadas por |d|, `ReferenceLine` en
      ±0,2/±0,5/±0,8, color por signo); `ComparativeBoxplots.jsx` (boxplots participa vs. no con
      `ComposedChart` + `Customized` dibujando caja/mediana/bigotes Tukey, selector accesible de
      variable); `CategoricalAssociation.jsx` (barras de `tasa_pct` por categoría con `ReferenceLine` en
      `meta.tasa_base_pct` + badge de V de Cramér, selector de variable); `LogisticOddsRatios.jsx`
      (forest-plot con `ErrorBar` sobre OR, `ReferenceLine` en OR=1, nota de aproximación). Todos manejan
      `comparativo == null` con un placeholder "Sin datos comparativos" (§7 del diseño). Seguir el patrón
      Recharts de `NumericDist.jsx`.
      Archivos: `dashboard/src/components/CohenDChart.jsx`, `dashboard/src/components/ComparativeBoxplots.jsx`, `dashboard/src/components/CategoricalAssociation.jsx`, `dashboard/src/components/LogisticOddsRatios.jsx`
      Verify: `cd dashboard; npm run build` termina con exit 0 con los componentes nuevos.

- [ ] 9. Reorganizar la pestaña Insights en `dashboard/src/App.jsx` (entregable B, RF-11/RF-12).
      Importar los 4 componentes nuevos. En el `panel-insights`, AÑADIR AL PRINCIPIO (antes de
      "Modalidades en el tiempo") el bloque comparativo: `section-title` "¿Qué diferencia a quienes
      participan? (pregrado)" + párrafo narrativo (desde `comparativo.resumen_narrativo`, sin lenguaje
      causal), luego `<CohenDChart>`, `<ComparativeBoxplots>`, `<CategoricalAssociation>` y
      (opcional) `<LogisticOddsRatios>`. MANTENER debajo, intactos, `ModalityArea`, `StackedByFaculty`,
      `SeasonBars` y `DonutResultado` bajo un `section-title` "Panorama histórico de la movilidad". Las
      vistas de Insights siguen SIN responder a los filtros. No tocar el panel Explorador ni el Heatmap.
      Archivos: `dashboard/src/App.jsx`
      Verify: `cd dashboard; npm run build` termina con exit 0; la pestaña Insights conserva las 4 vistas globales previas y añade boxplots, d de Cohen, tasas con V de Cramér y resumen narrativo (criterio 6).

- [ ] 10. Añadir la sección técnica a `latex/informe_proyecto.tex` (entregable C, RF-13). Insertar una
      `\section{Análisis comparativo inferencial (participantes vs. no participantes)}` INMEDIATAMENTE
      después de `\section{Hallazgos e insights principales}` (`\label{sec:insights}`, línea 507–508) y
      ANTES de `\section{Reorientación del alcance: foco descriptivo}` (`\label{sec:reorientacion}`,
      línea 630), SIN borrar contenido existente. Subsecciones §5.1 del diseño: (1) enfoque tamaño de
      efecto sobre significancia; (2) numéricas con `\includegraphics{fig_comparativo_boxplots.png}` +
      `\includegraphics{fig_comparativo_cohend.png}` + `\input{tablas/comparativo_numericas.tex}`;
      (3) categóricas con `\includegraphics{fig_comparativo_cramersv.png}` +
      `\input{tablas/comparativo_categoricas.tex}`; (4) modelo logístico con
      `\input{tablas/comparativo_logistica.tex}` + advertencia de aproximación; (5) equidad,
      limitaciones y encuadre asociativo. La narrativa se trae con `\input{tablas/comparativo_narrativa.tex}`
      (M2). NO añadir paquetes nuevos (solo `booktabs`/`graphicx`/`longtable`/`tabularx` ya cargados,
      RNF-6). No tocar `tab:perfil` ni `tab:grupos`.
      Archivos: `latex/informe_proyecto.tex`
      Verify: `pdflatex -interaction=nonstopmode -halt-on-error informe_proyecto.tex` (dos pasadas, en `cwd=latex/`) termina con exit 0 y produce `informe_proyecto.pdf`; registrar el número de páginas antes/después y confirmar que AUMENTÓ (sección nueva añadida, contenido previo intacto).

- [ ] 11. COMPROBACIÓN DE COHERENCIA final (verificación cruzada obligatoria del brief, RNF-1/criterio 9).
      Tras ejecutar el pipeline completo, comprobar que al menos un par de números — **media de PGA por
      grupo** y **d de Cohen de PGA** — son IDÉNTICOS entre `dashboard/public/data.json` y la tabla del
      informe (`reports/tables/comparativo_numericas.csv`, que es la fuente numérica del
      `latex/tablas/comparativo_numericas.tex` renderizado). Comparar tras redondeo común (`DECIMALES`).
      Añadir también V de Cramér de estrato como tercer número.
      Archivos: (ninguno; comando de verificación)
      Verify: `C:\Python312\python.exe -c "import json,csv; c=json.load(open(r'dashboard/public/data.json',encoding='utf-8'))['comparativo']; num={x['var']:x for x in c['numericas']}; rows=list(csv.DictReader(open(r'reports/tables/comparativo_numericas.csv',encoding='utf-8'))); pga_csv=[r for r in rows if 'PGA' in r['label']][0]; print('JSON media_part',round(num['PGA_ULTIMO']['media_part'],2),'CSV',pga_csv); print('JSON d',round(num['PGA_ULTIMO']['cohen_d'],2))"` — los valores de media de PGA por grupo y d de Cohen coinciden exactamente (a la precisión de `DECIMALES`) entre `data.json` y el CSV/.tex del informe. Si difieren, es fallo bloqueante (M1).

- [ ] 12. Verificación integral end-to-end (RNF-5/RNF-9, criterios 7, 8, 10, 11). Ejecutar la secuencia
      reproducible completa y confirmar que no se añadieron dependencias (`statsmodels` no instalado) y
      que el fix del Heatmap no se alteró.
      Archivos: (ninguno; comandos)
      Verify: en orden — `C:\Python312\python.exe -m src.export_dashboard` (exit 0);
      `C:\Python312\python.exe build_notebooks.py 06` (exit 0, celda de consistencia M1 en verde);
      `cd dashboard; npm run build` (exit 0); `pdflatex` dos pasadas (exit 0, PDF con más páginas);
      `git diff --stat` no muestra cambios en la escala de color del Heatmap ni en `requirements.txt`.

---

## Riesgos y dependencias

- **Dependencia dura 1→2→4/5/6→10/11.** El módulo `comparative_stats.py` es la fuente única; todo lo
  demás lo consume. Si su contrato (§3) cambia, se arrastran los consumidores. Implementarlo y verificarlo
  (ítem 1) antes de integrarlo.
- **M1 (consistencia web↔informe).** El riesgo real no es `data.json` vs `compute_comparative` (trivial),
  sino `data.json` vs el `.tex` renderizado, porque hay dos pasos de formateo (número→JSON y
  número→tabla LaTeX). Mitigación fijada: un único `DECIMALES` por campo aplicado a AMBAS salidas, y la
  celda de verificación del ítem 5 que compara contra el CSV/.tex, no solo contra el JSON.
- **M2 (cifras a mano).** Riesgo de que el redactor teclee números en la prosa. Mitigación: narrativa
  interpolada desde Python (`comparativo_narrativa.tex` + `resumen_narrativo` en `data.json`).
- **Logística (scikit-learn, sin statsmodels).** IC por bootstrap (B=1000) es aproximación; puede no
  converger o tener réplicas degeneradas. El contrato cubre los estados no-felices
  (`no_disponible`/`fallback_tabla_2x2`); verificar que web e informe rendericen sin ramas condicionales.
  El bootstrap de 1000 réplicas sobre ~41k×4 puede tardar; vigilar el timeout de `build_notebooks.py`
  (ya configurado a 1800 s).
- **LaTeX.** `pdflatex` confirmado (MiKTeX). Ruta A del diseño (sin paquetes nuevos) minimiza el riesgo;
  requiere dos pasadas para referencias cruzadas. `latex/tablas/` es un directorio NUEVO creado por el
  notebook con rutas absolutas desde `config.ROOT_DIR` (robusto al `cwd=notebooks/` del kernel).
- **Cobertura de variables.** Las coberturas exactas en pregrado (p. ej. PGA ~53–55%) vienen de
  `requisitos.md`, no recomputadas; `numeric_comparison` reporta `n` efectivo por grupo, así que un
  desfase pequeño no invalida el método.
