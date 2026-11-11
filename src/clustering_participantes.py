"""Fuente única de cálculo del clustering (K-means) de los participantes.

Este módulo concentra TODO el cálculo de la caracterización por agrupamiento de
los estudiantes que participan en internacionalización (foco: pregrado). Es la
**fuente única de verdad** (RNF-1): tanto el exportador del dashboard
(``export_dashboard``, que produce ``data.json``) como el notebook
``08_clustering_participantes`` (figuras/tablas del informe LaTeX) importan la
función pura ``compute_clustering`` y **solo leen** su resultado. Nadie recalcula
K-means en JavaScript ni en LaTeX.

La función es **pura**: recibe un ``DataFrame`` (o lee el parquet si recibe una
ruta/``None``) y devuelve un dict serializable de tipos nativos. El redondeo a la
precisión publicada se aplica **una sola vez** aquí (dict ``DECIMALES``), de modo
que web e informe muestren exactamente las mismas cifras.

Metodología fijada en ``design.md`` (§2) y contrato de datos en §3:
    * Alcance pregrado (``ES_PREGRADO`` & ``PARTICIPA == 1``); caso completo
      (listwise) sobre 5 features estandarizadas con ``StandardScaler``.
    * Barrido k=2..10 con codo (inercia) + silueta estimada por submuestreo
      determinista; selección de k por regla documentada con ramas de fallback.
    * Reordenamiento canónico determinista de los clusters por centroide
      (SEMESTRE_AVANCE -> PGA_ULTIMO -> EDAD) para que el id no dependa del label
      aleatorio de sklearn.
    * Centroides en unidades originales y en z; etiquetas en español derivadas
      algorítmicamente; perfilado numérico/categórico con variables externas.
    * Privacidad (Ley 1581): solo agregados; supresión de categorías con n<30.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from . import comparative_stats, config

# Semilla única de reproducibilidad (RF-3): todo lo aleatorio la usa.
RANDOM_SEED = config.RANDOM_SEED

# ---------------------------------------------------------------------------
# Features de clustering (design.md §2.2): un representante por constructo,
# estandarizadas. Orden fijo = orden de los vectores centroide. Etiquetas
# reutilizadas textualmente de comparative_stats.NUMERICAS donde coinciden.
# ---------------------------------------------------------------------------
FEATURES = [
    ("PGA_ULTIMO", "PGA (último)"),
    ("PERCENTIL_PGA_PROGRAMA", "Percentil de PGA (programa)"),
    ("SEMESTRE_AVANCE", "Semestre de avance"),
    ("PCT_CREDITOS_APROBADOS", "Proporción de créditos aprobados"),
    ("EDAD", "Edad"),
]

# Unidad publicada por feature (contrato §3; orden = FEATURES).
UNIDADES_FEATURE = {
    "PGA_ULTIMO": "0–5",
    "PERCENTIL_PGA_PROGRAMA": "0–100",
    "SEMESTRE_AVANCE": "sem",
    "PCT_CREDITOS_APROBADOS": "0–1",
    "EDAD": "años",
}

# Features descartadas, documentadas en meta.features_descartadas (design.md §3).
FEATURES_DESCARTADAS = [
    {"var": "PGA_PROMEDIO_HIST", "constructo": "desempeño",
     "motivo": "redundante con PGA_ULTIMO"},
    {"var": "PERCENTIL_PGA_NIVEL", "constructo": "posición relativa",
     "motivo": "redundante con PERCENTIL_PGA_PROGRAMA"},
    {"var": "SEMESTRES_MATRICULADOS", "constructo": "trayectoria",
     "motivo": "redundante con SEMESTRE_AVANCE"},
    {"var": "CREDITOS_APROBADOS_TOTAL", "constructo": "trayectoria",
     "motivo": "redundante con SEMESTRE_AVANCE"},
    {"var": "NUMERO_OPCIONES_INSCRITAS", "constructo": "exploración",
     "motivo": "baja pertinencia / asimetría (se perfila)"},
    {"var": "N_EVENTOS_MOVILIDAD", "constructo": "intensidad movilidad",
     "motivo": "casi constante; riesgo de cluster trivial (se perfila)"},
]

# Perfilado numérico (design.md §2.6): variables NO usadas como feature.
# Etiquetas reutilizadas de comparative_stats.NUMERICAS donde coinciden.
PERFIL_NUMERICO = [
    ("ICFES_PUNTAJE_TOTAL", "ICFES puntaje total"),
    ("ICFES_MATEMATICAS", "ICFES matemáticas"),
    ("ICFES_LECTURA_CRITICA", "ICFES lectura crítica"),
    ("ICFES_INGLES", "ICFES inglés"),
    ("ESTRATO_SOCIAL", "Estrato social (media)"),
    ("NUMERO_OPCIONES_INSCRITAS", "Número de opciones inscritas (media)"),
    ("N_EVENTOS_MOVILIDAD", "Eventos de movilidad (media)"),
]

# Perfilado categórico (design.md §2.6).
PERFIL_CATEGORICO = ["GENERO", "FACULTAD", "MODALIDAD_PRINCIPAL", "TIPO_ADMISION", "NIVEL"]

PERFIL_CATEGORICO_LABELS = {
    "GENERO": "Género",
    "FACULTAD": "Facultad",
    "MODALIDAD_PRINCIPAL": "Modalidad principal",
    "TIPO_ADMISION": "Tipo de admisión",
    "NIVEL": "Nivel",
}

# ---------------------------------------------------------------------------
# Precisión de publicación (RNF-1): redondeo ÚNICO aplicado tanto a data.json
# como a las tablas .tex del informe. Dict propio del módulo (design.md §2.5).
# ---------------------------------------------------------------------------
DECIMALES = {
    # Centroide en unidades originales, por feature.
    "PGA_ULTIMO": 2,
    "PERCENTIL_PGA_PROGRAMA": 1,
    "SEMESTRE_AVANCE": 1,
    "PCT_CREDITOS_APROBADOS": 3,
    "EDAD": 1,
    # Otros campos numéricos del contrato.
    "centroide_z": 2,
    "silueta": 4,
    "inercia": 0,
    "pct": 1,
    "cobertura_pct": 1,
    "media": 2,
    "min_cluster_pct": 1,
    "pct_descartados_na": 1,
}

# Rango válido del centroide por feature, en unidades originales (design.md §7).
# Constantes ejecutables: la prueba unitaria comprueba cada centroide contra ellas.
RANGOS_VALIDOS_CENTROIDE = {
    "PGA_ULTIMO": (0.0, 5.0),
    "PERCENTIL_PGA_PROGRAMA": (0.0, 100.0),
    "SEMESTRE_AVANCE": (0.0, 30.0),
    "PCT_CREDITOS_APROBADOS": (0.0, 1.0),
    "EDAD": (15.0, 80.0),
}

# Rango de barrido de k (design.md §2.4).
K_MIN, K_MAX = 2, 10

# Submuestreo determinista de la silueta (design.md §2.4).
SILUETA_SAMPLE_SIZE = 4000

# Supresión por privacidad (design.md §2.6, RNF-3).
MIN_N = 30


# ===========================================================================
# Utilidades internas de redondeo
# ===========================================================================
def _redondear(campo: str, valor):
    """Redondea `valor` a la precisión publicada del `campo` (dict DECIMALES).

    Devuelve ``None`` si el valor no es finito (NaN/inf no son válidos en JSON).
    Si el campo no está en DECIMALES, devuelve el float tal cual (saneado).
    """
    if valor is None:
        return None
    try:
        v = float(valor)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(v):
        return None
    dec = DECIMALES.get(campo)
    if dec is None:
        return v
    return round(v, dec)


# ===========================================================================
# Etiquetado algorítmico de clusters (design.md §2.5.1)
# ===========================================================================
# Fragmentos en español por feature y dirección (signo del z). La etiqueta se
# compone con las 1-2 features de mayor |z|. Descriptiva, nunca evaluativa.
_FRAGMENTOS_ETIQUETA = {
    "PGA_ULTIMO": {"alto": "de alto desempeño", "bajo": "de menor desempeño"},
    "PERCENTIL_PGA_PROGRAMA": {"alto": "en percentiles altos", "bajo": "en percentiles bajos"},
    "SEMESTRE_AVANCE": {"alto": "avanzados", "bajo": "en etapa inicial"},
    "PCT_CREDITOS_APROBADOS": {"alto": "de alta eficiencia", "bajo": "de menor eficiencia"},
    "EDAD": {"alto": "mayores", "bajo": "jóvenes"},
}


def etiquetar_cluster(centroide_z: list) -> list:
    """Devuelve los fragmentos (var, signo, |z|) ordenados por |z| descendente.

    `centroide_z` es la lista [{'var','z'}] del cluster. Se usa como insumo del
    etiquetado: `construir_etiquetas` compone los textos garantizando unicidad.
    """
    ordenados = sorted(centroide_z, key=lambda d: abs(d["z"]), reverse=True)
    out = []
    for d in ordenados:
        z = d["z"]
        signo = "alto" if z >= 0 else "bajo"
        out.append({"var": d["var"], "signo": signo, "abs_z": abs(z)})
    return out


def _texto_etiqueta(fragmentos: list, n_features: int) -> str:
    """Compone el texto en español a partir de las `n_features` dominantes."""
    piezas = []
    for f in fragmentos[:n_features]:
        frag = _FRAGMENTOS_ETIQUETA.get(f["var"], {}).get(f["signo"])
        if frag:
            piezas.append(frag)
    if not piezas:
        return "Grupo sin rasgo dominante"
    return "Grupo " + " y ".join(piezas)


def construir_etiquetas(clusters_z: list) -> list:
    """Compone una etiqueta única por cluster (design.md §2.5.1).

    `clusters_z` es la lista de `centroide_z` de cada cluster. Para cada cluster
    se usa la feature dominante (mayor |z|); si dos etiquetas colapsan se desempata
    añadiendo la 2.ª feature dominante.
    """
    frags = [etiquetar_cluster(cz) for cz in clusters_z]
    etiquetas = [_texto_etiqueta(f, 1) for f in frags]
    # Desempate: si hay duplicados, recomputar con 2 features para todos.
    if len(set(etiquetas)) < len(etiquetas):
        etiquetas = [_texto_etiqueta(f, 2) for f in frags]
    # Último recurso: si todavía colapsan, numerar para garantizar unicidad.
    vistas = {}
    for i, e in enumerate(etiquetas):
        if e in vistas:
            vistas[e] += 1
            etiquetas[i] = f"{e} ({vistas[e]})"
        else:
            vistas[e] = 1
    return etiquetas


# ===========================================================================
# Perfilado (design.md §2.6)
# ===========================================================================
def _perfil_numerico_cluster(sub_cluster: pd.DataFrame) -> list:
    """Media/n_con_dato/cobertura_pct por variable de PERFIL_NUMERICO."""
    n_cluster = len(sub_cluster)
    out = []
    for var, label in PERFIL_NUMERICO:
        if var == "ESTRATO_SOCIAL":
            # Coerción explícita: NaN/no-numéricos -> NaN; solo 1..6 (design.md §2.6).
            serie = pd.to_numeric(sub_cluster.get(var), errors="coerce")
            valido = serie.between(1, 6)
            n_con_dato = int(valido.sum())
            media = float(serie[valido].mean()) if n_con_dato > 0 else None
        else:
            serie = pd.to_numeric(sub_cluster.get(var), errors="coerce")
            valido = serie.notna()
            n_con_dato = int(valido.sum())
            media = float(serie[valido].mean()) if n_con_dato > 0 else None
        cobertura_pct = 100 * n_con_dato / n_cluster if n_cluster else 0.0
        out.append({
            "var": var,
            "label": label,
            "media": _redondear("media", media),
            "n_con_dato": n_con_dato,
            "cobertura_pct": _redondear("cobertura_pct", cobertura_pct),
        })
    return out


def _perfil_categorico_cluster(sub_cluster: pd.DataFrame, fac_map: dict) -> list:
    """Distribución {categoria,n,pct} por variable de PERFIL_CATEGORICO.

    Normalización idéntica al cubo/comparativo: FACULTAD -> nombre legible,
    fillna("Sin dato"). Supresión por privacidad: categorías con n<30 se agregan
    en "Otras" y se cuentan en categorias_suprimidas.
    """
    out = []
    n_cluster = len(sub_cluster)
    for var in PERFIL_CATEGORICO:
        label = PERFIL_CATEGORICO_LABELS.get(var, var)
        if var not in sub_cluster.columns:
            out.append({"var": var, "label": label,
                        "categorias_suprimidas": 0, "distribucion": []})
            continue
        if var == "FACULTAD":
            cat = sub_cluster[var].map(lambda c: fac_map.get(c, c)).fillna("Sin dato").astype(str)
        else:
            cat = sub_cluster[var].fillna("Sin dato").astype(str)
        conteos = cat.value_counts()
        conservadas = conteos[conteos >= MIN_N]
        suprimidas = conteos[conteos < MIN_N]
        categorias_suprimidas = int(len(suprimidas))
        n_otras = int(suprimidas.sum())

        distribucion = []
        for categoria, n in conservadas.items():
            distribucion.append({
                "categoria": str(categoria),
                "n": int(n),
                "pct": _redondear("pct", 100 * n / n_cluster if n_cluster else 0.0),
            })
        if n_otras >= MIN_N:
            distribucion.append({
                "categoria": "Otras",
                "n": n_otras,
                "pct": _redondear("pct", 100 * n_otras / n_cluster if n_cluster else 0.0),
            })
        out.append({
            "var": var,
            "label": label,
            "categorias_suprimidas": categorias_suprimidas,
            "distribucion": distribucion,
        })
    return out


# ===========================================================================
# Narrativa automática (design.md §4)
# ===========================================================================
def _fmt(valor, dec: int = 2) -> str:
    """Formatea un número a `dec` decimales con coma decimal española."""
    if valor is None:
        return "s. d."
    return f"{float(valor):.{dec}f}".replace(".", ",")


def _miles(n) -> str:
    """Separador de miles español (punto) para conteos enteros."""
    return f"{int(n):,}".replace(",", ".")


def construir_narrativa_clustering(out: dict) -> str:
    """Construye la prosa narrativa del clustering a partir de `out`.

    **Cero cifras tecleadas a mano** (M2): cada magnitud citada (k, tamaños y %
    de cada cluster, features dominantes, variable de perfilado más distintiva) se
    interpola desde el propio dict ``out``. La misma prosa alimenta data.json (web)
    y el .tex del informe. Sin lenguaje causal; con salvaguardas de encuadre.
    """
    meta = out["meta"]
    if not meta.get("disponible", True):
        return (
            "No hay suficientes participantes de pregrado con datos completos para "
            "realizar un agrupamiento robusto; la caracterización por k-means no está "
            "disponible en esta ejecución."
        )

    clusters = out["clusters"]
    k = meta["k_elegido"]

    partes = []
    partes.append(
        f"Sobre {_miles(meta['n_usados'])} participantes de pregrado con datos completos "
        f"(de {_miles(meta['n_participantes'])} participantes de pregrado y "
        f"{_miles(meta['n_participantes_global'])} participantes en todos los niveles), el "
        f"agrupamiento K-means identifica {k} perfiles internos a partir de cinco rasgos "
        f"académicos y demográficos estandarizados."
    )

    # Descripción de cada cluster con su feature dominante.
    descr = []
    for c in clusters:
        frag = etiquetar_cluster(c["centroide_z"])
        var_dom = frag[0]["var"] if frag else None
        label_dom = next((lbl for v, lbl in FEATURES if v == var_dom), var_dom)
        descr.append(
            f"el grupo «{c['etiqueta']}» reúne {_miles(c['n'])} estudiantes "
            f"({_fmt(c['pct'], 1)}%), caracterizado sobre todo por {str(label_dom).lower()}"
        )
    if descr:
        partes.append("En concreto, " + "; ".join(descr) + ".")

    # Variable de perfilado más distintiva: mayor rango de medias entre clusters.
    mejor_var, mejor_rango, mejor_label = None, -1.0, None
    for i, (var, label) in enumerate(PERFIL_NUMERICO):
        medias = [
            c["perfil_numerico"][i]["media"]
            for c in clusters
            if c["perfil_numerico"][i]["media"] is not None
        ]
        if len(medias) >= 2:
            rango = max(medias) - min(medias)
            if rango > mejor_rango:
                mejor_var, mejor_rango, mejor_label = var, rango, label
    if mejor_label is not None:
        partes.append(
            f"Entre las variables de perfilado externas, «{mejor_label}» es la que más "
            f"diferencia a los grupos; sus medias se calculan solo sobre quienes tienen dato "
            f"(cobertura parcial en los puntajes ICFES y en el estrato)."
        )

    partes.append(
        "Estos agrupamientos son descriptivos, no categorías administrativas ni relaciones "
        "causales; la media de estrato es un indicador ordinal orientativo y todas las medias "
        "de cobertura parcial deben leerse junto a su porcentaje de dato disponible."
    )
    return " ".join(partes)


# ===========================================================================
# API pública
# ===========================================================================
def _meta_base(df: pd.DataFrame, sub: pd.DataFrame, n_part_global: int,
               n_participantes: int) -> dict:
    """Construye el esqueleto de meta común a ramas disponible/no disponible."""
    return {
        "generado": pd.Timestamp.now().strftime("%Y-%m-%d"),
        "alcance": "pregrado",
        "algoritmo": "KMeans (k-means++, euclídea)",
        "estandarizacion": "StandardScaler (media 0, sd 1) sobre casos completos",
        "semilla": RANDOM_SEED,
        "n_init": 10,
        "k_rango": [K_MIN, K_MAX],
        "features": [
            {"var": v, "label": lbl, "unidad": UNIDADES_FEATURE.get(v, "")}
            for v, lbl in FEATURES
        ],
        "features_descartadas": FEATURES_DESCARTADAS,
        "silueta_sample_size": SILUETA_SAMPLE_SIZE,
        "silueta_nota": (
            "silueta estimada por submuestreo determinista (n=%d, semilla %d); "
            "no es el valor exacto" % (SILUETA_SAMPLE_SIZE, RANDOM_SEED)
        ),
        "n_participantes_global": int(n_part_global),
        "n_participantes": int(n_participantes),
        "regla_etiquetas": "features dominantes por |z| -> fragmento en español + dirección",
        "nota_privacidad": (
            "solo agregados: centroides, medias, conteos y %. "
            "No hay asignación por estudiante."
        ),
    }


def compute_clustering(df_or_path=None) -> dict:
    """Agrupa a los participantes de pregrado con K-means y perfila cada grupo.

    Parámetros
    ----------
    df_or_path:
        ``None`` -> lee ``config.ANALYTIC_DATASET``; ``str``/``Path`` -> lee ese
        parquet; ``DataFrame`` -> lo usa directamente (como ``compute_comparative``;
        ``export_dashboard`` le pasa el df ya cargado).

    Devuelve un dict serializable con ``meta``, ``curvas``, ``clusters`` y
    ``narrativa`` (contrato §3). Estados no felices: ``meta.disponible = false`` con
    ``motivo``, ``clusters = []`` y ``curvas = []``.
    """
    if df_or_path is None:
        df = pd.read_parquet(config.ANALYTIC_DATASET)
    elif isinstance(df_or_path, pd.DataFrame):
        df = df_or_path
    else:
        df = pd.read_parquet(df_or_path)

    # Validación: PARTICIPA binaria {0,1}.
    if "PARTICIPA" not in df.columns:
        raise ValueError("Falta la columna PARTICIPA en el DataFrame.")
    valores_participa = set(pd.unique(df["PARTICIPA"].dropna()))
    if not valores_participa <= {0, 1}:
        raise ValueError(
            "PARTICIPA debe ser binaria {0,1}; valores hallados: %s"
            % sorted(valores_participa)
        )

    n_part_global = int((df["PARTICIPA"] == 1).sum())

    # Subconjunto de participantes de pregrado.
    if "ES_PREGRADO" not in df.columns:
        raise ValueError("Falta la columna ES_PREGRADO para el filtro de alcance.")
    sub = df[(df["ES_PREGRADO"] == True) & (df["PARTICIPA"] == 1)].copy()  # noqa: E712
    n_participantes = len(sub)

    meta = _meta_base(df, sub, n_part_global, n_participantes)

    def _no_disponible(motivo: str) -> dict:
        meta["disponible"] = False
        meta["motivo"] = motivo
        meta["n_usados"] = 0
        meta["n_descartados_na"] = int(n_participantes)
        meta["pct_descartados_na"] = None
        meta["aviso_cobertura"] = None
        meta["k_elegido"] = None
        meta["criterio_k"] = None
        meta["k_descartados"] = []
        meta["aviso_k"] = None
        meta["orden_clusters"] = None
        meta["escalas_perfil"] = {}
        out = {"meta": meta, "curvas": [], "clusters": [], "scatter_muestra": []}
        out = comparative_stats._a_nativo(out)
        out["narrativa"] = construir_narrativa_clustering(out)
        return out

    # Features presentes.
    cols = [v for v, _ in FEATURES]
    faltantes = [c for c in cols if c not in sub.columns]
    if faltantes:
        return _no_disponible("features ausentes: " + ", ".join(faltantes))

    # Caso completo (listwise) sobre las 5 features.
    num = sub[cols].apply(pd.to_numeric, errors="coerce")
    mascara = num.notna().all(axis=1).to_numpy()
    sub_ok = sub[mascara].copy()
    X = num[mascara].to_numpy(dtype=float)
    n_usados = int(X.shape[0])
    n_descartados_na = int(n_participantes - n_usados)
    pct_descartados_na = 100 * n_descartados_na / n_participantes if n_participantes else 0.0

    meta["n_usados"] = n_usados
    meta["n_descartados_na"] = n_descartados_na
    meta["pct_descartados_na"] = _redondear("pct_descartados_na", pct_descartados_na)
    meta["aviso_cobertura"] = (
        "pérdida por casos incompletos superior al 2%% (%.1f%%)" % pct_descartados_na
        if pct_descartados_na > 2 else None
    )

    # Umbral de degeneración (design.md §2.4).
    umbral_deg = max(MIN_N, 0.03 * n_usados)

    # Viabilidad: debe haber margen para al menos k=2 no degenerado.
    if n_usados < 2 * umbral_deg:
        return _no_disponible(
            "n_usados (%d) insuficiente para k>=2 no degenerado (umbral %.0f)"
            % (n_usados, umbral_deg)
        )

    # Estandarización.
    scaler = StandardScaler()
    Xz = scaler.fit_transform(X)

    sample_size = min(n_usados, SILUETA_SAMPLE_SIZE)

    # Barrido k=2..10.
    curvas = []
    modelos = {}
    for k in range(K_MIN, K_MAX + 1):
        km = KMeans(n_clusters=k, random_state=RANDOM_SEED, n_init=10,
                    init="k-means++", max_iter=300)
        labels = km.fit_predict(Xz)
        sil = silhouette_score(Xz, labels, sample_size=sample_size, random_state=RANDOM_SEED)
        tamanos = np.bincount(labels, minlength=k)
        min_cluster_n = int(tamanos.min())
        min_cluster_pct = 100 * min_cluster_n / n_usados
        modelos[k] = {"km": km, "labels": labels, "min_cluster_n": min_cluster_n}
        curvas.append({
            "k": k,
            "inercia": _redondear("inercia", km.inertia_),
            "silueta": _redondear("silueta", sil),
            "min_cluster_pct": _redondear("min_cluster_pct", min_cluster_pct),
            # silueta sin redondear para la selección de k (uso interno).
            "_sil_raw": float(sil),
            "_min_cluster_n": min_cluster_n,
        })

    # Selección de k (design.md §2.4).
    sil_max = max(c["_sil_raw"] for c in curvas)
    no_degenerados = [c for c in curvas if c["_min_cluster_n"] >= umbral_deg]

    k_descartados = []
    aviso_k = None
    for c in curvas:
        if c["_min_cluster_n"] < umbral_deg:
            k_descartados.append({
                "k": c["k"],
                "motivo": "cluster degenerado (n<max(30,3%% de n_usados)=%.0f)" % umbral_deg,
            })

    candidatos = [c for c in no_degenerados if (sil_max - c["_sil_raw"]) <= 0.02]
    if candidatos:
        k_elegido = min(c["k"] for c in candidatos)
        criterio_k = (
            "menor k con silueta a <=0.02 del máximo y sin clusters degenerados "
            "(n<max(30,3%% de n_usados)=%.0f)" % umbral_deg
        )
    elif no_degenerados:
        mejor = max(no_degenerados, key=lambda c: c["_sil_raw"])
        k_elegido = mejor["k"]
        criterio_k = "mayor silueta entre los k sin clusters degenerados"
    else:
        mejor = max(curvas, key=lambda c: c["_min_cluster_n"])
        k_elegido = mejor["k"]
        criterio_k = "todos los k degeneran; elegido por min_cluster_pct máximo"
        aviso_k = "ningún k evita clusters pequeños; elegido por min_cluster_pct máximo"

    meta["k_elegido"] = int(k_elegido)
    meta["criterio_k"] = criterio_k
    meta["k_descartados"] = k_descartados
    meta["aviso_k"] = aviso_k
    meta["disponible"] = True

    # Limpieza de campos internos de curvas.
    curvas_pub = [
        {"k": c["k"], "inercia": c["inercia"], "silueta": c["silueta"],
         "min_cluster_pct": c["min_cluster_pct"]}
        for c in curvas
    ]

    # Ajuste final del k elegido (reusa el modelo del barrido, idéntico por semilla).
    km = modelos[k_elegido]["km"]
    labels = modelos[k_elegido]["labels"]
    centros_orig = scaler.inverse_transform(km.cluster_centers_)
    centros_z = km.cluster_centers_

    # Reordenamiento canónico determinista (design.md §2.5.0): asc por
    # SEMESTRE_AVANCE, luego PGA_ULTIMO, luego EDAD del centroide (unidades orig).
    idx_sem = cols.index("SEMESTRE_AVANCE")
    idx_pga = cols.index("PGA_ULTIMO")
    idx_edad = cols.index("EDAD")
    orden = sorted(
        range(k_elegido),
        key=lambda c: (centros_orig[c][idx_sem], centros_orig[c][idx_pga], centros_orig[c][idx_edad]),
    )
    # Mapa label_original -> id_canonico.
    remap = {label_orig: nuevo_id for nuevo_id, label_orig in enumerate(orden)}
    meta["orden_clusters"] = (
        "asc por SEMESTRE_AVANCE, luego PGA_ULTIMO, luego EDAD del centroide "
        "(unidades originales)"
    )

    # Escalas de perfilado: min/max observados por variable (design.md §2.6).
    escalas_perfil = {}
    for var, _ in PERFIL_NUMERICO:
        if var == "ESTRATO_SOCIAL":
            serie = pd.to_numeric(sub_ok.get(var), errors="coerce")
            serie = serie[serie.between(1, 6)]
        else:
            serie = pd.to_numeric(sub_ok.get(var), errors="coerce").dropna()
        if len(serie):
            escalas_perfil[var] = {"min": float(serie.min()), "max": float(serie.max())}
        else:
            escalas_perfil[var] = {"min": None, "max": None}
    meta["escalas_perfil"] = escalas_perfil

    fac_map = comparative_stats.faculty_name_map()

    # Centroides z de cada cluster en el orden canónico (insumo del etiquetado).
    clusters_z = []
    for nuevo_id in range(k_elegido):
        label_orig = orden[nuevo_id]
        clusters_z.append([
            {"var": cols[j], "z": float(centros_z[label_orig][j])}
            for j in range(len(cols))
        ])
    etiquetas = construir_etiquetas(clusters_z)

    clusters = []
    sub_ok = sub_ok.reset_index(drop=True)
    for nuevo_id in range(k_elegido):
        label_orig = orden[nuevo_id]
        mascara_cluster = labels == label_orig
        n = int(mascara_cluster.sum())
        pct = 100 * n / n_usados if n_usados else 0.0
        sub_cluster = sub_ok[mascara_cluster]

        centroide = [
            {"var": cols[j], "valor": _redondear(cols[j], float(centros_orig[label_orig][j]))}
            for j in range(len(cols))
        ]
        centroide_z = [
            {"var": cols[j], "z": _redondear("centroide_z", float(centros_z[label_orig][j]))}
            for j in range(len(cols))
        ]
        clusters.append({
            "id": nuevo_id,
            "etiqueta": etiquetas[nuevo_id],
            "n": n,
            "pct": _redondear("pct", pct),
            "centroide": centroide,
            "centroide_z": centroide_z,
            "perfil_numerico": _perfil_numerico_cluster(sub_cluster),
            "perfil_categorico": _perfil_categorico_cluster(sub_cluster, fac_map),
        })

    # Submuestra determinista para el scatter del dashboard (<=3000 filas de
    # sub_ok). Por privacidad solo se emiten las 5 features de clustering en
    # unidades originales (redondeadas con _redondear) y el id de cluster canónico;
    # sin identificadores. labels está alineado por posición con sub_ok (misma
    # máscara y orden), y sub_ok ya fue reseteado de índice arriba.
    rng = np.random.default_rng(RANDOM_SEED)
    n_scatter = min(3000, n_usados)
    idx_muestra = np.sort(rng.choice(n_usados, size=n_scatter, replace=False))
    scatter_muestra = []
    for i in idx_muestra:
        fila = sub_ok.iloc[i]
        cluster_id = remap[int(labels[i])]
        scatter_muestra.append({
            "cluster": int(cluster_id),
            "PGA_ULTIMO": _redondear("PGA_ULTIMO", fila["PGA_ULTIMO"]),
            "PERCENTIL_PGA_PROGRAMA": _redondear(
                "PERCENTIL_PGA_PROGRAMA", fila["PERCENTIL_PGA_PROGRAMA"]),
            "SEMESTRE_AVANCE": _redondear("SEMESTRE_AVANCE", fila["SEMESTRE_AVANCE"]),
            "PCT_CREDITOS_APROBADOS": _redondear(
                "PCT_CREDITOS_APROBADOS", fila["PCT_CREDITOS_APROBADOS"]),
            "EDAD": _redondear("EDAD", fila["EDAD"]),
        })

    out = {"meta": meta, "curvas": curvas_pub, "clusters": clusters,
           "scatter_muestra": scatter_muestra}
    # Saneamiento final: numpy -> nativo, NaN/inf -> None antes de serializar.
    out = comparative_stats._a_nativo(out)
    # Narrativa con cifras interpoladas (M2), tras el saneamiento.
    out["narrativa"] = construir_narrativa_clustering(out)
    return out
