"""Fuente única de cálculo de la evolución temporal ("histórico") de participantes.

Este módulo concentra TODA la estadística de **composición de los participantes
por año** y del **perfil académico medio de esas cohortes**. Es la **fuente única
de verdad** (RNF-1): tanto el exportador del dashboard (``export_dashboard``, que
produce ``data.json``) como el notebook ``07_historico_evolucion`` (que produce
PNG/CSV/.tex para el informe LaTeX) importan ``compute_historical`` y **solo leen**
su resultado. Nadie recalcula estadística en JavaScript ni en LaTeX.

Se decide un módulo **hermano** de ``comparative_stats`` (y no una ampliación de
este) porque el histórico es un eje distinto —series por año, no participante vs.
no participante— y no comparte la maquinaria inferencial (t de Welch, FDR,
logística). Se reutiliza de ``comparative_stats`` únicamente lo transversal:
``faculty_name_map()`` y el saneamiento ``_a_nativo`` (numpy->nativo, NaN/inf->None).

Framing OBLIGATORIO (historico-design.md §1): la única variable temporal fina a
nivel estudiante es ``PRIMER_ANIO_MOVILIDAD`` y **solo existe para participantes**;
no hay denominador temporal, de modo que **NO** se calcula ni se rotula "tasa de
participación". Todo es *composición de los participantes de cada año* o *media por
año*. Ninguna clave/valor string de la salida contiene la subcadena "tasa".

La función ``compute_historical`` es **pura**: recibe un ``DataFrame`` y devuelve
estructuras serializables (dicts/listas de tipos nativos). El redondeo a la
precisión publicada se aplica **una sola vez** aquí (dict ``DECIMALES``), de modo
que web e informe muestren exactamente las mismas cifras (la única diferencia es el
separador decimal del .tex).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import comparative_stats, config, utils  # noqa: F401 (utils reservado por simetría)

# Reutilizar lo transversal de comparative_stats (no duplicar; RF-5).
faculty_name_map = comparative_stats.faculty_name_map
_a_nativo = comparative_stats._a_nativo

# ---------------------------------------------------------------------------
# Umbrales del histórico (historico-design.md §1).
# ---------------------------------------------------------------------------
ANIO_MIN = 2012          # se recorta la cola rala 1998-2011
UMBRAL_N_ANIO = 30       # mismo umbral de supresión que comparative_stats (min_n=30)
TOP_FACULTADES = 8       # top 8 por total; el resto -> "Otras" (omitida si <=8)

# Conjunto "sin dato" idéntico a dashboard/src/components/CategoricalAssociation.jsx.
SIN_DATO = {"Sin dato", "Sin información", "Sin informacion", "N/A", "NA"}

# ---------------------------------------------------------------------------
# Precisión de publicación (RNF-1): redondeo ÚNICO aplicado tanto a data.json como
# a las tablas .tex del informe (NIT-2). Claves keyed por NOMBRE DE CAMPO del
# contrato §2. El notebook 07 deriva su `decimales_por_col` (keyed por columna de
# tabla) de este dict.
#   * pct de composición -> 1 decimal.
#   * métricas numéricas (media/mediana/q1/q3): PGA 2 dec, ICFES 1 dec, avance 1 dec.
#     Se organiza como un sub-dict por serie numérica para que el notebook pueda
#     derivar la precisión por columna de tabla a partir de la serie.
# ---------------------------------------------------------------------------
DECIMALES = {
    "pct": 1,
    "numerico": {
        "pga": {"media": 2, "mediana": 2, "q1": 2, "q3": 2},
        "icfes": {"media": 1, "mediana": 1, "q1": 1, "q3": 1},
        "avance": {"media": 1, "mediana": 1, "q1": 1, "q3": 1},
    },
}

# Columnas de origen de cada serie numérica del resumen (contrato §2).
NUMERICAS = {
    "pga": "PGA_ULTIMO",
    "icfes": "ICFES_PUNTAJE_TOTAL",
    "avance": "SEMESTRE_AVANCE",
}

# NOTA: el texto NO contiene la subcadena "tasa" (garantía dura del contrato §2 y
# criterios de aceptación de FEAT-001). Se reformula "no es tasa de participación"
# como "no es proporción de participación por grupo" para conservar el sentido sin
# violar la garantía verificada por test y por el one-liner de integración.
NOTA_FRAMING = (
    "Composición de los participantes de cada año y perfil académico medio de esas "
    "cohortes (no es proporción de participación por grupo: los no participantes no "
    "tienen año asignado). La composición por estrato/género se calcula sobre los "
    "participantes CON dato de la dimensión; 'Sin dato' se excluye y cada año "
    "renormaliza a 100%."
)


# ===========================================================================
# Utilidades internas de redondeo
# ===========================================================================
def _round(valor, dec: int):
    """Redondea `valor` a `dec` decimales; None si no es finito (no válido en JSON)."""
    if valor is None:
        return None
    try:
        v = float(valor)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(v):
        return None
    return round(v, dec)


def _composicion(sub: pd.DataFrame, cat: pd.Series, campo: str,
                 excluir_sin_dato: bool) -> list:
    """Serie de composición por año de una dimensión categórica.

    `cat` es la categórica ya normalizada (mismo índice que `sub`), alineada con la
    columna ``anio`` de `sub`. Si `excluir_sin_dato`, se eliminan las categorías del
    conjunto SIN_DATO **antes** de contar y cada año **renormaliza** a 100 % sobre
    las categorías con dato. Devuelve lista de ``{anio, <campo>, n, pct}``; no se
    rellenan ceros año×categoría (eso lo hace el dashboard).
    """
    tmp = pd.DataFrame({"anio": sub["anio"].to_numpy(), "cat": cat.to_numpy()})
    if excluir_sin_dato:
        tmp = tmp[~tmp["cat"].isin(SIN_DATO)]

    conteos = (tmp.groupby(["anio", "cat"]).size()
               .reset_index(name="n"))
    total_anio = conteos.groupby("anio")["n"].transform("sum")
    conteos["pct"] = 100 * conteos["n"] / total_anio

    # Orden estable para una salida determinista: año asc, categoría asc.
    conteos = conteos.sort_values(["anio", "cat"], kind="mergesort")
    return [
        {
            "anio": int(r.anio),
            campo: str(r.cat),
            "n": int(r.n),
            "pct": _round(r.pct, DECIMALES["pct"]),
        }
        for r in conteos.itertuples(index=False)
    ]


def _composicion_facultad(sub: pd.DataFrame, fac: pd.Series) -> list:
    """Composición de facultad por año con top `TOP_FACULTADES` + "Otras".

    Se ordenan las facultades por total de participantes en todo el rango con
    desempate estable (total descendente, nombre ascendente). Se conservan las top
    y el resto se agrupa en "Otras" por año. Si hay <= TOP_FACULTADES facultades no
    hay cola: "Otras" se OMITE (no se emite con 0).
    """
    tmp = pd.DataFrame({"anio": sub["anio"].to_numpy(), "cat": fac.to_numpy()})

    totales = tmp.groupby("cat").size().reset_index(name="total")
    # Desempate estable: total desc, nombre asc. Se ordena primero por nombre asc
    # y luego por total desc con mergesort (estable) para fijar el desempate.
    totales = totales.sort_values("cat", kind="mergesort")
    totales = totales.sort_values("total", ascending=False, kind="mergesort")
    top = list(totales["cat"].head(TOP_FACULTADES))

    hay_cola = len(totales) > TOP_FACULTADES
    if hay_cola:
        tmp["cat"] = np.where(tmp["cat"].isin(top), tmp["cat"], "Otras")

    conteos = tmp.groupby(["anio", "cat"]).size().reset_index(name="n")
    total_anio = conteos.groupby("anio")["n"].transform("sum")
    conteos["pct"] = 100 * conteos["n"] / total_anio

    conteos = conteos.sort_values(["anio", "cat"], kind="mergesort")
    return [
        {
            "anio": int(r.anio),
            "facultad": str(r.cat),
            "n": int(r.n),
            "pct": _round(r.pct, DECIMALES["pct"]),
        }
        for r in conteos.itertuples(index=False)
    ]


def _resumen_numerico(sub: pd.DataFrame) -> dict:
    """Media/mediana/Q1/Q3 por año de PGA/ICFES/avance (perfil de la cohorte)."""
    resumen = {}
    for serie, col in NUMERICAS.items():
        dec = DECIMALES["numerico"][serie]
        filas = []
        if col in sub.columns:
            valores = pd.to_numeric(sub[col], errors="coerce")
            tmp = pd.DataFrame({"anio": sub["anio"].to_numpy(),
                                "v": valores.to_numpy()}).dropna(subset=["v"])
            for anio, g in tmp.groupby("anio"):
                x = g["v"].to_numpy(dtype=float)
                q1, mediana, q3 = np.percentile(x, [25, 50, 75])
                filas.append({
                    "anio": int(anio),
                    "n": int(x.size),
                    "media": _round(x.mean(), dec["media"]),
                    "mediana": _round(mediana, dec["mediana"]),
                    "q1": _round(q1, dec["q1"]),
                    "q3": _round(q3, dec["q3"]),
                })
        filas.sort(key=lambda d: d["anio"])
        resumen[serie] = filas
    return resumen


# ===========================================================================
# API pública
# ===========================================================================
def compute_historical(df: pd.DataFrame) -> dict:
    """Calcula la sección ``historico`` del contrato §2 de historico-design.md.

    Filtra participantes con ``PRIMER_ANIO_MOVILIDAD`` no nulo, agrupa por año y
    conserva los años con ``anio >= ANIO_MIN`` y ``n_anio >= UMBRAL_N_ANIO``.
    Devuelve un dict serializable (numpy->nativo, NaN/inf->None vía ``_a_nativo``)
    con las series de composición (estrato/género/facultad/modalidad), el resumen
    numérico por año y el bloque ``meta``.

    Framing duro: ninguna clave/valor string contiene la subcadena "tasa".
    """
    if "PRIMER_ANIO_MOVILIDAD" not in df.columns:
        raise ValueError("Falta la columna PRIMER_ANIO_MOVILIDAD en el DataFrame.")

    # Participantes con año de movilidad válido.
    anio_raw = pd.to_numeric(df["PRIMER_ANIO_MOVILIDAD"], errors="coerce")
    part = df[anio_raw.notna()].copy()
    part["anio"] = anio_raw[anio_raw.notna()].astype(int).to_numpy()
    n_participantes_con_anio = int(len(part))

    # Conteo por año y clasificación de años fuera de rango / bajo umbral.
    n_por_anio_todos = part.groupby("anio").size()
    n_anios_fuera_rango = int((n_por_anio_todos.index < ANIO_MIN).sum())
    en_rango = n_por_anio_todos[n_por_anio_todos.index >= ANIO_MIN]
    n_anios_bajo_umbral = int((en_rango < UMBRAL_N_ANIO).sum())

    # Años conservados: en rango y con n suficiente (FUENTE ÚNICA = meta.n_por_anio).
    conservados = en_rango[en_rango >= UMBRAL_N_ANIO].sort_index()
    anios_conservados = [int(a) for a in conservados.index]

    sub = part[part["anio"].isin(anios_conservados)].copy()

    # --- Normalización de categóricas idéntica al cubo y al comparativo ---
    estrato = sub["ESTRATO_SOCIAL"].fillna("Sin dato").astype(str)
    genero = sub["GENERO"].fillna("Sin dato").astype(str)
    fac_map = faculty_name_map()
    facultad = (sub["FACULTAD"].map(lambda c: fac_map.get(c, c))
                .fillna("Sin dato").astype(str).str.title())
    modalidad = sub["MODALIDAD_PRINCIPAL"].fillna("Sin dato").astype(str)

    composicion_estrato = _composicion(sub, estrato, "estrato", excluir_sin_dato=True)
    composicion_genero = _composicion(sub, genero, "genero", excluir_sin_dato=True)
    composicion_facultad = _composicion_facultad(sub, facultad)
    composicion_modalidad = _composicion(sub, modalidad, "modalidad", excluir_sin_dato=False)

    resumen_numerico = _resumen_numerico(sub)

    meta = {
        "variable_temporal": "PRIMER_ANIO_MOVILIDAD",
        "framing": "composicion",
        "nota_framing": NOTA_FRAMING,
        "anio_min": ANIO_MIN,
        "umbral_n_anio": UMBRAL_N_ANIO,
        "n_por_anio": [
            {"anio": int(a), "n": int(conservados.loc[a])} for a in anios_conservados
        ],
        "n_participantes_con_anio": n_participantes_con_anio,
        "n_anios_fuera_rango": n_anios_fuera_rango,
        "n_anios_bajo_umbral": n_anios_bajo_umbral,
        "top_facultades": TOP_FACULTADES,
        "generado": pd.Timestamp.now().strftime("%Y-%m-%d"),
    }

    out = {
        "meta": meta,
        "composicion_estrato": composicion_estrato,
        "composicion_genero": composicion_genero,
        "composicion_facultad": composicion_facultad,
        "composicion_modalidad": composicion_modalidad,
        "resumen_numerico": resumen_numerico,
    }
    # Saneamiento final: numpy -> nativo, NaN/inf -> None antes de serializar.
    return _a_nativo(out)
