# Sistema de analítica y visualización de la participación estudiantil en internacionalización

Proyecto de grado — Ingeniería de Sistemas y Computación, Universidad de los Andes.
Autor: Juan David Torres Albarracín.

Este repositorio contiene el desarrollo de una herramienta de analítica de datos
para la Oficina de Internacionalización, siguiendo la metodología **CRISP-DM**
combinada con prácticas iterativas de desarrollo de software. El estado actual
del repositorio corresponde al **avance hasta la semana 9** del cronograma
(comprensión del problema, comprensión y preparación de datos, y análisis
exploratorio).

## Estructura del repositorio

```
PROY-GRADO/
├── data/                  # Fuentes anonimizadas (NO versionadas — ver .gitignore)
├── data_processed/        # Datasets analíticos generados por el pipeline (NO versionados)
├── src/                   # Código fuente reproducible del pipeline
│   ├── config.py          # Rutas, constantes y catálogos
│   ├── utils.py           # Utilidades (encoding, perfilamiento, E/S)
│   ├── internationalization.py  # Definición de la señal de internacionalización
│   └── build_dataset.py   # Pipeline de integración y construcción del dataset analítico
├── notebooks/             # Notebooks ejecutados y documentados (una etapa por notebook)
│   ├── 01_inventario_fuentes.ipynb        # Semana 5
│   ├── 02_calidad_datos.ipynb             # Semana 6
│   ├── 03_preparacion_dataset.ipynb       # Semanas 7-8
│   ├── 04_eda_univariado_bivariado.ipynb  # Semana 8
│   └── 05_eda_internacionalizacion.ipynb  # Semana 9
├── reports/
│   ├── figures/           # Figuras generadas (PNG) usadas en los notebooks y el informe
│   └── tables/            # Tablas intermedias (CSV)
├── docs/                  # Documentos de etapa (requerimientos, diccionario, calidad)
├── dashboard/             # Dashboard web interactivo (React + Vite + Recharts)
│   ├── public/data.json   # Cubo agregado generado por src/export_dashboard.py
│   └── src/               # Código de la aplicación (componentes, lógica de filtros)
├── latex/                 # Informe técnico principal (LaTeX)
└── requirements.txt
```

## Dashboard interactivo

El producto principal es un dashboard descriptivo y exploratorio que permite
filtrar la participación en internacionalización por once dimensiones y
visualizarla con gráficos interactivos (hover, tooltips, cross-filtering).

```bash
# 1. Generar el cubo de datos agregado (desde el dataset analítico)
python -m src.export_dashboard

# 2. Instalar dependencias y ejecutar en modo desarrollo
cd dashboard
npm install
npm run dev          # servidor local de desarrollo

# 3. Construir la versión estática desplegable
npm run build        # genera dashboard/dist/
```

El dashboard es **sin servidor**: todo el filtrado y la agregación ocurren en el
navegador sobre un cubo pre-agregado (no se exponen registros individuales, por
privacidad). El diseño y las decisiones se documentan en el informe LaTeX
(sección "Diseño e implementación del dashboard").

## Reproducibilidad

1. Instalar dependencias:

   ```bash
   pip install -r requirements.txt
   ```

2. Colocar las fuentes `.parquet` en `data/` (no se versionan por privacidad y tamaño).

3. Ejecutar el pipeline de construcción del dataset analítico:

   ```bash
   python -m src.build_dataset
   ```

   Esto genera `data_processed/dataset_analitico_estudiante.parquet` y
   artefactos intermedios.

4. Ejecutar los notebooks en orden (01 → 05). Cada notebook es autocontenido:
   reconstruye o carga los artefactos que necesita a partir del pipeline.

## Trazabilidad de decisiones

Todas las decisiones metodológicas relevantes (definición de la señal de
internacionalización, tratamiento de valores faltantes, variables descartadas,
prevención de *data leakage*, etc.) quedan registradas en los notebooks y,
de forma consolidada, en el informe LaTeX (`latex/informe_proyecto.tex`),
que es el documento principal del proyecto.

## Privacidad

Los datos son anonimizados (identificadores pseudonimizados) y **no se versionan**.
El proyecto aplica el principio de minimización de datos conforme a la Ley 1581
de 2012 y su reglamentación.
