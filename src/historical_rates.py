"""Fuente única de cálculo de la TASA DE INICIO DE MOVILIDAD por grupo y año.

Este módulo es **hermano** de ``historical_stats`` (y no una ampliación de él)
porque introduce un eje con **denominador reconstruido** y una **fuente adicional**
(``historial_rendimiento``): la tasa de inicio de movilidad por año y grupo. Se
mantiene separado para no contaminar la garantía "sin «tasa»" de ``historical_stats``
ni sus tests. Tanto el exportador del dashboard (``export_dashboard``, que produce
``data.json``) como el notebook ``07_historico_evolucion`` importan
``compute_historical_rates`` y **solo leen** su resultado (RNF-1: fuente única).

Framing (diseño §2.1): **Opción A**. Para cada año Y se define el conjunto de
estudiantes **activos** (al menos un registro en ``historial_rendimiento`` ese año,
único por estudiante y año). La tasa por grupo es

    tasa_pct = 100 * num / den

donde ``den`` = activos del grupo en Y y ``num`` = activos del grupo en Y cuyo
``PRIMER_ANIO_MOVILIDAD == Y``. Por construcción el numerador es un **subconjunto**
del denominador (``num <= den``), de modo que la tasa está siempre en ``[0, 100]``.
Es un **flujo de inicio**, no prevalencia ni stock; es asociación observada, no causa.

La función ``compute_historical_rates`` es **pura**: recibe dos ``DataFrame`` y
devuelve estructuras serializables (dicts/listas de tipos nativos). El redondeo a la
precisión publicada se aplica **una sola vez** aquí (``DECIMALES_TASA``), de modo
que web e informe muestren exactamente las mismas cifras.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from . import comparative_stats, config, historical_stats, utils

# Reutilizar lo transversal (no duplicar; RF-5).
faculty_name_map = comparative_stats.faculty_name_map
_a_nativo = comparative_stats._a_nativo
SIN_DATO = historical_stats.SIN_DATO

KEY = config.STUDENT_KEY  # 'CODIGO_ESTUDIANTE'

# ---------------------------------------------------------------------------
# Constantes del módulo (diseño §2.6). El rango se publica en meta para que
# React y el informe no lo hardcodeen.
# ---------------------------------------------------------------------------
TASA_ANIO_MIN = 2012
TASA_ANIO_MAX = 2023
UMBRAL_DEN = 100
DECIMALES_TASA = 2
TOP_FACULTADES = historical_stats.TOP_FACULTADES  # 8 (mismo top del histórico)
DIMENSIONES = ["estrato", "genero", "facultad", "nivel", "tipo_admision"]

# Mapa de columnas crudas del dataset analítico por dimensión del contrato.
COLS_CRUDAS = {
    "estrato": "ESTRATO_SOCIAL",
    "genero": "GENERO",
    "facultad": "FACULTAD",
    "nivel": "NIVEL",
    "tipo_admision": "TIPO_ADMISION",
}

# Etiquetas legibles de cada dimensión (contrato §2.3).
LABELS = {
    "estrato": "Estrato social",
    "genero": "Género",
    "facultad": "Facultad",
    "nivel": "Nivel académico",
    "tipo_admision": "Tipo de admisión",
}

# ---------------------------------------------------------------------------
# Textos canónicos de encuadre (contrato §2.3). Viven en Python para que web e
# informe cuenten lo mismo, igual que historical_stats.NOTA_FRAMING.
# ---------------------------------------------------------------------------
DEFINICION_ACTIVO = (
    "Estudiante con al menos un registro en historial_rendimiento cuyo año == Y "
    "(clave CODIGO_ESTUDIANTE+PERIODO, año vía periodo_to_year). Único por "
    "estudiante y año."
)
DEFINICION_NUMERADOR = (
    "Estudiantes ACTIVOS en Y cuyo PRIMER_ANIO_MOVILIDAD == Y, por categoría. "
    "Subconjunto del denominador por construcción (num <= den; tasa en [0,100])."
)
DEFINICION_TASA = "tasa_pct = 100 * num / den, por (dimension, anio, categoria)."
NOTA_FRAMING = (
    "Tasa de inicio de movilidad por año = estudiantes activos ese año cuyo primer "
    "evento ocurrió ese año / estudiantes activos ese año, por grupo. El numerador "
    "es un subconjunto del denominador (ambos restringidos a activos), por lo que la "
    "tasa está siempre en [0,100]. 'Activo' = al menos un registro en "
    "historial_rendimiento ese año. Es un flujo de inicio, no prevalencia ni stock. "
    "Excluye 'Sin dato' en numerador y denominador. Asociación observada, no causa."
)
NOTA_DIMENSIONES = (
    "Se excluyen 'programa' (demasiadas categorías) y 'modalidad' (es atributo del "
    "evento, no del estudiante activo; no define denominador poblacional)."
)
NOTA_RANGO = (
    "2024-2026 se excluyen por cohortes/numerador incompletos (rezago de registro). "
    "2012 coincide con el piso del histórico de composición. Fallback MANUAL a 2022 "
    "solo si den_global(2023) < 0.6*den_global(2022) (el exportador advierte; no "
    "cambia el valor solo)."
)


# ===========================================================================
# Utilidades internas
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


def _normaliza_dims(frame: pd.DataFrame) -> pd.DataFrame:
    """Normaliza las 5 dimensiones del frame fusionado activos↔analítico.

    Replica **literalmente** el bloque de normalización de
    ``historical_stats.compute_historical`` (diseño §2.6): para
    estrato/género/nivel/tipo_admision ``col.fillna('Sin dato').astype(str)``;
    para facultad ``col.map(fac_map).fillna('Sin dato').astype(str).str.title()``.

    Se aplica UNA sola vez al frame fusionado, de modo que numerador y denominador
    salen de la misma normalización y es imposible que diverjan (Hallazgos 2 y 4).
    Escribe el resultado en columnas con el nombre lógico de la dimensión.
    """
    frame = frame.copy()
    fac_map = faculty_name_map()
    for dim, col in COLS_CRUDAS.items():
        if dim == "facultad":
            frame[dim] = (frame[col].map(lambda c: fac_map.get(c, c))
                          .fillna("Sin dato").astype(str).str.title())
        else:
            frame[dim] = frame[col].fillna("Sin dato").astype(str)
    return frame


def _top8_facultad(base: pd.DataFrame) -> pd.DataFrame:
    """Colapsa las facultades fuera del top-8 a 'Otras' en ``base['facultad']``.

    El top-8 se calcula **una sola vez** sobre la población de referencia (los
    activos del rango, = todas las filas de ``base``) con el mismo desempate
    estable de ``_composicion_facultad`` (total desc, nombre asc, mergesort). Se
    aplica idéntico al numerador y al denominador porque opera sobre la columna
    compartida ``facultad`` antes de separar num/den. Si hay <=8 facultades no hay
    cola y no se crea 'Otras'.
    """
    base = base.copy()
    totales = base.groupby("facultad").size().reset_index(name="total")
    # Desempate estable: total desc, nombre asc (mergesort estable, dos pasadas).
    totales = totales.sort_values("facultad", kind="mergesort")
    totales = totales.sort_values("total", ascending=False, kind="mergesort")
    top = list(totales["facultad"].head(TOP_FACULTADES))
    if len(totales) > TOP_FACULTADES:
        base["facultad"] = np.where(base["facultad"].isin(top),
                                    base["facultad"], "Otras")
    return base


def _serie_dimension(base: pd.DataFrame, dim: str) -> list:
    """Construye la lista de celdas {anio, categoria, num, den, tasa_pct} de ``dim``.

    Excluye 'Sin dato' (idéntico en num y den), cuenta denominador y numerador sobre
    el **mismo** subconjunto ``g``, une por (anio, cat) rellenando num faltante con 0,
    filtra ``den >= UMBRAL_DEN``, redondea la tasa una sola vez y ordena de forma
    determinista (anio asc, categoria asc).
    """
    g = base[~base[dim].isin(SIN_DATO)]

    den = g.groupby(["anio", dim]).size().reset_index(name="den")
    num = (g[g["inicia"]].groupby(["anio", dim]).size()
           .reset_index(name="num"))

    celdas = den.merge(num, on=["anio", dim], how="left")
    celdas["num"] = celdas["num"].fillna(0).astype(int)
    celdas = celdas[celdas["den"] >= UMBRAL_DEN].copy()
    celdas["tasa_pct"] = [
        _round(100.0 * n / d, DECIMALES_TASA)
        for n, d in zip(celdas["num"], celdas["den"])
    ]
    celdas = celdas.rename(columns={dim: "categoria"})
    celdas["categoria"] = celdas["categoria"].astype(str)
    celdas = celdas.sort_values("categoria", kind="mergesort")
    celdas = celdas.sort_values("anio", kind="mergesort")
    return [
        {
            "anio": int(r.anio),
            "categoria": str(r.categoria),
            "num": int(r.num),
            "den": int(r.den),
            "tasa_pct": r.tasa_pct,
        }
        for r in celdas.itertuples(index=False)
    ]


# ===========================================================================
# API pública
# ===========================================================================
def compute_historical_rates(df: pd.DataFrame, rend: pd.DataFrame) -> dict:
    """Calcula la clave ``historico_tasas`` del contrato §2.3 de design.md.

    Parámetros
    ----------
    df : DataFrame
        Dataset analítico (una fila por estudiante) con ``PRIMER_ANIO_MOVILIDAD`` y
        las 5 columnas crudas de dimensión.
    rend : DataFrame
        ``historial_rendimiento`` con columnas ``CODIGO_ESTUDIANTE`` y ``PERIODO``.

    Devuelve un dict serializable (numpy->nativo, NaN/inf->None vía ``_a_nativo``)
    con ``meta`` + una lista por dimensión de celdas
    ``{anio, categoria, num, den, tasa_pct}``.
    """
    # (1) Validar que las 5 columnas crudas existen (estilo compute_historical).
    for dim, col in COLS_CRUDAS.items():
        if col not in df.columns:
            raise ValueError(
                f"Falta la columna {col} (dimensión '{dim}') en el DataFrame "
                "analítico."
            )
    if "PRIMER_ANIO_MOVILIDAD" not in df.columns:
        raise ValueError("Falta la columna PRIMER_ANIO_MOVILIDAD en el DataFrame.")

    # (2) ACTIVOS: año del periodo, descartar no parseables, recortar al rango,
    #     y dejar un (estudiante, año) único por fila.
    rend = rend[[KEY, "PERIODO"]].copy()
    rend["anio"] = rend["PERIODO"].map(utils.periodo_to_year)
    rend = rend.dropna(subset=["anio"]).copy()
    rend["anio"] = rend["anio"].astype(int)
    rend = rend[(rend["anio"] >= TASA_ANIO_MIN) & (rend["anio"] <= TASA_ANIO_MAX)]
    activos = rend[[KEY, "anio"]].drop_duplicates()

    # (3) MERGE ÚNICO + NORMALIZACIÓN ÚNICA.
    cols_crudas = list(COLS_CRUDAS.values())
    analitico = df[[KEY, "PRIMER_ANIO_MOVILIDAD", *cols_crudas]]
    base = activos.merge(analitico, on=KEY, how="left")
    # Filas de activos sin contrapartida en el analítico: quedan NaN en todas las
    # columnas crudas y, tras _normaliza_dims, 'Sin dato' (por tanto excluidas de
    # num y den). Se cuentan como cobertura (meta.n_activos_sin_analitico).
    sin_match = base[cols_crudas].isna().all(axis=1)
    n_activos_sin_analitico = int(sin_match.sum())
    base = _normaliza_dims(base)

    # (4) TOP-8 FACULTAD sobre la población de referencia (activos del rango).
    base = _top8_facultad(base)

    # (5) MARCA DE NUMERADOR (Opción A): activo en Y cuyo primer año de movilidad
    #     es Y. Por construcción num ⊆ den.
    primer_anio = pd.to_numeric(base["PRIMER_ANIO_MOVILIDAD"], errors="coerce")
    base["inicia"] = (base["anio"] == primer_anio)

    # Participantes (con PRIMER_ANIO_MOVILIDAD en rango) cuyo (KEY, anio) NO figura
    # entre los activos: quedan fuera del numerador (cobertura de la Opción A).
    pa_part = pd.to_numeric(df["PRIMER_ANIO_MOVILIDAD"], errors="coerce")
    part = df.loc[pa_part.notna(), [KEY]].copy()
    part["anio"] = pa_part[pa_part.notna()].astype(int).to_numpy()
    part = part[(part["anio"] >= TASA_ANIO_MIN) & (part["anio"] <= TASA_ANIO_MAX)]
    marca = part.merge(activos.assign(_en_activos=1),
                       on=[KEY, "anio"], how="left")
    n_part_sin_rendimiento = int(marca["_en_activos"].isna().sum())

    # (6) Una lista de celdas por dimensión.
    out = {}
    for dim in DIMENSIONES:
        out[dim] = _serie_dimension(base, dim)

    # den_global(anio) sobre los activos con alguna dimensión con dato: se usa el
    # conjunto completo de activos (una fila por estudiante-año), que es el tamaño
    # poblacional real del año.
    den_global = base.groupby("anio").size().sort_index()
    print("historico_tasas: den_global por año (activos únicos):")
    for anio, n in den_global.items():
        print(f"  {int(anio)}: {int(n)}")
    dg_2022 = int(den_global.get(2022, 0))
    dg_2023 = int(den_global.get(2023, 0))
    if dg_2022 > 0 and dg_2023 < 0.6 * dg_2022:
        print(
            f"ADVERTENCIA historico_tasas: den_global(2023)={dg_2023} < "
            f"0.6*den_global(2022)={0.6 * dg_2022:.0f}. Posible cohorte 2023 "
            "incompleta; considere bajar TASA_ANIO_MAX a 2022 MANUALMENTE "
            "(el código no cambia el rango por su cuenta)."
        )

    meta = {
        "framing": "tasa_inicio",
        "definicion_activo": DEFINICION_ACTIVO,
        "definicion_numerador": DEFINICION_NUMERADOR,
        "definicion_tasa": DEFINICION_TASA,
        "anio_min": TASA_ANIO_MIN,
        "anio_max": TASA_ANIO_MAX,
        "umbral_den": UMBRAL_DEN,
        "nota_framing": NOTA_FRAMING,
        "nota_dimensiones": NOTA_DIMENSIONES,
        "nota_rango": NOTA_RANGO,
        "dimensiones": list(DIMENSIONES),
        "labels": dict(LABELS),
        "n_part_sin_rendimiento": n_part_sin_rendimiento,
        "n_activos_sin_analitico": n_activos_sin_analitico,
        "generado": pd.Timestamp.now().strftime("%Y-%m-%d"),
    }

    out["meta"] = meta
    # Saneamiento final: numpy -> nativo, NaN/inf -> None antes de serializar.
    return _a_nativo(out)
