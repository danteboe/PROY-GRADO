"""Utilidades transversales: corrección de encoding, carga de fuentes y perfilamiento.

Estas funciones se usan tanto en el pipeline (`build_dataset`) como en los
notebooks, de modo que la lógica de limpieza y perfilamiento esté definida una
sola vez (reproducibilidad, OE3).
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

from . import config


# ---------------------------------------------------------------------------
# 1. Corrección de encoding (mojibake)
# ---------------------------------------------------------------------------
# Diagnóstico (ver notebook 02): el texto en español fue codificado en UTF-8 y
# posteriormente mal interpretado byte a byte. En las fuentes entregadas conviven
# DOS esquemas de "mojibake":
#
#   * Esquema A (p. ej. informacion_actual): UTF-8 interpretado con CP437.
#     "Magíster" -> "Mag¡ster", "Educación" -> "Educaci¢n", "Opción" -> "Opci¢n".
#     Inversa: value.encode('latin1').decode('cp437').
#
#   * Esquema B (p. ej. historial_materias): UTF-8 interpretado con CP850.
#     "Magíster" -> "MagÝster", "ESPAÑOL" -> "ESPAÐOL", "PRÁCTICA" -> "PR┴CTICA".
#     Inversa: value.encode('cp850').decode('latin1').
#
# `fix_mojibake` detecta automáticamente el esquema aplicable. Como heurística,
# un texto está "mal codificado" si contiene caracteres sospechosos (símbolos de
# los rangos CP437/CP850) y la corrección produce vocales acentuadas o ñ, que son
# las que el español realmente usa.

# Caracteres que delatan mojibake (no aparecen en texto español correcto).
_SUSPECT_CHARS = set("¡¢£¤¥¦§¨ÝÞßÐÑÒÓÔ¾¿ËÌÍÎ┴┬├─┼╔╦╚╩═║╗╝╣╠¬")
# Caracteres "buenos" esperados tras la corrección.
_SPANISH_ACCENTS = set("áéíóúÁÉÍÓÚñÑüÜ¿¡")


def _looks_fixed(before: str, after: str) -> bool:
    """True si `after` parece una corrección válida de `before`."""
    if after == before:
        return False
    # La corrección debe eliminar caracteres sospechosos e introducir acentos.
    introduced_accents = any(c in _SPANISH_ACCENTS for c in after)
    removed_suspects = sum(c in _SUSPECT_CHARS for c in before) >= sum(
        c in _SUSPECT_CHARS for c in after
    )
    return introduced_accents and removed_suspects


def fix_mojibake(value):
    """Recupera texto en español mal codificado, detectando el esquema (A o B).

    Devuelve el valor sin cambios si no es texto, si no presenta indicios de
    mojibake, o si ninguna corrección produce un resultado plausible.
    """
    if not isinstance(value, str):
        return value
    if not any(c in _SUSPECT_CHARS for c in value):
        return value
    for enc_bytes, enc_text in (("latin1", "cp437"), ("cp850", "latin1")):
        try:
            candidate = value.encode(enc_bytes).decode(enc_text)
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        if _looks_fixed(value, candidate):
            return candidate
    return value


def fix_mojibake_series(s: pd.Series) -> pd.Series:
    """Aplica `fix_mojibake` a una serie de texto.

    Usa una ruta vectorizada por valores únicos cuando es posible; si la columna
    contiene valores no hashables (listas/arrays con estructuras JSON), aplica la
    corrección elemento a elemento (solo afecta a las cadenas).
    """
    if s.dtype != object:
        return s
    try:
        mapping = {v: fix_mojibake(v) for v in s.dropna().unique()}
        return s.map(lambda v: mapping.get(v, v) if isinstance(v, str) else v)
    except TypeError:
        return s.map(fix_mojibake)


def fix_mojibake_df(df: pd.DataFrame, columns: Iterable[str] | None = None) -> pd.DataFrame:
    """Corrige el encoding de todas las columnas de texto (o de las indicadas)."""
    df = df.copy()
    cols = columns if columns is not None else [c for c in df.columns if df[c].dtype == object]
    for c in cols:
        df[c] = fix_mojibake_series(df[c])
    return df


# ---------------------------------------------------------------------------
# 2. Carga de fuentes
# ---------------------------------------------------------------------------
def source_path(name: str) -> Path:
    """Ruta absoluta de una fuente registrada en config.SOURCES."""
    if name not in config.SOURCES:
        raise KeyError(f"Fuente desconocida: {name!r}. Disponibles: {list(config.SOURCES)}")
    return config.DATA_DIR / config.SOURCES[name]


def load_source(name: str, columns: list[str] | None = None, fix_encoding: bool = False) -> pd.DataFrame:
    """Carga una fuente parquet por su nombre lógico.

    `fix_encoding=True` corrige el mojibake de las columnas de texto al cargar.
    """
    df = pd.read_parquet(source_path(name), columns=columns)
    if fix_encoding:
        df = fix_mojibake_df(df)
    return df


# ---------------------------------------------------------------------------
# 3. Periodos académicos (formato YYYYSS)
# ---------------------------------------------------------------------------
def periodo_to_year(periodo) -> float:
    """Extrae el año de un periodo con formato AAAASS (p. ej. 202610 -> 2026)."""
    try:
        return int(str(int(periodo))[:4])
    except (ValueError, TypeError):
        return np.nan


def periodo_to_semestre(periodo):
    """Devuelve el código de ciclo (los dos últimos dígitos) de un periodo AAAASS."""
    try:
        return str(int(periodo))[4:]
    except (ValueError, TypeError):
        return np.nan


# ---------------------------------------------------------------------------
# 4. Perfilamiento de calidad de datos
# ---------------------------------------------------------------------------
def profile_dataframe(df: pd.DataFrame, name: str = "") -> pd.DataFrame:
    """Genera una tabla de perfilamiento columna a columna.

    Incluye tipo, no nulos, % faltantes, cardinalidad y un valor de ejemplo.
    Es la base del informe de calidad de datos (semana 6).
    """
    n = len(df)
    rows = []
    for col in df.columns:
        s = df[col]
        non_null = s.notna().sum()
        missing = n - non_null
        example = s.dropna().iloc[0] if non_null > 0 else None
        # Algunas columnas contienen valores no hashables (listas/arrays con
        # estructuras JSON). En esos casos nunique() falla: se reporta NaN.
        try:
            n_unicos = int(s.nunique(dropna=True))
        except TypeError:
            n_unicos = np.nan
        if isinstance(example, (list, dict, np.ndarray)):
            example = str(example)[:60] + "..."
        rows.append(
            {
                "fuente": name,
                "columna": col,
                "dtype": str(s.dtype),
                "no_nulos": int(non_null),
                "faltantes": int(missing),
                "pct_faltantes": round(100 * missing / n, 2) if n else 0.0,
                "n_unicos": n_unicos,
                "cardinalidad_pct": round(100 * n_unicos / n, 2) if n and pd.notna(n_unicos) else np.nan,
                "ejemplo": example,
            }
        )
    return pd.DataFrame(rows)


def missing_summary(df: pd.DataFrame) -> pd.DataFrame:
    """Resumen ordenado de valores faltantes por columna."""
    n = len(df)
    miss = df.isna().sum().sort_values(ascending=False)
    out = pd.DataFrame({"faltantes": miss, "pct_faltantes": (100 * miss / n).round(2)})
    return out[out["faltantes"] > 0]


# ---------------------------------------------------------------------------
# 5. Figuras
# ---------------------------------------------------------------------------
def save_fig(fig, filename: str, dpi: int = 130) -> Path:
    """Guarda una figura en reports/figures y devuelve la ruta."""
    path = config.FIGURES_DIR / filename
    fig.savefig(path, dpi=dpi, bbox_inches="tight")
    return path
