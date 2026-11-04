"""Tests unitarios de src/historical_stats.compute_historical (contrato §2, §5).

Se usa un DataFrame sintético pequeño (NO se lee el parquet real). ``faculty_name_map``
se parchea para no tocar la fuente ``programas``: la facultad del sintético ya viene
como nombre legible, de modo que el mapa identidad basta.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from src import historical_stats as hs


@pytest.fixture(autouse=True)
def _sin_fuente_programas(monkeypatch):
    """Evita leer la fuente real: facultad ya es nombre legible (mapa identidad)."""
    monkeypatch.setattr(hs, "faculty_name_map", lambda: {})


def _fila(anio, estrato="2", genero="F", facultad="Ingenieria",
          modalidad="Intercambio internacional", pga=4.0, icfes=350.0, avance=8.0):
    return {
        "PRIMER_ANIO_MOVILIDAD": anio,
        "ESTRATO_SOCIAL": estrato,
        "GENERO": genero,
        "FACULTAD": facultad,
        "MODALIDAD_PRINCIPAL": modalidad,
        "PGA_ULTIMO": pga,
        "ICFES_PUNTAJE_TOTAL": icfes,
        "SEMESTRE_AVANCE": avance,
    }


def _df_base():
    """DataFrame con: un año válido (2015, n=40), un año fuera de rango (2008, n=35),
    un año bajo umbral (2013, n=10) y no participantes (año NaN)."""
    filas = []
    # 2015: 40 participantes, estratos mezclados incluyendo "Sin dato".
    for i in range(40):
        estrato = {0: "Sin dato", 1: "N/A"}.get(i, "2" if i % 2 else "3")
        genero = "Sin dato" if i == 2 else ("F" if i % 2 else "M")
        filas.append(_fila(2015, estrato=estrato, genero=genero))
    # 2008: 35 participantes (fuera de rango por anio < 2012).
    for _ in range(35):
        filas.append(_fila(2008))
    # 2013: 10 participantes (en rango pero bajo umbral n < 30).
    for _ in range(10):
        filas.append(_fila(2013))
    # No participantes (sin año).
    for _ in range(20):
        filas.append(_fila(np.nan))
    return pd.DataFrame(filas)


def test_composicion_suma_100_por_anio():
    out = hs.compute_historical(_df_base())
    for serie in ("composicion_estrato", "composicion_genero",
                  "composicion_facultad", "composicion_modalidad"):
        df = pd.DataFrame(out[serie])
        for anio, g in df.groupby("anio"):
            assert abs(g["pct"].sum() - 100.0) <= 0.1, (serie, anio, g["pct"].sum())


def test_umbral_y_rango_contados_por_separado():
    out = hs.compute_historical(_df_base())
    meta = out["meta"]
    # Solo 2015 se conserva.
    assert [d["anio"] for d in meta["n_por_anio"]] == [2015]
    assert meta["n_anios_fuera_rango"] == 1   # 2008
    assert meta["n_anios_bajo_umbral"] == 1    # 2013
    # Ningún año excluido aparece en las series de composición.
    anios_estrato = {d["anio"] for d in out["composicion_estrato"]}
    assert anios_estrato == {2015}


def test_facultad_top8_mas_otras_con_desempate_estable():
    # 10 facultades con tamaños decrecientes y dos empatadas para probar desempate.
    filas = []
    tam = {"F01": 90, "F02": 80, "F03": 70, "F04": 60, "F05": 50,
           "F06": 40, "F07": 35, "F08": 32, "FZ_empate": 31, "FA_empate": 31}
    for fac, n in tam.items():
        for _ in range(n):
            filas.append(_fila(2015, facultad=fac))
    out = hs.compute_historical(pd.DataFrame(filas))
    cats = {d["facultad"] for d in out["composicion_facultad"]}
    # Top 8 por total; la cola (las dos empatadas) cae en "Otras".
    assert "Otras" in cats
    assert cats == {"F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08", "Otras"}
    # Desempate: ambas empatadas (31) quedaron fuera del top -> en "Otras".
    assert "Fz_Empate" not in cats and "Fa_Empate" not in cats


def test_facultad_omite_otras_con_8_o_menos():
    filas = []
    for fac in ["F01", "F02", "F03", "F04", "F05", "F06", "F07", "F08"]:
        for _ in range(40):
            filas.append(_fila(2015, facultad=fac))
    out = hs.compute_historical(pd.DataFrame(filas))
    cats = {d["facultad"] for d in out["composicion_facultad"]}
    assert "Otras" not in cats
    assert len(cats) == 8


def test_salida_serializable_sin_nan_inf():
    out = hs.compute_historical(_df_base())
    # json.dumps falla con NaN/Infinity solo si allow_nan=False.
    texto = json.dumps(out, ensure_ascii=False, allow_nan=False)
    assert "NaN" not in texto and "Infinity" not in texto


def test_ningun_string_contiene_tasa():
    out = hs.compute_historical(_df_base())
    assert "tasa" not in json.dumps(out, ensure_ascii=False).lower()


def test_sin_dato_excluido_y_renormalizado():
    out = hs.compute_historical(_df_base())
    cats_estrato = {d["estrato"] for d in out["composicion_estrato"]}
    cats_genero = {d["genero"] for d in out["composicion_genero"]}
    for sd in hs.SIN_DATO:
        assert sd not in cats_estrato
        assert sd not in cats_genero
    # Renormalización: el año conservado suma 100% sobre categorías con dato.
    df = pd.DataFrame(out["composicion_estrato"])
    assert abs(df[df["anio"] == 2015]["pct"].sum() - 100.0) <= 0.1


def test_invariante_n1_anios_conservados():
    out = hs.compute_historical(_df_base())
    anios_meta = [d["anio"] for d in out["meta"]["n_por_anio"]]
    anios_series = sorted({d["anio"] for d in out["composicion_estrato"]})
    assert anios_series == anios_meta


def test_framing_composicion():
    out = hs.compute_historical(_df_base())
    assert out["meta"]["framing"] == "composicion"
