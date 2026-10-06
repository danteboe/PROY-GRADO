# Informe de calidad de datos (Semana 6)

**Etapa CRISP-DM:** Comprensión y calidad de datos · **OE2 / OE3**

Este documento resume el diagnóstico del notebook
`notebooks/02_calidad_datos.ipynb`. El perfilamiento columna a columna de las
fuentes núcleo se exporta en `reports/tables/informe_calidad_datos.csv`.

## Problemas detectados y reglas adoptadas

| # | Problema | Diagnóstico | Regla / decisión |
|---|---|---|---|
| 1 | Codificación (*mojibake*) | Dos esquemas: UTF-8 leído como CP437 (`informacion_actual`) y como CP850 (`historial_materias`). | Corrección automática centralizada en `utils.fix_mojibake` (detecta el esquema). |
| 2 | Valores faltantes | Alta ausencia en variables socioeconómicas y de ingreso; esperable por heterogeneidad del snapshot. | No se descartan a priori; se evalúa cobertura en pregrado (notebook 03). |
| 3 | Duplicados por estudiante | ICFES, CAPP y exámenes tienen varias filas por estudiante. | Deduplicación: ICFES = mayor puntaje; CAPP y exámenes = registro más reciente. |
| 4 | Valores atípicos | PGA dentro de `[0,5]`; ceros válidos (inicios de trayectoria). | Se conservan. |
| 5 | Categorías inconsistentes | Tras corregir encoding, no hay duplicados por mayúsculas/acentos. | Normalización de texto aplicada; `ESTRATO_SOCIAL` como categórica con "Sin dato". |

## Implicaciones para las etapas siguientes

- La corrección de encoding es prerrequisito de cualquier agregación por
  categoría (evita contar `Magíster` y su versión corrupta como dos niveles).
- La cobertura real de variables condiciona qué predictores son viables
  (ver tratamiento de faltantes en el notebook 03 y en el informe LaTeX).
