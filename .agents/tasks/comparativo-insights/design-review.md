# Revisión de diseño — comparativo-insights (iteración 4)

Revisión independiente de `diseno.md` contra `requisitos.md` y `entorno.md`, con verificación directa
del código fuente del repositorio. Foco especial en el rigor metodológico estadístico.

Veredicto mecánico: se cuentan hallazgos HIGH y MEDIUM. **2 MEDIUM, 0 HIGH, 4 NIT → CHANGES_REQUESTED.**

---

## Resumen de la verificación metodológica solicitada

Se comprobó explícitamente cada punto exigido. Resultado:

| Punto exigido | Estado | Dónde |
|---|---|---|
| Desbalance (~4,15 %) en comparaciones y logística | **Resuelto, correcto** | §2.2 |
| Welch + Mann-Whitney y justificación | **Resuelto, correcto** | §2.3 |
| Tamaño de efecto como métrica narrativa prioritaria; magnitud y signo | **Resuelto, correcto** | §2.4 |
| IC95 % de la diferencia de medias coherente con Welch | **Resuelto, correcto** | §2.5 |
| FDR/Bonferroni, familia correcta | **Resuelto, correcto** | §2.6 |
| Chi² + V de Cramér | **Resuelto, correcto** | §2.7 |
| Logística coherente con librerías; estandarización, NaN, colinealidad | **Resuelto, correcto** | §2.8 |
| Semilla fija (42) | **Resuelto, correcto** | §2.2/§2.8, verificado en `config.py` |
| Contrato de datos `comparativo` completo y consistente | **Resuelto** (con salvedad, ver M1) | §3 |
| Fuente única de cálculo con consistencia exacta web/informe | **Parcial — ver M1** | §4, §5.4 |
| Rutas PNG/CSV coherentes con graphicspath y build_notebooks | **Resuelto, correcto** | §5.3/§5.4 |
| No dependencias nuevas; no tocar el fix del Heatmap | **Resuelto, correcto** | §5.2, §6.4, RNF-2/RNF-7 |

Las dos salvedades que bloquean (M1, M2) y los NIT se detallan abajo.

---

## Hallazgos

### M1 — MEDIUM. La "consistencia exacta web↔informe" no está garantizada para las cifras que el informe realmente muestra (los `.tex`), solo para `data.json`.

**Dónde:** §4 ("Verificación reproducible"), §3 (nota de redondeo), §5.4 (generación de `.tex`), contra RNF-1 y criterio 9.

**Problema.** El diseño define bien la fuente única (`compute_comparative`) y rondea los floats "una sola
vez en Python" antes de serializar `data.json`. Pero el informe **no lee `data.json`**: lee
`\input{tablas/<nombre>.tex}`, y esos `.tex` los produce `df_to_latex_booktabs` aplicando **su propio**
formateo (coma decimal española, número de decimales por columna). Son **dos pasos de formateo
distintos** sobre el mismo dict: (a) el redondeo que entra a `data.json` (lo que ve el dashboard) y
(b) el formateo de decimales del `.tex` (lo que ve el informe). El diseño **no fija que ambos usen el
mismo número de decimales por campo**, y la verificación de §4 solo compara `compute_comparative` ↔
`data.json` (misma fuente, comparación casi trivial), **nunca** `data.json` ↔ el `.tex` renderizado.
Resultado: nada impide que el dashboard muestre `0,62` y el informe `0,6` (o `0.62`) para la misma `d`,
violando "numéricamente idéntica hasta la precisión mostrada" (RNF-1) — el requisito que el usuario
marca como no negociable.

**Fix concreto.** (1) Definir en el módulo un **diccionario único de precisión por campo** (p. ej.
`DECIMALES = {"cohen_d": 2, "cramers_v": 2, "p_welch": "sci-2", "tasa_pct": 2, ...}`) y aplicarlo
**tanto** al redondeo que entra a `data.json` **como** a `df_to_latex_booktabs`, de modo que la única
diferencia entre web e informe sea el separador decimal (`.` vs `,`). (2) Ampliar la celda de
verificación del notebook `06` para que, además de `compute_comparative ↔ data.json`, **compare el
contenido numérico del `.tex`/CSV generado contra `data.json`** para al menos una numérica y una
categórica (parseando el CSV, que no tiene coma decimal), y falle el build si difieren a la precisión
publicada. Así el criterio 9 cubre lo que de verdad ve cada entregable.

---

### M2 — MEDIUM. El resumen narrativo con cifras citadas se redacta "a mano" como prosa, lo que choca con RF-14 (prohibición de cifras a mano en el `.tex` de esta sección) y reabre el riesgo de divergencia de RNF-1.

**Dónde:** §6.3 ("Resumen narrativo … Se escribe a mano como prosa, pero las cifras citadas se toman de
`comparativo`"), §5.1 subsección 1, contra RF-14 y RNF-1.

**Problema.** RF-14 es explícito: "**No se permiten cifras escritas a mano en el `.tex` para esta
sección**". El diseño, sin embargo, deja el párrafo narrativo (que destaca "las 3-4 variables de mayor
efecto" con sus magnitudes) como prosa escrita a mano, confiando en que el redactor copie las cifras de
`comparativo`. En el `.tex` eso son cifras escritas a mano: si el cálculo cambia (otra corrida, otra
variable entra al top-4, otro valor de `d`), la prosa queda obsoleta y divergente del `data.json`/tabla,
violando RF-14 y RNF-1. El diseño reconoce el riesgo pero no da un mecanismo que lo impida.

**Fix concreto.** Elegir una de las dos vías y fijarla: (a) **Generar la narrativa con cifras desde
Python**: el notebook `06` emite un fragmento `latex/tablas/comparativo_narrativa.tex` (y un
`comparativo.resumen_narrativo` en `data.json` para la web) donde las magnitudes citadas se
**interpolan** desde el dict de `compute_comparative` (`f"d = {d:.2f}"`), de modo que no haya cifra a
mano; el informe lo incluye con `\input`. O (b) **Prohibir cifras concretas en la prosa**: la narrativa
redactada a mano habla de variables y dirección ("los participantes muestran mayor PGA, con el mayor
tamaño de efecto de la tabla") **sin números literales**, y todo número vive solo en las tablas/figuras
autogeneradas. La opción (a) es preferible porque conserva la riqueza narrativa sin romper RF-14.

---

### N1 — NIT. Ubicación de `df_to_latex_booktabs` sin fijar.

**Dónde:** §5.2 y §5.4 la invocan pero no declaran dónde vive (módulo `comparative_stats.py`, el
notebook `06`, o `utils.py`).

**Problema.** Es un formateador de presentación, no un cálculo, así que no viola la fuente única; pero
dejar su hogar sin especificar es un hueco de implementación que puede derivar en duplicación o en que
termine en `comparative_stats.py` mezclando cálculo con presentación.

**Fix.** Fijar que `df_to_latex_booktabs` vive en el **notebook `06`** (o en `nb_helpers.py`), **no** en
`src/comparative_stats.py` (que debe quedar de cálculo puro, coherente con §4 "funciones puras … sin
E/S salvo las de exportación a CSV, que viven en el notebook").

---

### N2 — NIT. `meta.tasa_base_pct` no se marca explícitamente como valor calculado en tiempo de ejecución.

**Dónde:** §3, `"tasa_base_pct": 4.15`.

**Problema.** El diseño ya corrigió (NIT previo) que `meta.generado` es ilustrativo y se calcula en
runtime, pero `tasa_base_pct`, `n_part` (5821) y `n_no` (134601) aparecen como literales sin la misma
aclaración. Son valores verificados en `requisitos.md`, así que el riesgo es bajo, pero por coherencia
con la nota de `generado` conviene marcarlos como ilustrativos/computados.

**Fix.** Añadir en §3 la nota: "`n_part`, `n_no` y `tasa_base_pct` son **valores ilustrativos**; en
ejecución se derivan del `df` filtrado por alcance dentro de `compute_comparative`
(`100 * part.mean()`)".

---

### N3 — NIT. Coerción de tipo de `ESTRATO_SOCIAL` a string no está fijada en el módulo de cálculo.

**Dónde:** §2.9 / §3 (contrato categórico muestra `"categoria": "6"` como string).

**Problema.** `export_dashboard.build_cube` hace `df["ESTRATO_SOCIAL"].fillna("Sin dato").astype(str)`
(verificado). El contrato de `comparativo` publica `categoria` como string. Si `comparative_stats`
construye la tabla de contingencia sobre `ESTRATO_SOCIAL` **sin** la misma coerción a `str` + `fillna("Sin
dato")`, las etiquetas de categoría podrían salir como floats (`6.0`) o `NaN`, desalineando web, informe
y la columna del heatmap existente.

**Fix.** Fijar en §2.9 que `categorical_comparison` aplica, para toda categórica, la misma normalización
que el cubo: `.astype(str)` tras mapear faltante a "Sin dato" (y, para `FACULTAD`, el nombre legible vía
`faculty_name_map()`), de modo que las etiquetas casen exactamente con el resto del proyecto.

---

### N4 — NIT. Bootstrap percentil de OR bajo `class_weight="balanced"`: el IC refleja una verosimilitud reponderada, conviene declararlo.

**Dónde:** §2.8 (logística con `class_weight="balanced"` + IC95 % por bootstrap percentil).

**Problema.** Combinar `class_weight="balanced"` con bootstrap percentil de `exp(coef_)` produce IC sobre
coeficientes de una **pérdida reponderada**, no de la verosimilitud binomial no ponderada. Es defendible
(el diseño ya aclara que `balanced` no cambia la interpretación relativa de los OR, solo el intercepto),
pero el IC resultante no es el de una logística clásica y el lector técnico podría leerlo como tal. No
cambia el cálculo; es un tema de transparencia.

**Fix.** Añadir una frase en `meta_modelo.nota` y en la narrativa del informe (§5.4): "los OR y sus IC
provienen de un ajuste con pérdida reponderada por clase (`class_weight='balanced'`); son una
aproximación comparativa, no estimaciones de máxima verosimilitud binomial no ponderada".

---

## Supuestos VERIFICADOS (leídos en el repositorio, no asumidos)

1. **`config.RANDOM_SEED = 42`, `ROOT_DIR`, `FIGURES_DIR`, `TABLES_DIR` existen** — `src/config.py`.
   `TABLES_DIR = REPORTS_DIR/"tables"`, `FIGURES_DIR = REPORTS_DIR/"figures"`. Confirmado.
2. **`utils.save_fig(fig, filename)` escribe SOLO en `reports/figures/`** — `src/utils.py`. Confirmado;
   por tanto la afirmación del diseño (§5.3) de que la copia a `latex/figuras/` es un mecanismo **nuevo**
   es correcta.
3. **`export_dashboard._faculty_name_map()` existe y devuelve código→nombre `.title()`** — verificado.
   La extracción a `comparative_stats.faculty_name_map()` es un refactor viable.
4. **`build_cube` arma el dict `out` y lo serializa a `dashboard/public/data.json`; `meta.generado`
   usa `pd.Timestamp.now().strftime("%Y-%m-%d")`** — verificado. Coherente con la nota del diseño.
5. **El heatmap usa umbral `n >= 30`** (`hm = hm[hm["n"] >= 30]`) — verificado; el umbral de privacidad
   30 del diseño es coherente con el existente.
6. **`data.js::loadCube()` devuelve un objeto mapeado explícito con el patrón `clave: raw.x || []`** —
   verificado; añadir `comparativo: raw.comparativo || null` encaja sin romper nada.
7. **`build_notebooks.py` ejecuta con `cwd = notebooks/` y selecciona por `prefix.startswith(s)`** —
   verificado; `python build_notebooks.py 06` seleccionará `06_comparativo_inferencial`. Los notebooks
   existentes llegan hasta `05_eda_internacionalizacion`; el prefijo `06` está libre, sin colisión.
8. **`BOOTSTRAP` (en `nb_helpers.py`) hace `from src import config, utils, internationalization as intl`
   y añade ROOT a `sys.path`** — verificado; la celda de copia del diseño (`from src import config`,
   `config.ROOT_DIR / "latex" / ...`) funcionará dentro del notebook.
9. **Preámbulo LaTeX carga `booktabs`, `array`, `longtable`, `tabularx`, `graphicx` y NO carga `siunitx`
   ni `csvsimple`** — verificado (`latex/informe_proyecto.tex`, líneas 3–26). La ruta A (sin paquetes
   nuevos, `.tex` con `booktabs` vía `\input`) es correcta y segura.
10. **`\graphicspath{{figuras/}}`** — verificado (línea 26). Las PNG deben copiarse a `latex/figuras/`;
    el `\includegraphics{fig_comparativo_*.png}` resolverá correctamente.
11. **Anclas de sección LaTeX** — `\section{Hallazgos e insights principales}`/`\label{sec:insights}` en
    líneas 507–508 y `\section{Reorientación del alcance…}`/`\label{sec:reorientacion}` en 630–631.
    Verificado; la ubicación "contigua a Hallazgos e insights" del diseño es inequívoca.
12. **Recharts `^2.12.7` ya es dependencia** (`dashboard/package.json`); `ComposedChart`, `ErrorBar`,
    `Customized`, `ReferenceLine` están disponibles en 2.x (y `ComposedChart` ya se usa en
    `NumericDist.jsx`). No se añade dependencia JS nueva (RNF-2 respetado).
13. **La pestaña Insights existe** con `id="panel-insights"`, patrón `role="tab"/"tabpanel"`, y los
    componentes `ModalityArea`, `StackedByFaculty`, `SeasonBars`, `DonutResultado` — verificado en
    `App.jsx`. El diseño los conserva (RF-11) sin moverlos.
14. **`statsmodels` AUSENTE, `scikit-learn` 1.7.2 PRESENTE** — `entorno.md`. La logística con
    `LogisticRegression(penalty=None)` + bootstrap es la vía correcta bajo la restricción.

## Supuestos NO verificados / potencialmente incorrectos

1. **Cobertura exacta por variable numérica en pregrado** (p. ej. `PGA_ULTIMO` ~53–55 %): tomada de
   `requisitos.md`, no recomputada en esta revisión. El diseño la maneja de forma robusta (n efectivo por
   grupo tras quitar NaN), así que un pequeño desfase no invalida el método.
2. **`n_efectivo` real de la logística con caso completo (~41 000 estimado)**: es una estimación del
   diseño; el valor verdadero solo se conoce al correr. No bloquea (el contrato lo publica como campo).
3. **Convergencia de `lbfgs` con `penalty=None` sobre ~41k × 4 predictores estandarizados**: muy probable,
   pero no ejecutado. El diseño ya cubre el no-happy-path (`convergio=false` → `predictores=[]`).
4. **Que la distribución TeX del usuario compile sin incidencias** la nueva sección: no se compiló aquí;
   la ruta A (solo paquetes ya cargados) minimiza el riesgo, pero queda sin verificar end-to-end.
5. **Que `df_to_latex_booktabs` y el redondeo de `data.json` produzcan la misma precisión**: ver M1 — no
   está especificado, por lo que no puede verificarse como correcto todavía.
