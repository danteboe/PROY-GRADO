# Informe de entorno — comparativo-insights

Paso de preparación. No se instaló ni ejecutó el pipeline completo; solo se localizó el intérprete y se verificó la disponibilidad de librerías.

## Intérprete Python a usar

- **Comando:** `python -m src.export_dashboard` (según `README.md`, el pipeline se corre así)
- **Ruta exacta del intérprete:** `C:\Python312\python.exe`
- **Versión:** Python 3.12.4 (64-bit, MSC v.1940)

El repositorio **no** contiene un entorno virtual (`venv` / `.venv` / `env`), ni `pyproject.toml`, `environment.yml`, `Pipfile` ni `setup.py`. La única especificación de dependencias es `requirements.txt` en la raíz. En el sistema, `python` resuelve a `C:\Python312\python.exe` (también es el destino por defecto del launcher `py`, marcado con `*` en `py -0p`). Existe además un Python 3.11 en `C:\Users\JUAN DAVID\AppData\Local\Programs\Python\Python311\python.exe`, pero **no** es el intérprete por defecto; el pipeline usa el 3.12.

Al no haber venv, el pipeline corre contra la instalación global de Python 3.12. Ese es el intérprete que se debe usar para el análisis.

## Librerías (verificadas en `C:\Python312\python.exe`, sin instalar nada)

| Librería                | Estado    | Versión  |
|-------------------------|-----------|----------|
| numpy                   | PRESENTE  | 2.2.4    |
| pandas                  | PRESENTE  | 2.2.3    |
| scipy (incl. scipy.stats) | PRESENTE | 1.16.3   |
| statsmodels             | **AUSENTE** | —      |
| scikit-learn (sklearn)  | PRESENTE  | 1.7.2    |

Nota: `requirements.txt` declara `scikit-learn==1.7.2` pero **no** lista `scipy` ni `statsmodels`. `scipy` resultó estar instalado de todos modos (probablemente como dependencia transitiva), mientras que `statsmodels` no está disponible.

## Dataset analítico (parquet)

- **Ruta:** `data_processed/dataset_analitico_estudiante.parquet`
- **Estado:** EXISTE (generado)
- **Tamaño:** ~9.3 MB (9 293 359 bytes)
- **Última modificación:** 2026-05-10 20:03

## Archivos clave del brief

Todos presentes:

- `src/config.py` — OK
- `src/build_dataset.py` — OK
- `src/export_dashboard.py` — OK
- `src/utils.py` — OK
- `src/internationalization.py` — OK
- `build_notebooks.py` — OK
- `latex/informe_proyecto.tex` — OK
- `dashboard/src/App.jsx` — OK
- `dashboard/src/data.js` — OK
- `dashboard/src/styles.css` — OK
- `dashboard/package.json` — OK
- `data_processed/dataset_analitico_estudiante.parquet` — OK

## Recomendación para el análisis multivariado (regresión logística)

`statsmodels` **no** está disponible, pero `scikit-learn` (1.7.2) **sí** lo está.

**Recomendación: implementar la regresión logística con scikit-learn** (`sklearn.linear_model.LogisticRegression`) para identificar qué diferencia a quienes participan en internacionalización de quienes no, reportando **odds ratios** como `exp(coef_)`.

Limitación a documentar: scikit-learn **no** entrega directamente intervalos de confianza al 95% ni p-valores de los coeficientes (su `LogisticRegression` aplica regularización L2 por defecto). Mitigaciones recomendadas:

- Fijar `penalty=None` (o un `C` muy alto) para obtener estimaciones no regularizadas comparables a una logística clásica.
- Aproximar los IC95% de los odds ratios mediante **bootstrap** sobre los coeficientes, o calcular los errores estándar a partir de la matriz de información (Hessiana) de forma manual, dejando claro en el informe que es una aproximación.
- Complementar con `scipy.stats` (que sí está presente) para pruebas de significancia univariadas (t de Student para medias, chi-cuadrado para tablas de contingencia) que respalden el análisis.

Alternativa de respaldo (ya no necesaria aquí, pero documentada por completitud): si no estuvieran ni `statsmodels` ni `scikit-learn`, se degradaría a **odds ratios por tabla de contingencia** calculados con `scipy.stats` / `numpy`, documentando la ausencia de ajuste multivariado y de IC analíticos.

Si se prefiere la ruta ideal (odds ratios con IC95% y p-valores analíticos directos, sin bootstrap), habría que instalar `statsmodels` — pero el brief indica NO instalar dependencias en este paso, así que la vía recomendada bajo la restricción actual es scikit-learn + scipy.
