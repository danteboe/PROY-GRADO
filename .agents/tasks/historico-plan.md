# Plan de implementación — Vistas de evolución temporal ("histórico") en Insights

Basado en el diseño aprobado `.agents/tasks/historico-design.md`. Todo en español.
Intérprete Python: `C:\Python312\python.exe`. NO instalar dependencias.
Raíz: `c:\Users\JUAN DAVID\Documents\UNIANDES\8VO SEMESTRE\PROY GRADO 2026-2\TRAVAIL\PROY-GRADO`.

Patrones confirmados en el código (fuente de cada decisión):
- `src/comparative_stats.py` es la fuente única de cálculo (funciones puras, `DECIMALES`, `_a_nativo`, `faculty_name_map`). El histórico replica ese patrón en un módulo hermano `src/historical_stats.py`.
- `src/export_dashboard.py::build_cube` añade `out["comparativo"] = ...`; se añade una línea análoga para `historico`. `MODALIDAD_PRINCIPAL` y `PRIMER_ANIO_MOVILIDAD` ya existen en el dataset analítico (usados en `build_cube`).
- `dashboard/src/data.js::loadCube` expone `comparativo: raw.comparativo || null`; se añade `historico`.
- `dashboard/src/App.jsx`: la pestaña Insights (`#panel-insights`) contiene `ComparativoInsights` + "Panorama histórico" (`ModalityArea`, `StackedByFaculty`, `SeasonBars`, `DonutResultado`). Hay `useMemo` de pivoteo año×categoría (`modalidadTemporal`, `seasonData`) a replicar.
- `nb_helpers.py::df_to_latex_booktabs(df, columnas, decimales_por_col, ...)` — `decimales_por_col` está **keyed por clave de columna de la tabla** (NIT-2 del review): hay que derivarlo del `DECIMALES` de `historical_stats`.
- `notebook_defs.py` define `NOTEBOOKS['06_comparativo_inferencial']`; `build_notebooks.py 06` construye/ejecuta. El notebook 06 copia PNG a `latex/figuras/`, escribe `.tex` en `latex/tablas/` y tiene una celda de verificación M1 que compara comp == data.json == CSV. El histórico añade `NOTEBOOKS['07_historico_evolucion']` espejo.
- `latex/informe_proyecto.tex`: `\section{Análisis comparativo inferencial}` (línea ~630) usa `\input{tablas/...}` e `\includegraphics{...}` con `\graphicspath{{figuras/}}`. El histórico añade una `\subsection` sin borrar nada.

Comandos reales de build/test (descubiertos):
- Exportar cubo: `C:\Python312\python.exe -m src.export_dashboard`
- Build dashboard: `cd dashboard && npm run build`
- Notebook informe: `C:\Python312\python.exe build_notebooks.py 07`
- Tests Python: `C:\Python312\python.exe -m pytest tests/ -q` (pytest 9.0.3 disponible; aún no hay carpeta `tests/`).

---

## Parte A — Python (cálculo + exportador)

- [ ] 1. Crear el módulo `src/historical_stats.py` con la función pura `compute_historical(df)` que devuelve el dict del contrato §2 del diseño.
      Replica el patrón de `comparative_stats.py`: importa `from . import config, utils` y reutiliza `comparative_stats.faculty_name_map` y `comparative_stats._a_nativo` (no duplicar). Define un dict local `DECIMALES` keyed por nombre de campo del contrato: `{"pct": 1, "media": 2, "mediana": 2, "q1": 2, "q3": 2}` con submapas o convención por métrica (PGA 2 dec; ICFES y avance 1 dec) — resuélvelo con un `DECIMALES` por serie numérica (p. ej. `DECIMALES_NUM = {"pga": {...}, "icfes": {...}, "avance": {...}}`) de modo que el notebook 07 pueda derivar `decimales_por_col`. Expón constantes de umbral `ANIO_MIN = 2012`, `UMBRAL_N_ANIO = 30`, `TOP_FACULTADES = 8`, y el conjunto `SIN_DATO = {"Sin dato", "Sin información", "Sin informacion", "N/A", "NA"}` (idéntico a `CategoricalAssociation.jsx`).
      Lógica: filtra participantes con `PRIMER_ANIO_MOVILIDAD` no nulo; agrupa por año; conserva años con `anio >= 2012` y `n_anio >= 30`; cuenta por separado `n_anios_fuera_rango` (año válido pero `< ANIO_MIN`) y `n_anios_bajo_umbral` (`>= ANIO_MIN` pero `< UMBRAL_N_ANIO`). Series de composición (`composicion_estrato`, `composicion_genero`, `composicion_facultad`, `composicion_modalidad`): normalización idéntica al cubo (`fillna("Sin dato").astype(str)`; facultad con `faculty_name_map().title()`; modalidad desde `MODALIDAD_PRINCIPAL`). Para estrato y género **excluir** `SIN_DATO` antes de calcular y **renormalizar** a 100% por año sobre categorías con dato. Facultad: top 8 por total en todo el rango con desempate estable (total desc, nombre asc), resto a "Otras"; si hay ≤8 facultades, **omitir** "Otras". Series numéricas (`resumen_numerico.{pga,icfes,avance}`): por año, `n`, `media`, `mediana`, `q1`, `q3` sobre `PGA_ULTIMO`/`ICFES_PUNTAJE_TOTAL`/`SEMESTRE_AVANCE`. `pct`/medias/cuartiles redondeados vía `DECIMALES`; NaN/inf → None vía `_a_nativo`. `meta` con `variable_temporal`, `framing="composicion"`, `nota_framing` (texto del §2), `anio_min`, `umbral_n_anio`, `n_por_anio` (ascendente; fuente única de años), `n_participantes_con_anio`, `n_anios_fuera_rango`, `n_anios_bajo_umbral`, `top_facultades`, `generado`. Ningún string de la salida contiene la subcadena "tasa".
      Files: `src/historical_stats.py`
      Verify: `C:\Python312\python.exe -c "import pandas as pd; from src import config, historical_stats as h; import json; df=pd.read_parquet(config.ANALYTIC_DATASET); out=h.compute_historical(df); json.dumps(out, ensure_ascii=False); print(out['meta']['framing'], len(out['composicion_estrato']))"` — imprime `composicion` y un conteo > 0, sin excepción de serialización.

- [ ] 2. Añadir tests unitarios de `historical_stats` en `tests/test_historical_stats.py` con un DataFrame sintético (sin leer el parquet real).
      Cubre (§5 del diseño): (a) cada año de composición suma 100% (±0,1); (b) años con `n<30` o `<2012` excluidos y `n_anios_fuera_rango`/`n_anios_bajo_umbral` contados por separado; (c) facultad top 8 + "Otras" con desempate estable, y con ≤8 facultades "Otras" NO aparece; (d) salida serializable con `json.dumps` (sin NaN/inf); (e) ningún campo/clave/valor string contiene "tasa"; (f) "Sin dato"/"Sin información"/N/A excluidos de estrato y género y renormalización a 100%; (g) invariante N1: años conservados == `[d["anio"] for d in meta["n_por_anio"]]`. Crea `tests/__init__.py` vacío si hace falta para el import del paquete.
      Files: `tests/test_historical_stats.py`, `tests/__init__.py`
      Verify: `C:\Python312\python.exe -m pytest tests/test_historical_stats.py -q` — todos los tests pasan.

- [ ] 3. Integrar `historico` en el exportador del cubo.
      En `src/export_dashboard.py`: importar `historical_stats` junto a `comparative_stats` y añadir, tras `out["comparativo"] = ...`, la línea `out["historico"] = historical_stats.compute_historical(df)`.
      Files: `src/export_dashboard.py`
      Verify: `C:\Python312\python.exe -m src.export_dashboard` regenera `dashboard/public/data.json`; luego `C:\Python312\python.exe -c "import json; d=json.load(open('dashboard/public/data.json',encoding='utf-8')); assert d['historico']['meta']['framing']=='composicion'; assert 'tasa' not in json.dumps(d['historico'], ensure_ascii=False).lower(); print('ok', len(d['historico']['composicion_estrato']))"` — imprime `ok` y conteo > 0.

## Parte B — Dashboard

- [ ] 4. Exponer el accesor `historico` en `dashboard/src/data.js`.
      En `loadCube()`, añadir dentro del objeto devuelto `historico: raw.historico || null,` (análogo a `comparativo`).
      Files: `dashboard/src/data.js`
      Verify: parte del build del paso 8; por ahora `cd dashboard && npx vite build` no debe romperse por esta línea (se valida al final).

- [ ] 5. Crear el componente `dashboard/src/components/HistoricalComposition.jsx` (área apilada al 100% categoría×año).
      Props: `{ title, subtitle, data, categories, note, toggle }` donde `data` son filas año×categoría ya pivoteadas (relleno de 0 en App.jsx) y `categories` la lista de series. Usar `recharts` `AreaChart` con `stackOffset="expand"` (patrón de `StackedByFaculty`+`ModalityArea`), paleta existente (`#1d4ed8`,`#0f766e`,`#d97706`,`#9333ea`,`#dc2626`,`#64748b`), `Legend`, tooltip que muestre `pct` (%) y `n` por categoría, `aria-label` descriptivo en el chart, y subtítulo con el framing composición-no-tasa (nunca la palabra "tasa"). Si `toggle` se pasa (nodo React), renderizarlo en una cabecera `card-head` como `<button>` con `aria-pressed`.
      Files: `dashboard/src/components/HistoricalComposition.jsx`
      Verify: parte del build del paso 8.

- [ ] 6. Crear el componente `dashboard/src/components/TemporalMean.jsx` (media por año + banda Q1–Q3 con selector de métrica).
      NO tocar `TemporalLine.jsx` (es rígido: `dataKey` fijo y franja COVID hardcodeada). `TemporalMean` recibe `{ title, subtitle, series }` donde `series = {pga:[{anio,n,media,mediana,q1,q3}], icfes:[...], avance:[...]}`; estado local con `<select>` de métrica (PGA/ICFES/avance, `aria-label`); dibuja banda Q1–Q3 vía `recharts` `Area` + línea de media, ejes claros (`XAxis dataKey="anio"`, `YAxis`), tooltip con media y cuartiles. Sin franja COVID. Subtítulo con framing (perfil académico medio de las cohortes de participantes; no es tasa).
      Files: `dashboard/src/components/TemporalMean.jsx`
      Verify: parte del build del paso 8.

- [ ] 7. Cablear el bloque histórico en `dashboard/src/App.jsx`.
      (a) Importar `HistoricalComposition` y `TemporalMean`. (b) Añadir `historico: raw.historico` ya expuesto por data.js como `cube.historico`; crear `useMemo` que pivoten `composicion_estrato`/`composicion_genero`/`composicion_facultad`/`composicion_modalidad` a filas `{anio, <categoria>:pct, ...}` rellenando 0 las categorías ausentes por año (patrón `modalidadTemporal`). (c) Nueva sección con `<div className="section-title">Evolución de los participantes en el tiempo</div>` colocada **tras `ComparativoInsights` y antes de** `<div className="section-title">Panorama histórico de la movilidad</div>`; dentro, en orden: tarjeta estrato (caso guía), tarjeta género, tarjeta `TemporalMean` (perfil numérico), cada una con título/subtítulo "Composición de los participantes por {dimensión} y año — no es tasa de participación" y la nota de framing repetida. (d) Toggle "Histórico" en la tarjeta de `StackedByFaculty` (conmuta a composición por facultad y año, serie `composicion_facultad`) y en `ModalityArea` (conmuta a composición 100% de modalidad por año, `composicion_modalidad`, con subtítulo que advierte el cambio de población a "participantes por año de su primer evento, ≥2012"). Los toggles son `<button>` con `aria-pressed` en la cabecera de su tarjeta; no alterar las props existentes de `StackedByFaculty`/`ModalityArea` cuando el toggle está inactivo (no romper el Explorador ni el panorama histórico). (e) Añadir a la frase del encabezado de la pestaña el framing que cubre composición y perfil numérico. Si `cube.historico` es null, degradar a placeholder sin romper el resto.
      Files: `dashboard/src/App.jsx`
      Verify: parte del build del paso 8.

- [ ] 8. Compilar el dashboard y confirmar que los nuevos componentes integran sin errores.
      Files: (verificación de 4–7)
      Verify: `cd dashboard && npm run build` — termina sin errores y genera `dashboard/dist/`.

## Parte C — LaTeX (informe)

- [ ] 9. Añadir el notebook `07_historico_evolucion` en `notebook_defs.py` (espejo del 06).
      Define `NOTEBOOKS['07_historico_evolucion'] = (titulo, celdas)` con celdas `md`/`code` y `BOOTSTRAP`. Importa `from src import historical_stats as hs` y `from nb_helpers import df_to_latex_booktabs`; rutas absolutas desde `config` (`LATEX_FIG = config.ROOT_DIR/'latex'/'figuras'`, `LATEX_TABLAS = .../'tablas'`, `mkdir(parents=True, exist_ok=True)`). Llama a `hist = hs.compute_historical(df)` **una sola vez** (no recalcula). Dibuja con matplotlib y `utils.save_fig(...)` a `reports/figures/` y copia con `shutil.copy2` a `latex/figuras/`: `fig_hist_estrato.png`, `fig_hist_genero.png`, `fig_hist_facultad.png`, `fig_hist_modalidad.png`, `fig_hist_numericas.png`. Escribe tablas `.tex` booktabs/longtable en `latex/tablas/` (composición por estrato×año y resumen numérico por año) usando `df_to_latex_booktabs` con `decimales_por_col` **derivado del `DECIMALES` de `historical_stats`** mapeando nombre-de-columna→decimales (NIT-2). Incluye una **celda de verificación M1** que compara, a la precisión de `DECIMALES`, al menos una serie de composición (p. ej. estrato de un año) y una numérica (media PGA de un año) entre `hist`, `data.json` (clave `historico`) y el CSV/.tex renderizado, y **falla** (`assert`) si difieren. Narrativa de celdas con framing composición-no-tasa y la limitación (asociación, no causa).
      Files: `notebook_defs.py`
      Verify: parte del paso 10.

- [ ] 10. Ejecutar el notebook 07 y confirmar que genera figuras/tablas sin error.
      Depende del paso 3 (data.json con `historico`) y del 9.
      Files: (ejecución de 9)
      Verify: `C:\Python312\python.exe build_notebooks.py 07` — ejecuta sin error (celda M1 en verde) y crea `latex/figuras/fig_hist_*.png` y los `.tex` en `latex/tablas/`.

- [ ] 11. Añadir la subsección de evolución temporal en `latex/informe_proyecto.tex` sin borrar contenido existente.
      Dentro de `\section{Análisis comparativo inferencial (participantes vs. no participantes)}` (o al cierre de esa sección), añadir `\subsection{Evolución temporal de la composición de participantes}` con `\includegraphics` de las PNG `fig_hist_*.png` (usa `\graphicspath{{figuras/}}` ya presente) y `\input{tablas/...}` de las tablas generadas en el paso 10, más un párrafo de framing (composición de participantes por año, no tasa; asociación, no causa; limitación de que los no participantes no tienen año). Sin paquetes LaTeX nuevos (usa `booktabs`/`longtable`/`tabularx` ya cargados). No modificar ni eliminar secciones/insights previos.
      Files: `latex/informe_proyecto.tex`
      Verify: `C:\Python312\python.exe -c "import pathlib,re; t=pathlib.Path('latex/informe_proyecto.tex').read_text(encoding='utf-8'); assert 'Evolución temporal de la composición de participantes' in t; assert all(f in t for f in ['fig_hist_estrato.png']); print('ok')"` — imprime `ok`. (La compilación PDF con LaTeX no forma parte del alcance/entorno; la verificación es la presencia de `\input`/`\includegraphics` de artefactos realmente generados en el paso 10.)

## Convergencia / verificación integral

- [ ] 12. Verificación cruzada web↔informe end-to-end.
      Reejecutar en orden `C:\Python312\python.exe -m src.export_dashboard`, `C:\Python312\python.exe build_notebooks.py 07`, `cd dashboard && npm run build`, `C:\Python312\python.exe -m pytest tests/ -q`. Confirmar que data.json, PNG/.tex y el build quedan consistentes y que la celda M1 del notebook 07 pasa.
      Verify: los cuatro comandos terminan sin error.

## Supuestos y notas

- La compilación del PDF LaTeX no se ejecuta aquí (no hay distribución LaTeX garantizada en el entorno). La consistencia se asegura vía la celda M1 del notebook 07 y la presencia verificable de los `\input`/`\includegraphics`.
- `pytest` está instalado (9.0.3) pero no figura en `requirements.txt`; no se instala nada. Si se desea dejar constancia, puede añadirse `pytest` a `requirements.txt` como cambio opcional, pero no es necesario para ejecutar los tests en este entorno.
- Precisión de decimales: un único `DECIMALES` en `historical_stats` es la fuente; el notebook 07 deriva `decimales_por_col` de él (por la firma real de `df_to_latex_booktabs`, keyed por columna de tabla).
