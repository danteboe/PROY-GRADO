"""Exporta un cubo agregado (JSON) para alimentar el dashboard interactivo.

Decisión de diseño
------------------
El dashboard es una aplicación React **sin backend**. Para que sea ligero y, a la
vez, permita filtrar por cualquier combinación de dimensiones del lado del
cliente, no se exportan los microdatos (234k estudiantes) ni los archivos fuente
(que además son sensibles). En su lugar se exporta un **cubo pre-agregado**: una
tabla donde cada fila es una combinación única de dimensiones y lleva el conteo de
estudiantes (`n`) y de participantes (`part`). El navegador reconstruye cualquier
indicador sumando las celdas que satisfacen los filtros activos.

El cubo incluye dos tipos de dimensiones:

* **Categóricas** (nivel, facultad, programa, género, estrato, tipo de admisión,
  estado académico, año de movilidad, modalidad): filtros de selección múltiple.
* **Numéricas discretizadas** (PGA, semestre de avance, puntaje ICFES, edad):
  guardadas como enteros en una rejilla fina (p. ej. PGA en pasos de 0.25) para
  habilitar **sliders de rango** en la interfaz. El valor centinela ``-1``
  representa "sin dato". La rejilla fina permite que el cross-filtering entre
  sliders y filtros categóricos sea exacto manteniendo el archivo pequeño
  (~3.5 MB sin comprimir, ~0.34 MB con gzip).

Esto respeta el principio de minimización de datos (no se publican registros
individuales).

Uso
---
    python -m src.export_dashboard
Genera:
    dashboard/public/data.json
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

from . import config, utils

KEY = config.STUDENT_KEY

# Dimensiones categóricas del cubo (filtros de selección múltiple).
CAT_DIMS = [
    "nivel", "facultad", "programa", "genero", "estrato",
    "tipo_admision", "estado", "anio_mov", "modalidad",
]

# Dimensiones numéricas discretizadas (sliders de rango). Para cada una se define
# el paso de la rejilla, un factor de escala entero (para no perder decimales) y
# el rango mostrado al usuario. El sentinel NA_SENTINEL marca "sin dato".
NA_SENTINEL = -1

NUM_DIMS = {
    # nombre: (serie_scaler, paso_en_unidades_reales, min_real, max_real, decimales)
    "pga":    dict(scale=100, step=0.25, lo=0.0,  hi=5.0,   dec=2, unit=""),
    "avance": dict(scale=1,   step=2,    lo=0,    hi=16,    dec=0, unit="sem"),
    "icfes":  dict(scale=1,   step=50,   lo=100,  hi=500,   dec=0, unit="pts"),
    "edad":   dict(scale=1,   step=5,    lo=15,   hi=45,    dec=0, unit="años"),
}


def _faculty_name_map() -> dict:
    """Mapa de código de facultad -> nombre legible (desde `programas`)."""
    pg = utils.load_source(
        "programas",
        columns=["CODIGO_FACULTAD_PROGRAMA_1", "DESCRIPCION_FACULTAD_PROGRAMA_1"],
        fix_encoding=True,
    )
    pg = pg.dropna().drop_duplicates("CODIGO_FACULTAD_PROGRAMA_1")
    m = pg.set_index("CODIGO_FACULTAD_PROGRAMA_1")["DESCRIPCION_FACULTAD_PROGRAMA_1"].to_dict()
    return {k: str(v).title() for k, v in m.items()}


def _discretize_pga(s: pd.Series) -> pd.Series:
    # Paso 0.25, almacenado como entero x100 (p. ej. 4.25 -> 425).
    return ((s * 4).round() * 25).fillna(NA_SENTINEL).astype(int)


def _discretize_step(s: pd.Series, step: int, lo: int, hi: int) -> pd.Series:
    v = (s / step).round() * step
    v = v.clip(lower=lo, upper=hi)
    return v.fillna(NA_SENTINEL).astype(int)


def build_cube(verbose: bool = True) -> dict:
    df = pd.read_parquet(config.ANALYTIC_DATASET)
    fac_map = _faculty_name_map()

    d = pd.DataFrame(index=df.index)
    d["nivel"] = df["NIVEL"].fillna("Sin dato")
    d["facultad"] = df["FACULTAD"].map(lambda c: fac_map.get(c, c)).fillna("Sin dato")
    d["programa"] = df["PROGRAMA"].fillna("Sin dato").astype(str).str.title()
    d["genero"] = df["GENERO"].fillna("Sin dato")
    d["estrato"] = df["ESTRATO_SOCIAL"].fillna("Sin dato").astype(str)
    d["tipo_admision"] = df["TIPO_ADMISION"].fillna("Sin dato")
    d["estado"] = df["ESTADO_ACADEMICO"].fillna("Sin dato")
    d["modalidad"] = df["MODALIDAD_PRINCIPAL"].fillna("No participa")
    d["participa"] = df["PARTICIPA"].astype(int)

    anio = df["PRIMER_ANIO_MOVILIDAD"]
    d["anio_mov"] = np.where(anio.notna(), anio.fillna(0).astype(int).astype(str), "N/A")

    # Dimensiones numéricas discretizadas (enteros).
    d["pga"] = _discretize_pga(df["PGA_ULTIMO"])
    d["avance"] = _discretize_step(df["SEMESTRE_AVANCE"], 2, 0, 16)
    d["icfes"] = _discretize_step(df["ICFES_PUNTAJE_TOTAL"], 50, 100, 500)
    d["edad"] = _discretize_step(df["EDAD"], 5, 15, 45)

    num_cols = list(NUM_DIMS)
    dims = CAT_DIMS + num_cols

    # Agregación: conteo de estudiantes y de participantes por celda.
    cube = (d.groupby(dims, dropna=False)
              .agg(n=("participa", "size"), part=("participa", "sum"))
              .reset_index())
    cube["n"] = cube["n"].astype(int)
    cube["part"] = cube["part"].astype(int)

    # Codificar las dimensiones categóricas como índices enteros + diccionarios.
    codebooks = {}
    dicts = {}
    for dim in CAT_DIMS:
        cats = sorted(cube[dim].astype(str).unique().tolist())
        codebooks[dim] = {v: i for i, v in enumerate(cats)}
        dicts[dim] = cats

    rows = []
    for r in cube.itertuples(index=False):
        rd = r._asdict()
        row = [codebooks[dim][str(rd[dim])] for dim in CAT_DIMS]
        row += [int(rd[dim]) for dim in num_cols]  # numéricos en bruto (ya enteros)
        row.append(int(rd["n"]))
        row.append(int(rd["part"]))
        rows.append(row)

    # Metadatos de los sliders: rango real y paso, en unidades del usuario.
    num_meta = {}
    for name, spec in NUM_DIMS.items():
        num_meta[name] = {
            "scale": spec["scale"],
            "step": spec["step"],
            "min": spec["lo"],
            "max": spec["hi"],
            "dec": spec["dec"],
            "unit": spec["unit"],
        }

    eventos = pd.read_parquet(config.MOBILITY_EVENTS)
    eventos_modalidad_anio = (eventos[eventos["ANIO"] >= 2010]
                              .groupby(["ANIO", "MODALIDAD"]).size()
                              .reset_index(name="n"))

    # ----- Vistas agregadas adicionales (responden preguntas de negocio) -----
    df_fac = df.copy()
    df_fac["FAC"] = df_fac["FACULTAD"].map(lambda c: fac_map.get(c, c)).fillna("Sin dato")

    # (a) Matriz de oportunidad por facultad: volumen vs. tasa de participación.
    opp = (df_fac.groupby("FAC")["PARTICIPA"].agg(n="size", part="sum").reset_index())
    opp = opp[opp["n"] >= 500].copy()
    opp["tasa"] = (100 * opp["part"] / opp["n"]).round(2)
    opp["no_part"] = opp["n"] - opp["part"]
    oportunidad = [
        {"facultad": r.FAC, "n": int(r.n), "part": int(r.part),
         "noPart": int(r.no_part), "tasa": float(r.tasa)}
        for r in opp.sort_values("n", ascending=False).itertuples()
    ]

    # (b) Heatmap facultad x estrato (tasa de participación) en pregrado.
    preg = df_fac[df_fac["ES_PREGRADO"]].copy()
    preg["EST"] = preg["ESTRATO_SOCIAL"].fillna("Sin dato").astype(str)
    hm = (preg.groupby(["FAC", "EST"])["PARTICIPA"].agg(n="size", part="sum").reset_index())
    hm = hm[hm["n"] >= 30].copy()
    hm["tasa"] = (100 * hm["part"] / hm["n"]).round(2)
    heatmap_fac_estrato = [
        {"facultad": r.FAC, "estrato": r.EST, "n": int(r.n),
         "part": int(r.part), "tasa": float(r.tasa)}
        for r in hm.itertuples()
    ]

    # (c) Modalidad x facultad (composición de la movilidad por facultad).
    evj = eventos.merge(df_fac[[KEY, "FAC"]], on=KEY, how="left")
    mf = evj.groupby(["FAC", "MODALIDAD"]).size().reset_index(name="n")
    tot_fac = mf.groupby("FAC")["n"].transform("sum")
    mf = mf[tot_fac >= 50].copy()
    modalidad_facultad = [
        {"facultad": r.FAC, "modalidad": r.MODALIDAD, "n": int(r.n)}
        for r in mf.itertuples()
    ]

    # (d) Estacionalidad: eventos por año y semestre (ciclo 10 vs 20).
    ev2 = eventos.copy()
    ev2["ciclo"] = ev2["PERIODO"].astype(str).str[4:6]
    ciclo_map = {"10": "Primer semestre", "20": "Segundo semestre"}
    ev2["sem"] = ev2["ciclo"].map(ciclo_map)
    seas = ev2[ev2["sem"].notna() & (ev2["ANIO"] >= 2010)]
    estacionalidad = [
        {"anio": int(r.ANIO), "sem": r.sem, "n": int(r.n)}
        for r in seas.groupby(["ANIO", "sem"]).size().reset_index(name="n").itertuples()
    ]
    estacionalidad_total = [
        {"sem": k, "n": int(v)} for k, v in ev2["sem"].value_counts().items()
    ]

    # (e) Resultado académico de la experiencia de movilidad.
    resultado_mov = [
        {"resultado": k, "n": int(v)}
        for k, v in eventos["RESULTADO"].value_counts().items()
    ]

    out = {
        "meta": {
            "generado": pd.Timestamp.now().strftime("%Y-%m-%d"),
            "n_estudiantes": int(len(df)),
            "n_participantes": int(df["PARTICIPA"].sum()),
            "n_eventos": int(len(eventos)),
            "cat_dims": CAT_DIMS,
            "num_dims": num_cols,
            "num_meta": num_meta,
            "na_sentinel": NA_SENTINEL,
        },
        "codebooks": dicts,
        # cada fila: [idx_cat_0..idx_cat_k, num_0..num_m, n, part]
        "rows": rows,
        "eventos_modalidad_anio": [
            {"anio": int(r.ANIO), "modalidad": r.MODALIDAD, "n": int(r.n)}
            for r in eventos_modalidad_anio.itertuples()
        ],
        "oportunidad": oportunidad,
        "heatmap_fac_estrato": heatmap_fac_estrato,
        "modalidad_facultad": modalidad_facultad,
        "estacionalidad": estacionalidad,
        "estacionalidad_total": estacionalidad_total,
        "resultado_mov": resultado_mov,
    }

    if verbose:
        print(f"Celdas del cubo: {len(rows):,} | "
              f"cat: {len(CAT_DIMS)} | num: {len(num_cols)}")
        print(f"Estudiantes: {out['meta']['n_estudiantes']:,} | "
              f"participantes: {out['meta']['n_participantes']:,}")
    return out


def main() -> None:
    out = build_cube(verbose=True)
    target_dir = config.ROOT_DIR / "dashboard" / "public"
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / "data.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    size_mb = path.stat().st_size / 1e6
    print(f"Exportado: {path} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
