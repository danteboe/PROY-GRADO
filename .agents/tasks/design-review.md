# Revisión de diseño — Histórico (evolución temporal) en Insights

Documento revisado: `.agents/tasks/historico-design.md`
Modo: diseño **ligero** (no se exige plan de implementación paso a paso; eso lo produce el planner).
Criterio de veredicto: mecánico. Cualquier hallazgo HIGH o MEDIUM ⇒ CHANGES_REQUESTED; cero ⇒ APPROVED.

La revisión se hizo **leyendo el código fuente real** citado por el diseño, no confiando en sus afirmaciones.

---

## Resumen del veredicto

- HIGH: 0
- MEDIUM: 0
- NIT: 3

**Veredicto: APPROVED.**

El framing composición-no-tasa (§1) es correcto, explícito y está justificado por la propiedad real
del dato (verificada en `internationalization.py`). El contrato de `historico` (§2) está completo y sin
ambigüedad bloqueante. Las decisiones UI toggle-vs-tarjeta (§3) están tomadas por gráfico y son
coherentes con los componentes reutilizables existentes. Las restricciones duras se respetan. Los tres
NIT no bloquean pero conviene que el planner los resuelva.

---

## Hallazgos

### NIT-1 — "Sin dato" en `composicion_facultad`: afirmación en tensión con la normalización real
**Severidad: NIT.** Ubicación: §2, regla "La modalidad y la facultad **no** tienen 'Sin dato'
relevante (… facultad mapeada)".

Problema. La normalización de facultad que el diseño dice reutilizar
(`comparative_stats.categorical_comparison`, verificada) es:
`df["FACULTAD"].map(lambda c: fac_map.get(c, c)).fillna("Sin dato").astype(str)`. Es decir, una
facultad con código NaN o no mapeado **sí** produce la categoría literal `"Sin dato"`. La afirmación de
que facultad "no tiene Sin dato relevante" es por tanto optimista: podría aparecer una banda "Sin dato"
dentro del apilado 100 % por año, y el diseño solo excluye "Sin dato" de estrato/género (H1), no de
facultad.

Fix concreto. En `historical_stats`, antes del top-8+cola, decidir explícitamente qué hacer con una
facultad "Sin dato": lo más coherente con el apilado 100 % es **tratarla como una categoría más** (ya
lo dice el diseño: "se trata igual que cualquier otra categoría con dato") — pero entonces corregir la
frase para que no afirme que no existe. Alternativa: plegar "Sin dato" de facultad dentro de "Otras".
Elegir una y dejar escrita la regla. No bloquea porque ambas vías son válidas y el impacto es cosmético
(una banda pequeña), pero la frase actual puede inducir al coder a no manejar el caso.

### NIT-2 — `DECIMALES` "el mismo dict" vs. firma real de `df_to_latex_booktabs`
**Severidad: NIT.** Ubicación: §2 (bullet de redondeo) y §4 (coherencia web↔informe).

Problema. El diseño dice que el notebook 07 pasa "el **mismo** dict `DECIMALES` de `historical_stats`"
a `df_to_latex_booktabs`. Verificada la firma real en `nb_helpers.py`:
`df_to_latex_booktabs(df, columnas, decimales_por_col, …)` — `decimales_por_col` está keyed por
**clave de columna de la tabla** (p. ej. `media`, `pct`), mientras que el `DECIMALES` de
`comparative_stats` está keyed por **nombre de campo del estadístico** (`media_part`, `tasa_pct`, …).
Son el mismo *concepto* (fuente única de redondeo) pero no necesariamente el mismo *juego de claves*:
para el histórico las claves deben coincidir con los nombres de columna de cada `.tex`
(`pct`, `media`, `mediana`, `q1`, `q3`, `n`, `anio`).

Fix concreto. Definir en `historical_stats` un `DECIMALES` cuyas claves sean exactamente los nombres de
campo del contrato (`pct`, `media`, `mediana`, `q1`, `q3`) y, al tabular, pasar a `df_to_latex_booktabs`
un `decimales_por_col` derivado de ese dict mapeando nombre-de-columna→decimales. La garantía M1 se
mantiene (un solo origen de precisión); solo hay que explicitar que el dict y `decimales_por_col`
comparten claves o que uno se deriva del otro. No bloquea: el planner puede resolver el mapeo trivial.

### NIT-3 — Rango/umbral del toggle de `ModalityArea`: años base no coinciden entre vistas
**Severidad: NIT.** Ubicación: §3, fila 4 y nota M2.

Problema. La vista base de `ModalityArea` usa eventos con `ANIO >= 2010` (verificado:
`modalidadTemporal` en `App.jsx` y el subtítulo "Eventos por modalidad desde 2010."), y la vista
histórica usa participantes con `anio >= 2012, n >= 30`. El diseño ya advierte el cambio de población y
de rango vía subtítulo/tooltip (M2, bien resuelto), pero no fija qué pasa con el **eje X** al conmutar:
al togglear, el dominio de años salta de 2010+ a 2012+ y la forma del área cambia de conteo absoluto a
100 %. Es un detalle de UX que el diseño ligero no tiene que especificar al detalle, pero conviene
anotarlo para el planner.

Fix concreto. En la nota M2, añadir una línea: "al activar el toggle, el eje X se recalcula al rango del
histórico (`>=2012`) y el eje Y pasa a porcentaje 0–100 %; al desactivar, vuelve al conteo de eventos
`>=2010`". No bloquea: es coherente con la decisión ya tomada (toggle con cambio de subtítulo).

---

## Chequeos específicos solicitados

### 1. Framing composición-por-año (NO tasa) — CORRECTO y EXPLÍCITO
- §1 establece el framing como composición de participantes por año, nunca tasa, y lo justifica con la
  ausencia de denominador temporal: solo los participantes tienen `PRIMER_ANIO_MOVILIDAD`.
- **Verificado en código** (`internationalization.py::student_participation`):
  `PRIMER_ANIO_MOVILIDAD = g["ANIO"].min()` se calcula agrupando **eventos de movilidad**; un no
  participante no tiene eventos ⇒ no tiene año. La consecuencia dura del diseño ("no existe denominador
  temporal, no se puede calcular tasa de participación por grupo×año") es correcta.
- La definición de `pct(Y,c) = participantes_del_año_Y_con_valor_c / total_participantes_del_año_Y` hace
  que cada año sume 100 % sobre su dimensión; es composición, no probabilidad de participar. Correcto.
- Regla anti-"tasa" (§3, M3): título/subtítulo "Composición de los participantes por {dimensión} y año —
  no es tasa de participación" en cada tarjeta, nota repetida, y test en §5(e) que falla si cualquier
  string del contrato contiene "tasa". **No se detecta ninguna serie etiquetada o interpretable como
  "tasa de participación".** No hay hallazgo bloqueante por este eje.
- Riesgo de contigüidad correctamente mitigado: `CategoricalAssociation` sí rotula "Tasa de
  participación por categoría" (verificado en el componente), y el diseño pone las tarjetas históricas
  con rótulo explícito anti-tasa justo al lado para evitar el arrastre.

### 2. Contrato de datos de `historico` — COMPLETO y sin ambigüedad bloqueante
- Shapes definidos para las cuatro series de composición (estrato, género, facultad con cola "Otras",
  modalidad) y para `resumen_numerico` (pga/icfes/avance con media/mediana/q1/q3 y n por año). Completo.
- Metadatos presentes: `variable_temporal`, `framing` ("composicion"), `nota_framing`, `anio_min`,
  `umbral_n_anio`, `n_por_anio` (n por año), `n_participantes_con_anio`, contadores de descarte
  separados, `top_facultades`, `generado`. El umbral (`>=2012`, `n>=30`) está justificado y es el mismo
  `min_n=30` del comparativo (**verificado**: `categorical_comparison(..., min_n=30)`).
- `pct` bien definido: sobre el total de participantes del año (o sobre el total **con dato** del año
  para estrato/género tras excluir "Sin dato", con renormalización a 100 %). Sin ambigüedad.
- `DECIMALES`, `faculty_name_map()` y `_a_nativo` existen en `comparative_stats` (**verificados**) y el
  diseño los reutiliza correctamente (ver NIT-2 sobre el keying del dict).
- Accesor `historico: raw.historico || null` en `data.js` es análogo al de `comparativo` (**verificado**
  que `comparativo: raw.comparativo || null` existe). Correcto.

### 3. Decisión UI toggle-vs-tarjeta — TOMADA por gráfico y COHERENTE
- Tabla de 10 ítems con decisión explícita por cada uno (2 toggles, 3 tarjetas dedicadas, 5 sin
  histórico justificado). No quedan decisiones abiertas.
- Reutilización coherente: `ModalityArea` (apilado por año) y `StackedByFaculty`
  (`stackOffset="expand"` = 100 %, **verificado**) se reutilizan vía toggle; `HistoricalComposition`
  nuevo para estrato/género/modalidad 100 %.
- `TemporalLine` **NO** se reutiliza y la justificación es correcta (**verificado en el archivo**):
  `dataKey="eventos"` fijo, `<ReferenceArea>` COVID hardcodeada, sin banda ni selector. Crear
  `TemporalMean.jsx` nuevo en lugar de refactorizar un componente commiteado del Explorador es la
  decisión correcta y respeta "no revertir arreglos". Bien resuelto (H2 del review previo).
- Ubicación en `#panel-insights` coherente con la estructura real (**verificada en App.jsx**):
  `ComparativoInsights` → nuevo bloque "Evolución de los participantes en el tiempo" → "Panorama
  histórico de la movilidad" (`ModalityArea`, `StackedByFaculty`, `SeasonBars`, `DonutResultado`).

### 4. Restricciones duras — RESPETADAS
- **Sin microdatos.** Solo agregados por año con supresión a nivel de año (`n<30`). Correcto.
- **Sin dependencias nuevas.** Python con numpy/pandas/scipy/sklearn (sin statsmodels); LaTeX con
  booktabs/longtable/tabularx (sin siunitx/csvsimple); recharts ya instalado. `df_to_latex_booktabs`
  existe en `nb_helpers.py` (**verificado**) y no usa paquetes nuevos. Correcto.
- **Español** en UI/código/documentación. Correcto.
- **No revertir arreglos commiteados.** El diseño es explícito en no tocar boxplots, odds ratios, V de
  Cramér, estrato "Sin dato" fuera (ahora correctamente ubicado EN Insights, verificado en
  `CategoricalAssociation.jsx` líneas ~56-60 con el mismo set `{Sin dato, Sin información, …}`), sidebar
  oculto y escala del Heatmap. La exclusión de "Sin dato" en el exportador refuerza el arreglo, no lo
  revierte. Correcto.

---

## Supuestos verificados (contra el código)

1. `PRIMER_ANIO_MOVILIDAD = g["ANIO"].min()` existe **solo para participantes** —
   `internationalization.py::student_participation`. Base del framing composición-no-tasa. **VERIFICADO.**
2. `PRIMER_ANIO_MOVILIDAD` y `MODALIDAD_PRINCIPAL` se adjuntan al dataset analítico —
   `build_dataset.py` líneas ~183-187 (`part_cols` incluye ambas). **VERIFICADO.** La modalidad a nivel
   estudiante existe, no hace falta la tabla de eventos para `composicion_modalidad`.
3. `TemporalLine.jsx` es rígido: `dataKey="eventos"` fijo, `ReferenceArea` COVID 2020–2021 hardcodeada,
   una sola `<Line>`, sin banda ni selector. **VERIFICADO** — justifica crear `TemporalMean.jsx`.
4. `CategoricalAssociation.jsx` vive en Insights, rotula "Tasa de participación por categoría" y filtra
   `{Sin dato, Sin información, Sin informacion, N/A, NA}` (líneas ~56-60). **VERIFICADO** — H1 correcto.
5. `StackedByFaculty.jsx` usa `stackOffset="expand"` (apilado 100 %) y `ModalityArea.jsx` usa área
   apilada por año. **VERIFICADO** — reutilización por toggle coherente.
6. `comparative_stats` expone `DECIMALES`, `faculty_name_map()`, `_a_nativo` y supresión `min_n=30` con
   normalización `fillna("Sin dato").astype(str)` (FACULTAD vía `fac_map`). **VERIFICADO.**
7. Patrón `out["comparativo"] = comparative_stats.compute_comparative(df, "pregrado")` en
   `export_dashboard.build_cube`. **VERIFICADO** — la línea análoga del histórico es un calco correcto.
8. Accesor `comparativo: raw.comparativo || null` en `data.js`. **VERIFICADO** — `historico` análogo.
9. Pivotado año×categoría con relleno de ceros en cliente: `modalidadTemporal` en `App.jsx` rellena con
   0 las modalidades ausentes por año. **VERIFICADO** — la afirmación de §2 es exacta.
10. Estructura de `#panel-insights`: `ComparativoInsights` seguido del bloque "Panorama histórico"
    (`ModalityArea`, `StackedByFaculty`, `SeasonBars`, `DonutResultado`). **VERIFICADO en App.jsx.**
11. `df_to_latex_booktabs` existe en `nb_helpers.py`, sin paquetes LaTeX nuevos. **VERIFICADO** (ver
    NIT-2 sobre el keying de `decimales_por_col`).

## Supuestos no verificados / con matiz

1. **Facultad "Sin dato" no aparece** (§2). PARCIALMENTE FALSO según la normalización reutilizada: la
   facultad usa `.fillna("Sin dato")`, así que una facultad sin código mapeado sí generaría "Sin dato".
   Ver NIT-1. Impacto cosmético, no bloqueante.
2. **`DECIMALES` es literalmente "el mismo dict"** pasado a `df_to_latex_booktabs` (§2/§4). Matizado: la
   firma real espera `decimales_por_col` keyed por columna de tabla, no por campo estadístico. Ver
   NIT-2. La garantía de fuente única se mantiene si se deriva un dict del otro.
3. **Cifras de ejemplo** (`n_participantes_con_anio: 8036`, `n`/`pct` de muestra, rango 1998–2026, masa
   útil 2012–2026). NO VERIFICADAS contra el dataset (no se ejecutó nada; es revisión de documento).
   Son ilustrativas del shape y no afectan el contrato. No es hallazgo.
4. **`compute_historical` suma 100 % por año tras renormalizar** y los contadores `n_anios_fuera_rango`/
   `n_anios_bajo_umbral` cuentan cada causa por separado. No verificable sin el módulo (aún no existe);
   el diseño lo fija como invariante testeable en §5. Correcto como especificación.

---

## Nota de alcance

Este es un diseño ligero; no se exigió ni se penalizó la ausencia de un plan de implementación paso a
paso. Los tres NIT son precisiones para el planner, no defectos del método ni del contrato. No se
detectó scope creep (el histórico se limita a las 6 series que el dato permite como composición de
participantes; las 4 exclusiones están justificadas) ni conflicto entre secciones.
