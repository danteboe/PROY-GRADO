"""Fuente única de cálculo del análisis comparativo participantes vs. no participantes.

Este módulo concentra TODA la estadística comparativa "¿qué diferencia a quienes
participan en internacionalización de quienes no?" (foco: pregrado). Es la **fuente
única de verdad** (RNF-1): tanto el exportador del dashboard (`export_dashboard`,
que produce ``data.json``) como el notebook ``06_comparativo_inferencial`` (que
produce PNG/CSV/.tex para el informe LaTeX) importan estas funciones y **solo leen**
sus resultados. Nadie recalcula estadísticos en JavaScript ni en LaTeX.

Las funciones son **puras**: reciben un ``DataFrame`` y devuelven estructuras
serializables (dicts/listas de tipos nativos de Python), sin efectos de E/S. El
redondeo a la precisión publicada se aplica **una sola vez** aquí (vía el dict
``DECIMALES``), de modo que web e informe muestren exactamente las mismas cifras.

Metodología fijada en ``diseno.md`` (§2) y contrato de datos en §3:
    * Numéricas: t de Welch (principal) + Mann-Whitney U asintótica (robustez);
      d de Cohen con SD agrupada; IC95% de la diferencia de medias (Welch-Satterthwaite);
      resumen de boxplot con whiskers de Tukey (sin min/max crudos, RNF-3).
    * Categóricas: chi-cuadrado de independencia + V de Cramér; supresión de
      categorías con n<30 (RNF-3).
    * Corrección por comparaciones múltiples: Benjamini-Hochberg (FDR), por familias.
    * Multivariado: regresión logística de scikit-learn (penalty=None,
      class_weight='balanced'), caso completo, IC95% por bootstrap percentil (B=1000,
      semilla 42). Sin statsmodels (RNF-2): no se reportan p-valores analíticos.
"""
from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression

from . import config, utils

# Semilla única de reproducibilidad (RF-3): todo lo aleatorio (bootstrap) la usa.
RANDOM_SEED = config.RANDOM_SEED

# ---------------------------------------------------------------------------
# Precisión de publicación (RNF-1): redondeo ÚNICO aplicado tanto a data.json
# como a las tablas .tex del informe. Es la base de la aserción de consistencia
# M1 del notebook 06. Cada campo numérico del contrato §3 que se publique como
# float aparece aquí con su número de decimales.
# ---------------------------------------------------------------------------
DECIMALES = {
    # Meta
    "tasa_base_pct": 2,
    "cobertura_pct": 1,
    # Numéricas
    "media_part": 2,
    "media_no": 2,
    "sd_part": 2,
    "sd_no": 2,
    "mediana_part": 2,
    "q1_part": 2,
    "q3_part": 2,
    "whisker_low_part": 2,
    "whisker_high_part": 2,
    "mediana_no": 2,
    "q1_no": 2,
    "q3_no": 2,
    "whisker_low_no": 2,
    "whisker_high_no": 2,
    "cohen_d": 2,
    "dif_medias": 2,
    "ic95_low": 2,
    "ic95_high": 2,
    "t_stat": 2,
    # p-valores: se conservan con más dígitos (pueden ser minúsculos con N grande)
    "p_welch": 6,
    "p_mannwhitney": 6,
    "p_ajustada": 6,
    # Categóricas
    "chi2": 2,
    "cramers_v": 2,
    "p": 6,
    "tasa_pct": 2,
    # Logística
    "coef": 3,
    "odds_ratio": 2,
    "replicas_descartadas_pct": 1,
}

# ---------------------------------------------------------------------------
# Selección de variables (diseno.md §2.9). Listas conservadas y descartes.
# ---------------------------------------------------------------------------
# Numéricas conservadas (etiquetas legibles en español, RNF-4).
NUMERICAS = [
    ("EDAD", "Edad"),
    ("NUMERO_OPCIONES_INSCRITAS", "Número de opciones inscritas"),
    ("ICFES_MATEMATICAS", "ICFES matemáticas"),
    ("ICFES_LECTURA_CRITICA", "ICFES lectura crítica"),
    ("ICFES_INGLES", "ICFES inglés"),
    ("ICFES_PUNTAJE_TOTAL", "ICFES puntaje total"),
    ("PGA_ULTIMO", "PGA (último)"),
    ("PGA_PROMEDIO_HIST", "PGA promedio histórico"),
    ("PCT_CREDITOS_APROBADOS", "% de créditos aprobados"),
    ("CREDITOS_APROBADOS_TOTAL", "Créditos aprobados (total)"),
    ("SEMESTRE_AVANCE", "Semestre de avance"),
    ("PERCENTIL_PGA_PROGRAMA", "Percentil de PGA (programa)"),
    ("PERCENTIL_PGA_NIVEL", "Percentil de PGA (nivel)"),
]

# Categóricas conservadas.
CATEGORICAS = [
    ("GENERO", "Género"),
    ("ESTRATO_SOCIAL", "Estrato social"),
    ("TIPO_ADMISION", "Tipo de admisión"),
    ("FACULTAD", "Facultad"),
    ("ESTADO_ACADEMICO", "Estado académico"),
]

# Variables descartadas, documentadas en meta.descartadas (contrato §3).
DESCARTADAS = [
    {"var": "PCT_AVANCE_CREDITOS", "tipo": "numerica", "cobertura_pct": 13.4,
     "motivo": "cobertura insuficiente (<15%)"},
    {"var": "NIVEL_INGLES", "tipo": "categorica", "cobertura_pct": 12.2,
     "motivo": "cobertura insuficiente"},
    {"var": "EXAMEN_NIVEL_MATEMATICAS", "tipo": "categorica", "cobertura_pct": 17.8,
     "motivo": "cobertura insuficiente"},
]

# Predictores de la logística (uno por constructo; z-score). diseno.md §2.8.
LOGIT_PREDICTORS = [
    ("PGA_ULTIMO", "PGA (último, estandarizado)"),
    ("SEMESTRE_AVANCE", "Semestre de avance (estandarizado)"),
    ("ICFES_PUNTAJE_TOTAL", "ICFES puntaje total (estandarizado)"),
    ("EDAD", "Edad (estandarizada)"),
]

# Predictores NO incluidos en el modelo, con su motivo (contrato §3).
PREDICTORES_NO_INCLUIDOS = [
    {"var": "PERCENTIL_PGA_PROGRAMA",
     "motivo": "colinealidad con PGA_ULTIMO (mismo constructo en escala relativa)"},
    {"var": "ICFES_MATEMATICAS",
     "motivo": "colinealidad con ICFES_PUNTAJE_TOTAL (componente del agregado)"},
    {"var": "ICFES_LECTURA_CRITICA",
     "motivo": "colinealidad con ICFES_PUNTAJE_TOTAL (componente del agregado)"},
    {"var": "ICFES_INGLES",
     "motivo": "colinealidad con ICFES_PUNTAJE_TOTAL (componente del agregado)"},
    {"var": "PGA_PROMEDIO_HIST",
     "motivo": "redundante con PGA_ULTIMO (constructo desempeño)"},
    {"var": "PCT_CREDITOS_APROBADOS",
     "motivo": "redundante con trayectoria/desempeño ya representados"},
    {"var": "CREDITOS_APROBADOS_TOTAL",
     "motivo": "redundante con trayectoria (SEMESTRE_AVANCE)"},
    {"var": "PERCENTIL_PGA_NIVEL",
     "motivo": "redundante con PGA_ULTIMO (desempeño en escala relativa)"},
    {"var": "NUMERO_OPCIONES_INSCRITAS",
     "motivo": "baja pertinencia explicativa para el modelo acotado"},
]


# ===========================================================================
# Utilidades internas de redondeo y saneamiento para serialización
# ===========================================================================
def _redondear(campo: str, valor):
    """Redondea `valor` a la precisión publicada del `campo` (dict DECIMALES).

    Devuelve ``None`` si el valor no es finito (NaN/inf no son válidos en JSON).
    Si el campo no está en DECIMALES, devuelve el float tal cual (saneado).
    """
    if valor is None:
        return None
    try:
        v = float(valor)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(v):
        return None
    dec = DECIMALES.get(campo)
    if dec is None:
        return v
    return round(v, dec)


def _a_nativo(obj):
    """Convierte recursivamente numpy -> tipos nativos y NaN/inf -> None.

    Garantiza que el dict resultante sea serializable con ``json.dump`` sin
    producir ``NaN``/``Infinity`` (que JSON estándar no admite).
    """
    if isinstance(obj, dict):
        return {k: _a_nativo(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_a_nativo(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        v = float(obj)
        return v if np.isfinite(v) else None
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, float):
        return obj if np.isfinite(obj) else None
    return obj


def _magnitud_d(d: float) -> str:
    """Etiqueta de magnitud del d de Cohen (umbrales de Cohen, diseno.md §2.4)."""
    a = abs(d)
    if a < 0.20:
        return "trivial"
    if a < 0.50:
        return "pequeño"
    if a < 0.80:
        return "mediano"
    return "grande"


def _magnitud_v(v: float) -> str:
    """Etiqueta de magnitud de la V de Cramér (diseno.md §2.7)."""
    if v < 0.10:
        return "trivial"
    if v < 0.20:
        return "pequeño"
    if v < 0.30:
        return "mediano"
    return "grande"


# ===========================================================================
# API pública
# ===========================================================================
def faculty_name_map() -> dict:
    """Mapa de código de facultad -> nombre legible (desde la fuente `programas`).

    Lógica trasladada desde ``export_dashboard._faculty_name_map`` para no
    duplicarla (RF-5): carga ``programas``, elimina nulos y duplicados por
    código, y devuelve ``{codigo: nombre.title()}``.
    """
    pg = utils.load_source(
        "programas",
        columns=["CODIGO_FACULTAD_PROGRAMA_1", "DESCRIPCION_FACULTAD_PROGRAMA_1"],
        fix_encoding=True,
    )
    pg = pg.dropna().drop_duplicates("CODIGO_FACULTAD_PROGRAMA_1")
    m = pg.set_index("CODIGO_FACULTAD_PROGRAMA_1")["DESCRIPCION_FACULTAD_PROGRAMA_1"].to_dict()
    return {k: str(v).title() for k, v in m.items()}


def bh_fdr(pvalues: list) -> list:
    """Corrección de Benjamini-Hochberg (FDR) sobre una familia de p-valores.

    Implementación propia con numpy (no requiere statsmodels, RNF-2). Devuelve
    los p-valores ajustados en el **orden original** de entrada. Los ``None``
    (variables no calculables, fuera de la familia) se devuelven como ``None``.

    Procedimiento: se ordenan los p ascendentes, ``p_adj[(i)] = p_(i) * m / rango``,
    se fuerza monotonía no decreciente desde el mayor rango hacia el menor y se
    recortan a 1.0.
    """
    vals = list(pvalues)
    # Índices de los p-valores realmente numéricos (los None quedan fuera).
    idx_validos = [i for i, p in enumerate(vals) if p is not None and np.isfinite(p)]
    m = len(idx_validos)
    ajustados = [None] * len(vals)
    if m == 0:
        return ajustados

    p = np.array([vals[i] for i in idx_validos], dtype=float)
    orden = np.argsort(p, kind="mergesort")       # orden ascendente estable
    p_ordenado = p[orden]
    rangos = np.arange(1, m + 1)
    p_adj_ord = p_ordenado * m / rangos
    # Monotonía no decreciente del final hacia el principio (min acumulado inverso).
    p_adj_ord = np.minimum.accumulate(p_adj_ord[::-1])[::-1]
    p_adj_ord = np.clip(p_adj_ord, 0.0, 1.0)
    # Deshacer el orden para volver a la posición de cada p dentro de los válidos.
    p_adj = np.empty(m, dtype=float)
    p_adj[orden] = p_adj_ord
    for k, i in enumerate(idx_validos):
        ajustados[i] = float(p_adj[k])
    return ajustados


def numeric_comparison(df: pd.DataFrame, var: str, label: str) -> dict:
    """Compara una variable numérica entre participantes y no participantes.

    Calcula (diseno.md §2.3-2.5): t de Welch, Mann-Whitney U asintótica, d de
    Cohen (SD agrupada), IC95% de la diferencia de medias (Welch-Satterthwaite)
    y el resumen de boxplot con whiskers de Tukey por grupo (sin min/max crudos,
    RNF-3). Las desviaciones estándar se calculan **una sola vez** con ``ddof=1``
    y alimentan t de Welch, SE, gl, IC y el d de Cohen (una sola aritmética).

    Si la columna no existe, o algún grupo queda con n<2 tras eliminar NaN, la
    variable se devuelve como **no calculable**: conserva ``var``, ``label``,
    ``n_part`` y ``n_no``, y pone todos los estadísticos en ``None`` (queda fuera
    de la familia FDR; contrato §3, NIT 4).
    """
    base = {"var": var, "label": label}
    estadisticos_null = {
        "media_part": None, "media_no": None, "sd_part": None, "sd_no": None,
        "mediana_part": None, "q1_part": None, "q3_part": None,
        "whisker_low_part": None, "whisker_high_part": None,
        "mediana_no": None, "q1_no": None, "q3_no": None,
        "whisker_low_no": None, "whisker_high_no": None,
        "cohen_d": None, "magnitud_d": None, "dif_medias": None,
        "ic95_low": None, "ic95_high": None, "t_stat": None,
        "p_welch": None, "p_mannwhitney": None, "p_ajustada": None,
    }

    if var not in df.columns:
        return {**base, "n_part": 0, "n_no": 0, **estadisticos_null}

    # Fuerza a numérico; valores no numéricos -> NaN (contabilizados como faltantes).
    serie = pd.to_numeric(df[var], errors="coerce")
    participa = df["PARTICIPA"].astype(int)
    x_part = serie[participa == 1].dropna().to_numpy(dtype=float)
    x_no = serie[participa == 0].dropna().to_numpy(dtype=float)
    n_part, n_no = int(x_part.size), int(x_no.size)

    # No calculable: algún grupo con menos de 2 observaciones.
    if n_part < 2 or n_no < 2:
        return {**base, "n_part": n_part, "n_no": n_no, **estadisticos_null}

    # Desviaciones estándar muestrales: UNA sola definición (ddof=1).
    media_part, media_no = float(x_part.mean()), float(x_no.mean())
    sd_part, sd_no = float(x_part.std(ddof=1)), float(x_no.std(ddof=1))

    # t de Welch (varianzas desiguales): prueba principal para la narrativa.
    t_stat, p_welch = stats.ttest_ind(x_part, x_no, equal_var=False)
    # Mann-Whitney U asintótica con corrección de empates (robustez).
    _, p_mannwhitney = stats.mannwhitneyu(
        x_part, x_no, alternative="two-sided", method="asymptotic"
    )

    # d de Cohen con SD agrupada ponderada por los n reales.
    sd_pooled = np.sqrt(
        ((n_part - 1) * sd_part ** 2 + (n_no - 1) * sd_no ** 2) / (n_part + n_no - 2)
    )
    cohen_d = (media_part - media_no) / sd_pooled if sd_pooled > 0 else np.nan

    # IC95% de la diferencia de medias por Welch-Satterthwaite.
    dif_medias = media_part - media_no
    se = np.sqrt(sd_part ** 2 / n_part + sd_no ** 2 / n_no)
    gl = (sd_part ** 2 / n_part + sd_no ** 2 / n_no) ** 2 / (
        (sd_part ** 2 / n_part) ** 2 / (n_part - 1)
        + (sd_no ** 2 / n_no) ** 2 / (n_no - 1)
    )
    t_critico = stats.t.ppf(0.975, gl)
    ic95_low = dif_medias - t_critico * se
    ic95_high = dif_medias + t_critico * se

    # Resumen de boxplot (whiskers de Tukey, sin min/max crudos ni outliers).
    def _resumen_tukey(x: np.ndarray) -> dict:
        q1, mediana, q3 = np.percentile(x, [25, 50, 75])
        iqr = q3 - q1
        whisker_low = max(float(x.min()), float(q1 - 1.5 * iqr))
        whisker_high = min(float(x.max()), float(q3 + 1.5 * iqr))
        return {
            "q1": float(q1), "mediana": float(mediana), "q3": float(q3),
            "whisker_low": whisker_low, "whisker_high": whisker_high,
        }

    r_part = _resumen_tukey(x_part)
    r_no = _resumen_tukey(x_no)

    resultado = {
        **base,
        "n_part": n_part, "n_no": n_no,
        "media_part": _redondear("media_part", media_part),
        "media_no": _redondear("media_no", media_no),
        "sd_part": _redondear("sd_part", sd_part),
        "sd_no": _redondear("sd_no", sd_no),
        "mediana_part": _redondear("mediana_part", r_part["mediana"]),
        "q1_part": _redondear("q1_part", r_part["q1"]),
        "q3_part": _redondear("q3_part", r_part["q3"]),
        "whisker_low_part": _redondear("whisker_low_part", r_part["whisker_low"]),
        "whisker_high_part": _redondear("whisker_high_part", r_part["whisker_high"]),
        "mediana_no": _redondear("mediana_no", r_no["mediana"]),
        "q1_no": _redondear("q1_no", r_no["q1"]),
        "q3_no": _redondear("q3_no", r_no["q3"]),
        "whisker_low_no": _redondear("whisker_low_no", r_no["whisker_low"]),
        "whisker_high_no": _redondear("whisker_high_no", r_no["whisker_high"]),
        "cohen_d": _redondear("cohen_d", cohen_d),
        "magnitud_d": _magnitud_d(cohen_d) if np.isfinite(cohen_d) else None,
        "dif_medias": _redondear("dif_medias", dif_medias),
        "ic95_low": _redondear("ic95_low", ic95_low),
        "ic95_high": _redondear("ic95_high", ic95_high),
        "t_stat": _redondear("t_stat", t_stat),
        "p_welch": _redondear("p_welch", p_welch),
        "p_mannwhitney": _redondear("p_mannwhitney", p_mannwhitney),
        "p_ajustada": None,   # se rellena en compute_comparative tras el FDR por familia
    }
    return resultado


def categorical_comparison(df: pd.DataFrame, var: str, label: str, min_n: int = 30) -> dict:
    """Compara una variable categórica entre participantes y no participantes.

    Normaliza la categórica con ``fillna("Sin dato").astype(str)`` (y FACULTAD a
    nombre legible), IDÉNTICO al cubo del dashboard. Suprime categorías con
    ``n < min_n`` (RNF-3) y las cuenta en ``categorias_suprimidas``; construye la
    tabla de contingencia categoría × PARTICIPA, aplica chi-cuadrado de
    independencia (sin corrección de Yates en tablas >2×2) y la V de Cramér
    (diseno.md §2.7).

    Tabla degenerada (una sola categoría tras supresión, o columna de ceros): la
    variable queda como **no calculable** (estadísticos en ``None``, fuera de FDR;
    contrato §3).
    """
    base = {"var": var, "label": label}
    estadisticos_null = {
        "chi2": None, "dof": None, "p": None,
        "cramers_v": None, "magnitud_v": None, "p_ajustada": None,
    }

    if var not in df.columns:
        return {**base, **estadisticos_null, "categorias_suprimidas": 0, "tabla": []}

    # Normalización idéntica al cubo (N3 de la revisión).
    if var == "FACULTAD":
        fac_map = faculty_name_map()
        cat = df[var].map(lambda c: fac_map.get(c, c)).fillna("Sin dato").astype(str)
    else:
        cat = df[var].fillna("Sin dato").astype(str)
    participa = df["PARTICIPA"].astype(int)

    tmp = pd.DataFrame({"cat": cat.to_numpy(), "part": participa.to_numpy()})
    conteos = tmp.groupby("cat")["part"].agg(n="size", n_part="sum").reset_index()
    conteos["n"] = conteos["n"].astype(int)
    conteos["n_part"] = conteos["n_part"].astype(int)

    # Supresión por privacidad: categorías con n < min_n no se publican ni entran al chi².
    conservadas = conteos[conteos["n"] >= min_n].copy()
    categorias_suprimidas = int((conteos["n"] < min_n).sum())

    # Tabla degenerada: menos de 2 categorías conservadas.
    if len(conservadas) < 2:
        return {**base, **estadisticos_null,
                "categorias_suprimidas": categorias_suprimidas, "tabla": []}

    # Tabla de contingencia categoría × PARTICIPA {0,1}.
    conservadas["n_no"] = conservadas["n"] - conservadas["n_part"]
    tabla_cont = conservadas[["n_part", "n_no"]].to_numpy()

    # Si alguna columna total es cero, el chi² no es válido -> no calculable.
    if tabla_cont.sum(axis=0).min() == 0:
        return {**base, **estadisticos_null,
                "categorias_suprimidas": categorias_suprimidas, "tabla": []}

    chi2, p, dof, _ = stats.chi2_contingency(tabla_cont, correction=False)
    n_total = int(tabla_cont.sum())
    k = min(tabla_cont.shape)  # min(filas, columnas); columnas = 2 (participa)
    cramers_v = np.sqrt(chi2 / (n_total * (k - 1))) if n_total > 0 and k > 1 else np.nan

    # Filas de la tabla publicada: tasa de participación por categoría, ordenadas
    # por tasa descendente para lectura directa.
    conservadas["tasa_pct"] = 100 * conservadas["n_part"] / conservadas["n"]
    conservadas = conservadas.sort_values("tasa_pct", ascending=False)
    tabla = [
        {
            "categoria": str(r.cat),
            "n": int(r.n),
            "n_part": int(r.n_part),
            "tasa_pct": _redondear("tasa_pct", r.tasa_pct),
        }
        for r in conservadas.itertuples(index=False)
    ]

    return {
        **base,
        "chi2": _redondear("chi2", chi2),
        "dof": int(dof),
        "p": _redondear("p", p),
        "cramers_v": _redondear("cramers_v", cramers_v),
        "magnitud_v": _magnitud_v(cramers_v) if np.isfinite(cramers_v) else None,
        "p_ajustada": None,   # se rellena en compute_comparative tras el FDR por familia
        "categorias_suprimidas": categorias_suprimidas,
        "tabla": tabla,
    }


def logistic_model(df: pd.DataFrame, predictors, n_boot: int = 1000, seed: int = RANDOM_SEED) -> dict:
    """Regresión logística multivariada (scikit-learn) + IC95% por bootstrap.

    Predictores numéricos estandarizados (z-score) sobre el subconjunto de casos
    completos (listwise). Modelo:
    ``LogisticRegression(penalty=None, class_weight='balanced', solver='lbfgs',
    max_iter=1000, random_state=seed)``. ``odds_ratio = exp(coef)``.

    IC95% por **bootstrap percentil** (B=n_boot): en cada réplica se recomputa la
    estandarización sobre la muestra remuestreada antes de reajustar (semilla por
    réplica = ``seed + i``); las réplicas sin ambas clases se descartan y se
    registra ``replicas_descartadas_pct`` (diseno.md §2.8). No hay p-valores
    analíticos (sin statsmodels): ``p = null`` por predictor.

    Estados no felices (contrato §3): si el modelo no converge o no es viable,
    ``meta_modelo.convergio=false`` / ``modo='no_disponible'`` y ``predictores=[]``.
    """
    cols = [p[0] for p in predictors]
    etiquetas = {p[0]: p[1] for p in predictors}
    n_pregrado = int(len(df))

    meta_modelo = {
        "modo": "multivariado",
        "convergio": True,
        "replicas_descartadas_pct": 0.0,
        "n_efectivo": 0,
        "n_pregrado": n_pregrado,
        "alcance_modelo": "factores academicos/edad; sin covariables socioeconomicas/estructurales",
        "tratamiento_faltantes": "caso completo (listwise)",
        "estandarizacion": "z-score recomputado por réplica (punto estimado sobre casos completos)",
        "metodo_ic": "bootstrap percentil (B=%d, semilla %d)" % (n_boot, seed),
        "class_weight": "balanced",
        "nota": (
            "OR y bootstrap son aproximación; sin p-valores analíticos (sin statsmodels); "
            "equidad socioeconómica no controlada por desempeño (ver univariadas)"
        ),
        "predictores_no_incluidos": PREDICTORES_NO_INCLUIDOS,
    }

    def _no_disponible(motivo: str) -> dict:
        meta_modelo["modo"] = "no_disponible"
        meta_modelo["convergio"] = False
        meta_modelo["nota"] = meta_modelo["nota"] + " | " + motivo
        return {"meta_modelo": meta_modelo, "predictores": []}

    # Columnas presentes; las ausentes invalidan el modelo multivariado.
    faltantes = [c for c in cols if c not in df.columns]
    if faltantes:
        return _no_disponible("columnas ausentes: " + ", ".join(faltantes))

    # Caso completo: solo filas con TODOS los predictores presentes.
    num = df[cols].apply(pd.to_numeric, errors="coerce")
    y = df["PARTICIPA"].astype(int).to_numpy()
    mascara = num.notna().all(axis=1).to_numpy()
    X_full = num[mascara].to_numpy(dtype=float)
    y_full = y[mascara]
    n_efectivo = int(X_full.shape[0])
    meta_modelo["n_efectivo"] = n_efectivo

    # Debe haber ambas clases y suficientes casos para ajustar.
    if n_efectivo < 2 or len(np.unique(y_full)) < 2:
        return _no_disponible("caso completo sin ambas clases o n insuficiente")

    def _ajustar(X: np.ndarray, yv: np.ndarray):
        """Estandariza (z-score) y ajusta la logística; devuelve (coefs, convergio)."""
        mu = X.mean(axis=0)
        sigma = X.std(axis=0, ddof=0)
        sigma = np.where(sigma == 0, 1.0, sigma)   # evita división por cero
        Xz = (X - mu) / sigma
        with warnings.catch_warnings():
            warnings.simplefilter("error", ConvergenceWarning)
            modelo = LogisticRegression(
                penalty=None, class_weight="balanced", solver="lbfgs",
                max_iter=1000, random_state=seed,
            )
            try:
                modelo.fit(Xz, yv)
            except ConvergenceWarning:
                return None, False
        return modelo.coef_[0], True

    coefs, convergio = _ajustar(X_full, y_full)
    if not convergio or coefs is None:
        return _no_disponible("la logística no convergió en el ajuste principal")

    # Bootstrap percentil del odds ratio (z-score recomputado por réplica).
    rng_base = np.random.default_rng(seed)
    or_boot = []
    descartadas = 0
    for i in range(n_boot):
        rng = np.random.default_rng(seed + i)
        idx = rng.integers(0, n_efectivo, size=n_efectivo)
        Xb, yb = X_full[idx], y_full[idx]
        if len(np.unique(yb)) < 2:
            descartadas += 1
            continue
        coefs_b, ok = _ajustar(Xb, yb)
        if not ok or coefs_b is None:
            descartadas += 1
            continue
        or_boot.append(np.exp(coefs_b))

    _ = rng_base  # (semilla base documentada; las réplicas usan seed+i)
    replicas_validas = len(or_boot)
    meta_modelo["replicas_descartadas_pct"] = _redondear(
        "replicas_descartadas_pct", 100 * descartadas / n_boot if n_boot else 0.0
    )
    if descartadas > 0.05 * n_boot:
        meta_modelo["nota"] += " | >5% de réplicas bootstrap descartadas (IC menos estable)"

    or_boot_arr = np.array(or_boot) if replicas_validas > 0 else None
    odds_ratios = np.exp(coefs)

    predictores_out = []
    for j, c in enumerate(cols):
        if or_boot_arr is not None:
            ic_low = float(np.percentile(or_boot_arr[:, j], 2.5))
            ic_high = float(np.percentile(or_boot_arr[:, j], 97.5))
        else:
            ic_low = ic_high = None
        predictores_out.append({
            "predictor": c,
            "label": etiquetas[c],
            "coef": _redondear("coef", coefs[j]),
            "odds_ratio": _redondear("odds_ratio", odds_ratios[j]),
            "ic95_low": _redondear("ic95_low", ic_low),
            "ic95_high": _redondear("ic95_high", ic_high),
            "p": None,   # sin p-valor analítico
        })

    return {"meta_modelo": meta_modelo, "predictores": predictores_out}


def compute_comparative(df: pd.DataFrame, scope: str = "pregrado") -> dict:
    """Orquesta el análisis comparativo completo y devuelve el dict del contrato §3.

    Filtra por alcance (``pregrado`` -> ``ES_PREGRADO == True``), corre las
    comparaciones numéricas y categóricas, aplica Benjamini-Hochberg **por familia**
    (numéricas sobre ``p_welch``; categóricas sobre el ``p`` de chi²; la logística
    queda fuera), ajusta el modelo logístico y arma el bloque ``meta``.

    Validaciones (diseno.md §7): ``PARTICIPA`` debe ser binaria {0,1} (si no,
    ``ValueError``); ``ES_PREGRADO`` debe existir para el filtro de alcance.
    """
    if "PARTICIPA" not in df.columns:
        raise ValueError("Falta la columna PARTICIPA en el DataFrame.")
    valores_participa = set(pd.unique(df["PARTICIPA"].dropna()))
    if not valores_participa <= {0, 1}:
        raise ValueError(
            "PARTICIPA debe ser binaria {0,1}; valores hallados: %s" % sorted(valores_participa)
        )

    if scope == "pregrado":
        if "ES_PREGRADO" not in df.columns:
            raise ValueError("Falta la columna ES_PREGRADO para el filtro de alcance.")
        sub = df[df["ES_PREGRADO"] == True].copy()  # noqa: E712 (comparación explícita a True)
        alcance = "Pregrado"
    elif scope == "global":
        sub = df.copy()
        alcance = "Global"
    else:
        raise ValueError("scope debe ser 'pregrado' o 'global'; se recibió %r" % scope)

    participa = sub["PARTICIPA"].astype(int)
    n_part = int((participa == 1).sum())
    n_no = int((participa == 0).sum())
    tasa_base_pct = 100 * participa.mean() if len(participa) else np.nan

    # --- Numéricas ---
    numericas = [numeric_comparison(sub, var, label) for var, label in NUMERICAS]
    p_welch_familia = [x["p_welch"] for x in numericas]  # None si no calculable (fuera de FDR)
    p_adj_num = bh_fdr(p_welch_familia)
    for x, p_adj in zip(numericas, p_adj_num):
        x["p_ajustada"] = _redondear("p_ajustada", p_adj) if p_adj is not None else None

    # --- Categóricas ---
    categoricas = [categorical_comparison(sub, var, label) for var, label in CATEGORICAS]
    p_chi_familia = [x["p"] for x in categoricas]        # None si no calculable (fuera de FDR)
    p_adj_cat = bh_fdr(p_chi_familia)
    for x, p_adj in zip(categoricas, p_adj_cat):
        x["p_ajustada"] = _redondear("p_ajustada", p_adj) if p_adj is not None else None

    # --- Logística (fuera de FDR) ---
    logistica = logistic_model(sub, LOGIT_PREDICTORS, n_boot=1000, seed=RANDOM_SEED)

    meta = {
        "alcance": alcance,
        "n_part": n_part,
        "n_no": n_no,
        "tasa_base_pct": _redondear("tasa_base_pct", tasa_base_pct),
        "metodo": {
            "numericas": (
                "t de Welch (principal) + Mann-Whitney U asintótica con corrección de "
                "empates (robustez); d de Cohen; IC95% de la diferencia de medias"
            ),
            "categoricas": "chi-cuadrado de independencia + V de Cramer",
            "logistica": (
                "LogisticRegression(penalty=None, class_weight='balanced'); OR=exp(coef); "
                "IC95% por bootstrap (B=1000)"
            ),
        },
        "correccion": {
            "metodo": "Benjamini-Hochberg (FDR)",
            "nivel": 0.05,
            "familias": {
                "numericas": "todos los p_welch de las numericas conservadas",
                "categoricas": "todos los p (chi2) de las categoricas conservadas",
                "logistica": "sin correccion (sin p-valores analiticos)",
            },
        },
        "semilla": RANDOM_SEED,
        "umbral_grupo": 30,
        "descartadas": DESCARTADAS,
        "generado": pd.Timestamp.now().strftime("%Y-%m-%d"),
    }

    out = {
        "meta": meta,
        "numericas": numericas,
        "categoricas": categoricas,
        "logistica": logistica,
    }
    # Saneamiento final: numpy -> nativo, NaN/inf -> None antes de serializar.
    return _a_nativo(out)
