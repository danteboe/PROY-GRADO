"""Definición de celdas de los notebooks del proyecto.

Cada entrada de NOTEBOOKS mapea un prefijo de archivo a (título, [celdas]).
Las celdas se crean con los ayudantes md()/code() importados desde build_notebooks.
Los textos de interpretación están redactados a partir de los resultados reales
obtenidos al ejecutar el código (ver _analysis durante el desarrollo).
"""
from nb_helpers import md, code, BOOTSTRAP

NOTEBOOKS: dict = {}


# ===========================================================================
# NOTEBOOK 01 — Inventario de fuentes y diccionario de datos (Semana 5)
# ===========================================================================
nb01 = [
    md(r"""
# 01 — Inventario de fuentes y diccionario de datos

**Etapa CRISP-DM:** Comprensión de datos · **Semana 5 del cronograma** · **OE2**

## Objetivo
Caracterizar las fuentes de datos entregadas por la Universidad: número de
registros, variables, granularidad (unidad de información), claves de unión,
periodos cubiertos y pertinencia frente a los objetivos del proyecto. El
producto es un **diccionario de datos preliminar** que servirá de base para las
etapas de calidad (semana 6) e integración (semanas 7-8).

## Contexto
El proyecto busca analizar la participación estudiantil en internacionalización.
Las fuentes son archivos `parquet` anonimizados ubicados en `data/`. No existe
una tabla explícita de "experiencias de internacionalización": esta señal deberá
**derivarse** de los registros académicos (se aborda en el notebook 03).
"""),
    code(BOOTSTRAP),
    md("## 1. Carga del inventario de fuentes\nRecorremos las fuentes registradas en `config.SOURCES` y describimos su tamaño."),
    code(r"""
import os
rows = []
frames = {}
for name, fname in config.SOURCES.items():
    path = config.DATA_DIR / fname
    df = utils.load_source(name)
    frames[name] = df
    rows.append({
        'fuente': name,
        'archivo': fname,
        'filas': len(df),
        'columnas': df.shape[1],
        'tamano_MB': round(os.path.getsize(path) / 1e6, 1),
    })
inventario = pd.DataFrame(rows).sort_values('filas', ascending=False).reset_index(drop=True)
inventario
"""),
    md(r"""
### Resultado e interpretación
El universo de datos combina fuentes de muy distinta escala. Las fuentes
**transaccionales** (una fila por evento académico) son las más grandes:
`historial_materias` (~6.9 M filas, un registro por curso-estudiante-periodo),
`programas` (~1.8 M) e `historial_rendimiento` (~1.2 M, un registro por
estudiante-periodo). Las fuentes **de estudiante** son más pequeñas:
`informacion_actual` (~234 k filas) es un snapshot con **una fila por
estudiante**, lo que la convierte en la candidata natural a *columna vertebral*
de la unidad de análisis.
"""),
    md("## 2. Identificación de la clave de estudiante y granularidad\nVerificamos qué columna identifica al estudiante y si cada fuente es a nivel estudiante o transaccional."),
    code(r"""
def student_col(df):
    for c in (config.STUDENT_KEY, config.STUDENT_KEY_ANOM):
        if c in df.columns:
            return c
    return None

gran = []
for name, df in frames.items():
    key = student_col(df)
    n = len(df)
    n_est = df[key].nunique() if key else np.nan
    filas_por_est = round(n / n_est, 2) if key and n_est else np.nan
    gran.append({
        'fuente': name,
        'clave_estudiante': key,
        'n_estudiantes': n_est,
        'filas': n,
        'filas_por_estudiante': filas_por_est,
        'unidad': 'estudiante' if filas_por_est == 1 else 'transaccional/otra',
    })
granularidad = pd.DataFrame(gran).sort_values('filas_por_estudiante', ascending=False)
granularidad
"""),
    md(r"""
### Resultado e interpretación
Todas las fuentes identifican al estudiante mediante un código anonimizado:
la mayoría usa `CODIGO_ESTUDIANTE`, mientras que `historial_materias` y
`programas` usan `CODIGO_ESTUDIANTE_ANOM`. Esta diferencia de nombre es un primer
problema de integración que se normaliza en el pipeline (semana 7).

`informacion_actual` tiene exactamente **1 fila por estudiante** (granularidad de
estudiante); el resto son fuentes transaccionales con varias filas por
estudiante. **Decisión:** se adopta el estudiante como unidad de análisis y
`informacion_actual` como columna vertebral; las fuentes transaccionales se
agregarán a nivel estudiante.
"""),
    md("## 3. Periodos cubiertos\nLos periodos tienen formato `AAAASS`. Revisamos el rango temporal de las fuentes con periodo."),
    code(r"""
periodos = []
for name, df in frames.items():
    pcol = next((c for c in ['PERIODO', 'PERIODO_SNAPSHOT'] if c in df.columns), None)
    if pcol is None:
        continue
    anios = df[pcol].map(utils.periodo_to_year).dropna()
    if len(anios):
        periodos.append({'fuente': name, 'anio_min': int(anios.min()),
                         'anio_max': int(anios.max())})
periodos_df = pd.DataFrame(periodos).sort_values('anio_min')
periodos_df
"""),
    md(r"""
### Resultado e interpretación
Las fuentes transaccionales cubren un rango histórico amplio (desde finales de
los años 1990/2000 hasta 2026), suficiente para análisis de tendencias
temporales de largo plazo (PA1). El snapshot `informacion_actual` registra el
último periodo observado de cada estudiante.
"""),
    md("## 4. Diccionario de datos preliminar\nGeneramos una descripción columna a columna de todas las fuentes y la exportamos a `docs/`."),
    code(r"""
dicc_parts = []
for name, df in frames.items():
    prof = utils.profile_dataframe(df, name=name)
    dicc_parts.append(prof)
diccionario = pd.concat(dicc_parts, ignore_index=True)
print('Total de columnas documentadas:', len(diccionario))
# Exportar diccionario completo
out_csv = config.TABLES_DIR / 'diccionario_datos.csv'
diccionario.to_csv(out_csv, index=False, encoding='utf-8')
print('Diccionario exportado a', out_csv)
diccionario.head(20)
"""),
    md("### Variables candidatas por bloque temático\nAgrupamos las variables que, por la propuesta, son pertinentes para el análisis."),
    code(r"""
bloques = {
    'Identificación / demografía': ['CODIGO_ESTUDIANTE', 'EDAD', 'GENERO',
        'ESTRATO_SOCIAL', 'DEPARTAMENTO_COLEGIO', 'CIUDAD_COLEGIO'],
    'Programa / unidad académica': ['CODIGO_FACULTAD_PROGRAMA_1', 'PROGRAMA_1',
        'NIVEL_PROGRAMA_1', 'TIPO_ADMISION'],
    'Desempeño académico': ['PGA', 'PROMEDIO_SEMESTRAL', 'CREDITOS_APROBADOS',
        'TOTAL_SEMESTRES_MATRICULADOS', 'PERCENTIL_PGA_PROGRAMA', 'SEMESTRE_AVANCE'],
    'Pruebas de ingreso': ['PUNTAJE_TOTAL', 'MATEMATICAS', 'LECTURA_CRITICA',
        'INGLES', 'NIVEL_INGLES'],
    'Señal de internacionalización (derivada)': ['NOMBRE_CURSO', 'CODIGO_CURSO',
        'ESTATUS', 'CODIGO_CAMPUS'],
}
for b, cols in bloques.items():
    presentes = sorted(set(cols) & set(diccionario['columna']))
    print(f"\n{b}:")
    print('  ', ', '.join(presentes))
"""),
    md(r"""
## 5. Conclusiones y decisiones (semana 5)

- **Unidad de análisis:** el estudiante. `informacion_actual` (1 fila/estudiante)
  es la columna vertebral.
- **Claves de unión:** `CODIGO_ESTUDIANTE`, con normalización de
  `CODIGO_ESTUDIANTE_ANOM` → `CODIGO_ESTUDIANTE` en `historial_materias` y
  `programas`.
- **Fuentes núcleo** (confirmadas pertinentes): `informacion_actual`,
  `historial_materias` (fuente de la señal de internacionalización),
  `historial_rendimiento`, `percentiles_historicos`, `icfes_saber11`,
  `examenes_clasificacion`, `capp_creditos`.
- **Problema detectado:** las columnas de texto presentan *mojibake* de
  codificación (p. ej. `Mag¡ster`, `Educaci¾n`). Se analiza y corrige en el
  notebook 02.
- El diccionario de datos preliminar queda exportado en
  `reports/tables/diccionario_datos.csv`.

**Siguiente paso:** perfilamiento y evaluación de calidad de datos (semana 6).
"""),
]
NOTEBOOKS['01_inventario_fuentes'] = ("Inventario de fuentes y diccionario de datos", nb01)


# ===========================================================================
# NOTEBOOK 02 — Perfilamiento y calidad de datos (Semana 6)
# ===========================================================================
nb02 = [
    md(r"""
# 02 — Perfilamiento y calidad de datos

**Etapa CRISP-DM:** Comprensión y calidad de datos · **Semana 6** · **OE2 / OE3**

## Objetivo
Evaluar la calidad de las fuentes núcleo: valores faltantes, duplicados,
cardinalidad, consistencia de categorías, valores atípicos y problemas de
codificación. A partir del diagnóstico se definen **reglas de limpieza y
validación** que alimentan el pipeline de preparación (semana 7).

## Contexto
En el notebook 01 se detectó *mojibake* en las columnas de texto. Aquí se
diagnostica su origen, se corrige y se cuantifican los problemas de calidad que
condicionarán las decisiones de preparación y de modelamiento (p. ej. qué
variables tienen cobertura suficiente).
"""),
    code(BOOTSTRAP),
    md("## 1. Diagnóstico del problema de codificación (mojibake)\nComparamos el texto crudo con el texto corregido en dos fuentes que usan esquemas distintos."),
    code(r"""
# Fuente A: informacion_actual (esquema UTF-8 interpretado como CP437)
ia = utils.load_source('informacion_actual', columns=['NIVEL_PROGRAMA_1', 'TIPO_ADMISION'])
# Fuente B: historial_materias (esquema UTF-8 interpretado como CP850)
hm = utils.load_source('historial_materias', columns=['NOMBRE_CURSO'])

ejemplos = pd.DataFrame({
    'crudo': [
        ia['NIVEL_PROGRAMA_1'].dropna().unique()[1],
        ia['TIPO_ADMISION'].dropna().unique()[1],
        'DOBLE TITULACIËN',
        'PR┴CTICA PROFESIONAL',
    ],
})
ejemplos['corregido'] = ejemplos['crudo'].map(utils.fix_mojibake)
ejemplos
"""),
    md(r"""
### Resultado e interpretación
Las fuentes presentan **dos** esquemas de *mojibake* distintos. En
`informacion_actual`, `Mag¡ster`/`Opci¢n` corresponde a texto UTF-8 interpretado
con CP437; en `historial_materias`, `DOBLE TITULACIËN`/`PR┴CTICA` corresponde a
UTF-8 interpretado con CP850. La función `utils.fix_mojibake` **detecta
automáticamente** el esquema aplicable (reintroduce las vocales acentuadas y la
ñ, y elimina los símbolos espurios) y deja los dos casos en español correcto:
`Magíster`, `Opción`, `DOBLE TITULACIÓN`, `PRÁCTICA`.

**Decisión:** la corrección de codificación se aplica de forma centralizada en
`utils.fix_mojibake_df`, invocada por el pipeline al cargar cada fuente de texto.
Esto evita categorías duplicadas por diferencias de codificación (p. ej. que
`Magíster` y `Mag¡ster` se cuenten como dos niveles distintos).
"""),
    md("## 2. Perfilamiento de valores faltantes en las fuentes de estudiante\nAnalizamos el snapshot `informacion_actual`, base de la unidad de análisis."),
    code(r"""
ia_full = utils.load_source('informacion_actual', fix_encoding=True)
miss = utils.missing_summary(ia_full)
print('Columnas con faltantes:', len(miss), 'de', ia_full.shape[1])
miss.head(25)
"""),
    md(r"""
### Resultado e interpretación
Varias columnas de `informacion_actual` tienen faltantes elevados. En
particular, variables personales y de contexto socioeconómico (p. ej.
`ESTRATO_SOCIAL`, datos de colegio, puntajes ICFES almacenados como texto)
presentan ausencias importantes. Esto es esperable: el snapshot incluye
estudiantes de todos los niveles (pregrado y posgrado) y épocas, y no todos
tienen registrada la misma información de ingreso.

**Implicación metodológica:** las variables con faltante muy alto no se
descartan automáticamente; se evalúa su cobertura **dentro del subconjunto de
pregrado** (foco del análisis) antes de decidir su uso en EDA y modelamiento.
"""),
    md("## 3. Duplicados y granularidad\nVerificamos la unicidad del estudiante en las fuentes de estudiante y la presencia de duplicados en transaccionales."),
    code(r"""
checks = []
for name in ['informacion_actual', 'icfes_saber11', 'capp_creditos', 'examenes_clasificacion']:
    df = utils.load_source(name, columns=[config.STUDENT_KEY])
    checks.append({
        'fuente': name,
        'filas': len(df),
        'estudiantes_unicos': df[config.STUDENT_KEY].nunique(),
        'filas_duplicadas_por_estudiante': int(df.duplicated(config.STUDENT_KEY).sum()),
    })
pd.DataFrame(checks)
"""),
    md(r"""
### Resultado e interpretación
`informacion_actual` no tiene duplicados por estudiante (1 fila/estudiante,
confirma la unidad de análisis). En cambio, `icfes_saber11`, `capp_creditos` y
`examenes_clasificacion` **sí** tienen varias filas por estudiante (p. ej.
distintas presentaciones del examen o distintos cálculos de créditos en el
tiempo).

**Regla de limpieza adoptada:** al agregar estas fuentes a nivel estudiante se
conserva un único registro por estudiante con un criterio explícito y
justificado: para ICFES, el registro de **mayor puntaje total**; para CAPP y
exámenes, el registro **más reciente** por fecha. Esta regla está implementada
en `src/build_dataset.py`.
"""),
    md("## 4. Consistencia de categorías\nRevisamos categorías clave tras la corrección de encoding."),
    code(r"""
for col in ['NIVEL_PROGRAMA_1', 'GENERO', 'ESTRATO_SOCIAL', 'ESTADO_ACADEMICO']:
    print(f"\n=== {col} ===")
    print(utils.fix_mojibake_series(ia_full[col]).value_counts(dropna=False).head(12))
"""),
    md(r"""
### Resultado e interpretación
Tras corregir el encoding, las categorías quedan bien formadas: `NIVEL_PROGRAMA_1`
distingue Pregrado, Magíster, Especialización, Doctorado, etc.; `GENERO` tiene
tres valores (`MASCULINO`, `FEMENINO`, `No Informa`); `ESTRATO_SOCIAL` toma
valores 1-6 con una fracción importante en `None`. No se observan categorías
redundantes por mayúsculas/acentos una vez normalizado el texto.

**Decisión:** `ESTRATO_SOCIAL` se tratará como categórica (incluyendo una
categoría explícita "Sin dato") y se usará **solo para análisis agregado de
equidad**, en coherencia con el principio de minimización de la propuesta.
"""),
    md("## 5. Valores atípicos en variables numéricas de desempeño\nRevisamos el PGA, que debe estar en escala 0-5."),
    code(r"""
rr = utils.load_source('historial_rendimiento', columns=['PGA', 'PROMEDIO_SEMESTRAL'])
desc = rr[['PGA', 'PROMEDIO_SEMESTRAL']].describe()
fuera_rango = ((rr['PGA'] < 0) | (rr['PGA'] > 5)).sum()
print('Registros con PGA fuera de [0,5]:', int(fuera_rango))
desc
"""),
    md(r"""
### Resultado e interpretación
El PGA se encuentra en el rango esperado 0-5, sin valores fuera de escala. Existe
una masa de registros con PGA muy bajo (incluyendo ceros), compatible con
estudiantes en su primer periodo o con muy pocos créditos cursados. No se
eliminan: representan situaciones reales del inicio de la trayectoria. La media
del PGA ronda 3.8, consistente con una escala de aprobación en 3.0.
"""),
    md("## 6. Exportar informe de calidad\nConsolidamos el perfilamiento de las fuentes núcleo en un archivo para el informe."),
    code(r"""
nucleo = ['informacion_actual', 'historial_materias', 'historial_rendimiento',
          'percentiles_historicos', 'icfes_saber11', 'examenes_clasificacion',
          'capp_creditos']
partes = []
for name in nucleo:
    df = utils.load_source(name, fix_encoding=False)
    partes.append(utils.profile_dataframe(df, name=name))
calidad = pd.concat(partes, ignore_index=True)
out = config.TABLES_DIR / 'informe_calidad_datos.csv'
calidad.to_csv(out, index=False, encoding='utf-8')
print('Informe de calidad exportado a', out, '-', len(calidad), 'columnas perfiladas')
# Resumen: faltantes promedio por fuente
resumen = calidad.groupby('fuente')['pct_faltantes'].mean().round(1).sort_values(ascending=False)
resumen
"""),
    md(r"""
## 7. Conclusiones y reglas de limpieza (semana 6)

**Problemas de calidad detectados y decisiones:**

1. **Codificación (mojibake), dos esquemas.** → Corrección automática
   centralizada en `utils.fix_mojibake`.
2. **Faltantes elevados** en variables socioeconómicas y de ingreso. → No se
   descartan a priori; se evalúa cobertura en el subconjunto de pregrado y se
   usa imputación/indicadores documentados en el notebook 03.
3. **Múltiples filas por estudiante** en ICFES/CAPP/exámenes. → Regla de
   deduplicación explícita (mejor puntaje / más reciente).
4. **Valores de PGA** dentro de rango; ceros válidos conservados.
5. **Categorías** consistentes tras normalización de texto.

El **informe de calidad** queda en `reports/tables/informe_calidad_datos.csv`.

**Siguiente paso:** diseño del esquema analítico e implementación del pipeline de
integración (semana 7).
"""),
]
NOTEBOOKS['02_calidad_datos'] = ("Perfilamiento y calidad de datos", nb02)


# ===========================================================================
# NOTEBOOK 03 — Preparación: señal de internacionalización y dataset analítico
# (Semanas 7-8)
# ===========================================================================
nb03 = [
    md(r"""
# 03 — Preparación de datos: señal de internacionalización y dataset analítico

**Etapa CRISP-DM:** Preparación de datos · **Semanas 7-8** · **OE3**

## Objetivo
1. **Definir y justificar la señal de participación en internacionalización**, la
   decisión metodológica central de la fase de datos.
2. Construir el **conjunto de datos analítico** a nivel estudiante integrando las
   fuentes núcleo y la etiqueta de participación.
3. Documentar el **tratamiento de valores faltantes** y las validaciones.

## Contexto
Los datos entregados **no contienen una tabla explícita de experiencias de
internacionalización**. La participación debe derivarse de los registros
académicos. La calidad de todo el análisis posterior depende de que esta señal
sea correcta, auditable y libre de *data leakage*.
"""),
    code(BOOTSTRAP),
    md(r"""
## 1. Definición de la señal de participación

La señal se construye a partir de `historial_materias`: la Universidad inscribe
las experiencias de movilidad como asignaturas en la historia académica del
estudiante (cursos de intercambio, doble titulación, semanas internacionales,
viajes internacionales de estudio). El criterio está implementado en
`src/internationalization.py` y combina **nombre de curso** (patrón de
expresión regular) y **código de curso** (lista canónica).
"""),
    code(r"""
print('Patrón de nombres de movilidad:')
print('  ', intl.MOBILITY_NAME_PATTERN.pattern)
print('\nCódigos canónicos de movilidad (muestra):')
print('  ', sorted(intl.MOBILITY_COURSE_CODES)[:12], '...')
print('\nModalidades consideradas internacionales:')
for m in sorted(intl.MODALIDADES_INTERNACIONALES):
    print('  -', m)
"""),
    md("### Extracción de los eventos de movilidad\nAplicamos el criterio sobre los 6.9 M de registros de cursos."),
    code(r"""
eventos = intl.extract_mobility_events(only_international=True)
print('Eventos de movilidad internacional:', len(eventos))
print('Estudiantes con al menos un evento:', eventos[config.STUDENT_KEY].nunique())
eventos.head(8)
"""),
    md("### Distribución por modalidad\n¿Qué tipos de experiencia componen la señal?"),
    code(r"""
modalidad_counts = eventos['MODALIDAD'].value_counts()
display(modalidad_counts.to_frame('eventos'))

fig, ax = plt.subplots(figsize=(8, 4))
modalidad_counts.sort_values().plot.barh(ax=ax, color=sns.color_palette('deep'))
ax.set_title('Eventos de movilidad por modalidad')
ax.set_xlabel('Número de eventos')
utils.save_fig(fig, 'fig_modalidades_eventos.png')
plt.show()
"""),
    md(r"""
### Resultado e interpretación
Se identifican **9.526 eventos de movilidad internacional** correspondientes a
**8.067 estudiantes**. La modalidad dominante es el **intercambio internacional**
(cerca del 81% de los eventos), seguido por **doble titulación**, **viaje
internacional de estudio** y **semana internacional**. El **intercambio virtual**
es marginal pero presente (modalidad surgida principalmente durante la pandemia).

**Decisión:** se excluye del foco la modalidad "intercambio nacional" (parámetro
`only_international=True`), ya que no corresponde a internacionalización. La señal
resultante es coherente con las categorías de movilidad que gestiona una Oficina
de Internacionalización.
"""),
    md("## 2. Prevención de *data leakage*\nGuardamos el primer periodo de movilidad por estudiante: cualquier predictor futuro deberá anclarse a un momento anterior a esta fecha."),
    code(r"""
part = intl.student_participation(eventos)
print('Resumen de participación por estudiante:')
display(part[['N_EVENTOS_MOVILIDAD']].describe().T)
print('\nDistribución del primer año de movilidad (recientes):')
display(part.groupby('PRIMER_ANIO_MOVILIDAD').size().tail(10).to_frame('estudiantes'))
"""),
    md(r"""
### Resultado e interpretación
La mayoría de los estudiantes participa **una sola vez** (media de ~1.18 eventos,
mediana 1), con casos de hasta 7 eventos. Guardar `PRIMER_PERIODO_MOVILIDAD`
permite, en la fase de modelamiento (semana 10+), construir predictores usando
**solo** información anterior a ese periodo, respetando la advertencia de la
propuesta sobre fuga de información: una variable registrada después de la
movilidad no puede usarse para predecirla.
"""),
    md("## 3. Construcción del dataset analítico\nEjecutamos el pipeline reproducible que integra todas las fuentes a nivel estudiante."),
    code(r"""
from src import build_dataset
df = build_dataset.build(verbose=True)
print('\nForma del dataset analítico:', df.shape)
df[['CODIGO_ESTUDIANTE', 'NIVEL', 'FACULTAD', 'PGA_ULTIMO', 'SEMESTRE_AVANCE',
    'PARTICIPA', 'MODALIDAD_PRINCIPAL']].head(8)
"""),
    md(r"""
### Resultado e interpretación
El pipeline produce un dataset de **233.987 estudiantes × 44 variables**, con la
clave de estudiante única (validación automática superada). Integra: atributos
demográficos e institucionales, desempeño académico agregado (PGA histórico,
créditos, semestres), posición relativa (percentil de PGA), avance (semestre),
pruebas de ingreso (ICFES), clasificación de inglés/matemáticas, progreso de
créditos (CAPP) y la **etiqueta `PARTICIPA`**.
"""),
    md("## 4. Tasa de participación y desbalance de clases\nEste es un insumo decisivo para la estrategia de modelamiento."),
    code(r"""
tasa_global = 100 * df['PARTICIPA'].mean()
tasa_preg = 100 * df.loc[df['ES_PREGRADO'], 'PARTICIPA'].mean()
print(f'Tasa de participación global: {tasa_global:.2f}%')
print(f'Tasa de participación en pregrado: {tasa_preg:.2f}%')

tabla_nivel = df.groupby('NIVEL')['PARTICIPA'].agg(['sum', 'count', 'mean'])
tabla_nivel['tasa_%'] = (100 * tabla_nivel['mean']).round(2)
tabla_nivel = tabla_nivel.sort_values('count', ascending=False)
tabla_nivel[['sum', 'count', 'tasa_%']]
"""),
    md(r"""
### Resultado e interpretación
La participación es un fenómeno **minoritario y desbalanceado**: 3.43% global y
**4.15% en pregrado**. El pregrado concentra el mayor volumen de participantes
(5.821) y la tasa más alta entre los niveles con volumen relevante. Esto
confirma dos decisiones:

- **Foco en pregrado** para el análisis y el modelamiento posterior.
- La métrica de evaluación del futuro modelo no podrá ser solo la exactitud
  (un clasificador trivial que prediga "no participa" acertaría ~96%): habrá que
  usar **precision/recall, F1 y PR-AUC**, tal como anticipa la propuesta para
  clases desbalanceadas.
"""),
    md("## 5. Tratamiento de valores faltantes en el subconjunto de pregrado\nEvaluamos la cobertura real de las variables candidatas antes de decidir imputación."),
    code(r"""
preg = df[df['ES_PREGRADO']].copy()
feats = ['PGA_ULTIMO', 'PERCENTIL_PGA_PROGRAMA', 'SEMESTRE_AVANCE',
         'ICFES_PUNTAJE_TOTAL', 'ICFES_INGLES', 'NIVEL_INGLES',
         'PCT_CREDITOS_APROBADOS', 'EDAD', 'SEMESTRES_MATRICULADOS']
cobertura = pd.DataFrame({
    'pct_faltante': (100 * preg[feats].isna().mean()).round(1),
    'no_nulos': preg[feats].notna().sum(),
}).sort_values('pct_faltante', ascending=False)
cobertura
"""),
    md(r"""
### Resultado e interpretación
En pregrado, las variables presentan faltantes relevantes: `NIVEL_INGLES` ~88%,
el bloque de PGA/avance ~46-55% y el ICFES ~45%. El alto faltante se explica por
la **naturaleza del snapshot**: `informacion_actual` incluye estudiantes muy
antiguos (sin ICFES moderno) o con trayectorias cortas (sin historial de
rendimiento consolidado).

**Decisiones de tratamiento (documentadas):**

- `NIVEL_INGLES` se **descarta** como variable principal por cobertura
  insuficiente (<13%); se conserva solo el puntaje de inglés del ICFES.
- Para las variables de desempeño e ICFES se adoptará, en el modelamiento, una
  estrategia de **imputación por mediana + indicador de faltante** (bandera
  `*_faltante`), evitando descartar estudiantes y haciendo explícito el faltante.
  Esta estrategia es coherente con la literatura sobre datos faltantes citada en
  la propuesta (Little y Rubin). No se imputa en la fase de EDA: aquí se analizan
  los datos observados.
- El tratamiento definitivo se consolidará junto con la construcción de
  predictores anti-*leakage* en la fase de modelamiento (semana 10+).
"""),
    md(r"""
## 6. Conclusiones y decisiones (semanas 7-8)

- **Señal de internacionalización definida y auditable**: cursos de movilidad en
  `historial_materias` (nombre + código), clasificados por modalidad. 9.526
  eventos / 8.067 estudiantes.
- **Dataset analítico** construido y validado (233.987 × 44), reproducible con
  `python -m src.build_dataset`.
- **Desbalance** confirmado (4.15% en pregrado) → define la estrategia de métricas
  del modelo.
- **Faltantes** caracterizados; reglas de tratamiento definidas y justificadas.
- **Anti-leakage**: se preserva el primer periodo de movilidad por estudiante.

**Siguiente paso:** análisis exploratorio univariado y bivariado (semana 8) y
análisis descriptivo profundo con indicadores (semana 9).
"""),
]
NOTEBOOKS['03_preparacion_dataset'] = ("Preparación: señal de internacionalización y dataset analítico", nb03)


# ===========================================================================
# NOTEBOOK 04 — EDA univariado y bivariado (Semana 8)
# ===========================================================================
nb04 = [
    md(r"""
# 04 — Análisis exploratorio univariado y bivariado

**Etapa CRISP-DM:** EDA · **Semana 8** · **OE4**

## Objetivo
Describir las variables del dataset analítico (univariado) y explorar su relación
con la participación en internacionalización (bivariado). El énfasis está en el
**subconjunto de pregrado**, foco del proyecto.

## Contexto
Con el dataset analítico ya construido (notebook 03), aquí se producen las
primeras distribuciones y cruces que orientarán el análisis profundo (semana 9)
y la selección de variables para el modelamiento.
"""),
    code(BOOTSTRAP),
    code(r"""
df = pd.read_parquet(config.ANALYTIC_DATASET)
preg = df[df['ES_PREGRADO']].copy()
print('Universo total:', len(df), '| Pregrado:', len(preg))
print('Participantes pregrado:', int(preg['PARTICIPA'].sum()),
      f"({100*preg['PARTICIPA'].mean():.2f}%)")
"""),
    md("## 1. Univariado — variables categóricas\nDistribución de nivel, facultad, género y tipo de admisión."),
    code(r"""
fig, axes = plt.subplots(2, 2, figsize=(13, 9))
df['NIVEL'].value_counts().head(7).plot.bar(ax=axes[0, 0], color='steelblue')
axes[0, 0].set_title('Estudiantes por nivel (universo)')
axes[0, 0].tick_params(axis='x', rotation=30)

preg['FACULTAD'].value_counts().plot.bar(ax=axes[0, 1], color='seagreen')
axes[0, 1].set_title('Estudiantes de pregrado por facultad')

preg['GENERO'].value_counts().plot.bar(ax=axes[1, 0], color='indianred')
axes[1, 0].set_title('Género (pregrado)')
axes[1, 0].tick_params(axis='x', rotation=0)

preg['ESTRATO_SOCIAL'].value_counts(dropna=False).sort_index().plot.bar(ax=axes[1, 1], color='slateblue')
axes[1, 1].set_title('Estrato social (pregrado)')
plt.tight_layout()
utils.save_fig(fig, 'fig_univariado_categoricas.png')
plt.show()
"""),
    md(r"""
### Resultado e interpretación
El pregrado es el nivel más numeroso del universo. La población de pregrado se
concentra en unas pocas facultades grandes (Ingeniería es la de mayor volumen),
con una distribución de género relativamente equilibrada y una fuerte presencia
de estratos 3-6. Una fracción notable de estudiantes tiene `ESTRATO_SOCIAL`
ausente, lo que refuerza la decisión de tratarlo como categórica con nivel "Sin
dato" y de usarlo solo para lectura de equidad.
"""),
    md("## 2. Univariado — variables numéricas de desempeño\nDistribución de PGA, percentil, avance y puntaje ICFES."),
    code(r"""
num = ['PGA_ULTIMO', 'PERCENTIL_PGA_PROGRAMA', 'SEMESTRE_AVANCE', 'ICFES_PUNTAJE_TOTAL']
fig, axes = plt.subplots(2, 2, figsize=(13, 8))
for ax, col in zip(axes.ravel(), num):
    data = preg[col].dropna()
    sns.histplot(data, bins=40, ax=ax, color='steelblue')
    ax.set_title(f'{col}  (n={len(data):,})')
plt.tight_layout()
utils.save_fig(fig, 'fig_univariado_numericas.png')
plt.show()
preg[num].describe().round(2)
"""),
    md(r"""
### Resultado e interpretación
El PGA de pregrado se concentra alrededor de 3.8-4.0 con cola inferior (primeros
semestres y casos de bajo rendimiento). El percentil de PGA por programa es, por
construcción, aproximadamente uniforme (mediana ~48). El avance en semestres
muestra una masa importante en etapas intermedias/avanzadas. El puntaje ICFES se
distribuye de forma aproximadamente simétrica alrededor de ~355. Estas escalas
son coherentes y no requieren transformaciones adicionales para el análisis
descriptivo.
"""),
    md("## 3. Bivariado — tasa de participación por categoría\nComparamos la tasa de participación entre grupos."),
    code(r"""
def tasa_por_categoria(data, col, min_n=200):
    t = data.groupby(col)['PARTICIPA'].agg(['mean', 'count'])
    t = t[t['count'] >= min_n]
    t['tasa_%'] = (100 * t['mean']).round(2)
    return t[['count', 'tasa_%']].sort_values('tasa_%', ascending=False)

print('=== Tasa por facultad (pregrado) ==='); display(tasa_por_categoria(preg, 'FACULTAD'))
print('=== Tasa por género (pregrado) ==='); display(tasa_por_categoria(preg, 'GENERO'))
print('=== Tasa por estrato (pregrado) ==='); display(tasa_por_categoria(preg, 'ESTRATO_SOCIAL'))
"""),
    code(r"""
fig, ax = plt.subplots(figsize=(9, 4.5))
tf = tasa_por_categoria(preg, 'FACULTAD')
tf['tasa_%'].sort_values().plot.barh(ax=ax, color='teal')
ax.set_title('Tasa de participación en internacionalización por facultad (pregrado)')
ax.set_xlabel('% de estudiantes con movilidad')
utils.save_fig(fig, 'fig_tasa_por_facultad.png')
plt.show()
"""),
    md(r"""
### Resultado e interpretación
Aparecen diferencias marcadas entre grupos:

- **Facultad:** la tasa de participación va desde ~0.1% hasta **~12%** según la
  facultad (Administración muestra la tasa más alta; Arquitectura, Economía y
  Derecho también destacan). Es la dimensión con mayor poder discriminante
  observado.
- **Género:** la tasa es algo mayor en mujeres (~4.7%) que en hombres (~3.7%).
- **Estrato:** existe un **gradiente socioeconómico** claro: la tasa crece de
  forma monótona con el estrato (de ~0.4% en estratos 1-2 a **~9.5%** en estrato
  6). Es un hallazgo relevante de equidad que debe interpretarse como asociación,
  no causa, y comunicarse con cuidado.

**Decisión:** facultad/programa y variables socioeconómicas son candidatas
importantes para el EDA profundo (semana 9) y potenciales predictores; la lectura
de estrato se enmarcará explícitamente como análisis de equidad.
"""),
    md("## 4. Bivariado — desempeño académico y participación\nComparamos distribuciones de variables numéricas entre participantes y no participantes."),
    code(r"""
comparar = ['PGA_ULTIMO', 'PERCENTIL_PGA_PROGRAMA', 'ICFES_PUNTAJE_TOTAL', 'ICFES_INGLES']
fig, axes = plt.subplots(2, 2, figsize=(13, 8))
for ax, col in zip(axes.ravel(), comparar):
    sns.boxplot(data=preg, x='PARTICIPA', y=col, ax=ax)
    ax.set_title(col)
    ax.set_xticklabels(['No participa', 'Participa'])
plt.tight_layout()
utils.save_fig(fig, 'fig_bivariado_desempeno.png')
plt.show()

resumen = preg.groupby('PARTICIPA')[comparar + ['SEMESTRE_AVANCE', 'NIVEL_INGLES']].mean().T
resumen['diferencia'] = resumen[1] - resumen[0]
resumen.round(2)
"""),
    md(r"""
### Resultado e interpretación
Los participantes muestran, en promedio, **mejor desempeño y mejor perfil de
ingreso** que los no participantes:

- PGA final más alto (~4.14 vs ~3.81).
- Percentil de PGA por programa mucho mayor (~68 vs ~46): los participantes
  tienden a estar en la mitad superior de su programa.
- Puntaje ICFES total y de inglés más altos.
- Mayor avance (más semestres cursados), consistente con que la movilidad suele
  ocurrir en etapas intermedias/avanzadas de la carrera.

Estas diferencias son coherentes con la intuición institucional (la movilidad
suele exigir buen desempeño y cierto avance) y sugieren que las variables de
desempeño y de ingreso tendrán valor predictivo. **Advertencia metodológica:**
el PGA/percentil "final" incluye periodos posteriores a la movilidad, por lo que
en el modelamiento deberán recalcularse **antes** del primer evento para evitar
*data leakage*.
"""),
    md(r"""
## 5. Conclusiones (semana 8)

- El EDA univariado confirma escalas y distribuciones coherentes tras la limpieza.
- El EDA bivariado revela **asociaciones fuertes** entre participación y:
  facultad/programa, estrato social, desempeño (PGA, percentil) y perfil de
  ingreso (ICFES, inglés), además de un avance mayor.
- Se identifican riesgos de *leakage* en variables de desempeño "finales".

**Siguiente paso:** análisis descriptivo profundo, indicadores y selección de
preguntas de modelamiento (semana 9).
"""),
]
NOTEBOOKS['04_eda_univariado_bivariado'] = ("EDA univariado y bivariado", nb04)


# ===========================================================================
# NOTEBOOK 05 — EDA profundo, indicadores y candidatos a modelamiento (Semana 9)
# ===========================================================================
nb05 = [
    md(r"""
# 05 — Análisis descriptivo profundo, indicadores y candidatos a modelamiento

**Etapa CRISP-DM:** Análisis exploratorio · **Semana 9** · **OE4 / OE5 (preparación)**

## Objetivo
1. Analizar la participación con mayor profundidad: **evolución temporal**,
   participación por **programa**, **modalidad** y **momento de la trayectoria**.
2. Definir y calcular los **indicadores principales** que alimentarán el
   dashboard.
3. Explorar la **relación entre trayectoria académica y participación**.
4. **Seleccionar y formular** la(s) pregunta(s) que se convertirán en problema de
   modelamiento (semana 10+).

## Contexto
Integra los hallazgos de los notebooks 03-04 para producir la vista descriptiva
que responde las preguntas analíticas PA1-PA6 y prepara la transición al
componente predictivo (PA7).
"""),
    code(BOOTSTRAP),
    code(r"""
df = pd.read_parquet(config.ANALYTIC_DATASET)
eventos = pd.read_parquet(config.MOBILITY_EVENTS)
preg = df[df['ES_PREGRADO']].copy()
print('Eventos:', len(eventos), '| Pregrado:', len(preg))
"""),
    md("## 1. PA1 — Evolución temporal de la participación\nContamos eventos de movilidad por año."),
    code(r"""
eventos_anio = eventos[eventos['ANIO'] >= 2002].groupby('ANIO').size()
fig, ax = plt.subplots(figsize=(11, 4.5))
eventos_anio.plot(ax=ax, marker='o', color='navy')
ax.axvspan(2020, 2021, color='red', alpha=0.12, label='Pandemia COVID-19')
ax.set_title('Evolución anual de eventos de movilidad internacional')
ax.set_xlabel('Año'); ax.set_ylabel('Número de eventos')
ax.legend()
utils.save_fig(fig, 'fig_evolucion_temporal.png')
plt.show()
eventos_anio.tail(10).to_frame('eventos')
"""),
    md(r"""
### Resultado e interpretación
La participación crece de forma sostenida desde comienzos de los 2000 hasta
estabilizarse en ~400-450 eventos anuales en la década de 2010. Se observa una
**caída pronunciada en 2020-2021** (de ~447 en 2019 a ~257-268), claramente
atribuible a las restricciones de movilidad por la pandemia de COVID-19, seguida
de una **recuperación fuerte desde 2022** que alcanza máximos históricos
(~585-595 eventos en 2023-2025). Este patrón valida la señal construida (reacciona
a un choque externo conocido de la forma esperada) y constituye un indicador
central para el dashboard (PA1).
"""),
    md("## 2. PA3 — Modalidades a lo largo del tiempo\n¿Cómo cambia la composición por modalidad?"),
    code(r"""
piv = (eventos[eventos['ANIO'] >= 2010]
       .pivot_table(index='ANIO', columns='MODALIDAD', values=config.STUDENT_KEY,
                    aggfunc='count', fill_value=0))
fig, ax = plt.subplots(figsize=(11, 5))
piv.plot.area(ax=ax, alpha=0.85)
ax.set_title('Composición de eventos de movilidad por modalidad (desde 2010)')
ax.set_xlabel('Año'); ax.set_ylabel('Eventos')
ax.legend(title='Modalidad', bbox_to_anchor=(1.02, 1), loc='upper left')
utils.save_fig(fig, 'fig_modalidad_temporal.png')
plt.show()
"""),
    md(r"""
### Resultado e interpretación
El **intercambio internacional** domina la movilidad en todo el periodo. La
**doble titulación**, los **viajes internacionales de estudio** y las **semanas
internacionales** aportan volúmenes menores pero estables. El **intercambio
virtual** aparece de forma puntual alrededor de 2020-2021, coherente con la
sustitución de la movilidad física durante la pandemia. La composición confirma
que el intercambio es la experiencia a priorizar en los indicadores del
dashboard, sin perder la desagregación por modalidad.
"""),
    md("## 3. PA2 — Participación por programa académico\nIdentificamos los programas de pregrado con mayor tasa y volumen de movilidad."),
    code(r"""
prog = preg.groupby('PROGRAMA')['PARTICIPA'].agg(['sum', 'count', 'mean'])
prog = prog[prog['count'] >= 300].copy()
prog['tasa_%'] = (100 * prog['mean']).round(2)
top_tasa = prog.sort_values('tasa_%', ascending=False).head(12)
display(top_tasa[['sum', 'count', 'tasa_%']])

fig, ax = plt.subplots(figsize=(10, 5))
top_tasa['tasa_%'].sort_values().plot.barh(ax=ax, color='darkorange')
ax.set_title('Programas de pregrado con mayor tasa de participación (n>=300)')
ax.set_xlabel('% de estudiantes con movilidad')
utils.save_fig(fig, 'fig_tasa_por_programa.png')
plt.show()
"""),
    md(r"""
### Resultado e interpretación
A nivel de programa, las tasas de participación son muy heterogéneas. Los
programas de áreas de administración, economía y algunas ingenierías y
disciplinas de ciencias sociales/humanidades presentan las tasas más altas,
mientras que otros programas tienen participación casi nula. Esta heterogeneidad
sugiere que la **facultad/programa** es una variable estructural clave y refuerza
su inclusión como dimensión de segmentación en el dashboard y como predictor
candidato.
"""),
    md("## 4. PA4 — Momento de la trayectoria\n¿En qué semestre de avance se encuentran los participantes?"),
    code(r"""
fig, ax = plt.subplots(figsize=(10, 4.5))
sns.histplot(data=preg, x='SEMESTRE_AVANCE', hue='PARTICIPA', bins=30,
             stat='density', common_norm=False, ax=ax,
             palette={0: 'lightgray', 1: 'crimson'})
ax.set_title('Avance (semestres) — participantes vs no participantes (pregrado)')
ax.set_xlabel('Semestre de avance')
handles = ax.get_legend().legend_handles
ax.legend(handles, ['Participa', 'No participa'])
utils.save_fig(fig, 'fig_momento_trayectoria.png')
plt.show()
preg.groupby('PARTICIPA')['SEMESTRE_AVANCE'].describe().round(2)
"""),
    md(r"""
### Resultado e interpretación
Los participantes se concentran en **etapas intermedias y avanzadas** de la
carrera: su avance mediano es de ~8.75 semestres frente a ~8 en no participantes,
y su distribución es mucho más estrecha (menos participación en primeros
semestres). Esto es consistente con que la movilidad suele requerir haber
cursado un mínimo de créditos. **Implicación anti-leakage:** al modelar, los
predictores de desempeño deben "congelarse" en un corte temporal anterior al
primer evento, no al final de la trayectoria.
"""),
    md("## 5. PA5 — Relación trayectoria académica ↔ participación (correlaciones)\nCuantificamos la asociación de variables numéricas con la participación."),
    code(r"""
num_feats = ['PGA_ULTIMO', 'PGA_PROMEDIO_HIST', 'PERCENTIL_PGA_PROGRAMA',
             'SEMESTRE_AVANCE', 'SEMESTRES_MATRICULADOS', 'PCT_CREDITOS_APROBADOS',
             'ICFES_PUNTAJE_TOTAL', 'ICFES_INGLES', 'ICFES_MATEMATICAS', 'EDAD',
             'PARTICIPA']
corr = preg[num_feats].corr(numeric_only=True)
fig, ax = plt.subplots(figsize=(9, 7))
sns.heatmap(corr, annot=True, fmt='.2f', cmap='coolwarm', center=0, ax=ax,
            cbar_kws={'shrink': 0.8})
ax.set_title('Correlaciones (pregrado) — incluye PARTICIPA')
utils.save_fig(fig, 'fig_correlaciones.png')
plt.show()
corr['PARTICIPA'].drop('PARTICIPA').sort_values(ascending=False).round(3).to_frame('corr_con_PARTICIPA')
"""),
    md(r"""
### Resultado e interpretación
Las correlaciones con `PARTICIPA` son, individualmente, de magnitud baja a
moderada (lo esperable para un evento poco frecuente), pero con signos
coherentes y consistentes: el **percentil de PGA por programa** y el **PGA**
muestran la asociación positiva más clara, seguidos del avance y el perfil de
ingreso (ICFES, inglés). Ninguna variable domina por sí sola, lo que anticipa que
un modelo multivariado (y posiblemente no lineal) puede capturar mejor el
fenómeno que cualquier regla univariada. Las correlaciones entre predictores
(p. ej. PGA y percentil) alertan sobre colinealidad a considerar en modelos
lineales.
"""),
    md("## 6. Indicadores principales (insumo del dashboard)\nConsolidamos los KPIs que el dashboard deberá exponer y los exportamos."),
    code(r"""
indicadores = {
    'estudiantes_universo': int(len(df)),
    'estudiantes_pregrado': int(len(preg)),
    'participantes_total': int(df['PARTICIPA'].sum()),
    'participantes_pregrado': int(preg['PARTICIPA'].sum()),
    'tasa_participacion_global_%': round(100 * df['PARTICIPA'].mean(), 2),
    'tasa_participacion_pregrado_%': round(100 * preg['PARTICIPA'].mean(), 2),
    'eventos_movilidad_total': int(len(eventos)),
    'anio_pico_eventos': int(eventos.groupby('ANIO').size().idxmax()),
    'modalidad_principal': eventos['MODALIDAD'].value_counts().index[0],
    'facultad_mayor_tasa': preg.groupby('FACULTAD')['PARTICIPA'].mean().idxmax(),
    'avance_mediano_participantes': round(float(preg.loc[preg['PARTICIPA'] == 1, 'SEMESTRE_AVANCE'].median()), 2),
}
indic_df = pd.DataFrame(indicadores.items(), columns=['indicador', 'valor'])
indic_df.to_csv(config.TABLES_DIR / 'indicadores_principales.csv', index=False, encoding='utf-8')
indic_df
"""),
    md(r"""
### Resultado e interpretación
Los indicadores sintetizan la vista descriptiva en métricas directamente
reutilizables por el dashboard (resumen general): tamaño del universo y del
pregrado, número de participantes, tasas, eventos totales, año pico, modalidad
dominante, facultad con mayor tasa y avance mediano de los participantes. Quedan
exportados en `reports/tables/indicadores_principales.csv` para su consumo por la
capa de visualización (etapa 5).
"""),
    md(r"""
## 7. Selección y formulación de la pregunta de modelamiento (PA7)

A partir del análisis, se formaliza el problema de modelamiento que se abordará a
partir de la semana 10:

> **Problema:** dado un estudiante de **pregrado**, estimar la **probabilidad de
> que participe en una experiencia de internacionalización** (movilidad) en algún
> momento de su carrera, usando **únicamente información disponible antes del
> evento**.

**Justificación de la selección:**

- Existe una **variable objetivo bien definida y auditable** (`PARTICIPA`), con
  una tasa de base realista (4.15%).
- El EDA mostró **asociaciones consistentes** (desempeño, percentil, facultad,
  perfil de ingreso) que dan sustento a un modelo con capacidad discriminante.
- El problema es **relevante para la Oficina**: permite identificar perfiles con
  baja participación y focalizar estrategias.

**Decisiones metodológicas heredadas al modelamiento:**

1. **Clase desbalanceada** → métricas: precision, recall, F1 y **PR-AUC** además
   de ROC-AUC; se evaluarán técnicas de manejo de desbalance.
2. **Anti-leakage** → los predictores de desempeño se calcularán en un corte
   temporal **anterior** al primer evento de movilidad (`PRIMER_PERIODO_MOVILIDAD`).
3. **Complejidad progresiva** → línea base trivial → regresión logística →
   árboles/Random Forest → boosting, incorporando interpretabilidad (SHAP).
4. **Variables descartadas** por cobertura: `NIVEL_INGLES` (<13%).

## 8. Conclusiones (semana 9)

El análisis descriptivo responde PA1-PA6 y deja definida PA7:

- Tendencia temporal con efecto COVID y recuperación posterior.
- Fuerte heterogeneidad por facultad/programa.
- Intercambio internacional como modalidad dominante.
- Movilidad concentrada en etapas intermedias/avanzadas.
- Asociación clara con desempeño y perfil de ingreso, y un gradiente
  socioeconómico que se comunica como análisis de equidad.
- Indicadores principales calculados y exportados.
- Pregunta de modelamiento formulada con sus salvaguardas metodológicas.

Con esto se completa el alcance planificado hasta la semana 9 del cronograma.
"""),
]
NOTEBOOKS['05_eda_internacionalizacion'] = ("EDA profundo, indicadores y candidatos a modelamiento", nb05)
