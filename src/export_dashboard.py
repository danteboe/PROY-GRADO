"""Exporta un cubo agregado (JSON) para alimentar el dashboard interactivo.

Decisión de diseño
------------------
El dashboard es una aplicación React **sin backend**. Para que sea ligero y, a la
vez, permita filtrar por cualquier combinación de dimensiones del lado del
cliente, no se exportan los microdatos (234k estudiantes) ni los archivos fuente
(que además son sensibles). En su lugar se exporta un **cubo pre-agregado**: una
tabla donde cada fila es una combinación única de dimensiones categóricas y lleva
el conteo de estudiantes (`n`). El navegador reconstruye cualquier indicador
sumando las celdas que satisfacen los filtros activos.

Esto respeta el principio de minimización de datos (no se publican registros
individuales) y mantiene el artefacto pequeño (~pocos MB, muy comprimible).

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

# Dimensiones categóricas del cubo (cada combinación distinta es una celda).
CUBE_DIMS = [
    "nivel", "facultad", "programa", "genero", "estrato",
    "tipo_admision", "estado", "anio_mov", "modalidad",
    "pga_bin", "avance_bin", "icfes_bin",
]


def _faculty_name_map() -> dict:
    """Mapa de código de facultad -> nombre legible (desde `programas`)."""
    pg = utils.load_source(
        "programas",
        columns=["CODIGO_FACULTAD_PROGRAMA_1", "DESCRIPCION_FACULTAD_PROGRAMA_1"],
        fix_encoding=True,
    )
    pg = pg.dropna().drop_duplicates("CODIGO_FACULTAD_PROGRAMA_1")
    m = pg.set_index("CODIGO_FACULTAD_PROGRAMA_1")["DESCRIPCION_FACULTAD_PROGRAMA_1"].to_dict()
    # Normalizar a Título (evita todo-mayúsculas en la interfaz).
    return {k: str(v).title() for k, v in m.items()}


def _bin_series(s: pd.Series, bins, labels) -> pd.Series:
    out = pd.cut(s, bins=bins, right=False, labels=labels)
    return out.astype("object").where(out.notna(), "Sin dato")


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

    d["pga_bin"] = _bin_series(df["PGA_ULTIMO"], [0, 3, 3.5, 4, 4.5, 5.01],
                               ["<3.0", "3.0-3.5", "3.5-4.0", "4.0-4.5", "4.5-5.0"])
    d["avance_bin"] = _bin_series(df["SEMESTRE_AVANCE"], [0, 2, 4, 6, 8, 10, 100],
                                  ["0-2", "2-4", "4-6", "6-8", "8-10", "10+"])
    d["icfes_bin"] = _bin_series(df["ICFES_PUNTAJE_TOTAL"], [0, 300, 350, 400, 2000],
                                 ["<300", "300-350", "350-400", "400+"])

    # Agregación: conteo de estudiantes y de participantes por celda.
    cube = (d.groupby(CUBE_DIMS, dropna=False)
              .agg(n=("participa", "size"), part=("participa", "sum"))
              .reset_index())
    cube["n"] = cube["n"].astype(int)
    cube["part"] = cube["part"].astype(int)

    # Codificar dimensiones categóricas como índices enteros + diccionarios,
    # para reducir el tamaño del JSON (strings repetidos se guardan una vez).
    dicts = {}
    rows = []
    cat_dims = [c for c in CUBE_DIMS]
    codebooks = {}
    for dim in cat_dims:
        cats = sorted(cube[dim].astype(str).unique().tolist())
        codebooks[dim] = {v: i for i, v in enumerate(cats)}
        dicts[dim] = cats

    for _, r in cube.iterrows():
        row = [codebooks[dim][str(r[dim])] for dim in cat_dims]
        row.append(int(r["n"]))
        row.append(int(r["part"]))
        rows.append(row)

    # Metadatos y catálogos para la interfaz.
    eventos = pd.read_parquet(config.MOBILITY_EVENTS)
    eventos_por_anio = (eventos[eventos["ANIO"] >= 2002]
                        .groupby("ANIO").size().astype(int))
    eventos_modalidad_anio = (eventos[eventos["ANIO"] >= 2010]
                              .groupby(["ANIO", "MODALIDAD"]).size()
                              .reset_index(name="n"))

    out = {
        "meta": {
            "generado": pd.Timestamp.now().strftime("%Y-%m-%d"),
            "n_estudiantes": int(len(df)),
            "n_participantes": int(df["PARTICIPA"].sum()),
            "n_eventos": int(len(eventos)),
            "dims": cat_dims,
        },
        "codebooks": dicts,
        "rows": rows,  # [idx_dim_0, ..., idx_dim_k, n, part]
        "eventos_anio": [
            {"anio": int(a), "n": int(v)} for a, v in eventos_por_anio.items()
        ],
        "eventos_modalidad_anio": [
            {"anio": int(r.ANIO), "modalidad": r.MODALIDAD, "n": int(r.n)}
            for r in eventos_modalidad_anio.itertuples()
        ],
    }

    if verbose:
        print(f"Celdas del cubo: {len(rows):,} | dimensiones: {len(cat_dims)}")
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
