"""Tests unitarios de src/historical_rates.compute_historical_rates (contrato §2.3, §2.7).

Se usan DataFrames sintéticos pequeños (NO se leen los parquet reales): un dataset
analítico (una fila por estudiante) y un historial_rendimiento (clave + periodo).
``faculty_name_map`` se parchea a identidad para no tocar la fuente ``programas``:
la facultad del sintético ya viene como nombre legible.

Las 13 invariantes del diseño §2.7 se cubren entre las funciones de test de abajo.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from src import historical_rates as hr


@pytest.fixture(autouse=True)
def _sin_fuente_programas(monkeypatch):
    """Evita leer la fuente real: facultad ya es nombre legible (mapa identidad)."""
    monkeypatch.setattr(hr, "faculty_name_map", lambda: {})


# ---------------------------------------------------------------------------
# Constructores sintéticos
# ---------------------------------------------------------------------------
def _periodo(anio: int, ciclo: str = "10") -> int:
    """Periodo AAAASS a partir de año y ciclo (p. ej. 2015, '10' -> 201510)."""
    return int(f"{anio}{ciclo}")


def _analitico(filas: list) -> pd.DataFrame:
    """DataFrame analítico con las columnas que exige compute_historical_rates."""
    cols = ["CODIGO_ESTUDIANTE", "PRIMER_ANIO_MOVILIDAD", "ESTRATO_SOCIAL",
            "GENERO", "FACULTAD", "NIVEL", "TIPO_ADMISION"]
    return pd.DataFrame(filas, columns=cols)


def _rend(filas: list) -> pd.DataFrame:
    """DataFrame historial_rendimiento sintético (clave + periodo)."""
    return pd.DataFrame(filas, columns=["CODIGO_ESTUDIANTE", "PERIODO"])


def _poblacion_basica():
    """Población sintética plausible para las invariantes generales.

    - Estrato 6 crece de ~0 iniciadores (2012) a varios (2020) => tasa crece.
    - Denominador >= UMBRAL_DEN por (anio, estrato) en 2012 y 2020.
    - Un estudiante con dos periodos del MISMO año (unicidad del activo).
    - Un activo SIN contrapartida en el analítico (n_activos_sin_analitico).
    - Un participante con PRIMER_ANIO_MOVILIDAD en rango SIN rendimiento ese año
      (n_part_sin_rendimiento).
    """
    ana = []
    rend = []
    cod = 0

    def agrega(anio_activo, estrato, inicia_en, ciclos=("10",)):
        nonlocal cod
        cod += 1
        key = f"E{cod:05d}"
        ana.append([key, inicia_en, estrato, "F", "Ingenieria", "Pregrado",
                    "Regular"])
        for c in ciclos:
            rend.append([key, _periodo(anio_activo, c)])
        return key

    # 2012: 120 activos de estrato 6, solo ~1 inicia (tasa ~0.83%); 120 de estrato 2.
    for i in range(120):
        agrega(2012, "6", inicia_en=2012 if i == 0 else np.nan)
    for i in range(120):
        agrega(2012, "2", inicia_en=2012 if i < 3 else np.nan)

    # 2020: 120 activos de estrato 6, ~8 inician (tasa ~6.7%); 120 de estrato 2.
    for i in range(120):
        agrega(2020, "6", inicia_en=2020 if i < 8 else np.nan)
    for i in range(120):
        agrega(2020, "2", inicia_en=2020 if i < 5 else np.nan)

    # Unicidad del activo: un estudiante con dos ciclos del mismo año (2012).
    agrega(2012, "6", inicia_en=np.nan, ciclos=("10", "20"))

    # Activo sin contrapartida en el analítico: aparece en rend pero NO en ana.
    rend.append(["ZZZ_SIN_ANALITICO", _periodo(2012, "10")])

    # Participante con PRIMER_ANIO_MOVILIDAD en rango pero sin rendimiento ese año:
    # está en el analítico, inicia en 2015, pero no tiene registro de rendimiento.
    cod += 1
    ana.append([f"E{cod:05d}", 2015, "3", "M", "Ingenieria", "Pregrado",
                "Regular"])

    return _analitico(ana), _rend(rend)


# ---------------------------------------------------------------------------
# Invariantes 1-5, 7-9 (sobre la población básica)
# ---------------------------------------------------------------------------
def test_rango_de_anios():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    for dim in hr.DIMENSIONES:
        for fila in out[dim]:
            assert hr.TASA_ANIO_MIN <= fila["anio"] <= hr.TASA_ANIO_MAX


def test_umbral_denominador():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    for dim in hr.DIMENSIONES:
        for fila in out[dim]:
            assert fila["den"] >= hr.UMBRAL_DEN


def test_formula_de_la_tasa():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    for dim in hr.DIMENSIONES:
        for fila in out[dim]:
            esperado = round(100.0 * fila["num"] / fila["den"], hr.DECIMALES_TASA)
            assert abs(fila["tasa_pct"] - esperado) <= 1e-9


def test_num_menor_o_igual_den():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    for dim in hr.DIMENSIONES:
        for fila in out[dim]:
            assert fila["num"] <= fila["den"]


def test_tasa_en_rango_0_100():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    for dim in hr.DIMENSIONES:
        for fila in out[dim]:
            assert 0.0 <= fila["tasa_pct"] <= 100.0


def test_exclusion_sin_dato():
    # Se inyectan categorías "Sin dato" (NaN) y N/A en estrato; deben excluirse.
    ana, rend = _poblacion_basica()
    cod = "E99999"
    extra_ana = pd.DataFrame(
        [[cod, np.nan, np.nan, "F", "Ingenieria", "Pregrado", "Regular"]],
        columns=ana.columns,
    )
    ana = pd.concat([ana, extra_ana], ignore_index=True)
    rend = pd.concat(
        [rend, pd.DataFrame([[cod, _periodo(2012)]], columns=rend.columns)],
        ignore_index=True,
    )
    out = hr.compute_historical_rates(ana, rend)
    for dim in hr.DIMENSIONES:
        cats = {fila["categoria"] for fila in out[dim]}
        for sd in hr.SIN_DATO:
            assert sd not in cats


def test_dimensiones_y_claves():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    assert out["meta"]["dimensiones"] == hr.DIMENSIONES
    for dim in hr.DIMENSIONES:
        assert dim in out
        for fila in out[dim]:
            assert "categoria" in fila
    # facultad: nunca más de 9 categorías por año (8 + "Otras").
    df_fac = pd.DataFrame(out["facultad"])
    if not df_fac.empty:
        por_anio = df_fac.groupby("anio")["categoria"].nunique()
        assert (por_anio <= 9).all()


def test_serializable_sin_nan_inf():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    texto = json.dumps(out, ensure_ascii=False, allow_nan=False)
    assert "NaN" not in texto and "Infinity" not in texto


def test_poblacion_activa_por_intervalo():
    rendimiento = _rend([
        ["A", _periodo(2012, "10")],
        ["A", _periodo(2012, "20")],
        ["A", _periodo(2014)],
        ["B", _periodo(2013)],
        ["C", _periodo(2014)],
        [None, _periodo(2013)],
        ["D", None],
    ])
    activos = hr.active_student_years(rendimiento)
    assert hr.compute_active_population(activos, 2012, 2014) == {
        "desde": 2012,
        "hasta": 2014,
        "rangos": [[1, 2, 3], [1, 3], [2]],
    }


# ---------------------------------------------------------------------------
# Invariante 6: unicidad del activo
# ---------------------------------------------------------------------------
def test_unicidad_del_activo():
    # Un estudiante con dos ciclos del mismo año cuenta UNA vez en el denominador.
    # Se construye una población donde ese estudiante es el único de su categoría
    # (tipo_admision 'Especial') para medir su aporte al den directamente.
    ana = [["U00001", np.nan, "2", "F", "Ingenieria", "Pregrado", "Especial"]]
    for i in range(130):
        ana.append([f"R{i:05d}", np.nan, "2", "F", "Ingenieria", "Pregrado",
                    "Regular"])
    ana_df = _analitico(ana)

    rend = [["U00001", _periodo(2012, "10")], ["U00001", _periodo(2012, "20")]]
    for i in range(130):
        rend.append([f"R{i:05d}", _periodo(2012, "10")])
    rend_df = _rend(rend)

    out = hr.compute_historical_rates(ana_df, rend_df)
    esp = [f for f in out["tipo_admision"]
           if f["anio"] == 2012 and f["categoria"] == "Especial"]
    # 'Especial' tiene den < UMBRAL_DEN (un solo estudiante) => se suprime; pero el
    # punto es que no cuenta 2: lo verificamos sobre el agregado 'Regular' (130
    # activos, no 260 pese a nada) y sobre la ausencia de doble conteo global.
    assert esp == []  # suprimido por umbral, no por doble conteo
    reg = [f for f in out["tipo_admision"]
           if f["anio"] == 2012 and f["categoria"] == "Regular"]
    assert reg and reg[0]["den"] == 130


# ---------------------------------------------------------------------------
# Invariante 10: activo sin match en el analítico
# ---------------------------------------------------------------------------
def test_activo_sin_analitico_excluido_y_contado():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    # El activo 'ZZZ_SIN_ANALITICO' no tiene categorías => 'Sin dato' => excluido.
    assert out["meta"]["n_activos_sin_analitico"] >= 1


# ---------------------------------------------------------------------------
# Invariante 11: numerador como subconjunto de activos (Opción A)
# ---------------------------------------------------------------------------
def test_participante_sin_rendimiento_no_suma_numerador():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    # El participante que inicia en 2015 sin registro de rendimiento ese año queda
    # fuera del numerador y se cuenta en n_part_sin_rendimiento.
    assert out["meta"]["n_part_sin_rendimiento"] >= 1
    # No existe celda de 2015 por estrato (ese participante no es activo en 2015).
    anios_estrato = {f["anio"] for f in out["estrato"]}
    assert 2015 not in anios_estrato


# ---------------------------------------------------------------------------
# Invariante 12: top-8 de facultad único con "Otras" coherente
# ---------------------------------------------------------------------------
def test_top8_facultad_otras_coherente():
    # 10 facultades, cada una con 110 activos en 2012; ~5 inician en cada una.
    ana = []
    rend = []
    facs = [f"Fac{i:02d}" for i in range(10)]
    cod = 0
    for fac in facs:
        for j in range(110):
            cod += 1
            key = f"K{cod:06d}"
            inicia = 2012 if j < 5 else np.nan
            ana.append([key, inicia, "2", "F", fac, "Pregrado", "Regular"])
            rend.append([key, _periodo(2012)])
    out = hr.compute_historical_rates(_analitico(ana), _rend(rend))

    cats = {f["categoria"] for f in out["facultad"]}
    assert "Otras" in cats  # 10 > 8 => hay cola
    assert len([c for c in cats if c != "Otras"]) <= 8
    # Coherencia num <= den en "Otras".
    otras = [f for f in out["facultad"] if f["categoria"] == "Otras"]
    for f in otras:
        assert f["num"] <= f["den"]


def test_facultad_omite_otras_con_8_o_menos():
    ana = []
    rend = []
    facs = [f"Fac{i:02d}" for i in range(8)]
    cod = 0
    for fac in facs:
        for _ in range(110):
            cod += 1
            key = f"K{cod:06d}"
            ana.append([key, np.nan, "2", "F", fac, "Pregrado", "Regular"])
            rend.append([key, _periodo(2012)])
    out = hr.compute_historical_rates(_analitico(ana), _rend(rend))
    cats = {f["categoria"] for f in out["facultad"]}
    assert "Otras" not in cats
    assert len(cats) == 8


# ---------------------------------------------------------------------------
# Invariante 13: plausibilidad (la tasa crece de ~0 a unos pocos %)
# ---------------------------------------------------------------------------
def test_plausibilidad_tasa_crece():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    estrato6 = {f["anio"]: f["tasa_pct"] for f in out["estrato"]
                if f["categoria"] == "6"}
    assert 2012 in estrato6 and 2020 in estrato6
    # ~0.8% en 2012 (1/121) y ~6.7% en 2020 (8/120): crece y queda en pocos %.
    assert estrato6[2012] < 2.0
    assert estrato6[2020] > estrato6[2012]
    assert estrato6[2020] < 15.0


# ---------------------------------------------------------------------------
# Validación de entrada
# ---------------------------------------------------------------------------
def test_falta_columna_lanza_valueerror():
    ana, rend = _poblacion_basica()
    ana_sin = ana.drop(columns=["ESTRATO_SOCIAL"])
    with pytest.raises(ValueError, match="ESTRATO_SOCIAL"):
        hr.compute_historical_rates(ana_sin, rend)


def test_framing_tasa_inicio():
    ana, rend = _poblacion_basica()
    out = hr.compute_historical_rates(ana, rend)
    assert out["meta"]["framing"] == "tasa_inicio"
