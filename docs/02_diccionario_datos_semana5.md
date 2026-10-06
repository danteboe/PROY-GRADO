# Diccionario de datos preliminar (Semana 5)

**Etapa CRISP-DM:** Comprensión de datos · **OE2**

Este documento acompaña al notebook `notebooks/01_inventario_fuentes.ipynb`, que
genera el diccionario de datos completo en
`reports/tables/diccionario_datos.csv` (una fila por columna de cada fuente, con
tipo, no nulos, % de faltantes, cardinalidad y un valor de ejemplo).

## Fuentes y granularidad

| Fuente | Filas | Variables | Unidad de información | Clave |
|---|---:|---:|---|---|
| informacion_actual | 233 987 | 73 | Estudiante (snapshot) | `CODIGO_ESTUDIANTE` |
| historial_materias | 6 958 732 | 14 | Curso-estudiante-periodo | `CODIGO_ESTUDIANTE_ANOM` |
| programas | 1 770 486 | 18 | Programa-estudiante-periodo | `CODIGO_ESTUDIANTE_ANOM` |
| historial_rendimiento | 1 230 195 | 28 | Estudiante-periodo | `CODIGO_ESTUDIANTE` |
| percentiles_historicos | 994 875 | 18 | Estudiante-periodo | `CODIGO_ESTUDIANTE` |
| icfes_saber11 | 262 148 | 10 | Presentación de examen | `CODIGO_ESTUDIANTE` |
| historial_opciones | 173 387 | 14 | Opción-estudiante-periodo | `CODIGO_ESTUDIANTE` |
| grados | 139 429 | 10 | Grado obtenido | `CODIGO_ESTUDIANTE` |
| examenes_clasificacion | 79 599 | 8 | Clasificación por estudiante | `CODIGO_ESTUDIANTE` |
| capp_creditos | 30 771 | 7 | Cálculo de créditos | `CODIGO_ESTUDIANTE` |

(Se añaden también `momento_academico_materia` y `percentiles_academicos`, no
usadas como núcleo en esta fase.)

## Claves y relaciones

- Clave de estudiante: `CODIGO_ESTUDIANTE`, con normalización de
  `CODIGO_ESTUDIANTE_ANOM → CODIGO_ESTUDIANTE` en `historial_materias` y
  `programas`.
- Periodos en formato `AAAASS` (año + ciclo). Rango histórico amplio (finales de
  los 1990/2000 hasta 2026).

## Decisiones (semana 5)

1. **Unidad de análisis:** el estudiante; `informacion_actual` como columna
   vertebral.
2. **Fuentes núcleo** confirmadas por pertinencia: `informacion_actual`,
   `historial_materias` (fuente de la señal de internacionalización),
   `historial_rendimiento`, `percentiles_historicos`, `icfes_saber11`,
   `examenes_clasificacion`, `capp_creditos`.
3. **Problema detectado:** *mojibake* de codificación en texto (se trata en la
   semana 6).
