"""Pipeline reproducible de integración y construcción del dataset analítico.

Corresponde al OE3 y a las semanas 7-8 del cronograma. Produce un conjunto de
datos **a nivel estudiante** (una fila por estudiante) que integra:

* atributos demográficos e institucionales (informacion_actual, spine),
* desempeño académico agregado (historial_rendimiento),
* avance y posición relativa (percentiles_historicos),
* pruebas de ingreso (icfes_saber11) y clasificación (examenes_clasificacion),
* progreso de créditos (capp_creditos),
* la etiqueta de participación en internacionalización (señal derivada).

Unidad de análisis
-------------------
El estudiante. `informacion_actual` tiene exactamente una fila por estudiante y
se usa como columna vertebral; el resto de fuentes se agregan a nivel estudiante
y se unen con `left join` para no perder estudiantes del universo.

Uso
---
    python -m src.build_dataset

Esto escribe:
    data_processed/eventos_movilidad.parquet
    data_processed/dataset_analitico_estudiante.parquet
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from . import config, internationalization as intl, utils

KEY = config.STUDENT_KEY


# ---------------------------------------------------------------------------
# Bloques de features por fuente (cada uno devuelve un DF indexado por KEY)
# ---------------------------------------------------------------------------
def _spine() -> pd.DataFrame:
    """Columna vertebral: atributos del estudiante (informacion_actual)."""
    cols = [
        "CODIGO_ESTUDIANTE", "PERIODO", "EDAD", "GENERO",
        "CODIGO_FACULTAD_PROGRAMA_1", "CODIGO_PROGRAMA_1", "PROGRAMA_1",
        "NIVEL_PROGRAMA_1", "ESTADO_ACADEMICO", "TIPO_ADMISION",
        "ESTRATO_SOCIAL", "DEPARTAMENTO_COLEGIO", "CIUDAD_COLEGIO",
        "NUMERO_OPCIONES_INSCRITAS", "PROMEDIO_MOVIL",
        "NUMERO_PRUEBAS_ACADEMICAS",
    ]
    df = utils.load_source("informacion_actual", columns=cols, fix_encoding=True)
    df = df.rename(columns={
        "CODIGO_FACULTAD_PROGRAMA_1": "FACULTAD",
        "CODIGO_PROGRAMA_1": "CODIGO_PROGRAMA",
        "PROGRAMA_1": "PROGRAMA",
        "NIVEL_PROGRAMA_1": "NIVEL",
        "PERIODO": "PERIODO_SNAPSHOT",
    })
    df["ANIO_SNAPSHOT"] = df["PERIODO_SNAPSHOT"].map(utils.periodo_to_year)
    return df


def _rendimiento() -> pd.DataFrame:
    """Desempeño académico: último PGA y agregados históricos por estudiante."""
    cols = [
        "CODIGO_ESTUDIANTE", "PERIODO", "PGA", "PROMEDIO_SEMESTRAL",
        "CREDITOS_APROBADOS", "CREDITOS_REPROBADOS", "TOTAL_SEMESTRES_MATRICULADOS",
        "PORCENTAJE_CREDITOS_APROBADOS",
    ]
    rr = utils.load_source("historial_rendimiento", columns=cols)
    rr = rr.sort_values("PERIODO")
    last = rr.groupby(KEY).tail(1)
    agg = rr.groupby(KEY).agg(
        PGA_ULTIMO=("PGA", "last"),
        PGA_PROMEDIO_HIST=("PGA", "mean"),
        PGA_MIN=("PGA", "min"),
        PGA_MAX=("PGA", "max"),
        N_PERIODOS_RENDIMIENTO=("PERIODO", "nunique"),
    )
    last_feats = last.set_index(KEY)[[
        "TOTAL_SEMESTRES_MATRICULADOS", "CREDITOS_APROBADOS",
        "PORCENTAJE_CREDITOS_APROBADOS",
    ]].rename(columns={
        "TOTAL_SEMESTRES_MATRICULADOS": "SEMESTRES_MATRICULADOS",
        "CREDITOS_APROBADOS": "CREDITOS_APROBADOS_TOTAL",
        "PORCENTAJE_CREDITOS_APROBADOS": "PCT_CREDITOS_APROBADOS",
    })
    return agg.join(last_feats)


def _percentiles() -> pd.DataFrame:
    """Avance (semestres) y posición relativa (percentil PGA) más recientes."""
    cols = ["CODIGO_ESTUDIANTE", "PERIODO", "SEMESTRE_AVANCE",
            "PERCENTIL_PGA_PROGRAMA", "PERCENTIL_PGA_NIVEL"]
    pe = utils.load_source("percentiles_historicos", columns=cols).sort_values("PERIODO")
    last = pe.groupby(KEY).tail(1).set_index(KEY)
    return last[["SEMESTRE_AVANCE", "PERCENTIL_PGA_PROGRAMA", "PERCENTIL_PGA_NIVEL"]].rename(
        columns={
            "SEMESTRE_AVANCE": "SEMESTRE_AVANCE",
            "PERCENTIL_PGA_PROGRAMA": "PERCENTIL_PGA_PROGRAMA",
            "PERCENTIL_PGA_NIVEL": "PERCENTIL_PGA_NIVEL",
        }
    )


def _icfes() -> pd.DataFrame:
    """Puntajes Saber 11 (ICFES). Se conserva el registro de mayor puntaje total."""
    cols = ["CODIGO_ESTUDIANTE", "PUNTAJE_TOTAL", "MATEMATICAS",
            "LECTURA_CRITICA", "INGLES"]
    ic = utils.load_source("icfes_saber11", columns=cols)
    ic = ic.sort_values("PUNTAJE_TOTAL").groupby(KEY).tail(1).set_index(KEY)
    return ic.rename(columns={
        "PUNTAJE_TOTAL": "ICFES_PUNTAJE_TOTAL",
        "MATEMATICAS": "ICFES_MATEMATICAS",
        "LECTURA_CRITICA": "ICFES_LECTURA_CRITICA",
        "INGLES": "ICFES_INGLES",
    })


def _examenes() -> pd.DataFrame:
    """Clasificación de inglés/matemáticas (nivel más reciente por estudiante)."""
    cols = ["CODIGO_ESTUDIANTE", "NIVEL_INGLES", "EXAMEN_NIVEL_MATEMATICAS",
            "FECHA_NIVEL_INGLES"]
    ex = utils.load_source("examenes_clasificacion", columns=cols)
    ex = ex.sort_values("FECHA_NIVEL_INGLES").groupby(KEY).tail(1).set_index(KEY)
    return ex[["NIVEL_INGLES", "EXAMEN_NIVEL_MATEMATICAS"]]


def _capp() -> pd.DataFrame:
    """Progreso de créditos (CAPP): registro más reciente por estudiante."""
    cols = ["CODIGO_ESTUDIANTE", "CREDITOS_REQUERIDOS", "CREDITOS_COMPLETADOS",
            "CREDITOS_FALTANTES", "FECHA_CALCULO_CAPP"]
    cp = utils.load_source("capp_creditos", columns=cols)
    cp = cp.sort_values("FECHA_CALCULO_CAPP").groupby(KEY).tail(1).set_index(KEY)
    cp["PCT_AVANCE_CREDITOS"] = (
        cp["CREDITOS_COMPLETADOS"] / cp["CREDITOS_REQUERIDOS"].replace(0, np.nan)
    )
    return cp[["CREDITOS_REQUERIDOS", "CREDITOS_COMPLETADOS",
               "CREDITOS_FALTANTES", "PCT_AVANCE_CREDITOS"]]


# ---------------------------------------------------------------------------
# Orquestación
# ---------------------------------------------------------------------------
def build(verbose: bool = True) -> pd.DataFrame:
    """Construye y persiste el dataset analítico a nivel estudiante."""
    def log(msg: str) -> None:
        if verbose:
            print(msg, flush=True)

    log("[1/8] Cargando columna vertebral (informacion_actual)...")
    df = _spine()
    n0 = len(df)
    log(f"      estudiantes (universo): {n0:,}")

    log("[2/8] Extrayendo eventos de movilidad (señal de internacionalización)...")
    events = intl.extract_mobility_events(only_international=True)
    events.to_parquet(config.MOBILITY_EVENTS, index=False)
    part = intl.student_participation(events)
    log(f"      eventos de movilidad: {len(events):,} | estudiantes participantes: {len(part):,}")

    log("[3/8] Agregando desempeño académico (historial_rendimiento)...")
    rend = _rendimiento()

    log("[4/8] Agregando avance y percentiles (percentiles_historicos)...")
    perc = _percentiles()

    log("[5/8] Agregando pruebas de ingreso y clasificación (ICFES, exámenes)...")
    icfes = _icfes()
    examenes = _examenes()

    log("[6/8] Agregando progreso de créditos (CAPP)...")
    capp = _capp()

    log("[7/8] Integrando todas las fuentes (left join sobre el estudiante)...")
    df = df.set_index(KEY)
    for block in (rend, perc, icfes, examenes, capp):
        df = df.join(block, how="left")
    df = df.reset_index()

    # Etiqueta de participación: 1 si tiene evento de movilidad, 0 en caso contrario.
    part_cols = ["N_EVENTOS_MOVILIDAD", "PRIMER_PERIODO_MOVILIDAD",
                 "PRIMER_ANIO_MOVILIDAD", "MODALIDAD_PRINCIPAL"]
    df = df.merge(
        part[[KEY, "PARTICIPA"] + part_cols], on=KEY, how="left"
    )
    df["PARTICIPA"] = df["PARTICIPA"].fillna(0).astype(int)
    df["N_EVENTOS_MOVILIDAD"] = df["N_EVENTOS_MOVILIDAD"].fillna(0).astype(int)

    # Marca del subconjunto de pregrado (foco principal de modelamiento).
    df["ES_PREGRADO"] = (df["NIVEL"] == config.NIVEL_PREGRADO)

    log(f"[8/8] Guardando dataset analítico ({len(df):,} filas, {df.shape[1]} columnas)...")
    df.to_parquet(config.ANALYTIC_DATASET, index=False)
    log(f"      -> {config.ANALYTIC_DATASET}")

    # Validaciones automáticas básicas (semana 7).
    _validate(df, n0)
    return df


def _validate(df: pd.DataFrame, n_universo: int) -> None:
    """Validaciones automáticas del dataset analítico."""
    assert df[KEY].is_unique, "La clave de estudiante no es única en el dataset analítico."
    assert len(df) == n_universo, "El left join alteró el número de estudiantes del universo."
    assert set(df["PARTICIPA"].unique()) <= {0, 1}, "PARTICIPA debe ser binaria."
    tasa = 100 * df["PARTICIPA"].mean()
    print(f"      [validación] clave única: OK | filas: {len(df):,} | "
          f"tasa de participación global: {tasa:.2f}%")
    tasa_preg = 100 * df.loc[df["ES_PREGRADO"], "PARTICIPA"].mean()
    print(f"      [validación] tasa de participación en pregrado: {tasa_preg:.2f}%")


if __name__ == "__main__":
    build()
    sys.exit(0)
