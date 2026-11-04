# Requisitos — Análisis estadístico comparativo "¿Qué diferencia a los estudiantes que participan en internacionalización de los que no?"

Tarea: comparativo-insights · Foco de modelamiento: **pregrado** (tasa ~4,15 %), con lecturas globales donde aporten.

## Resumen

Se requiere un análisis estadístico comparativo robusto entre estudiantes **participantes** y **no participantes** en programas de internacionalización, que aparezca de forma **numéricamente idéntica** en tres entregables: (A) una nueva sección `comparativo` del cubo `data.json` generada por el pipeline Python, (B) nuevas vistas en la pestaña **Insights** del dashboard React, y (C) una nueva sección técnica del informe LaTeX con gráficos (boxplots entre otros), tablas de pruebas de significancia y narrativa analítica.

El requisito transversal y no negociable es la **consistencia numérica exacta** entre el dashboard y el informe: ambos deben leer de **una única fuente de cálculo** en Python (un módulo nuevo, p. ej. `src/comparative_stats.py`), de modo que ninguna cifra se recalcule por separado en JavaScript, en LaTeX ni en un notebook. El análisis debe respetar el encuadre descriptivo del proyecto: se reportan **asociaciones, no causas**, se prioriza el **tamaño de efecto** sobre la significancia (porque con N grande casi todo sale significativo), y se mantiene la **minimización de datos** (Ley 1581): solo estadísticos agregados, nunca microdatos ni filas individuales.

### Hechos del repositorio confirmados (leídos, no asumidos)

Verificado sobre `data_processed/dataset_analitico_estudiante.parquet` (233 987 × 44; pregrado = 140 422, participantes pregrado = 5 821) y el código fuente:

- **Entorno Python** (`entorno.md`): intérprete `C:\Python312\python.exe` (3.12.4), sin venv. Disponibles: `numpy` 2.2.4, `pandas` 2.2.3, `scipy` 1.16.3 (incluye `scipy.stats`), `scikit-learn` 1.7.2. **`statsmodels` NO está disponible.** Recomendación del entorno: logística con `sklearn.linear_model.LogisticRegression` (`penalty=None`), odds ratios = `exp(coef_)`, IC95 % por bootstrap (aproximación a documentar), y pruebas univariadas con `scipy.stats`.
- **Cobertura en pregrado de las variables numéricas candidatas** (% no nulo):
  - Buena/alta: `EDAD` 99,8 %, `NUMERO_OPCIONES_INSCRITAS` 100 %, `ICFES_MATEMATICAS` 86,4 %, `ICFES_LECTURA_CRITICA` 86,4 %.
  - Media (~53–55 %): `PGA_ULTIMO`, `PGA_PROMEDIO_HIST`, `PCT_CREDITOS_APROBADOS`, `CREDITOS_APROBADOS_TOTAL`, `ICFES_PUNTAJE_TOTAL` (55,0 %), `ICFES_INGLES` (54,8 %).
  - Media-baja (45,0 %): `SEMESTRE_AVANCE`, `PERCENTIL_PGA_PROGRAMA`, `PERCENTIL_PGA_NIVEL`.
  - **Muy incompleta: `PCT_AVANCE_CREDITOS` = 13,4 %** → candidata a descarte documentado (ver RF-4).
- **Variables categóricas candidatas** (cardinalidad / cobertura en pregrado):
  - `GENERO` (3 / 100 %), `ESTRATO_SOCIAL` (6 / 75,1 %), `TIPO_ADMISION` (20 / 99,3 %), `FACULTAD` (14 / 100 %, es un **código**; existe mapa a nombre legible en `export_dashboard._faculty_name_map()`), `ESTADO_ACADEMICO` (19 / 100 %).
  - **`NIVEL_INGLES` (8 / 12,2 %) y `EXAMEN_NIVEL_MATEMATICAS` (2 / 17,8 %)**: cobertura baja **y** almacenadas como `float64` (códigos numéricos), no como texto. Requieren mapa de etiquetas y advertencia de cobertura (ver RF-4 y RF-11).
- **Patrón de generación de artefactos del informe:** las figuras PNG se escriben con `utils.save_fig(fig, nombre)` en `reports/figures/`, y las tablas CSV con `df.to_csv(...)` en `reports/tables/`. Los notebooks se definen como celdas en `notebook_defs.py` y se ejecutan con `build_notebooks.py`. El LaTeX usa `\graphicspath{{figuras/}}` e incluye PNG con `\includegraphics`; dispone de `booktabs`, `longtable`, `tabularx`, `siunitx` **NO** está cargado actualmente (ver RNF-6).
- **Exportador del dashboard:** `src/export_dashboard.py` arma un dict `out` que se serializa a `dashboard/public/data.json`; `out` ya contiene `meta`, `codebooks`, `rows` y vistas agregadas (`oportunidad`, `heatmap_fac_estrato`, etc.). `dashboard/src/data.js::loadCube()` mapea cada clave de `out` a un accesor. La pestaña Insights existe (`App.jsx`, panel `panel-insights`, patrón accesible `role="tablist"/"tab"/"tabpanel"`).

## Requisitos funcionales

### Núcleo de cálculo (fuente única)

- **RF-1.** Debe existir **un único módulo de cálculo** en Python (p. ej. `src/comparative_stats.py`) que compute todos los estadísticos comparativos a partir del dataset analítico. Tanto `src/export_dashboard.py` (entregable A) como el generador de figuras/tablas del informe (entregable C, vía `notebook_defs.py` / notebook dedicado) deben **importar y llamar a este módulo**, sin reimplementar ningún cálculo. Ninguna cifra del informe o del dashboard puede derivarse de un cálculo paralelo.
- **RF-2.** El módulo debe exponer una función que, dado el DataFrame (o su ruta) y el alcance (`pregrado` o `global`), devuelva una estructura serializable con las tres sub-secciones: `numericas`, `categoricas` y (opcional) `logistica`, más `meta`. Esta estructura es la que el exportador inserta en `out["comparativo"]` y la que el notebook del informe consume para dibujar/tabular.
- **RF-3.** El cálculo debe usar la semilla `config.RANDOM_SEED = 42` en todo procedimiento con aleatoriedad (p. ej. bootstrap de la logística) para garantizar reproducibilidad.

### Selección y saneamiento de variables

- **RF-4.** Para cada variable candidata se debe **verificar la cobertura** en el alcance analizado y **descartar de forma documentada** las de cobertura insuficiente. Decisión por defecto (ajustable en diseño):
  - Descartar `PCT_AVANCE_CREDITOS` (13,4 %) del análisis numérico; registrar el motivo en `meta.descartadas`.
  - Descartar `NIVEL_INGLES` (12,2 %) y `EXAMEN_NIVEL_MATEMATICAS` (17,8 %) del análisis categórico principal, o incluirlas marcadas explícitamente como "cobertura baja"; en todo caso documentar la cobertura. (Coherente con el descarte de `NIVEL_INGLES` ya hecho en el informe actual, §4.6.)
  - Las demás variables listadas en el brief se conservan. Cada variable numérica reportará su `n_part` y `n_no` efectivos (tras eliminar NaN por grupo), haciendo visible la pérdida por faltantes.
- **RF-5.** Las variables categóricas que son códigos deben mapearse a **etiquetas legibles en español** antes de reportarse: `FACULTAD` mediante el mapa de nombres existente (reutilizar `_faculty_name_map()` o su lógica desde el módulo único), y `NIVEL_INGLES` / `EXAMEN_NIVEL_MATEMATICAS` mediante un catálogo de códigos si se conservan. El valor faltante se representa como categoría explícita "Sin dato" (coherente con el resto del proyecto).

### Entregable A — Sección `comparativo` en `data.json`

- **RF-6.** `out["comparativo"]["numericas"]` debe ser una lista; por variable: `var`, `label`, `n_part`, `n_no`, `media_part`, `media_no`, `sd_part`, `sd_no`, resumen de distribución por grupo para boxplot (`mediana`, `q1`, `q3`, `min`, `max` **o** whiskers tipo Tukey: `whisker_low`, `whisker_high`; el diseño fija cuál y es idéntico para web e informe), `cohen_d`, `dif_medias`, `ic95_low`, `ic95_high` (IC de la diferencia de medias), `t_stat`, `p_welch`, `p_mannwhitney`, `p_ajustada`.
- **RF-7.** `out["comparativo"]["categoricas"]` debe ser una lista; por variable: `var`, `label`, tabla de tasas por categoría (`categoria`, `n`, `n_part`, `tasa_pct`), y los estadísticos de la variable: `chi2`, `dof`, `p`, `cramers_v`, `p_ajustada`.
- **RF-8.** `out["comparativo"]["logistica"]` (opcional, ver RF-13) debe ser una lista por predictor: `predictor`, `coef`, `odds_ratio`, `ic95_low`, `ic95_high`, `p`, más un bloque de metadatos del modelo (variables incluidas, n efectivo, tratamiento de faltantes, método de IC).
- **RF-9.** `out["comparativo"]["meta"]` debe documentar: `alcance` ("Pregrado"), `n_part`, `n_no`, `metodo` (Welch + Mann-Whitney para numéricas; chi-cuadrado + V de Cramér para categóricas; logística si aplica), `correccion` (FDR Benjamini-Hochberg y la familia sobre la que se aplica), `semilla` (42), `descartadas` (con motivo) y fecha de generación. El cubo debe seguir sin exponer microdatos (solo agregados), preservando el peso ligero del `data.json`.
- **RF-10.** La corrección por comparaciones múltiples (`p_ajustada`) debe calcularse con **FDR (Benjamini-Hochberg)**, de forma consistente entre numéricas y categóricas, y el diseño debe especificar explícitamente qué conjunto de p-valores forma cada familia de corrección.

### Entregable B — Dashboard (pestaña Insights)

- **RF-11.** Añadir a la pestaña **Insights** (sin romper ni mover las vistas globales existentes: modalidades en el tiempo, modalidad por facultad, estacionalidad, resultado de la experiencia):
  - **Boxplots** participantes vs. no participantes por variable numérica, construidos a partir del resumen de 5 números provisto por `comparativo.numericas` (no se recalculan cuantiles en el cliente).
  - **Gráfico de tamaños de efecto**: `cohen_d` por variable, ordenado, con bandas/etiquetas de interpretación (insignificante/pequeño/mediano/grande).
  - **Visualización de tasas por categoría** con la **V de Cramér** por variable (p. ej. barras de tasa por categoría + indicador de V de Cramér).
  - **Resumen narrativo en español** que priorice tamaño de efecto y evite todo lenguaje causal.
- **RF-12.** `dashboard/src/data.js::loadCube()` debe exponer la nueva sección (p. ej. `comparativo: raw.comparativo`) siguiendo el patrón de accesores existente; los nuevos componentes solo **leen** estos valores precomputados. Las vistas de Insights son globales/narrativas y, como el resto de esa pestaña, **no responden a los filtros** del Explorador (coherente con la arquitectura actual).

### Entregable C — Informe LaTeX

- **RF-13.** Añadir una **nueva sección técnica** al informe (sin borrar contenido existente) que incluya: los **boxplots** (PNG), una **tabla de pruebas numéricas** (media por grupo, diferencia, IC95 %, d de Cohen con interpretación, p de Welch, p de Mann-Whitney, p ajustada FDR), una **tabla de categóricas** (chi², gl, p, V de Cramér, p ajustada), una **tabla de logística si aplica**, y narrativa técnica que cubra: (i) N grande ⇒ significancia casi automática, por lo que se prioriza el tamaño de efecto; (ii) equidad/gradiente socioeconómico con encuadre asociación-no-causa; (iii) limitaciones observacionales, NaNs/faltantes y sesgo de selección.
- **RF-14.** Las figuras y tablas del informe deben **generarse automáticamente** desde el mismo cálculo (RF-1), siguiendo el patrón existente: PNG vía `utils.save_fig` en `reports/figures/`, CSV vía `to_csv` en `reports/tables/`, definidos en `notebook_defs.py` (notebook nuevo o celdas nuevas) y ejecutados por `build_notebooks.py`. No se permiten cifras escritas a mano en el `.tex` para esta sección.

### Logística (opcional, condicionada al entorno)

- **RF-15.** Si se incluye la regresión logística, debe implementarse con `sklearn.linear_model.LogisticRegression(penalty=None)` sobre el subconjunto de pregrado, reportando odds ratios = `exp(coef_)`. Los IC95 % se aproximan por **bootstrap** con semilla 42, y el informe debe declarar explícitamente que es una aproximación (scikit-learn no entrega IC ni p-valores analíticos; `statsmodels` no está disponible). Debe documentarse el tratamiento de faltantes de los predictores (el diseño decide: imputación con indicador, o caso completo) y el impacto en el n efectivo.

## Requisitos no funcionales

- **RNF-1 (Consistencia numérica exacta — CLAVE).** Cualquier cifra que aparezca en el informe y en el dashboard debe provenir del mismo cálculo y coincidir hasta la precisión mostrada. Debe existir una **verificación reproducible** (p. ej. una aserción o un test) de que las cifras del informe se leen de los mismos CSV/estructura que alimentan `data.json`. No se admite redondeo divergente entre ambos.
- **RNF-2 (Sin dependencias nuevas sin confirmación).** Implementar con `numpy`, `pandas`, `scipy.stats` y `scikit-learn` ya presentes. **No** instalar `statsmodels` ni ninguna otra librería sin confirmación explícita del usuario.
- **RNF-3 (Privacidad / Ley 1581).** Solo se publican estadísticos agregados. No se exponen microdatos ni filas individuales. Se recomienda un **umbral mínimo de grupo** (p. ej. suprimir o marcar celdas/categorías con n muy pequeño) para evitar reidentificación; el diseño fija el umbral.
- **RNF-4 (Idioma y estilo).** UI e informe en **español**; comentarios de código en español, siguiendo el estilo y las convenciones del repositorio existente (docstrings explicativos, nombres de columnas en mayúsculas, etc.).
- **RNF-5 (Build en verde).** `npm run build` dentro de `dashboard/` debe terminar sin errores tras los cambios. El pipeline `python -m src.export_dashboard` debe ejecutarse sin error y `data.json` debe seguir siendo ligero.
- **RNF-6 (Compilación LaTeX).** El informe debe compilar. Si se usan comandos de `siunitx` u otros paquetes no cargados hoy, el diseño debe añadir el `\usepackage` correspondiente; de lo contrario, usar solo paquetes ya presentes (`booktabs`, `longtable`, `tabularx`, `array`, `graphicx`).
- **RNF-7 (No tocar el fix del Heatmap).** No modificar la escala de color ni la luminancia de texto del Heatmap recién corregido, salvo que sea estrictamente necesario; en tal caso, justificarlo.
- **RNF-8 (Accesibilidad).** Los nuevos componentes del dashboard deben llevar `aria-label` descriptivos, `tooltips` informativos y contraste suficiente, en línea con el patrón accesible ya usado en Insights/Explorador.
- **RNF-9 (Reproducibilidad).** Todo el flujo debe regenerarse con los comandos existentes (`python -m src.build_dataset`, `python -m src.export_dashboard`, `python build_notebooks.py`, `npm run build`), sin pasos manuales ocultos.

## Criterios de aceptación

1. Existe un único módulo Python de cálculo comparativo; `export_dashboard.py` y el generador de artefactos del informe lo importan, y **ninguno** reimplementa un estadístico.
2. `data.json` contiene `comparativo` con `numericas`, `categoricas`, `meta` y (si aplica) `logistica`, con exactamente los campos de RF-6, RF-7, RF-8 y RF-9.
3. Para cada variable numérica conservada se reportan n por grupo, medias, sd, resumen de boxplot, d de Cohen, diferencia e IC95 %, p de Welch, p de Mann-Whitney y p ajustada FDR.
4. Para cada variable categórica conservada se reportan tasas por categoría, chi², gl, p, V de Cramér y p ajustada FDR; `FACULTAD` aparece con nombre legible.
5. `PCT_AVANCE_CREDITOS` está documentada como descartada por cobertura (13,4 %) en `meta.descartadas`; la baja cobertura de `NIVEL_INGLES` y `EXAMEN_NIVEL_MATEMATICAS` está igualmente documentada.
6. La pestaña Insights muestra boxplots, gráfico de d de Cohen, tasas por categoría con V de Cramér y un resumen narrativo en español sin lenguaje causal; las vistas globales previas siguen presentes y funcionando.
7. `npm run build` termina en verde; `python -m src.export_dashboard` corre sin error y produce un `data.json` que `loadCube()` decodifica sin fallos.
8. El informe LaTeX incorpora la nueva sección con boxplots y las tablas de numéricas, categóricas y (si aplica) logística, más la narrativa de N-grande/efecto, equidad asociativa y limitaciones; no se borró contenido previo y el `.tex` compila.
9. Las cifras de al menos una variable numérica y una categórica coinciden exactamente entre `data.json` y la tabla correspondiente del informe (verificación explícita de RNF-1).
10. No se añadieron dependencias nuevas; `statsmodels` no se instaló. La logística, si existe, usa scikit-learn con IC por bootstrap (semilla 42) y declara la aproximación.
11. El fix del Heatmap no fue alterado (o, si lo fue, está justificado como estrictamente necesario).

## Fuera de alcance

- Modelos predictivos operativos o puntuación de estudiantes individuales (el proyecto es descriptivo; la logística, si se incluye, es inferencial/explicativa, no un clasificador en producción).
- Exponer microdatos o permitir descargas de filas individuales.
- Rediseñar las vistas globales existentes de Insights o el Explorador más allá de lo necesario para integrar lo nuevo.
- Instalar `statsmodels` u otras librerías; IC/p-valores analíticos exactos de la logística.
- Reabrir el fix de color/luminancia del Heatmap.

## Supuestos (declarados)

- **S1.** El alcance primario del comparativo es **pregrado**; una lectura global es "donde aporte" y, si se incluye, se reporta como alcance separado con su propia `meta`. (Confírmese en diseño si el global se publica o solo se menciona.)
- **S2.** El "grupo participante" se define por `PARTICIPA == 1` y el "no participante" por `PARTICIPA == 0`, reutilizando la etiqueta ya construida en `build_dataset.py`. No se redefine la señal.
- **S3.** El resumen de boxplot se basará en whiskers de Tukey (1,5·IQR) por ser el estándar y evitar publicar min/max que podrían ser outliers reidentificables; el diseño confirma esta elección y la hace idéntica en web e informe.
- **S4.** La familia de corrección FDR por defecto agrupa todas las p de las variables numéricas en una familia y todas las de categóricas en otra; el diseño puede refinarlo.
- **S5.** La logística es **opcional**: se incluye solo si el diseño concluye que aporta sobre las pruebas univariadas dado el entorno (sin IC analíticos) y el tratamiento de faltantes no sesga en exceso el n efectivo.

## Decisiones metodológicas abiertas (para el diseño)

1. **Formato del resumen de boxplot** (min/max vs. whiskers de Tukey) y manejo de outliers, garantizando que web e informe usen exactamente el mismo resumen (S3).
2. **Familia(s) de corrección FDR** y si la logística entra o no en alguna familia (RF-10, S4).
3. **Inclusión y alcance de la logística**: sí/no, predictores, tratamiento de faltantes (caso completo vs. imputación con indicador), y método de IC (bootstrap vs. Hessiana manual) (RF-15, S5).
4. **Suerte de `NIVEL_INGLES` y `EXAMEN_NIVEL_MATEMATICAS`**: descartar del todo o conservar marcadas como cobertura baja, y catálogo de etiquetas para sus códigos (RF-4, RF-5).
5. **Alcance global**: publicar la versión global en `data.json`/informe o limitarse a pregrado con mención (S1).
6. **Umbral de supresión por grupo pequeño** para privacidad (RNF-3) y cómo se marca en web e informe.
7. **Ubicación exacta** del nuevo módulo y del notebook/celdas que generan figuras/tablas, y nombres de los PNG/CSV, para encajar con `reports/figures|tables` y `notebook_defs.py`.
8. **Elección de la prueba numérica reportada como principal** (Welch vs. Mann-Whitney) para la narrativa, dado que ambas se exponen; y si se reporta un IC para la diferencia de medias (paramétrico) o también para la mediana.
