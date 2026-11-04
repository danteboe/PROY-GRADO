# Diseño técnico — comparativo-insights

Análisis estadístico comparativo "¿Qué diferencia a los estudiantes que participan en
internacionalización de los que no?" · Foco: **pregrado** (tasa ~4,15 %). **Iteración 3** (revisión
más reciente en `design-review.json`: veredicto CHANGES_REQUESTED, 1 MEDIUM + 5 NIT; todos atendidos
— ver §11 "Respuesta a los hallazgos de la revisión"). La ronda anterior (iteración 2) también quedó
atendida y se conserva en §11.1 para trazabilidad.

Este documento **fija la metodología estadística y el contrato de datos antes de implementar**.
El stack queda **bloqueado** tras la aprobación: `numpy` 2.2.4, `pandas` 2.2.3, `scipy.stats`
1.16.3 y `scikit-learn` 1.7.2, todos ya presentes en `C:\Python312\python.exe`. **No** se instala
`statsmodels` ni ninguna otra librería (RNF-2). Matplotlib/seaborn (ya usados por los notebooks) se
reutilizan para las figuras del informe.

---

## 1. Visión general

Se introduce un **único módulo de cálculo** `src/comparative_stats.py` con funciones puras que
reciben el `DataFrame` analítico y devuelven estructuras serializables. Ese módulo es la **fuente
única de verdad**: lo importa `src/export_dashboard.py` (entregable A → `data.json`) y lo importa un
**notebook nuevo `06_comparativo_inferencial`** definido en `notebook_defs.py` y ejecutado por
`build_notebooks.py` (entregable C → PNG en `reports/figures/`, CSV en `reports/tables/`). El
dashboard React (entregable B) y el informe LaTeX **solo leen** valores precomputados; no recalculan
ningún estadístico (RF-1, RNF-1).

El encuadre es **descriptivo/asociativo**: se reportan asociaciones, no causas; con N≈140k en
pregrado casi todo sale significativo, por lo que la **narrativa prioriza el tamaño de efecto (d de
Cohen y V de Cramér)**, no el p-valor. Se preserva la minimización de datos (solo agregados).

---

## 2. Metodología estadística (FIJADA)

### 2.1 Definición de grupos y alcance

- **Participante** = `PARTICIPA == 1`; **no participante** = `PARTICIPA == 0` (S2; etiqueta ya
  construida en `build_dataset.py`, no se redefine).
- **Alcance primario: pregrado** (`ES_PREGRADO == True`). Decisión sobre S1: **se publica solo
  pregrado** en `data.json` y en el informe. La función admite `scope="global"` para inspección
  interna, pero `export_dashboard` y el notebook invocan únicamente `scope="pregrado"`. Motivo: el
  foco del proyecto es pregrado, el global mezcla niveles con tasas base muy distintas (posgrado
  diluye y confunde la lectura) y publicar dos alcances duplicaría la UI sin aportar a la pregunta.
  La `meta` deja constancia del alcance elegido.

### 2.2 Desbalance de clases (~4,15 %)

El desbalance es intrínseco al fenómeno y **no se corrige con remuestreo** en las pruebas
univariadas: las comparaciones son entre dos poblaciones reales (participantes ≈ 5 821; no
participantes ≈ 134 601), no una tarea de clasificación balanceada. Tratamiento explícito:

- **Pruebas de medias (numéricas):** se usa **t de Welch** (no asume varianzas ni tamaños iguales),
  que es robusta al fuerte desbalance de n por grupo. El `cohen_d` se calcula con **desviación
  estándar agrupada (pooled)** ponderada por los n reales.
- **Tasas base (categóricas):** cada tabla de contingencia reporta la **tasa de participación por
  categoría** (`tasa_pct`) junto a la tasa base global (en `meta`), para que la lectura sea "esta
  categoría participa X veces la tasa base", nunca "esta categoría participa mucho" en abstracto.
- **Logística:** `LogisticRegression(class_weight="balanced")` para que los coeficientes no queden
  dominados por la clase mayoritaria; se documenta que `balanced` reescala la pérdida y **no** altera
  la interpretación relativa de los odds ratios, pero sí el intercepto (que por tanto **no** se
  reporta como tasa base; la tasa base se lee de los datos, no del modelo).
- **No sobre-afirmar:** la narrativa (web e informe) debe decir "asociación", "mayor propensión
  relativa", nunca "causa" ni "predice". Regla de redacción fijada en RF-11/RF-13.

### 2.3 Elección de pruebas numéricas: Welch + Mann-Whitney (ambas)

Se reportan **las dos** por variable:

- **t de Welch** (`scipy.stats.ttest_ind(..., equal_var=False)`): prueba paramétrica de diferencia de
  medias con varianzas desiguales. Es la **prueba principal para la narrativa** (decisión sobre el
  punto abierto 8) porque el tamaño de efecto narrativo (d de Cohen) y el IC95 % se definen sobre
  **medias**, y Welch es su prueba de significancia coherente.
- **Mann-Whitney U** (`scipy.stats.mannwhitneyu(..., alternative="two-sided", method="asymptotic")`):
  alternativa **no paramétrica** (compara distribuciones/rangos), robusta a asimetría y outliers. Se
  incluye como **chequeo de robustez**: si Welch y Mann-Whitney concuerdan en dirección, la conclusión
  es sólida pese a no-normalidad. Variables como PGA o avance son asimétricas, así que esta
  verificación es pertinente. **Se fija `method="asymptotic"` explícitamente** (resuelve hallazgo
  NIT 3): con N≈140k y empates fuertes (p. ej. `SEMESTRE_AVANCE` y PGA con valores repetidos) el
  `method="auto"` por defecto ya tomaría la ruta asintótica, pero fijarla la hace determinista y
  documentada; scipy aplica la corrección por empates. Se anota en `meta.metodo.numericas`
  ("Mann-Whitney U asintótica con corrección de empates").

Ambos p-valores (`p_welch`, `p_mannwhitney`) se exponen en `data.json` y en la tabla del informe.

**Regla de lectura ante discrepancia (resuelve hallazgo NIT 5):** la **significancia se decide
siempre con `p_ajustada`** (Welch corregido por FDR, la prueba principal). Mann-Whitney **no** se
ajusta por FDR y **no** se usa para decidir significancia; sirve únicamente como chequeo de
**robustez por concordancia de dirección del efecto**. Es decir, si Welch (tras FDR) y Mann-Whitney
apuntan al **mismo grupo favorecido**, la conclusión se considera robusta a no-normalidad, con
independencia del p crudo de Mann-Whitney. Un `p_mannwhitney` minúsculo (habitual con N≈140k) **no**
"rescata" una diferencia cuyo `p_ajustada` quedó no significativo, ni la agranda: la magnitud siempre
se lee del d de Cohen. Esta regla se refleja textualmente en la narrativa de web e informe.

### 2.4 Significancia vs. tamaño de efecto

Con N≈140k, p<0,05 es casi automático y **no informa magnitud**. La métrica narrativa prioritaria es
el **d de Cohen** (diferencia estandarizada de medias):

```
d = (media_part − media_no) / sd_pooled
sd_pooled = sqrt( ((n_part−1)·sd_part² + (n_no−1)·sd_no²) / (n_part + n_no − 2) )
```

- **Signo:** positivo ⇒ a favor de **participantes** (media mayor en participantes); negativo ⇒ a
  favor de **no participantes**. La UI y el informe rotulan explícitamente el grupo favorecido.
- **Interpretación de magnitud** (umbrales de Cohen, fijados e idénticos en web e informe):
  - |d| < 0,20 → **trivial**
  - 0,20 ≤ |d| < 0,50 → **pequeño**
  - 0,50 ≤ |d| < 0,80 → **mediano**
  - |d| ≥ 0,80 → **grande**
- La narrativa ordena las variables por |d| descendente y comenta solo las de efecto ≥ pequeño,
  señalando explícitamente que varias diferencias, aun siendo "significativas", son triviales.

**Nota sobre d con SD agrupada junto a Welch (resuelve hallazgo NIT 6).** La prueba principal es Welch
(no asume varianzas iguales), pero el `cohen_d` usa `sd_pooled`, que **sí** asume homogeneidad de
varianzas. Es una combinación **convencional y defendible** y no se cambia la fórmula. Se añade una
**nota explícita en la narrativa web/informe**: cuando `sd_part` y `sd_no` difieran mucho (razón de
varianzas extrema), la **etiqueta de magnitud de `d` es orientativa** y pueden mandar el **signo** y el
**IC95 % de la diferencia de medias** (ambos coherentes con Welch), que no dependen del supuesto de
homogeneidad. Es decir, la interpretación nunca se apoya solo en la banda de `d` cuando las varianzas
son muy dispares; se contrasta con dirección e IC.

### 2.5 IC95 % de la diferencia de medias

Para cada numérica se reporta el IC95 % **de la diferencia de medias** (paramétrico, consistente con
Welch), usando el error estándar de Welch y los grados de libertad de Welch–Satterthwaite:

```
dif = media_part − media_no
se  = sqrt( sd_part²/n_part + sd_no²/n_no )
gl  = (sd_part²/n_part + sd_no²/n_no)² /
      ( (sd_part²/n_part)²/(n_part−1) + (sd_no²/n_no)²/(n_no−1) )
ic95 = dif ± t_{0.975, gl} · se        # t crítico vía scipy.stats.t.ppf
```

**Una sola definición de varianzas por grupo (resuelve hallazgo NIT 8).** `numeric_comparison`
calcula `sd_part` y `sd_no` **una vez** con `ddof=1` (varianza muestral), y **esos mismos**
`sd_part`, `sd_no`, `n_part`, `n_no` alimentan **tanto** el `t_stat`/`p_welch` (vía
`scipy.stats.ttest_ind(..., equal_var=False)`, que usa internamente la misma definición muestral)
**como** el `se`, los `gl` de Welch–Satterthwaite, el IC95 % y el `sd_pooled` del `cohen_d`. No hay
una segunda definición de varianza en ninguna parte del cálculo, de modo que el `t_stat` publicado y
el IC provienen de la misma aritmética (sin micro-divergencia).

Se reporta IC de la **diferencia de medias**, no de la mediana (decisión sobre el punto abierto 8):
es coherente con d de Cohen y con Welch, y evita introducir un tercer marco (bootstrap de medianas)
que complicaría la consistencia numérica.

### 2.6 Corrección por comparaciones múltiples: FDR Benjamini-Hochberg

Se usa **Benjamini-Hochberg (FDR)**, no Bonferroni (decisión sobre RF-10, S4). Motivo: con muchas
pruebas exploratorias, Bonferroni (control FWER) es excesivamente conservador y destruye potencia;
FDR controla la proporción esperada de falsos positivos, apropiado para un análisis descriptivo que
busca señales, no decisiones confirmatorias. Implementación propia con `numpy` (no requiere
statsmodels): orden de p, `p_adj[i] = min_{k≥i}( p_(k) · m / k )`, monótona no decreciente.

**Familias de corrección (fijadas, S4 refinado):**
- **Familia 1 — numéricas:** todos los `p_welch` de las variables numéricas conservadas forman una
  familia; `p_ajustada` de cada numérica proviene de esta familia (se corrige **sobre Welch**, la
  prueba principal; Mann-Whitney se reporta sin ajuste como robustez).
- **Familia 2 — categóricas:** todos los `p` (chi-cuadrado) de las categóricas conservadas forman
  otra familia.
- **La logística NO entra en ninguna familia FDR:** scikit-learn no entrega p-valores analíticos; sus
  IC son aproximados por bootstrap y su rol es ilustrar asociación multivariada ajustada, no
  contrastar hipótesis. Se declara así en `meta.correccion`.

`meta.correccion` documenta: método ("Benjamini-Hochberg (FDR)"), nivel (0,05) y la composición exacta
de cada familia.

### 2.7 Categóricas: chi-cuadrado de independencia + V de Cramér

Por cada categórica: tabla de contingencia categoría × `PARTICIPA`, luego
`scipy.stats.chi2_contingency` (sin corrección de Yates para tablas >2×2) → `chi2`, `dof`, `p`. El
tamaño de efecto es **V de Cramér**:

```
V = sqrt( chi2 / (n · (min(filas, columnas) − 1)) )
```

Interpretación de magnitud de V (dependiente de gl; se usa la convención de Cohen para gl* =
min(f,c)−1; para las variables aquí gl*≥1, umbrales conservadores fijados):
- V < 0,10 → **trivial**; 0,10 ≤ V < 0,20 → **pequeño**; 0,20 ≤ V < 0,30 → **mediano**;
  V ≥ 0,30 → **grande**.
La narrativa prioriza V sobre el p (mismo argumento de N grande).

### 2.8 Multivariado: regresión logística (scikit-learn)

Decisión según `entorno.md` (statsmodels AUSENTE, scikit-learn PRESENTE): **se incluye** la logística
(resuelve S5 a favor de incluirla, porque aporta la lectura "qué pesa cuando se controla por el
resto", que las univariadas no dan). Implementación:

- `sklearn.linear_model.LogisticRegression(penalty=None, class_weight="balanced",
  solver="lbfgs", max_iter=1000, random_state=config.RANDOM_SEED)`.
- **Predictores (numéricos estandarizados, z-score):** se eligen evitando colinealidad y redundancia:
  - `PGA_ULTIMO` (desempeño) — **se descarta `PERCENTIL_PGA_PROGRAMA`** como predictor del modelo por
    alta colinealidad con PGA (mide lo mismo en escala relativa); el percentil sí se reporta en las
    univariadas.
  - `SEMESTRE_AVANCE` (momento de la trayectoria).
  - `ICFES_PUNTAJE_TOTAL` — **se descartan los componentes** `ICFES_MATEMATICAS`,
    `ICFES_LECTURA_CRITICA`, `ICFES_INGLES` como predictores del modelo, por colinealidad con el total
    (el total es combinación de sus componentes). Los componentes sí entran en las univariadas.
  - `EDAD`.
  Justificación de colinealidad fijada: no se meten a la vez el agregado y sus componentes, ni el
  valor absoluto y su percentil. **De las numéricas conservadas en univariadas, el modelo retiene un
  predictor por constructo** (desempeño → `PGA_ULTIMO`; trayectoria → `SEMESTRE_AVANCE`; ingreso →
  `ICFES_PUNTAJE_TOTAL`; demografía → `EDAD`) **y descarta las demás por redundancia con esos
  constructos** — `PGA_PROMEDIO_HIST` (colineal directo con `PGA_ULTIMO`), `PCT_CREDITOS_APROBADOS` y
  `CREDITOS_APROBADOS_TOTAL` (redundantes con trayectoria/desempeño), `PERCENTIL_PGA_NIVEL` (desempeño
  en escala relativa) — **o por baja pertinencia explicativa** (`NUMERO_OPCIONES_INSCRITAS`). Todas
  estas exclusiones, junto con las de colinealidad ICFES y percentil, quedan listadas con su motivo en
  `meta_modelo.predictores_no_incluidos` (contrato §3), de modo que la exclusión sea una decisión
  documentada por variable y no una omisión.
- **Exclusión de categóricas — decisión explícita (resuelve hallazgo MEDIUM 4).** El modelo logístico
  es, por decisión acotada, **solo de factores académicos y de edad** (los 4 numéricos anteriores) y
  **no** incluye `ESTRATO_SOCIAL`, `FACULTAD` ni `GENERO` como predictores. Esta es una **decisión
  documentada, no una omisión**, y se registra en `meta_modelo.alcance_modelo = "factores
  academicos/edad; sin covariables socioeconomicas/estructurales"`. Consecuencia metodológica que se
  declara expresamente en la narrativa (web §6 e informe §5.5): **la asociación socioeconómica
  (estrato, facultad) NO queda controlada por desempeño** en este modelo; por tanto, la lectura de
  equidad socioeconómica se hace **íntegramente en las univariadas categóricas** (chi² + V de Cramér
  sobre `ESTRATO_SOCIAL` y `FACULTAD`), y el informe advierte que el modelo multivariado no responde
  "¿el estrato sigue asociado tras controlar por PGA/ICFES?". Motivo de acotar: (i) mantener el modelo
  interpretable y la escala de OR homogénea "por 1 SD" (meter dummies mezclaría OR por-SD con OR
  por-categoría); (ii) `FACULTAD` (14 niveles) y `ESTRATO_SOCIAL` (6 niveles con "Sin dato") añadirían
  ~18 dummies que, combinadas con el caso completo (~45–55 % de faltante en PGA/ICFES), degradarían el
  `n_efectivo` y la estabilidad; (iii) la logística es, por requisito (S5/RF-15), **opcional e
  ilustrativa**, no el eje del análisis de equidad. Se elige explícitamente la opción (b) de la
  revisión (modelo acotado + equidad en univariadas), no la (a) (dummies socioeconómicas), y queda
  constancia para que no se lea como descuido.
- **Estandarización:** z-score para que los odds ratios sean "por 1 desviación estándar del
  predictor" y comparables entre sí. **Punto estimado:** la media/desv. se calcula **sobre el
  subconjunto de casos completos** usados en el ajuste principal, y los OR publicados
  (`odds_ratio`) salen de ese ajuste. **Dentro del bootstrap (resuelve hallazgo MEDIUM 2):** en
  **cada réplica** se **recalcula** la estandarización (media y desv. del predictor) **sobre la
  muestra remuestreada** antes de reajustar el modelo, de modo que el IC refleje la variabilidad
  completa del pipeline (estandarización + ajuste) y no un IC artificialmente estrecho con
  estandarización congelada. Esta decisión se registra en el contrato como
  `meta_modelo.estandarizacion = "z-score recomputado por réplica (punto estimado sobre casos completos)"`
  para que sea auditable.
- **Odds ratio** = `exp(coef_)`; se reporta por predictor.
- **Tratamiento de faltantes (decisión sobre RF-15 / punto abierto 3): CASO COMPLETO.** El modelo se
  ajusta solo sobre filas con **todos** los predictores presentes. Motivo: imputar PGA/ICFES (con
  ~45-55 % de faltante) introduciría señal artificial en un modelo explicativo, y el indicador de
  faltante contaminaría la interpretación de los odds ratios. Se documenta `n_efectivo` y la pérdida
  frente al n de pregrado, y se advierte del **sesgo de selección** resultante (los casos completos
  sobre-representan a estudiantes con trayectoria consolidada) en la narrativa del informe.
- **IC95 % por bootstrap (decisión sobre punto abierto 3):** `B = 1000` remuestreos con reemplazo del
  subconjunto de casos completos, `random_state=42` derivado de `config.RANDOM_SEED` (semilla por
  réplica = 42 + i). Para cada réplica se reajusta el modelo y se guarda `exp(coef_)`; el IC95 % es el
  **percentil 2,5–97,5** de la distribución bootstrap del odds ratio. Se elige bootstrap sobre la
  Hessiana manual por ser más simple de auditar y no depender de la forma analítica con `penalty=None`.
  El informe declara **explícitamente** que es una **aproximación** (scikit-learn no da IC/p-valores
  analíticos; statsmodels no disponible). No se reporta `p` analítico de la logística; el campo `p` de
  `logistica` se deja como `null` (o se omite) y se documenta la ausencia.
- **Semilla:** todo lo aleatorio (bootstrap) usa `config.RANDOM_SEED = 42` (RF-3).

### 2.9 Selección y saneamiento de variables (RF-4, RF-5)

**Numéricas conservadas** (cobertura suficiente en pregrado): `EDAD`, `NUMERO_OPCIONES_INSCRITAS`,
`ICFES_MATEMATICAS`, `ICFES_LECTURA_CRITICA`, `ICFES_INGLES`, `ICFES_PUNTAJE_TOTAL`, `PGA_ULTIMO`,
`PGA_PROMEDIO_HIST`, `PCT_CREDITOS_APROBADOS`, `CREDITOS_APROBADOS_TOTAL`, `SEMESTRE_AVANCE`,
`PERCENTIL_PGA_PROGRAMA`, `PERCENTIL_PGA_NIVEL`.
**Descartada:** `PCT_AVANCE_CREDITOS` (13,4 % de cobertura) → registrada en `meta.descartadas` con
motivo "cobertura insuficiente (<15 %)".
Cada numérica reporta `n_part` y `n_no` **efectivos tras eliminar NaN por grupo** (visibiliza la
pérdida por faltantes).

**Categóricas conservadas:** `GENERO`, `ESTRATO_SOCIAL`, `TIPO_ADMISION`, `FACULTAD` (con nombre
legible), `ESTADO_ACADEMICO`.
**Decisión sobre `NIVEL_INGLES` (12,2 %) y `EXAMEN_NIVEL_MATEMATICAS` (17,8 %) (punto abierto 4):**
**se descartan** del análisis categórico principal (coherente con el descarte de `NIVEL_INGLES` ya
hecho en §4.6 del informe) y se registran en `meta.descartadas` con su cobertura. No se construye
catálogo de códigos para ellas (no se publican), evitando trabajo y riesgo de etiquetas ambiguas.

**Mapeos legibles (RF-5):** `FACULTAD` → nombre vía la lógica de `_faculty_name_map()`. Para no
duplicar esa función, se **extrae** a `comparative_stats.faculty_name_map()` y `export_dashboard` pasa
a importarla desde ahí (refactor mínimo, misma lógica). Faltante → categoría explícita **"Sin dato"**.

**Privacidad / umbral de grupo pequeño (RNF-3, punto abierto 6):** en las tablas de categóricas se
**suprime** (no se publica fila) toda categoría con `n < 30` estudiantes, y se marca en `meta` el
número de categorías suprimidas por variable. Umbral 30 fijado (coherente con el `min_n=30` ya usado
en el heatmap de `export_dashboard`). Las celdas suprimidas **no** entran en el chi-cuadrado para
evitar categorías inestables; se documenta.

### 2.10 Formato del resumen de boxplot (S3 confirmado)

Se usa **whiskers de Tukey (1,5·IQR)**, idéntico en web e informe (resuelve punto abierto 1):

```
q1, mediana, q3 = percentiles 25/50/75 del grupo
iqr = q3 − q1
whisker_low  = max(min_observado,  q1 − 1.5·iqr)
whisker_high = min(max_observado,  q3 + 1.5·iqr)
```

**No se publican `min`/`max` crudos** (podrían ser outliers reidentificables; RNF-3). Los campos del
contrato son `q1`, `mediana`, `q3`, `whisker_low`, `whisker_high`. Los outliers individuales **no** se
publican (ni puntos sueltos): el boxplot muestra caja + bigotes de Tukey, sin puntos outlier, en web e
informe por igual.

---

## 3. Contrato de datos — sección `comparativo` de `data.json`

El exportador inserta `out["comparativo"]` con esta forma **exacta**. Tipos: `int` para conteos,
`float` para estadísticos (redondeados en Python a la precisión publicada para evitar divergencia de
redondeo entre web e informe, RNF-1), `str` para etiquetas, `null` permitido donde se indica.

```jsonc
"comparativo": {
  "meta": {
    "alcance": "Pregrado",
    "n_part": 5821,                 // int
    "n_no": 134601,                 // int
    "tasa_base_pct": 4.15,          // float, tasa de participación global del alcance
    "metodo": {
      "numericas": "t de Welch (principal) + Mann-Whitney U asintótica con corrección de empates (robustez); d de Cohen; IC95% de la diferencia de medias",
      "categoricas": "chi-cuadrado de independencia + V de Cramer",
      "logistica": "LogisticRegression(penalty=None, class_weight='balanced'); OR=exp(coef); IC95% por bootstrap (B=1000)"
    },
    "correccion": {
      "metodo": "Benjamini-Hochberg (FDR)",
      "nivel": 0.05,
      "familias": {
        "numericas": "todos los p_welch de las numericas conservadas",
        "categoricas": "todos los p (chi2) de las categoricas conservadas",
        "logistica": "sin correccion (sin p-valores analiticos)"
      }
    },
    "semilla": 42,                  // int
    "umbral_grupo": 30,             // int, supresion por privacidad
    "descartadas": [               // lista de objetos
      {"var": "PCT_AVANCE_CREDITOS", "tipo": "numerica", "cobertura_pct": 13.4, "motivo": "cobertura insuficiente (<15%)"},
      {"var": "NIVEL_INGLES", "tipo": "categorica", "cobertura_pct": 12.2, "motivo": "cobertura insuficiente"},
      {"var": "EXAMEN_NIVEL_MATEMATICAS", "tipo": "categorica", "cobertura_pct": 17.8, "motivo": "cobertura insuficiente"}
    ],
    "generado": "2026-05-11"        // str YYYY-MM-DD — VALOR ILUSTRATIVO; en tiempo de ejecución se
                                    // rellena con pd.Timestamp.now().strftime("%Y-%m-%d") dentro de
                                    // compute_comparative (coherente con export_dashboard.build_cube);
                                    // nunca es un literal escrito a mano (resuelve hallazgo NIT 6)
  },

  "numericas": [                    // lista; un objeto por variable conservada
    {
      "var": "PGA_ULTIMO",          // str, nombre de columna
      "label": "PGA (último)",      // str, etiqueta legible en español
      "n_part": 3100, "n_no": 60000,// int, efectivos tras quitar NaN por grupo
      "media_part": 4.14, "media_no": 3.81,   // float
      "sd_part": 0.42, "sd_no": 0.55,          // float
      "mediana_part": 4.20, "q1_part": 3.95, "q3_part": 4.45,       // float (boxplot part)
      "whisker_low_part": 3.30, "whisker_high_part": 5.00,          // float
      "mediana_no": 3.85, "q1_no": 3.40, "q3_no": 4.20,            // float (boxplot no part)
      "whisker_low_no": 2.20, "whisker_high_no": 5.00,             // float
      "cohen_d": 0.62,              // float, signo = a favor de participantes si >0
      "magnitud_d": "mediano",      // str: trivial|pequeño|mediano|grande
      "dif_medias": 0.33,           // float = media_part - media_no
      "ic95_low": 0.30, "ic95_high": 0.36,   // float, IC de la diferencia de medias
      "t_stat": 42.1,               // float, estadístico de Welch
      "p_welch": 1.2e-120,          // float
      "p_mannwhitney": 3.4e-115,    // float
      "p_ajustada": 1.6e-119        // float, FDR sobre p_welch (familia numéricas)
    }
    // ... resto de numéricas
  ],

  "categoricas": [                  // lista; un objeto por variable conservada
    {
      "var": "ESTRATO_SOCIAL",
      "label": "Estrato social",
      "chi2": 1850.3, "dof": 6, "p": 0.0,     // float, int, float
      "cramers_v": 0.11,            // float
      "magnitud_v": "pequeño",      // str: trivial|pequeño|mediano|grande
      "p_ajustada": 0.0,            // float, FDR (familia categóricas)
      "categorias_suprimidas": 0,   // int, por umbral de privacidad
      "tabla": [                    // lista de filas (categorías no suprimidas)
        {"categoria": "6", "n": 4200, "n_part": 398, "tasa_pct": 9.48},
        {"categoria": "5", "n": 7100, "n_part": 445, "tasa_pct": 6.26}
        // ...
      ]
    }
    // ... resto de categóricas
  ],

  "logistica": {                    // objeto (no lista): modelo + predictores
    "meta_modelo": {
      "modo": "multivariado",       // str: "multivariado" | "fallback_tabla_2x2" | "no_disponible"
      "convergio": true,            // bool; false si lbfgs no convergió -> predictores = []
      "replicas_descartadas_pct": 0.0, // float; % de réplicas bootstrap descartadas (0 si ninguna)
      "n_efectivo": 41000,          // int, casos completos usados
      "n_pregrado": 140422,         // int, para mostrar la pérdida
      "alcance_modelo": "factores academicos/edad; sin covariables socioeconomicas/estructurales",
      "tratamiento_faltantes": "caso completo (listwise)",
      "estandarizacion": "z-score recomputado por réplica (punto estimado sobre casos completos)",
      "metodo_ic": "bootstrap percentil (B=1000, semilla 42)",
      "class_weight": "balanced",
      "nota": "OR y bootstrap son aproximación; sin p-valores analíticos (sin statsmodels); equidad socioeconómica no controlada por desempeño (ver univariadas)",
      "predictores_no_incluidos": [ // lista de objetos: variable + motivo (antes predictores_descartados_colinealidad)
        {"var": "PERCENTIL_PGA_PROGRAMA", "motivo": "colinealidad con PGA_ULTIMO (mismo constructo en escala relativa)"},
        {"var": "ICFES_MATEMATICAS", "motivo": "colinealidad con ICFES_PUNTAJE_TOTAL (componente del agregado)"},
        {"var": "ICFES_LECTURA_CRITICA", "motivo": "colinealidad con ICFES_PUNTAJE_TOTAL (componente del agregado)"},
        {"var": "ICFES_INGLES", "motivo": "colinealidad con ICFES_PUNTAJE_TOTAL (componente del agregado)"},
        {"var": "PGA_PROMEDIO_HIST", "motivo": "redundante con PGA_ULTIMO (constructo desempeño)"},
        {"var": "PCT_CREDITOS_APROBADOS", "motivo": "redundante con trayectoria/desempeño ya representados"},
        {"var": "CREDITOS_APROBADOS_TOTAL", "motivo": "redundante con trayectoria (SEMESTRE_AVANCE)"},
        {"var": "PERCENTIL_PGA_NIVEL", "motivo": "redundante con PGA_ULTIMO (desempeño en escala relativa)"},
        {"var": "NUMERO_OPCIONES_INSCRITAS", "motivo": "baja pertinencia explicativa para el modelo acotado"}
      ]
    },
    "predictores": [                // lista; un objeto por predictor del modelo
      {
        "predictor": "PGA_ULTIMO",
        "label": "PGA (último, estandarizado)",
        "coef": 0.55,               // float, en escala z (en fallback_tabla_2x2 = ln(OR) de la tabla)
        "odds_ratio": 1.73,         // float = exp(coef)
        "ic95_low": 1.60, "ic95_high": 1.88,   // float, percentiles bootstrap (o null en fallback si no se calcula)
        "p": null                   // sin p-valor analítico
      }
      // ...
    ]
  }
}
```

**Estados no-felices del bloque `logistica` (forma estable — resuelve hallazgo MEDIUM 1).** El
contrato cubre explícitamente los tres modos para que `<LogisticOddsRatios>` (web) y
`comparativo_logistica.tex` (informe) rendericen **sin ramas condicionales por caso**:

- `modo == "multivariado"` (camino feliz): `predictores` es la lista de 4 predictores con todas las
  claves pobladas (`coef` en escala z, `odds_ratio=exp(coef)`, IC por bootstrap percentil).
- `modo == "no_disponible"` **o** `convergio == false` ⇒ **`predictores: []`**. La UI y el informe
  muestran el texto **"Modelo logístico no disponible"** (y la razón en `meta_modelo.nota`) en lugar
  de intentar dibujar el forest-plot o la tabla. No se emiten filas.
- `modo == "fallback_tabla_2x2"` (degradación a OR por tabla 2×2 por predictor dicotomizado en la
  mediana; ver §7): cada objeto de `predictores` **mantiene exactamente las mismas claves**
  (`predictor, label, coef, odds_ratio, ic95_low, ic95_high, p`), con `coef = ln(OR)` de la tabla 2×2
  y `odds_ratio = OR` de la tabla. Los IC se pueblan por el método declarado en `meta_modelo.metodo_ic`
  (o `ic95_low = ic95_high = null` si no se calculan), y `p = null`. Así el forest-plot y la `.tex`
  leen las mismas claves en los tres modos; la única diferencia visible es la nota de aproximación en
  `meta_modelo.nota`. `replicas_descartadas_pct` es `0.0` fuera del modo multivariado.

**Variables degeneradas / no calculables (resuelve hallazgo NIT 4).** Una variable que no se puede
calcular (grupo vacío o n<2 tras quitar NaN en una numérica; tabla de contingencia degenerada en una
categórica — ver §7) **sigue apareciendo en su lista** (`numericas`/`categoricas`) para no romper el
índice de los consumidores, pero con sus estadísticos en `null`, de forma que el tipo sea estable al
ordenar. En concreto: para una **numérica no calculable**, `cohen_d = magnitud_d = dif_medias =
ic95_low = ic95_high = t_stat = p_welch = p_mannwhitney = p_ajustada = null` (se conservan `var`,
`label`, `n_part`, `n_no`); para una **categórica no calculable**, `chi2 = dof = p = cramers_v =
magnitud_v = p_ajustada = null`. Estas variables **quedan fuera de la familia FDR** (no participan en
el ajuste BH; ver §2.6/§7), por lo que su `p_ajustada` es `null` por definición, nunca un número.
Web e informe las **listan al final, marcadas como "no calculable"** y no intentan dibujar su boxplot/
barra. Así el orden por `p_ajustada` o por `|cohen_d|` trata `null` como "sin valor" al final y no
mezcla tipos.

`meta.descartadas`, la supresión por umbral y la ausencia de microdatos garantizan RNF-3 y el peso
ligero del `data.json` (son decenas de objetos agregados, no filas).

---

## 4. Módulo único de cálculo — `src/comparative_stats.py`

**Ubicación (punto abierto 7):** `src/comparative_stats.py`. Funciones **puras** (reciben DataFrame,
devuelven dicts/DataFrames; sin efectos de E/S salvo las de exportación a CSV, que viven en el
notebook, no en el módulo).

API pública:

```python
RANDOM_SEED = config.RANDOM_SEED

def faculty_name_map() -> dict: ...
    # mapa código->nombre (lógica trasladada desde export_dashboard._faculty_name_map)

def numeric_comparison(df, var, label) -> dict: ...
    # Welch + Mann-Whitney + d de Cohen + IC95% + resumen boxplot Tukey, para una numérica

def categorical_comparison(df, var, label, min_n=30) -> dict: ...
    # chi2 + V de Cramér + tabla de tasas con supresión por umbral

def bh_fdr(pvalues: list[float]) -> list[float]: ...
    # Benjamini-Hochberg sobre una familia de p-valores

def logistic_model(df, predictors, n_boot=1000, seed=RANDOM_SEED) -> dict: ...
    # LogisticRegression(penalty=None, class_weight='balanced') + bootstrap de OR

def compute_comparative(df, scope="pregrado") -> dict:
    # Orquesta todo; aplica el filtro de alcance, corre numéricas y categóricas,
    # aplica bh_fdr por familia, corre la logística, arma meta y devuelve el dict
    # EXACTO de la sección 3 (lo que entra en out["comparativo"]).
```

**Garantía de fuente única (RNF-1):**
- `export_dashboard.build_cube()` añade `out["comparativo"] = comparative_stats.compute_comparative(df, "pregrado")`.
- El notebook `06` llama a **la misma** `compute_comparative(df, "pregrado")`, y de su resultado deriva
  las figuras y los CSV. No hay recomputación: las tablas CSV se construyen volcando los mismos dicts.
- **Verificación reproducible (RNF-1, criterio 9) — vía primaria sin pytest (resuelve hallazgo
  NIT 7):** la verificación **primaria** son **aserciones en una celda final del notebook `06`** (no
  depende de ningún runner externo; si divergen, falla el build del notebook y por tanto `python
  build_notebooks.py 06`). Esa celda:
  1. llama a `compute_comparative`,
  2. carga el `data.json` recién exportado,
  3. afirma que, para al menos una numérica (p. ej. `PGA_ULTIMO`) y una categórica (p. ej.
     `ESTRATO_SOCIAL`), los campos clave (`cohen_d`, `dif_medias`, `cramers_v`, `tasa_pct`) coinciden
     hasta la precisión publicada.
  Un `tests/test_comparative_consistency.py` para `pytest` queda como **complemento OPCIONAL**.
  Motivo: `pytest` está instalado en el intérprete pero **no** figura en `requirements.txt`; formalizar
  pytest como dependencia sería introducir herramienta nueva, lo que contradice el espíritu de RNF-2 /
  RNF-9, así que **no se añade a `requirements.txt` sin confirmación del usuario**. La vía primaria
  (celda del notebook) cumple el criterio 9 por sí sola.

---

## 5. Entregable C — Informe LaTeX

### 5.1 Ubicación de la sección

Se añade una **sección nueva** titulada **"Análisis comparativo inferencial (participantes vs. no
participantes)"** colocada **inmediatamente después de `\section{Hallazgos e insights principales}`**
(`\label{sec:insights}`, línea 507 del `.tex`) **y antes de `\section{Reorientación del alcance: foco
descriptivo}`** (`\label{sec:reorientacion}`, línea 630) — resuelve hallazgo NIT 5, que señaló que
"antes de Conclusiones" abarcaba seis secciones intermedias. El ancla queda fijada sin margen: la nueva
sección es contigua a Hallazgos e insights. Decisión documentada: sección nueva, no ampliación de EDA,
porque es contenido técnico-inferencial nuevo y mantiene intacto el EDA descriptivo existente; no se
borra nada (RF-13). Subsecciones:

1. `\subsection{Enfoque: tamaño de efecto sobre significancia}` — narrativa del N grande ⇒
   significancia casi automática; por qué se prioriza d de Cohen / V de Cramér.
2. `\subsection{Diferencias en variables numéricas}` — boxplots + tabla numérica.
3. `\subsection{Diferencias en variables categóricas}` — tabla categórica + comentario de V de Cramér.
4. `\subsection{Modelo logístico multivariado}` — tabla de odds ratios; advertencia de aproximación.
5. `\subsection{Equidad, limitaciones y encuadre asociativo}` — gradiente socioeconómico como
   asociación-no-causa, **leído desde las univariadas categóricas** (chi² + V de Cramér sobre
   `ESTRATO_SOCIAL` y `FACULTAD`); se declara explícitamente que el modelo logístico **no** incluye
   covariables socioeconómicas y que, por tanto, **la asociación socioeconómica no está controlada por
   desempeño** (ver §2.8, hallazgo MEDIUM 4). Además: faltantes/NaN; sesgo de selección del caso
   completo; naturaleza observacional.

### 5.2 Paquetes (RNF-6) — sin paquetes nuevos (resuelve hallazgo MEDIUM 3)

El preámbulo actual (verificado en `latex/informe_proyecto.tex`, líneas 3–21) carga:
`inputenc`, `fontenc`, `babel[spanish]`, `geometry`, `setspace`, `parskip`, `enumitem`,
**`booktabs`**, **`array`**, **`longtable`**, **`tabularx`**, `multirow`, **`graphicx`**, `float`,
`amsmath`, `amssymb`, `caption`, `xcolor`, `hyperref`. **`siunitx` NO está cargado; `csvsimple`
TAMPOCO.**

**Decisión fijada (ruta A): NO se añade ningún paquete LaTeX nuevo.** RNF-6 permite "usar solo
paquetes ya presentes", y la revisión señaló (acertadamente) que `siunitx`/`csvsimple` no están
confirmados en la distribución TeX del usuario y que depender de `\csvreader` dejaría todas las tablas
de la sección sin renderizar si falta el paquete. Para no arriesgar la compilación:

- Las tablas se incluyen con **`\input{tablas/<nombre>.tex}`**, donde cada `.tex` es un **`tabular`/
  `longtable` ya formateado con `booktabs`** (`\toprule`/`\midrule`/`\bottomrule`), generado por el
  notebook `06` (ver §5.4). No se usa `\csvreader`.
- El formato numérico (coma decimal española, número de decimales, alineación) se aplica **en Python**
  al construir el `.tex` (una función `df_to_latex_booktabs`), no con `siunitx`. Así el alineado y el
  separador decimal no dependen de ningún paquete nuevo y las cifras siguen saliendo del mismo
  `compute_comparative` (RF-14).
- Las columnas numéricas usan tipo `r` (alineación a la derecha) con la coma ya incrustada por Python;
  no se requiere el tipo `S` de siunitx.

Este es el **camino primario y único**, no un fallback hipotético: el `.tex` tabular generado por el
notebook es lo que el informe incluye.

### 5.3 Figuras (rutas exactas)

`\graphicspath{{figuras/}}` (verificado en `latex/informe_proyecto.tex` línea 26). Las figuras se
generan con `utils.save_fig(fig, nombre)` en **`reports/figures/`**.

**Aclaración (resuelve hallazgo MEDIUM 1): la copia a `latex/figuras/` es un mecanismo NUEVO, no un
patrón existente.** Se verificó el código: `utils.save_fig` escribe **solo** en `reports/figures/`,
`build_notebooks.py` solo construye y ejecuta notebooks, y **ningún** `.py` del repo copia PNG a
`latex/`. Las 10 PNG que hoy viven en `latex/figuras/` se pusieron **a mano**; no hay paso
reproducible que las genere. Por tanto, este diseño **introduce explícitamente** un paso de copia
nuevo (y un directorio nuevo `latex/tablas/`), no "sigue un patrón".

Para que ese paso sea reproducible y robusto frente al `cwd` del kernel (el notebook se ejecuta con
`cwd = notebooks/`, ver `resources={"metadata": {"path": str(NB_DIR)}}` en `build_notebooks.py`), la
copia usa **rutas absolutas derivadas de `config`**, nunca rutas relativas al cwd:

```python
import shutil
from src import config
LATEX_FIG = config.ROOT_DIR / "latex" / "figuras"
LATEX_TAB = config.ROOT_DIR / "latex" / "tablas"
LATEX_FIG.mkdir(parents=True, exist_ok=True)   # figuras/ ya existe; mkdir es idempotente
LATEX_TAB.mkdir(parents=True, exist_ok=True)   # tablas/ es DIRECTORIO NUEVO
for nombre in ("fig_comparativo_boxplots.png", "fig_comparativo_cohend.png", "fig_comparativo_cramersv.png"):
    shutil.copy2(config.FIGURES_DIR / nombre, LATEX_FIG / nombre)
```

(`config.ROOT_DIR`, `config.FIGURES_DIR` y `config.TABLES_DIR` existen y se verificaron en
`src/config.py`.) Esta celda de copia va al final del notebook `06`, de modo que `python
build_notebooks.py 06` deja PNG+CSV en `reports/` **y** sus copias en `latex/`, sin acción manual
(RNF-9). PNG nuevas:

- `fig_comparativo_boxplots.png` — rejilla de boxplots (participa vs. no) de las numéricas con |d|
  mayor (p. ej. top 6 por efecto), construidos con matplotlib `ax.bxp(...)` a partir del resumen Tukey
  precalculado (mismos 5 números que la web).
- `fig_comparativo_cohend.png` — barras horizontales de d de Cohen ordenadas, con líneas de banda
  (0,2 / 0,5 / 0,8) y color por signo.
- `fig_comparativo_cramersv.png` — barras de V de Cramér por categórica, con bandas de magnitud.

Inclusión: `\includegraphics[width=0.92\textwidth]{fig_comparativo_boxplots.png}` (y análogas).

### 5.4 Tablas (rutas exactas, generación automática — RF-14)

Se escriben **dos artefactos por tabla** desde el notebook `06`, ambos derivados del mismo dict de
`compute_comparative`:

1. un **CSV** en **`reports/tables/`** (trazabilidad y para el test de consistencia / inspección);
2. un **`.tex` tabular con `booktabs`** (vía `df_to_latex_booktabs`, formateo numérico en Python)
   copiado con `shutil.copy2`/escritura directa a **`latex/tablas/`** (directorio NUEVO, creado con
   `mkdir(parents=True, exist_ok=True)` usando `config.ROOT_DIR / "latex" / "tablas"`, ver §5.3).

El informe incluye el `.tex` con `\input{tablas/<nombre>.tex}` (no `\csvreader`, resuelve MEDIUM 3).
Artefactos nuevos:

- `reports/tables/comparativo_numericas.csv` + `latex/tablas/comparativo_numericas.tex` — columnas:
  `label, media_no, media_part, dif_medias, ic95_low, ic95_high, cohen_d, magnitud_d, p_welch,
  p_mannwhitney, p_ajustada`.
- `reports/tables/comparativo_categoricas.csv` + `latex/tablas/comparativo_categoricas.tex` —
  columnas: `label, chi2, dof, p, cramers_v, magnitud_v, p_ajustada`.
- `reports/tables/comparativo_logistica.csv` + `latex/tablas/comparativo_logistica.tex` — columnas:
  `label, odds_ratio, ic95_low, ic95_high`.

Cada `.tex` es un `tabular`/`longtable` envuelto en `\toprule … \midrule … \bottomrule` (`booktabs`,
ya cargado). **Ninguna cifra de esta sección se escribe a mano** (RF-14); todas provienen de los
artefactos generados por el mismo `compute_comparative`, y el formateo (coma decimal, decimales) se
aplica una sola vez en Python. Las tablas existentes `tab:perfil` y `tab:grupos` (escritas a mano)
**no se tocan** (son del EDA previo).

---

## 6. Entregable B — Dashboard (pestaña Insights)

### 6.1 Accesor en `data.js`

En `loadCube()`, añadir al objeto devuelto:
```js
comparativo: raw.comparativo || null,
```
Los componentes nuevos **solo leen** `cube.comparativo.{numericas,categoricas,logistica,meta}`. Las
vistas de Insights son globales y **no responden a los filtros** del Explorador (RF-12), coherente con
el resto de la pestaña.

### 6.2 Reorganización de la pestaña Insights (sin romper lo existente)

Se **mantienen** `ModalityArea`, `StackedByFaculty`, `SeasonBars` y `DonutResultado` y sus
`section-title`. Se **añade al principio** del panel (antes de "Modalidades en el tiempo") un bloque
nuevo con subtítulos:

- `section-title`: **"¿Qué diferencia a quienes participan? (pregrado)"** + párrafo narrativo que
  prioriza tamaño de efecto y evita lenguaje causal (RF-11).
- `section-title`: "Tamaño de efecto por variable numérica" → `<CohenDChart>`
- `section-title`: "Distribuciones comparadas" → `<ComparativeBoxplots>`
- `section-title`: "Asociación en variables categóricas" → `<CategoricalAssociation>`
- (opcional) `section-title`: "Modelo multivariado" → `<LogisticOddsRatios>`

Los bloques globales existentes quedan **debajo**, bajo un `section-title` "Panorama histórico de la
movilidad", para separarlos narrativamente sin moverlos de la pestaña.

### 6.3 Componentes nuevos (props)

Todos reciben datos **precalculados** (sin recomputar cuantiles ni estadísticos en el cliente). Todos
llevan `aria-label` descriptivo, `Tooltip` informativo y contraste suficiente (RNF-8), siguiendo el
patrón de los componentes actuales.

**`<CohenDChart data={comparativo.numericas} />`**
- Barras horizontales (Recharts `BarChart` layout `vertical`) de `cohen_d` por variable, ordenadas por
  |d| desc. Color por signo (verde = a favor de participantes, ámbar/rojo = a favor de no
  participantes, usando la paleta ya presente). Líneas de referencia `ReferenceLine` en ±0,2, ±0,5,
  ±0,8 con etiquetas pequeño/mediano/grande. Tooltip: `label`, `cohen_d`, `magnitud_d`, grupo
  favorecido, `dif_medias`, IC95 %.
- Props: `data` (array de `numericas`). Sin estado; puro render.

**`<ComparativeBoxplots data={comparativo.numericas} />`**
- Boxplots participa vs. no por variable, **sin librería nueva**. Implementación elegida:
  **`ComposedChart` + formas vía `Customized`** dibujando caja (q1–q3), mediana y bigotes de Tukey a
  partir de los 5 números precalculados (`q1`, `mediana`, `q3`, `whisker_low`, `whisker_high` por
  grupo). (Alternativa considerada: `ErrorBar` sobre `Bar`; se descarta porque `ErrorBar` modela solo
  un rango simétrico y no la caja+mediana; `Customized` da control total y no añade dependencias.)
  Selector (dropdown accesible) para elegir la variable a graficar, o una rejilla paginada; se fija
  **selector** para mantener el SVG ligero.
- Props: `data` (array de `numericas`), `initialVar` opcional.

**`<CategoricalAssociation data={comparativo.categoricas} />`**
- Por variable (selector): barras de `tasa_pct` por categoría (Recharts `BarChart`) con `ReferenceLine`
  en la tasa base (`meta.tasa_base_pct`), y un **badge con la V de Cramér** y su `magnitud_v`. Tooltip:
  `categoria`, `n`, `n_part`, `tasa_pct`.
- Props: `data` (array de `categoricas`), `tasaBase` (number, de `meta.tasa_base_pct`).

**`<LogisticOddsRatios data={comparativo.logistica} />`** (opcional)
- Forest-plot simple: punto = `odds_ratio`, barra de error = IC95 % (`ErrorBar` **sí** aplica aquí,
  rango asimétrico sobre el OR), `ReferenceLine` en OR=1. Nota al pie: "OR aproximados; IC por
  bootstrap; asociación, no causa".
- Props: `data` (objeto `logistica`).

**Resumen narrativo (RF-11):** un bloque de texto en español, redactado en el notebook/informe y
reflejado en la UI como párrafo estático, que destaca las 3-4 variables de mayor efecto y recuerda el
encuadre asociativo. (Se escribe a mano como prosa, pero **las cifras citadas** se toman de
`comparativo`, no se recalculan.)

### 6.4 Estilos

Reutilizar clases `card`, `card-sub`, `section-title`, `custom-tooltip`, `tt-*` ya existentes en
`styles.css`. No se toca el fix del Heatmap (RNF-7).

---

## 7. Manejo de errores y validación (concreto por operación)

- **Carga del parquet** (`compute_comparative`): si la ruta no existe → `FileNotFoundError` propagado
  (fatal; el pipeline aborta con mensaje claro). Recuperable: no.
- **Variable candidata ausente en el DataFrame:** si una columna esperada no existe → se omite esa
  variable, se añade a `meta.descartadas` con motivo "columna ausente" y se registra un `warning`
  (print) en el notebook/export. Recuperable: sí (no aborta).
- **Grupo vacío o n<2 tras quitar NaN** (numérica): la prueba no es calculable → la variable
  **permanece en la lista** `numericas` con `p_welch/p_mannwhitney/p_ajustada/cohen_d/magnitud_d/
  dif_medias/ic95_*/t_stat: null`, se excluye de la familia FDR y se anota en `meta`; web/informe la
  listan al final como "no calculable" (contrato §3, NIT 4). Recuperable: sí.
- **Tabla de contingencia degenerada** (una sola categoría tras supresión, o columna de ceros):
  chi-cuadrado no válido → la variable permanece en `categoricas` con `chi2/dof/p/cramers_v/magnitud_v/
  p_ajustada: null`, excluida de la familia FDR, anotada; listada al final como "no calculable".
  Recuperable: sí.
- **No convergencia de la logística** (`lbfgs` no converge en `max_iter`): se captura el
  `ConvergenceWarning`; si no converge, se reporta `logistica` con `meta_modelo.convergio=false`,
  `meta_modelo.modo="no_disponible"` y **`predictores=[]`**; el resto del `comparativo` se publica
  igual. Web/informe muestran "Modelo logístico no disponible" (contrato §3). Recuperable: sí (degrada
  solo la logística). Fallback último (coherente con entorno.md): si el ajuste multivariado no es
  viable por completo, se degrada a **odds ratios por tabla** (2×2 por predictor dicotomizado en la
  mediana) con `meta_modelo.modo="fallback_tabla_2x2"`, poblando en cada predictor **las mismas claves**
  del contrato (`coef=ln(OR)`, `odds_ratio=OR`, IC por el método declarado o `null`, `p=null`) para
  que forest-plot y `.tex` rendericen sin ramas condicionales; se documenta la limitación en
  `meta_modelo.nota`.
- **Bootstrap con réplica degenerada** (remuestreo sin ambas clases): se descarta esa réplica y se
  continúa; el porcentaje descartado se registra en `meta_modelo.replicas_descartadas_pct`; si >5 % de
  réplicas se descartan, además se añade una advertencia a `meta_modelo.nota`. Recuperable: sí.
- **Serialización JSON:** `float`/`int` nativos (se convierte `numpy` → nativo antes de `json.dump`);
  `NaN`/`inf` se transforman a `null` (JSON no los admite). Validación: tras exportar, `loadCube()`
  debe decodificar sin fallo (criterio 7).
- **Logging:** nivel `print` (consistente con el repo, que usa `print` en pipeline y `verbose`). Los
  fatales lanzan excepción; los recuperables imprimen `warning` y continúan.

### Validación de entradas externas

La única entrada externa real es el **DataFrame del parquet** (no hay input de usuario en tiempo de
cálculo). Reglas: `PARTICIPA` debe ser binaria {0,1} (si no, `ValueError` fatal); columnas numéricas
se fuerzan a `float` con `pd.to_numeric(errors="coerce")` (valores no numéricos → NaN, contabilizados
como faltantes); `ES_PREGRADO` debe existir para el filtro de alcance (si falta, fatal). En la web,
`cube.comparativo` puede ser `null` (data.json viejo) → los componentes renderizan un placeholder "Sin
datos comparativos" en vez de romper.

### Invariantes y dónde se aplican

- **Consistencia numérica web↔informe (RNF-1):** la posee el **módulo único** (`comparative_stats`),
  que es la única fuente; el redondeo se hace una sola vez en Python antes de serializar, y el informe
  lee los CSV derivados del mismo dict. Nadie recalcula en JS/LaTeX.
- **Minimización de datos (RNF-3):** la aplica `compute_comparative` (solo agregados; supresión n<30;
  sin min/max crudos). Capa de datos, porque es donde se decide qué sale del Python.
- **Reproducibilidad (semilla):** la fija `config.RANDOM_SEED`, usada por el bootstrap en el módulo.

---

## 8. Testabilidad

- **Verificación de consistencia primaria (sin pytest):** aserciones en la celda final del notebook
  `06` (ver §4). Es la verificación que cumple el criterio 9 y no depende de un runner externo ni de
  añadir pytest a `requirements.txt` (NIT 7).
- **Unit test (opcional, pytest):** `bh_fdr` contra un caso conocido; `numeric_comparison` con dos
  arrays sintéticos de d de Cohen conocido (verifica signo y magnitud, y que un solo `sd` ddof=1
  alimenta t_stat e IC); `categorical_comparison` con una tabla 2×2 de V de Cramér conocida;
  `faculty_name_map` devuelve dict no vacío. No requieren el dataset real. Solo se ejecutan si el
  usuario opta por formalizar pytest (no se añade a `requirements.txt` sin confirmación).
- **Integration test (opcional, pytest — `test_comparative_consistency.py`):** duplica la aserción de
  la celda del notebook sobre el parquet real; es complemento, no la vía primaria (RNF-1, criterio 9).
- **Build web:** `npm run build` debe quedar en verde con los componentes nuevos y `cube.comparativo`
  posiblemente `null` (criterio 7, RNF-5).
- **Diseño testeable:** las funciones puras (sin E/S) y la separación cálculo/presentación hacen que
  cada estadístico sea verificable de forma aislada; la logística, al depender de aleatoriedad, se
  prueba con semilla fija y tolerancia.

---

## 9. Comandos de reproducción (RNF-9, sin pasos manuales)

```powershell
python -m src.build_dataset           # dataset analítico (si hace falta)
python -m src.export_dashboard        # genera data.json con out["comparativo"]
python build_notebooks.py 06          # notebook nuevo -> PNG + CSV + .tex; copia a latex/figuras y latex/tablas
cd dashboard; npm run build           # build del dashboard en verde
# compilar latex/informe_proyecto.tex con el motor habitual
```

---

## 10. Resumen de decisiones abiertas resueltas

1. Boxplot → **whiskers de Tukey (1,5·IQR)**, sin min/max crudos, sin puntos outlier; idéntico web/informe.
2. FDR → **Benjamini-Hochberg**, dos familias (numéricas sobre Welch; categóricas sobre chi²); logística fuera.
3. Logística → **incluida**, scikit-learn `penalty=None, class_weight='balanced'`, **caso completo**, IC95 % por **bootstrap** (B=1000, semilla 42), sin p-valores analíticos.
4. `NIVEL_INGLES` / `EXAMEN_NIVEL_MATEMATICAS` → **descartadas** y documentadas por cobertura.
5. Alcance → **solo pregrado** publicado.
6. Umbral de privacidad → **n < 30** suprimido, marcado en `meta`.
7. Ubicación → módulo `src/comparative_stats.py`; notebook `06_comparativo_inferencial`; PNG en `reports/figures/`→`latex/figuras/`; CSV en `reports/tables/`→`latex/tablas/`.
8. Prueba principal → **Welch** (para narrativa, d de Cohen e IC de medias); Mann-Whitney como robustez; IC solo de la diferencia de **medias**.

---

## 11. Respuesta a los hallazgos de la revisión (iteración 3 — revisión vigente)

Revisión `design-review.json` vigente (veredicto CHANGES_REQUESTED, 1 MEDIUM + 5 NIT). Todos los
hallazgos se **atienden** (no se hace backlog ni se ignora ninguno); las correcciones son coherentes
con `requisitos.md`.

| # | Sev | Hallazgo | Resolución |
|---|-----|----------|------------|
| 1 | MEDIUM | El contrato "exacto" de `logistica` no cubre los campos del manejo de errores (convergio, réplicas descartadas) ni la degradación por fallback | **Atendido en §3 (contrato `logistica.meta_modelo`) + §7.** Se añaden `modo` ("multivariado"\|"fallback_tabla_2x2"\|"no_disponible"), `convergio:bool` y `replicas_descartadas_pct:float` al contrato. Se fija: si `convergio=false` o `modo="no_disponible"` ⇒ `predictores=[]` y web/informe muestran "Modelo logístico no disponible"; si `modo="fallback_tabla_2x2"` ⇒ cada predictor mantiene **las mismas claves** (`coef=ln(OR)` de la tabla, `odds_ratio=OR`, IC por el método declarado o `null`, `p=null`), de modo que el forest-plot y la `.tex` rendericen sin ramas condicionales. |
| 2 | NIT | Justificación de colinealidad incompleta para predictores numéricos no-ICFES / no-percentil | **Atendido en §2.8 + §3.** Se añade la regla "un predictor por constructo" (desempeño→`PGA_ULTIMO`; trayectoria→`SEMESTRE_AVANCE`; ingreso→`ICFES_PUNTAJE_TOTAL`; demografía→`EDAD`) con motivo de descarte por variable para `PGA_PROMEDIO_HIST`, `PCT_CREDITOS_APROBADOS`, `CREDITOS_APROBADOS_TOTAL`, `PERCENTIL_PGA_NIVEL` y `NUMERO_OPCIONES_INSCRITAS`. El campo `predictores_descartados_colinealidad` se renombra a **`predictores_no_incluidos`** (lista de objetos `{var, motivo}`). |
| 3 | NIT | `method` de Mann-Whitney sin especificar (N grande con empates) | **Atendido en §2.3 + §3.** Se fija `method="asymptotic"` en `numeric_comparison` y se anota en `meta.metodo.numericas` ("Mann-Whitney U asintótica con corrección de empates"). |
| 4 | NIT | `p_ajustada` de variables degeneradas (p=null) sin valor definido en el contrato | **Atendido en §3.** Se declara que las variables excluidas de la familia FDR llevan `p_ajustada=null` (y `cohen_d`/`cramers_v`/`magnitud_*`/demás estadísticos = `null`), permanecen en su lista, y web/informe las listan al final como "no calculable". Sin tipo mixto al ordenar. |
| 5 | NIT | Ubicación exacta de la nueva sección LaTeX es un rango amplio | **Atendido en §5.1.** Se precisa "inmediatamente después de `\section{Hallazgos e insights principales}` (`sec:insights`, línea 507) y antes de `\section{Reorientación del alcance: foco descriptivo}` (`sec:reorientacion`, línea 630)", verificado contra el `.tex`. |
| 6 | NIT | d de Cohen con SD agrupada junto a Welch (varianzas desiguales): señalar la tensión | **Atendido en §2.4.** Se añade nota: con `sd_part` y `sd_no` muy dispares, la etiqueta de magnitud de `d` (SD agrupada) es orientativa y mandan el **signo** y el **IC de la diferencia de medias** (coherentes con Welch); no se cambia la fórmula. |

## 11.1. Respuesta a los hallazgos de la revisión (iteración 2 — histórico)

Revisión previa `design-review.json` (veredicto CHANGES_REQUESTED). Todos los hallazgos se
**atendieron** (no se hizo backlog ni se ignoró ninguno); las correcciones son coherentes con
`requisitos.md`.

| # | Sev | Hallazgo | Resolución |
|---|-----|----------|------------|
| 1 | MEDIUM | La copia de PNG a `latex/figuras/` se presentaba como patrón existente, pero no existe automatización | **Atendido en §5.3.** Se declara explícitamente que la copia es un **mecanismo nuevo** (verificado: `utils.save_fig` solo escribe en `reports/figures/`; las PNG en `latex/figuras/` son manuales). La copia usa rutas **absolutas** desde `config` (`config.ROOT_DIR / "latex" / ...`, `config.FIGURES_DIR`), `mkdir(parents=True, exist_ok=True)`, `shutil.copy2`, nunca rutas relativas al `cwd` del kernel (`notebooks/`). `latex/tablas/` se declara directorio nuevo. |
| 2 | MEDIUM | Ambigüedad: ¿se recalcula el z-score por réplica bootstrap? Afecta el IC95 % de los OR | **Atendido en §2.8.** Se fija que en **cada réplica** se **recalcula** la estandarización sobre la muestra remuestreada antes de reajustar; el punto estimado usa la estandarización sobre casos completos. Se registra en `meta_modelo.estandarizacion` (contrato §3). |
| 3 | MEDIUM | Riesgo de compilación LaTeX: `siunitx`/`csvsimple` sin verificar y sin fallback ejecutable | **Atendido en §5.2/§5.4 — ruta A.** **No** se añade ningún paquete nuevo. Las tablas se generan como `.tex` con `booktabs`/`longtable` (ya cargados) desde el notebook (`df_to_latex_booktabs`, formateo numérico en Python) e se incluyen con `\input{tablas/...tex}`. No se usa `\csvreader`. Es el camino primario y único. |
| 4 | MEDIUM | El modelo logístico omite todas las categóricas sin justificarlo | **Atendido en §2.8 (opción b) + §5.1/§5.5 + contrato.** Se declara explícitamente que el modelo es **solo de factores académicos/edad** (decisión acotada, no omisión), con motivos (OR homogéneos por-SD; evitar ~18 dummies que degradan el n efectivo del caso completo; logística opcional por S5/RF-15). La lectura de equidad socioeconómica pasa **íntegramente a las univariadas** y el informe advierte que la asociación socioeconómica **no** está controlada por desempeño. Se registra en `meta_modelo.alcance_modelo`. |
| 5 | NIT | Mann-Whitney sin FDR mientras Welch sí; falta regla ante discrepancia | **Atendido en §2.3.** Significancia se decide siempre con `p_ajustada` (Welch, FDR); Mann-Whitney juzga robustez solo por **concordancia de dirección del efecto**, no por su p crudo. Regla reflejada en la narrativa web/informe. |
| 6 | NIT | `meta.generado` aparecía como literal `"2026-05-11"` | **Atendido en §3.** Se marca el literal como ilustrativo y se fija que se rellena con `pd.Timestamp.now().strftime("%Y-%m-%d")` en `compute_comparative`. |
| 7 | NIT | `pytest` no está en `requirements.txt` aunque esté instalado | **Atendido en §4/§8.** La verificación RNF-1 **primaria** es la aserción en la celda final del notebook (sin runner externo). El test pytest es complemento opcional; no se añade a `requirements.txt` sin confirmación del usuario (RNF-2). |
| 8 | NIT | Asegurar una sola definición de varianzas por grupo entre `t_stat`/`p_welch` y `se`/`gl`/`cohen_d` | **Atendido en §2.5/§4.** `numeric_comparison` calcula `sd` **una vez con `ddof=1`**; esos mismos `sd_part`, `sd_no`, `n_part`, `n_no` alimentan t de Welch (scipy), SE, gl, IC y `sd_pooled` del `cohen_d`. Una sola aritmética, sin micro-divergencia. |
