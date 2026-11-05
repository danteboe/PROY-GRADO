"""Tests unitarios de src/clustering_participantes.compute_clustering (design §7).

Los casos sobre el dataset real usan la fixture ``out_real`` (lee
``config.ANALYTIC_DATASET`` una sola vez). Los casos de borde (features ausentes,
coerción de estrato, privacidad) usan DataFrames sintéticos. ``faculty_name_map``
se parchea para no tocar la fuente ``programas`` real.
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from src import clustering_participantes as cp
from src import config


@pytest.fixture(autouse=True)
def _sin_fuente_programas(monkeypatch):
    """Evita leer la fuente real: facultad ya es nombre legible (mapa identidad)."""
    monkeypatch.setattr(cp.comparative_stats, "faculty_name_map", lambda: {})


@pytest.fixture(scope="module")
def out_real():
    """Resultado de compute_clustering sobre el dataset analítico real."""
    df = pd.read_parquet(config.ANALYTIC_DATASET)
    return cp.compute_clustering(df)


# ---------------------------------------------------------------------------
# Casos sobre el dataset real
# ---------------------------------------------------------------------------
def test_suma_n_igual_n_usados(out_real):
    assert out_real["meta"]["disponible"] is True
    total = sum(c["n"] for c in out_real["clusters"])
    assert total == out_real["meta"]["n_usados"]


def test_suma_pct_cerca_100(out_real):
    total_pct = sum(c["pct"] for c in out_real["clusters"])
    assert abs(total_pct - 100.0) <= 0.5


def test_k_elegido_en_rango(out_real):
    k = out_real["meta"]["k_elegido"]
    assert 2 <= k <= 10
    assert len(out_real["clusters"]) == k


def test_silueta_k_elegido_valida(out_real):
    k = out_real["meta"]["k_elegido"]
    sil = {c["k"]: c["silueta"] for c in out_real["curvas"]}[k]
    assert sil is not None and -1.0 <= sil <= 1.0


def test_curvas_cubre_k_2_a_10(out_real):
    ks = [c["k"] for c in out_real["curvas"]]
    assert ks == list(range(2, 11))


def test_determinismo_tamanos_cluster(out_real):
    df = pd.read_parquet(config.ANALYTIC_DATASET)
    out2 = cp.compute_clustering(df)
    t1 = [c["n"] for c in out_real["clusters"]]
    t2 = [c["n"] for c in out2["clusters"]]
    assert t1 == t2
    assert out_real["meta"]["k_elegido"] == out2["meta"]["k_elegido"]


def test_centroides_finitos_y_en_rango(out_real):
    for c in out_real["clusters"]:
        for item in c["centroide"]:
            lo, hi = cp.RANGOS_VALIDOS_CENTROIDE[item["var"]]
            assert item["valor"] is not None
            assert np.isfinite(item["valor"])
            assert lo <= item["valor"] <= hi, (item["var"], item["valor"])


def test_orden_canonico_semestre_avance(out_real):
    def _val(c, var):
        return {i["var"]: i["valor"] for i in c["centroide"]}[var]

    # El orden canónico ordena por los centroides SIN redondear; sobre los valores
    # publicados (redondeados) la clave primaria SEMESTRE_AVANCE debe quedar no
    # decreciente (los empates tras redondeo los desempata PGA/EDAD sin redondear).
    semestres = [_val(c, "SEMESTRE_AVANCE") for c in out_real["clusters"]]
    assert semestres == sorted(semestres)
    assert [c["id"] for c in out_real["clusters"]] == list(range(len(out_real["clusters"])))


def test_perfil_usa_icfes_lectura_critica(out_real):
    variables = {p["var"] for p in out_real["clusters"][0]["perfil_numerico"]}
    assert "ICFES_LECTURA_CRITICA" in variables
    assert "ICFES_LECTURA" not in variables


def test_serializable_sin_nan_inf(out_real):
    texto = json.dumps(out_real, ensure_ascii=False, allow_nan=False)
    assert "NaN" not in texto and "Infinity" not in texto


def test_privacidad_sin_estructuras_de_tamano_n(out_real):
    """Ninguna estructura publicada tiene longitud ~n_usados; categorías con n>=30."""
    n_usados = out_real["meta"]["n_usados"]
    # curvas depende de k (rango), clusters de k_elegido.
    assert len(out_real["curvas"]) == 9
    assert len(out_real["clusters"]) == out_real["meta"]["k_elegido"]
    for c in out_real["clusters"]:
        assert len(c["centroide"]) == len(cp.FEATURES)
        assert len(c["centroide_z"]) == len(cp.FEATURES)
        assert len(c["perfil_numerico"]) == len(cp.PERFIL_NUMERICO)
        # Ninguna lista publicada se aproxima a n_usados.
        for pc in c["perfil_categorico"]:
            assert len(pc["distribucion"]) < n_usados
            for d in pc["distribucion"]:
                assert d["n"] >= cp.MIN_N


def test_etiquetas_unicas(out_real):
    etiquetas = [c["etiqueta"] for c in out_real["clusters"]]
    assert len(set(etiquetas)) == len(etiquetas)


def test_narrativa_descriptiva(out_real):
    narr = out_real["narrativa"].lower()
    assert "descriptiv" in narr
    assert "causal" in narr


# ---------------------------------------------------------------------------
# Casos de borde (DataFrames sintéticos)
# ---------------------------------------------------------------------------
def test_coercion_estrato_sin_typeerror():
    """ESTRATO_SOCIAL object con 'Sin dato'/NaN no lanza TypeError y se excluye."""
    n = 400
    rng = np.random.default_rng(0)
    df = pd.DataFrame({
        "PARTICIPA": 1,
        "ES_PREGRADO": True,
        "PGA_ULTIMO": rng.uniform(2.5, 4.8, n),
        "PERCENTIL_PGA_PROGRAMA": rng.uniform(0, 100, n),
        "SEMESTRE_AVANCE": rng.integers(1, 16, n).astype(float),
        "PCT_CREDITOS_APROBADOS": rng.uniform(0.6, 1.0, n),
        "EDAD": rng.uniform(17, 30, n),
        "ESTRATO_SOCIAL": pd.Series(
            [None if rng.random() < 0.3 else rng.choice(["1", "2", "3", "4", "5", "6"])
             for _ in range(n)], dtype="object"),
        "ICFES_PUNTAJE_TOTAL": rng.uniform(256, 499, n),
        "ICFES_MATEMATICAS": rng.uniform(10, 127, n),
        "ICFES_LECTURA_CRITICA": rng.uniform(12, 100, n),
        "ICFES_INGLES": rng.uniform(18, 100, n),
        "NUMERO_OPCIONES_INSCRITAS": rng.integers(0, 6, n),
        "N_EVENTOS_MOVILIDAD": rng.integers(1, 4, n),
        "GENERO": rng.choice(["F", "M"], n),
        "FACULTAD": "Ingenieria",
        "MODALIDAD_PRINCIPAL": "Intercambio internacional",
        "TIPO_ADMISION": "Regular",
        "NIVEL": "Pregrado",
    })
    out = cp.compute_clustering(df)
    assert out["meta"]["disponible"] is True
    estrato = {p["var"]: p for p in out["clusters"][0]["perfil_numerico"]}["ESTRATO_SOCIAL"]
    # La media (si hay dato) debe caer en el rango ordinal 1..6.
    if estrato["media"] is not None:
        assert 1.0 <= estrato["media"] <= 6.0


def test_disponible_false_sin_features():
    """DataFrame sin las features -> disponible=false bien formado."""
    df = pd.DataFrame({
        "PARTICIPA": [1, 0, 1, 0],
        "ES_PREGRADO": [True, True, True, True],
    })
    out = cp.compute_clustering(df)
    assert out["meta"]["disponible"] is False
    assert "motivo" in out["meta"]
    assert out["clusters"] == []
    assert out["curvas"] == []
    assert isinstance(out["narrativa"], str) and out["narrativa"]


def test_participa_no_binaria_lanza():
    df = pd.DataFrame({"PARTICIPA": [0, 1, 2], "ES_PREGRADO": [True, True, True]})
    with pytest.raises(ValueError):
        cp.compute_clustering(df)
