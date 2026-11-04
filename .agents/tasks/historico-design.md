# Diseño ligero: vistas de evolución temporal ("histórico") en Insights

## 0. Alcance y restricciones

Añadir vistas de **evolución temporal** a la pestaña *Insights* del dashboard, alimentadas por una
nueva sección `historico` en `dashboard/public/data.json` que produce el exportador de Python, y
documentarlas en el informe LaTeX usando la misma vía de artefactos que el comparativo (notebook →
`reports/figures` + `reports/tables` → `latex/figuras` + `latex/tablas`).

Este es un diseño **ligero**: el método ya está acotado por los datos. Fija tres cosas y nada más:
el framing estadístico obligatorio (§1), el contrato de datos de `historico` (§2) y la decisión de
UI toggle-vs-tarjeta por gráfico (§3). No incluye plan de implementación paso a paso (lo hará el
planner).

Restricciones que el diseño respeta explícitamente:

- **Sin microdatos.** Solo agregados por año (con umbral de supresión); nunca filas de estudiante.
- **Sin dependencias nuevas.** Python con numpy/pandas/scipy/scikit-learn (sin statsmodels); LaTeX
  con los paquetes ya presentes (`booktabs`, `longtable`, `tabularx`); sin `siunitx`/`csvsimple`.
  Dashboard con `recharts` ya instalado. Build: `npm run build` (sin dev/watch).
- **Español** en UI, código y documentación.
- **No tocar ni revertir** los arreglos visuales ya commiteados (boxplots, odds ratios con ejes,
  V de Cramér con tooltip, estrato "Sin dato" fuera de Insights, sidebar oculto en Insights, escala
  del Heatmap).
- **Accesibilidad.** El toggle "Histórico" es un `<button>` enfocable por teclado con `aria-label`
  y `aria-pressed`; tooltips informativos; contraste suficiente con la paleta existente
  (azul `#2563eb`/`#1d4ed8`, morado `#9333ea`, teal `#0f766e`, ámbar `#d97706`, grises `#64748b`).

---

## 1. Framing estadístico obligatorio: composición, NO tasa

**Hallazgo clave (verificado por el orquestador; se respeta como dado).** La única variable temporal
fina a nivel estudiante es `PRIMER_ANIO_MOVILIDAD` y **solo existe para participantes**. Se deriva en
`src/internationalization.py::student_participation` como `g["ANIO"].min()` (año del primer evento de
movilidad) y se adjunta al dataset analítico en `build_dataset.py`. Los **no participantes no tienen
año asignado** (`PRIMER_ANIO_MOVILIDAD` es NaN para ellos).

**Consecuencia dura.** No existe denominador temporal: no se puede saber cuántos estudiantes "no
participantes" corresponden a un año Y, porque el año solo se define a partir del evento de movilidad.
Por lo tanto **NO se puede calcular tasa de participación por grupo × año**, y **ninguna serie
temporal del histórico puede etiquetarse como "tasa de participación"**. Esto es un requisito duro:
toda etiqueta, título, subtítulo, leyenda, caption y tooltip del histórico habla de *composición de
los participantes* o de *medias por año*, nunca de tasa.

**Lo que SÍ se calcula** (todo sobre el subconjunto de participantes con año válido):

1. **Composición por año.** De los participantes cuyo primer evento fue en el año Y, qué fracción
   pertenece a cada valor de una dimensión categórica (estrato, género, facultad, modalidad). Para
   cada año Y y cada categoría c:

   ```
   pct(Y, c) = participantes_del_año_Y_con_valor_c / total_participantes_del_año_Y
   ```

   Así, cada año suma 100 % sobre sus categorías. Este es el framing del caso guía del usuario
   ("¿ha aumentado la proporción de participantes de estrato 2/3/4?"): es composición de la cohorte
   de participantes de cada año, no probabilidad de participar.

2. **Medias (y mediana/Q1/Q3) por año.** Para `PGA_ULTIMO`, `ICFES_PUNTAJE_TOTAL` y
   `SEMESTRE_AVANCE`: la media y los cuartiles entre los participantes de cada año. Describe cómo
   cambia el perfil académico de las cohortes de participantes a lo largo del tiempo.

**Población y rango.** ~8.036 participantes con año válido; rango bruto 1998–2026, masa útil
2012–2026.

**Umbral fijado.** Se conservan **años con `anio >= 2012` y con al menos 30 participantes**
(`n_anio >= 30`). Justificación:

- `2012` recorta la cola rala de 1998–2011 (pocos eventos por año, estimaciones de composición
  inestables) y coincide con la "masa útil" ya identificada.
- `n_anio >= 30` es el **mismo umbral de supresión** que ya usa `comparative_stats` (`min_n=30`,
  `meta.umbral_grupo`) y el heatmap del cubo; mantenerlo da coherencia y evita publicar porcentajes
  calculados sobre cohortes diminutas (un estudiante movería varios puntos porcentuales). El año en
  curso (p. ej. 2026, incompleto) tiende a caer por este filtro, lo cual es deseable.

Dentro de una serie de composición, **las categorías con muy pocos casos en un año** se absorben en
la agregación de "Otras" (solo aplica a facultad; ver §2) o simplemente aparecen con `pct` pequeño;
no se suprime categoría por categoría dentro del año para no romper la suma a 100 %. La supresión por
privacidad opera a nivel de **año completo** (el año entra o no), que es agregado y no reconstruye
microdatos.

**Encuadre causal.** Igual que el comparativo: todo es composición observada de cohortes, no causa.
El texto del informe y los subtítulos de la web lo dicen explícitamente.

---

## 2. Contrato de datos: sección `historico` de `data.json`

Nuevo módulo hermano **`src/historical_stats.py`** (fuente única de cálculo, coherente con el patrón
de `comparative_stats.py`): funciones puras que reciben el `DataFrame` analítico y devuelven
estructuras serializables. Lo importan `export_dashboard.build_cube` (para escribir `data.json`) y el
notebook nuevo del informe (para figuras/tablas). Se decide un módulo nuevo en vez de ampliar
`comparative_stats.py` porque el histórico es un eje distinto (series por año, no participante vs. no
participante) y no comparte la maquinaria inferencial (t de Welch, FDR, logística); mantenerlos
separados conserva la cohesión de cada módulo. Reutiliza de `comparative_stats` lo transversal:
`faculty_name_map()` y el saneamiento numpy→nativo (`_a_nativo`) — se expondrá/importará esa utilidad
en vez de duplicarla.

`export_dashboard.build_cube` añade una sola línea análoga a la del comparativo:

```python
out["historico"] = historical_stats.compute_historical(df)
```

El dict se escribe bajo la clave `historico`. **Shape exacto:**

```jsonc
"historico": {
  "meta": {
    "variable_temporal": "PRIMER_ANIO_MOVILIDAD",
    "framing": "composicion",                 // literal; nunca "tasa"
    "nota_framing": "Composición de los participantes de cada año y perfil académico medio de esas cohortes (no es tasa de participación: los no participantes no tienen año asignado). La composición por estrato/género se calcula sobre los participantes CON dato de la dimensión; 'Sin dato' se excluye y cada año renormaliza a 100%.",
    "anio_min": 2012,                          // umbral aplicado
    "umbral_n_anio": 30,                       // años con < 30 participantes se descartan
    "n_por_anio": [ {"anio": 2012, "n": 312}, ... ],  // participantes por año conservado, ascendente.
                                               // FUENTE ÚNICA de los años conservados: la lista de años
                                               // es exactamente [d.anio for d in n_por_anio]. No se duplica
                                               // en un campo "anios" aparte (ver N1).
    "n_participantes_con_anio": 8036,
    "n_anios_fuera_rango": 2,                   // años con >=1 participante pero anio < anio_min
    "n_anios_bajo_umbral": 1,                   // años con anio >= anio_min pero n < umbral_n_anio
    "top_facultades": 8,                        // tamaño del top; resto -> "Otras" (omitida si queda 0)
    "generado": "2025-..."
  },

  // --- Series de COMPOSICIÓN (cada año suma 100% sobre su dimensión) ---
  // pct = participantes de ese valor en el año / total participantes del año * 100
  "composicion_estrato":   [ {"anio": 2012, "estrato": "2", "n": 70, "pct": 22.4}, ... ],
  "composicion_genero":    [ {"anio": 2012, "genero": "F",  "n": 180, "pct": 57.7}, ... ],
  "composicion_facultad":  [ {"anio": 2012, "facultad": "Ingeniería", "n": 95, "pct": 30.4}, ... ],
  "composicion_modalidad": [ {"anio": 2012, "modalidad": "Intercambio internacional", "n": 250, "pct": 80.1}, ... ],

  // --- Series de MEDIAS/cuartiles por año (perfil académico de la cohorte) ---
  "resumen_numerico": {
    "pga":    [ {"anio": 2012, "n": 300, "media": 3.95, "mediana": 4.00, "q1": 3.70, "q3": 4.25}, ... ],
    "icfes":  [ {"anio": 2012, "n": 280, "media": 345.0, "mediana": 348.0, "q1": 320.0, "q3": 372.0}, ... ],
    "avance": [ {"anio": 2012, "n": 300, "media": 8.6, "mediana": 8.0, "q1": 7.0, "q3": 10.0}, ... ]
  }
}
```

**Reglas del contrato:**

- **Dimensiones de composición.** `estrato`, `genero`, `facultad`, `modalidad`. Los valores
  categóricos se normalizan **idéntico al cubo y al comparativo**: `fillna("Sin dato").astype(str)`
  para estrato/género; `faculty_name_map()` + `.title()` para facultad; `MODALIDAD_PRINCIPAL` para
  modalidad (la modalidad a nivel estudiante ya existe en el dataset analítico, no hace falta recurrir
  a la tabla de eventos).
- **Exclusión de "Sin dato" en estrato y género (requisito duro, H1).** El exportador **excluye**
  las categorías sin dato de `composicion_estrato` y `composicion_genero` **antes** de calcular los
  porcentajes, usando el mismo conjunto que `CategoricalAssociation.jsx`
  (`{"Sin dato", "Sin información", "Sin informacion", "N/A", "NA"}`), y **renormaliza** para que cada
  año siga sumando 100 % sobre las categorías **con dato**. Motivo: el arreglo que oculta estrato
  "Sin dato" **vive en Insights** — en `dashboard/src/components/CategoricalAssociation.jsx`
  (líneas 56-60), renderizado dentro de `ComparativoInsights` en `#panel-insights` —, el usuario pidió
  textualmente quitarlo en Insights (mensaje 10) y es un arreglo commiteado que las restricciones
  prohíben revertir. Las tarjetas históricas de estrato/género van en esa misma pestaña, contiguas a
  `CategoricalAssociation`; mostrar "Sin dato" reintroduciría lo que se mandó quitar y crearía
  incoherencia dentro del panel. Se excluye en el **exportador** (opción preferida del review) para que
  web e informe lean exactamente la misma serie ya saneada, sin depender de un filtro de cliente. La
  modalidad y la facultad **no** tienen "Sin dato" relevante (modalidad siempre definida para el evento;
  facultad mapeada); si apareciera, se trata igual que cualquier otra categoría con dato.
- **Facultad: top + cola.** Se ordenan las facultades por total de participantes en todo el rango con
  **desempate estable**: total descendente y, ante empate, nombre ascendente (alfabético). Se conservan
  las **top 8** (`meta.top_facultades`) y el resto se agrupa en una categoría **"Otras"** por año.
  Si hay **≤ 8 facultades**, no hay cola: la categoría "Otras" **se omite** (no se emite con 0) para no
  mostrar una banda vacía. Evita una leyenda ilegible y series de una sola observación.
- **`pct`** se redondea a 1 decimal; `media`/`mediana`/`q1`/`q3` a 2 decimales (PGA), 1 (ICFES),
  1 (avance). Centraliza el redondeo en un dict `DECIMALES` local del módulo `historical_stats`, igual
  que `comparative_stats`. **Este mismo dict `DECIMALES` es el que el notebook 07 pasa a
  `df_to_latex_booktabs`** al generar las tablas del informe (ver §4): así `data.json` y las `.tex`
  publican exactamente la misma precisión, y la única diferencia web↔informe es el separador decimal
  (coma en el `.tex`). Esto es lo que hace **real** —y no solo nominal— la garantía de consistencia
  M1 del comparativo (ver M1 del review y §5).
- **NaN/inf → None** antes de serializar (reutiliza `_a_nativo`). Un año sin ninguna observación de
  una métrica numérica (improbable tras el umbral) emite esa métrica con `null` en media/cuartiles.
- **Completitud por año × categoría.** El exportador **no** rellena ceros; el dashboard rellena
  categorías ausentes con `0` al pivotar (igual que `modalidadTemporal` hoy en `App.jsx`). Así el
  JSON queda mínimo y el apilado no muestra huecos. La renormalización a 100 % de estrato/género (tras
  excluir "Sin dato") se hace en el exportador **sobre el total con dato del año**, de modo que las
  categorías emitidas de ese año ya suman 100 %.
- **Privacidad.** Solo conteos agregados por año (`n`) y porcentajes/medias; nunca microdatos.
  La supresión por año (`< 30`) protege cohortes pequeñas.

**Accesor en `dashboard/src/data.js`.** En `loadCube()` añadir una línea análoga a `comparativo`:

```js
historico: raw.historico || null,
```

Los componentes del histórico solo **leen** de `cube.historico`; no recalculan estadística en JS
(misma regla que el comparativo). El pivotado año×categoría → filas de recharts se hace en `App.jsx`
con `useMemo`, replicando el patrón ya usado para `modalidadTemporal`/`seasonData`.

---

## 3. Decisión de UI: toggle "Histórico" vs. tarjeta dedicada, por gráfico

**Principio.** El usuario pidió un botón "Histórico" en la mayor cantidad posible de gráficas de
Insights. Regla de decisión:

- **Toggle "Histórico" dentro de la tarjeta** cuando la gráfica actual tiene una contrapartida
  temporal natural *de participantes* (composición o media por año de la **misma dimensión**). El
  botón alterna entre la vista agregada actual y su evolución, sin duplicar tarjetas.
- **Tarjeta dedicada de evolución** cuando (a) no hay vista agregada equivalente a la que añadir un
  toggle, o (b) la gráfica actual compara participantes vs. no participantes y su versión temporal
  solo puede mostrar participantes (poner un toggle sugeriría, falsamente, una evolución de la
  comparación o de la tasa).
- **Sin histórico** cuando los datos no lo permiten (la métrica no es descomponible por
  `PRIMER_ANIO_MOVILIDAD`, p. ej. resultado del evento sin año fiable, o ya es intrínsecamente una
  serie temporal).

La vista de composición usa **barras/área apiladas al 100 % por año** (reutiliza el patrón de
`ModalityArea.jsx` para apilado por año y `StackedByFaculty.jsx` para apilado 100 %). Se introduce el
componente nuevo **`HistoricalComposition.jsx`**: área apilada al 100 % de categoría × año, con
el toggle embebido, tooltip que muestra `pct` y `n` por categoría, leyenda, `aria-label` y colores de
la paleta. El toggle, cuando va dentro de otra tarjeta, se implementa como un `<button>` en la cabecera
de la tarjeta (`aria-pressed`) que conmuta el `children` renderizado. Las series de medias por año usan
un **componente nuevo `TemporalMean.jsx`** (no se reutiliza `TemporalLine.jsx` tal cual): línea de
media por año + banda Q1–Q3 vía `recharts` `Area`, con selector de métrica PGA/ICFES/avance. Motivo:
`TemporalLine.jsx` es rígido — dibuja una sola `<Line dataKey="eventos">` con una `<ReferenceArea>`
COVID-19 hardcodeada, sin banda, sin `dataKey` parametrizable ni selector de métrica (verificado en el
archivo). Reutilizarlo exigiría refactorizar un componente ya commiteado del Explorador (riesgo de
regresión) para parametrizar `dataKey`/color/banda/franja. Se prefiere un componente nuevo
`TemporalMean.jsx` que **se inspira** en el patrón de `TemporalLine` sin tocarlo, dejando intacto su
comportamiento actual en el Explorador. La franja COVID-19 **no** se incluye en `TemporalMean` (no
aplica a una serie de medias académicas).

### Tabla de decisión por gráfico/tarjeta de Insights

Gráficas existentes de la pestaña *Insights* (bloque `#panel-insights` de `App.jsx`): el bloque
comparativo (`ComparativoInsights`: narrativa, `CohenDChart`, `ComparativeBoxplots`,
`CategoricalAssociation`, `LogisticOddsRatios`) y el panorama histórico global (`ModalityArea`,
`StackedByFaculty`, `SeasonBars`, `DonutResultado`).

| # | Gráfico / tarjeta actual (Insights) | Qué muestra hoy | Decisión | Serie histórica que la alimenta | Por qué |
|---|---|---|---|---|---|
| 1 | `CategoricalAssociation` — fila **Estrato social** | Tasa de participación por estrato + V de Cramér (part. vs. no) | **Tarjeta dedicada** `HistoricalComposition` (título "Composición de los participantes por estrato y año — no es tasa de participación"; excluye "Sin dato") | `composicion_estrato` | Es el **caso guía** del usuario. La tarjeta actual compara con no participantes (hay tasa); el histórico solo tiene participantes → no se puede togglear a "evolución de la tasa". Tarjeta aparte, claramente visible, responde "¿ha subido la proporción de estrato 2/3/4?". |
| 2 | `CategoricalAssociation` — fila **Género** | Tasa por género + V de Cramér | **Tarjeta dedicada** `HistoricalComposition` (título "Composición de los participantes por género y año — no es tasa de participación"; excluye "Sin dato") | `composicion_genero` | Mismo motivo que estrato: la fila actual es comparación con tasa; el histórico es composición de participantes. Cubre la dimensión equidad de género en el tiempo. |
| 3 | `StackedByFaculty` — modalidad por facultad | Composición (%) de modalidades por facultad (solo participantes/eventos) | **Toggle "Histórico"** en la tarjeta → evolución por **facultad** | `composicion_facultad` (top 8 + "Otras") | Ya es composición de participantes y apilada; el toggle conmuta "composición por facultad" ↔ "composición de participantes por facultad y año". Responde si cambia el mix de facultades que envían gente. |
| 4 | `ModalityArea` — modalidades por año | Eventos por modalidad por año (conteo absoluto, nivel **evento**, `ANIO>=2010`) | **Toggle "Histórico"** → composición **100 %** de modalidad de **participantes por año de su primer evento** (nivel participante, `>=2012`, `n>=30`) | `composicion_modalidad` | Ya es temporal en conteo; el toggle añade la lectura **composición** (100 %) por año de los participantes. Ver nota M2 abajo: el toggle cambia de población (eventos → participantes) y de rango/umbral; debe advertirse en la UI. |
| 5 | `ComparativeBoxplots` — numéricas (PGA, avance, ICFES…) | Bigotes de Tukey part. vs. no (agregado, sin tiempo) | **Tarjeta dedicada** `TemporalMean` (**componente nuevo**, "Perfil académico de los participantes por año": PGA / ICFES / avance, media + banda Q1–Q3, selector de métrica) | `resumen_numerico.{pga,icfes,avance}` | El boxplot compara dos grupos sin eje temporal; no hay toggle natural. La tarjeta dedicada muestra cómo evoluciona la media/cuartiles de la **cohorte de participantes**. No se mezcla con no participantes (no tienen año). `TemporalLine.jsx` no sirve tal cual (ver §3, H2); se crea `TemporalMean.jsx`. |
| 6 | `CohenDChart` — d de Cohen por variable | Tamaño de efecto part. vs. no (resumen inferencial) | **Sin histórico** | — | El d de Cohen es un estadístico part.-vs.-no sin denominador temporal; una serie por año exigiría recalcular el efecto por cohorte-año (otro análisis, fuera del alcance ligero). |
| 7 | `LogisticOddsRatios` — forest plot | Odds ratios del modelo logístico multivariado | **Sin histórico** | — | El modelo es part.-vs.-no sobre todo el subconjunto; "OR por año" es un modelo distinto y pesado, fuera de alcance. |
| 8 | Narrativa comparativa (`ComparativoInsights` texto) | Prosa síntesis | **Sin histórico** | — | Es texto, no gráfico. |
| 9 | `SeasonBars` — estacionalidad | Eventos por año y semestre (primer/segundo) | **Sin histórico nuevo** (ya es temporal) | — | Ya es una serie por año; añadir "histórico" sería redundante. Se deja como está. |
| 10 | `DonutResultado` — resultado del evento | % aprobado/reprobado/… de los eventos | **Sin histórico** (recomendado) | — | El resultado se define sobre el evento; descomponerlo por `PRIMER_ANIO_MOVILIDAD` mezclaría primer-año con eventos posteriores del mismo estudiante. Para no introducir una serie ambigua, se omite en este alcance ligero. |

**Regla de rotulado anti-"tasa" (requisito duro §1, M3).** Cada tarjeta/vista histórica de
composición lleva **título y subtítulo explícitos**: "Composición de los participantes por {dimensión}
y año — no es tasa de participación". La nota de framing de §1 se **repite en cada tarjeta** del bloque
histórico (en su `card-sub`), no solo en el encabezado del bloque. Esto evita el arrastre de "tasa"
desde las tarjetas comparativas vecinas (`CategoricalAssociation`, que sí rotula "tasa de
participación"): el usuario ve de un vistazo que la serie temporal es composición de cohortes, no tasa.
Ninguna etiqueta, título, subtítulo, leyenda, tooltip o caption del histórico contiene la palabra
"tasa".

**Advertencia de población en el toggle de `ModalityArea` (M2).** Al activar el toggle "Histórico"
(fila 4), el subtítulo/tooltip cambia para decir explícitamente "composición (%) de **participantes
por año de su primer evento**" y el eje usa el rango del histórico (`>=2012`, `n>=30`). La vista base
(eventos, `>=2010`) y la vista histórica (participantes-primer-año) son **poblaciones y rangos
distintos**; el cambio de subtítulo al conmutar lo deja claro para que el lector no interprete la vista
histórica como el mismo conteo de eventos "normalizado". Se mantiene como toggle (no se degrada a
tarjeta dedicada) porque ambas vistas responden a la misma pregunta de "mix de modalidades" y el
cambio de subtítulo resuelve la ambigüedad sin duplicar tarjetas.

**Resumen de cobertura.** Histórico en **6 de 10** ítems (todos los que los datos permiten como
composición de participantes por año): estrato (caso guía), género, facultad, modalidad y perfil
numérico (PGA/ICFES/avance). 2 toggles + 3 tarjetas dedicadas; los 4 restantes se justifican arriba.

**Ubicación en la pestaña.** Las tarjetas dedicadas (1, 2, 5) se agrupan bajo un nuevo
`section-title` **"Evolución de los participantes en el tiempo"**, colocado **tras el bloque
comparativo y antes del panorama histórico global**, con la tarjeta de estrato primera (caso guía).
Los toggles (3, 4) se quedan en sus tarjetas actuales del panorama histórico. El encabezado de la
pestaña aclara, igual que hoy, que estas vistas son del histórico completo y no reaccionan a los
filtros; se añade una frase de framing que cubre **ambos** tipos de serie (composición y perfil numérico):
"las series temporales describen la **composición de los participantes** de cada año y el **perfil
académico medio** (PGA/ICFES/avance) de esas cohortes; no son tasas de participación".

---

## 4. Vía del informe LaTeX (misma fuente única)

El histórico sigue la misma mecánica que el comparativo (notebook_defs → ejecuta → escribe PNG/CSV/.tex
→ copia a `latex/`):

- **Nuevo notebook** `07_historico_evolucion` (definido en `notebook_defs.py`, ejecutado por
  `build_notebooks.py`). Importa `src.historical_stats.compute_historical`, **no recalcula** nada:
  solo dibuja figuras con matplotlib y escribe tablas con `df_to_latex_booktabs` (ya disponible).
- **Figuras** (a `reports/figures/`, copiadas a `latex/figuras/`): `fig_hist_estrato.png` (apilado
  100 % estrato×año — caso guía), `fig_hist_genero.png`, `fig_hist_facultad.png`,
  `fig_hist_modalidad.png`, `fig_hist_numericas.png` (medias de PGA/ICFES/avance por año).
- **Tablas** `.tex` booktabs/longtable (sin paquetes nuevos) a `latex/tablas/`: composición por
  estrato×año y el resumen numérico por año.
- **Sección** en `informe_proyecto.tex`: nueva `\subsection` **"Evolución temporal de la composición
  de participantes"** dentro de `\section{Hallazgos e insights principales}` (o como subsección del
  dashboard), con `\includegraphics`/`\input` de los artefactos anteriores y un párrafo de framing
  (composición, no tasa; asociación, no causa). Reutiliza `\graphicspath{{figuras/}}` existente.

Coherencia web↔informe (garantía M1 **real**, no nominal). El notebook 07 **no** lee `data.json`:
llama a `compute_historical(df)` y formatea las `.tex` con `df_to_latex_booktabs` pasándole el **mismo
dict `DECIMALES` de `historical_stats`** que alimenta `data.json`. Como ambos caminos (JSON y `.tex`)
parten de la misma función pura y del mismo redondeo, los porcentajes y medias son idénticos salvo el
separador decimal (coma en el `.tex`). Para que esta garantía no sea solo nominal, el notebook 07
incluye una **celda de verificación** (igual que el comparativo) que compara las cifras del `.tex`/CSV
del histórico contra la clave `historico` de `data.json` a la precisión publicada y **falla el build si
difieren** (al menos una serie de composición y una numérica). Ver §5.

---

## 5. Validación / testabilidad

- **Unit (Python, `historical_stats`):** con un DataFrame sintético pequeño verificar que (a) cada
  año de una serie de composición suma 100 % (±0,1 por redondeo); (b) los años con `n < 30` o
  `< 2012` se excluyen, y que `meta.n_anios_fuera_rango`/`meta.n_anios_bajo_umbral` cuentan cada causa
  por separado (N2); (c) la facultad agrupa correctamente top 8 + "Otras", con **desempate estable**
  (total desc, nombre asc) y, en el caso de **≤ 8 facultades**, que "Otras" **no** aparece (N3);
  (d) salida sin NaN/inf (serializable con `json.dump`); (e) ningún campo/clave/valor string contiene
  la subcadena "tasa"; (f) **"Sin dato"/"Sin información"/N/A se excluyen** de `composicion_estrato` y
  `composicion_genero`, y el año **renormaliza a 100 %** sobre las categorías con dato (H1);
  (g) **invariante N1:** la lista de años conservados es exactamente `[d["anio"] for d in
  meta["n_por_anio"]]` (no existe un campo `anios` aparte).
- **Integración:** `python -m src.export_dashboard` produce `data.json` con la clave `historico` y
  `meta.framing == "composicion"`; `npm run build` compila sin errores con los nuevos componentes
  (`HistoricalComposition.jsx`, `TemporalMean.jsx`).
- **Informe:** `python build_notebooks.py 07` ejecuta sin error y genera los PNG/.tex esperados.
- **Verificación de consistencia web↔informe (M1):** la celda de verificación del notebook 07 compara,
  a la precisión de `DECIMALES`, al menos una serie de composición y una numérica del `.tex`/CSV contra
  la clave `historico` de `data.json`, y **falla** si difieren. Esto convierte la garantía M1 en una
  comprobación ejecutable, no una afirmación.
- **Difícil de testear automáticamente** (se verifica manualmente): contraste de color del apilado,
  foco por teclado del toggle, legibilidad de la leyenda de facultades, y que el cambio de subtítulo
  del toggle de `ModalityArea` comunica el cambio de población (M2).

---

## 6. Respuestas a los hallazgos de la revisión (`design-review.json`)

Todos los hallazgos se **corrigen** en esta revisión; ninguno se backlogea ni se ignora. Cada cambio
se mantiene dentro de las restricciones duras (sin microdatos, sin dependencias nuevas, español, no
revertir arreglos commiteados) y es coherente con los requisitos originales.

- **H1 (HIGH) — "Sin dato" de estrato en Insights.** CORREGIDO. Verificado contra el código
  (`CategoricalAssociation.jsx` líneas 56-60, renderizado en `#panel-insights`): el arreglo vive en
  **Insights**, no en el Explorador. §2 ahora **excluye** "Sin dato"/"Sin información"/N/A de
  `composicion_estrato` y `composicion_genero` en el **exportador** (opción preferida del review) y
  **renormaliza** a 100 % sobre categorías con dato; se documenta en `meta.nota_framing`. Se corrigió
  la frase falsa que atribuía el arreglo al Explorador. Alineado con el mensaje 10 del usuario y con la
  restricción de no revertir arreglos commiteados.
- **H2 (HIGH) — `TemporalLine.jsx` no reutilizable.** CORREGIDO. Verificado el archivo: `dataKey`
  fijo "eventos", franja COVID hardcodeada, sin banda ni selector. §3 y la fila 5 ahora declaran un
  **componente nuevo `TemporalMean.jsx`** (patrón análogo, sin tocar `TemporalLine` del Explorador),
  con media + banda Q1–Q3 + selector de métrica y sin franja COVID. Elegida la opción preferida del
  review (componente nuevo) sobre refactorizar, para no arriesgar regresión en un componente commiteado.
- **M1 (MEDIUM) — consistencia de decimales nominal.** CORREGIDO. §2 fija que el `DECIMALES` de
  `historical_stats` es el **mismo** dict que el notebook 07 pasa a `df_to_latex_booktabs`; §4 y §5
  añaden una **celda de verificación** que compara `.tex`/CSV contra la clave `historico` de
  `data.json` y falla el build si difieren. La garantía M1 pasa de nominal a ejecutable.
- **M2 (MEDIUM) — toggle de `ModalityArea` mezcla poblaciones.** CORREGIDO. Se mantiene el toggle
  (responde a la misma pregunta de mix) y la fila 4 + nota M2 fijan que al activarlo el subtítulo/tooltip
  diga "composición (%) de participantes por año de su primer evento" y que el eje use `>=2012, n>=30`,
  distinto del conteo de eventos (`>=2010`). Se decidió una vía (no se deja abierta).
- **M3 (MEDIUM) — fuga de "tasa" por contigüidad.** CORREGIDO. §3 añade la **regla de rotulado**:
  título/subtítulo "Composición de los participantes por {dimensión} y año — no es tasa de
  participación" y la nota de framing repetida en **cada** tarjeta del bloque. Filas 1 y 2 actualizadas
  con esos títulos.
- **N1 (NIT) — `meta.anios` duplicado.** CORREGIDO. Se eliminó el campo `anios`; la fuente única son
  los años de `n_por_anio` y se declara el invariante `[d.anio for d in n_por_anio]`, verificado en §5.
- **N2 (NIT) — `n_anios_descartados` ambiguo.** CORREGIDO. Sustituido por `n_anios_fuera_rango` y
  `n_anios_bajo_umbral`; verificados por separado en §5.
- **N3 (NIT) — desempate top-8 / ≤8 facultades.** CORREGIDO. §2 fija desempate estable (total desc,
  nombre asc) y que "Otras" se omite si hay ≤8 facultades; caso ≤8 añadido al test de §5.
- **N4 (NIT) — framing no cubre `resumen_numerico`.** CORREGIDO. La nota de la cabecera (§3) y
  `meta.nota_framing` (§2) ahora mencionan tanto la composición como el perfil académico medio de las
  cohortes.
