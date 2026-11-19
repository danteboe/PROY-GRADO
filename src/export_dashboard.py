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
  estado académico, año de movilidad, modalidad, resultado de la experiencia):
  filtros de selección múltiple.
* **Numéricas discretizadas** (PGA, semestre de avance, puntaje ICFES total, edad,
  e ICFES por materia: matemáticas, lectura crítica e inglés): guardadas como
  enteros en una rejilla fina (p. ej. PGA en pasos de 0.25; ICFES por materia en
  pasos de 10) para habilitar **sliders de rango** en la interfaz. El valor
  centinela ``-1`` representa "sin dato".

Tamaño del cubo (tras añadir las 3 dims ICFES por materia y la dim 'resultado'):
~131 mil celdas, ~7.3 MB sin comprimir y ~0.63 MB con gzip. El crecimiento frente
a la versión anterior (~3.5 MB) proviene de la explosión combinatoria de las dims
nuevas. Se considera aceptable: lo relevante en transferencia es el gzip (0.63 MB),
que sirve el servidor estático, y un JSON de ~7.3 MB se parsea sin problema en el
cliente. El paso 10 de las dims ICFES por materia es un compromiso deliberado para
limitar ese crecimiento manteniendo granularidad útil (ver NUM_DIMS).

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

from . import (
    clustering_participantes,
    comparative_stats,
    config,
    historical_rates,
    historical_stats,
    utils,
)

KEY = config.STUDENT_KEY

# Dimensiones categóricas del cubo (filtros de selección múltiple).
CAT_DIMS = [
    "nivel", "facultad", "programa", "genero", "estrato",
    "tipo_admision", "estado", "anio_mov", "modalidad", "resultado",
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
    # ICFES por materia (paso 10 para limitar el crecimiento del cubo al añadir 3
    # dims). No se incluyen ciencias naturales/sociales: no existen en el parquet.
    "icfes_mate":    dict(scale=1, step=10, lo=0, hi=100, dec=0, unit="pts"),
    "icfes_lectura": dict(scale=1, step=10, lo=0, hi=100, dec=0, unit="pts"),
    "icfes_ingles":  dict(scale=1, step=10, lo=0, hi=100, dec=0, unit="pts"),
}


def _faculty_name_map() -> dict:
    """Mapa de código de facultad -> nombre legible (desde `programas`).

    Delega en `comparative_stats.faculty_name_map()` para no duplicar la lógica
    (fuente única; RF-5).
    """
    return comparative_stats.faculty_name_map()


def _discretize_pga(s: pd.Series) -> pd.Series:
    # Paso 0.25, almacenado como entero x100 (p. ej. 4.25 -> 425).
    return ((s * 4).round() * 25).fillna(NA_SENTINEL).astype(int)


def _discretize_step(s: pd.Series, step: int, lo: int, hi: int) -> pd.Series:
    v = (s / step).round() * step
    v = v.clip(lower=lo, upper=hi)
    return v.fillna(NA_SENTINEL).astype(int)


def _activity_counts(d: pd.DataFrame, ids: pd.Series, activos: pd.DataFrame, desde: int, hasta: int) -> dict:
    """Agrupa conteos por celda del cubo y conjunto de años, sin exportar identificadores."""
    # ngroup y la agregación del cubo recorren las mismas celdas en orden.
    perfiles = d.groupby(CAT_DIMS + list(NUM_DIMS), dropna=False).ngroup()
    perfil_por_estudiante = pd.Series(perfiles.to_numpy(), index=ids)
    en_rango = activos[activos["anio"].between(desde, hasta)]
    anios = en_rango.sort_values("anio").groupby(KEY)["anio"].agg(tuple)
    patrones, codebook = pd.factorize(anios)
    conteos = pd.DataFrame({
        "perfil": anios.index.map(perfil_por_estudiante).fillna(-1).astype(int),
        "patron": patrones,
    }).groupby(["perfil", "patron"]).size()
    return {
        "anios": [list(map(int, patron)) for patron in codebook],
        # perfil -1: activo en el historial sin atributos en el dataset analítico.
        "conteos": [[int(perfil), int(patron), int(n)] for (perfil, patron), n in conteos.items()],
    }


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

    # Dimensión 'resultado': resultado académico del PRIMER evento de movilidad de
    # cada estudiante. Se toma del parquet de eventos (KEY, PERIODO, RESULTADO),
    # ordenando por PERIODO ascendente y quedándose con el primer evento por KEY.
    # Quienes no tienen evento quedan como 'No participa'.
    eventos = pd.read_parquet(config.MOBILITY_EVENTS)
    primer_evento = (eventos.sort_values("PERIODO")
                            .groupby(KEY, as_index=True)
                            .head(1)
                            .set_index(KEY)["RESULTADO"])
    d["resultado"] = (df[KEY].map(primer_evento)
                        .fillna("No participa").astype(str).values)

    # Dimensiones numéricas discretizadas (enteros).
    d["pga"] = _discretize_pga(df["PGA_ULTIMO"])
    d["avance"] = _discretize_step(df["SEMESTRE_AVANCE"], 2, 0, 16)
    d["icfes"] = _discretize_step(df["ICFES_PUNTAJE_TOTAL"], 50, 100, 500)
    d["edad"] = _discretize_step(df["EDAD"], 5, 15, 45)
    d["icfes_mate"] = _discretize_step(df["ICFES_MATEMATICAS"], 10, 0, 100)
    d["icfes_lectura"] = _discretize_step(df["ICFES_LECTURA_CRITICA"], 10, 0, 100)
    d["icfes_ingles"] = _discretize_step(df["ICFES_INGLES"], 10, 0, 100)

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
        if dim == "anio_mov":
            anios = [int(cat) for cat in cats if cat.isdecimal()]
            if anios:
                desde, hasta = min(anios), max(anios)
                cats = [str(anio) for anio in range(desde, hasta + 1)] + ["N/A"]
        etiqueta_faltante = (
            "N/A" if dim == "anio_mov" else
            "No participa" if dim in {"modalidad", "resultado"} else
            "Sin dato"
        )
        if etiqueta_faltante not in cats:
            cats.append(etiqueta_faltante)
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

    # `eventos` ya se cargó arriba (para la dim 'resultado').
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

    # Análisis comparativo inferencial (fuente única; alcance pregrado, RF-1/RF-2).
    out["comparativo"] = comparative_stats.compute_comparative(df, "pregrado")

    # Evolución temporal (histórico): composición de participantes por año (fuente
    # única; mismo patrón que el comparativo, RF-1/RF-2).
    out["historico"] = historical_stats.compute_historical(df)

    # Tasa de inicio de movilidad por año y grupo (fuente única; clave hermana de
    # 'historico'). Requiere historial_rendimiento (clave + periodo); si la fuente
    # falta o es ilegible, load_source lanza y el exportador falla de forma visible
    # (no se emite un data.json parcial).
    rend = utils.load_source(
        "historial_rendimiento", columns=["CODIGO_ESTUDIANTE", "PERIODO"]
    )
    out["historico_tasas"] = historical_rates.compute_historical_rates(df, rend)
    anios_mov = [int(cat) for cat in dicts["anio_mov"] if cat.isdecimal()]
    if anios_mov:
        activos = historical_rates.active_student_years(rend)
        out["poblacion_activa"] = historical_rates.compute_active_population(
            activos, min(anios_mov), max(anios_mov)
        )
        out["actividad"] = _activity_counts(d, df[KEY], activos, min(anios_mov), max(anios_mov))

    # Caracterización por clustering (K-means) de los participantes de pregrado
    # (fuente única; mismo patrón que el comparativo, RF-1/RF-2). Recibe el df ya
    # cargado para no releer el parquet.
    out["clustering"] = clustering_participantes.compute_clustering(df)

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
