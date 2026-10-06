"""Configuración central del proyecto: rutas, nombres de fuentes y catálogos.

Centralizar estas constantes evita rutas "mágicas" dispersas en los notebooks y
facilita la reproducibilidad del pipeline (OE3 de la propuesta).
"""
from __future__ import annotations

from pathlib import Path

# ---------------------------------------------------------------------------
# Rutas base
# ---------------------------------------------------------------------------
# El paquete vive en PROY-GRADO/src/ ; la raíz del repositorio es el padre.
ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
PROCESSED_DIR = ROOT_DIR / "data_processed"
REPORTS_DIR = ROOT_DIR / "reports"
FIGURES_DIR = REPORTS_DIR / "figures"
TABLES_DIR = REPORTS_DIR / "tables"
DOCS_DIR = ROOT_DIR / "docs"

for _d in (PROCESSED_DIR, FIGURES_DIR, TABLES_DIR, DOCS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Fuentes de datos (archivos parquet en data/)
# ---------------------------------------------------------------------------
SOURCES = {
    "capp_creditos": "capp_creditos_estudiante_anonimizacion.parquet",
    "examenes_clasificacion": "examenes_clasificacion_estudiante_anonimizacion.parquet",
    "grados": "grados_estudiante_anonimizacion.parquet",
    "historial_materias": "historial_materias_estudiante_anonimizacio.parquet",
    "historial_opciones": "historial_opciones_estudiante_anonimizacion.parquet",
    "historial_rendimiento": "historial_rendimiento_academico_estudiante_anonimizacion.parquet",
    "icfes_saber11": "icfes_saber11_estudiante_anonimizacion.parquet",
    "informacion_actual": "informacion_actual_estudiante_anonimizacion.parquet",
    "momento_academico": "momento_academico_materia_estudiante_anonimizacion.parquet",
    "percentiles_academicos": "percentiles_academicos_estudiante_anonimizacion.parquet",
    "percentiles_historicos": "percentiles_historicos_academicos_estudiante_anonimizacion.parquet",
    "programas": "programas_estudiante_anonimizacion.parquet",
}

# Columnas que identifican al estudiante en cada fuente. Dos fuentes grandes
# (historial_materias y programas) usan el sufijo _ANOM.
STUDENT_KEY = "CODIGO_ESTUDIANTE"
STUDENT_KEY_ANOM = "CODIGO_ESTUDIANTE_ANOM"

# ---------------------------------------------------------------------------
# Dataset analítico de salida
# ---------------------------------------------------------------------------
ANALYTIC_DATASET = PROCESSED_DIR / "dataset_analitico_estudiante.parquet"
MOBILITY_EVENTS = PROCESSED_DIR / "eventos_movilidad.parquet"

# ---------------------------------------------------------------------------
# Catálogo de niveles académicos (texto ya corregido de encoding)
# ---------------------------------------------------------------------------
NIVEL_PREGRADO = "Pregrado"

# ---------------------------------------------------------------------------
# Reproducibilidad
# ---------------------------------------------------------------------------
RANDOM_SEED = 42
