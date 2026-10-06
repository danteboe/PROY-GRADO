"""Definición reproducible de la señal de participación en internacionalización.

Esta es la decisión metodológica central del proyecto en su fase de datos
(semanas 7-9). Los conjuntos de datos entregados por la Universidad no contienen
una tabla explícita de "experiencias de internacionalización"; la participación
debe **derivarse** de los registros académicos.

Fuente principal de la señal
----------------------------
`historial_materias`: el registro histórico de cursos contiene asignaturas que
representan explícitamente experiencias de movilidad (cursos de intercambio,
doble titulación, semanas internacionales y viajes internacionales de estudio).
Estas asignaturas son el mecanismo administrativo con el que la Universidad
inscribe la movilidad de un estudiante en su historia académica, por lo que
constituyen el proxy más directo y auditable de participación.

Criterio de inclusión (ver `MOBILITY_NAME_PATTERN` y `MOBILITY_COURSE_CODES`)
-----------------------------------------------------------------------------
Se marca un registro de curso como "evento de movilidad" cuando el nombre del
curso (ya corregido de encoding y en mayúsculas) coincide con el patrón de
movilidad, o cuando el código del curso pertenece a la lista de códigos
canónicos de movilidad. Cada evento se clasifica además en una **modalidad**.

Decisiones y justificación
--------------------------
* Se usa el *nombre* del curso además del código porque un mismo tipo de
  experiencia aparece bajo múltiples códigos de departamento (DECA-2201,
  INTL-2201, IGEN-4201, etc.). Confiar solo en códigos subestimaría la señal.
* "INTERCAMBIO NACIONAL" se conserva pero se clasifica como modalidad propia
  (nacional) y puede excluirse del foco internacional mediante el parámetro
  `only_international`.
* La señal se construye sin mirar ninguna variable posterior al evento, de modo
  que pueda reutilizarse como variable objetivo en la fase de modelamiento
  evitando *data leakage* (OE5, etapa 4 de la propuesta).
"""
from __future__ import annotations

import re

import pandas as pd

from . import config, utils

# ---------------------------------------------------------------------------
# Patrón de nombres de curso que representan movilidad / internacionalización.
# ---------------------------------------------------------------------------
MOBILITY_NAME_PATTERN = re.compile(
    r"\bINTERCAMBIO\b"            # intercambio (académico)
    r"|VIAJE INTERNACIONAL"       # viajes internacionales de estudio
    r"|SEMANA INTERNACIONAL"      # semanas internacionales
    r"|DOBLE TITULAC"             # doble titulación (internacional)
    r"|INTERNATIONAL EXCHANGE"
    r"|STUDY ABROAD"
)

# Códigos de curso canónicos de movilidad (respaldo cuando el nombre no coincide).
MOBILITY_COURSE_CODES = {
    "DECA-2201", "DECA-2202", "DECA-2203", "DECA-213",
    "INTL-2201", "INTL-2203", "INTL-2204", "INTL-2210", "INTL-2212",
    "INTL-2214", "INTL-6002",
    "MBAE-4543", "MBAE-4593", "MBAE-4594",
    "EMBA-4502", "EMBA-4506", "EMBA-4513", "EMBA-4517",
    "MADM-4514", "MADM-4552", "MADM-4909",
    "IGEN-4201", "MINT-4100", "MDIS-4801",
}


def classify_modalidad(nombre: str) -> str:
    """Clasifica un nombre de curso de movilidad en una modalidad legible."""
    if not isinstance(nombre, str):
        return "No clasificada"
    u = nombre.upper()
    if "DOBLE TITULAC" in u:
        return "Doble titulación"
    if "SEMANA INTERNACIONAL" in u:
        return "Semana internacional"
    if "VIAJE INTERNACIONAL" in u:
        return "Viaje internacional de estudio"
    if "VIRTUAL" in u:
        return "Intercambio virtual"
    if "NACIONAL" in u:
        return "Intercambio nacional"
    if "INTERCAMBIO" in u or "EXCHANGE" in u or "STUDY ABROAD" in u:
        return "Intercambio internacional"
    return "Otra movilidad"


# Modalidades consideradas internacionales (para el foco del proyecto).
MODALIDADES_INTERNACIONALES = {
    "Intercambio internacional",
    "Doble titulación",
    "Semana internacional",
    "Viaje internacional de estudio",
    "Intercambio virtual",
}


def extract_mobility_events(
    historial_materias: pd.DataFrame | None = None,
    only_international: bool = True,
) -> pd.DataFrame:
    """Extrae los eventos de movilidad a nivel (estudiante, periodo, curso).

    Parameters
    ----------
    historial_materias
        DataFrame ya cargado. Si es None se carga desde la fuente registrada.
    only_international
        Si True, descarta la modalidad "Intercambio nacional" del resultado.

    Returns
    -------
    DataFrame con columnas: CODIGO_ESTUDIANTE, PERIODO, ANIO, CODIGO_CURSO,
    NOMBRE_CURSO, MODALIDAD, NIVEL_ACADEMICO_ESTUDIANTE, CODIGO_CAMPUS, RESULTADO.
    """
    cols = [
        "CODIGO_ESTUDIANTE_ANOM", "PERIODO", "CODIGO_CURSO", "NOMBRE_CURSO",
        "ESTATUS", "CODIGO_CAMPUS", "RESULTADO", "NUMERO_CREDITOS",
        "NIVEL_ACADEMICO_ESTUDIANTE",
    ]
    if historial_materias is None:
        hm = utils.load_source("historial_materias", columns=cols)
    else:
        hm = historial_materias[cols].copy()

    # Corregir encoding de las columnas de texto relevantes.
    for c in ["NOMBRE_CURSO", "NIVEL_ACADEMICO_ESTUDIANTE", "RESULTADO", "ESTATUS"]:
        hm[c] = utils.fix_mojibake_series(hm[c])

    nombre_up = hm["NOMBRE_CURSO"].astype(str).str.upper()
    by_name = nombre_up.str.contains(MOBILITY_NAME_PATTERN, na=False)
    by_code = hm["CODIGO_CURSO"].isin(MOBILITY_COURSE_CODES)
    mask = by_name | by_code

    events = hm.loc[mask].copy()
    events = events.rename(columns={"CODIGO_ESTUDIANTE_ANOM": config.STUDENT_KEY})
    events["MODALIDAD"] = events["NOMBRE_CURSO"].map(classify_modalidad)
    events["ANIO"] = events["PERIODO"].map(utils.periodo_to_year)

    if only_international:
        events = events[events["MODALIDAD"].isin(MODALIDADES_INTERNACIONALES)].copy()

    keep = [
        config.STUDENT_KEY, "PERIODO", "ANIO", "CODIGO_CURSO", "NOMBRE_CURSO",
        "MODALIDAD", "NIVEL_ACADEMICO_ESTUDIANTE", "CODIGO_CAMPUS", "RESULTADO",
    ]
    return events[keep].reset_index(drop=True)


def student_participation(events: pd.DataFrame) -> pd.DataFrame:
    """Agrega los eventos a nivel estudiante (una fila por estudiante participante).

    Devuelve: CODIGO_ESTUDIANTE, PARTICIPA (1), N_EVENTOS_MOVILIDAD,
    PRIMER_PERIODO_MOVILIDAD, PRIMER_ANIO_MOVILIDAD, MODALIDADES (lista),
    MODALIDAD_PRINCIPAL.
    """
    if events.empty:
        return pd.DataFrame(
            columns=[
                config.STUDENT_KEY, "PARTICIPA", "N_EVENTOS_MOVILIDAD",
                "PRIMER_PERIODO_MOVILIDAD", "PRIMER_ANIO_MOVILIDAD",
                "MODALIDADES", "MODALIDAD_PRINCIPAL",
            ]
        )
    g = events.groupby(config.STUDENT_KEY)
    out = pd.DataFrame({
        "N_EVENTOS_MOVILIDAD": g.size(),
        "PRIMER_PERIODO_MOVILIDAD": g["PERIODO"].min(),
        "PRIMER_ANIO_MOVILIDAD": g["ANIO"].min(),
        "MODALIDADES": g["MODALIDAD"].agg(lambda s: sorted(set(s))),
        "MODALIDAD_PRINCIPAL": g["MODALIDAD"].agg(lambda s: s.value_counts().index[0]),
    }).reset_index()
    out["PARTICIPA"] = 1
    return out
