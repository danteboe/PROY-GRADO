"""Ayudantes compartidos para construir celdas de notebooks."""
from __future__ import annotations

import nbformat as nbf

# Prefijo de arranque común: hace importable el paquete src y fija estilos.
BOOTSTRAP = r"""
import sys, os
from pathlib import Path
# Permitir importar el paquete src desde notebooks/
ROOT = Path.cwd().parent if Path.cwd().name == 'notebooks' else Path.cwd()
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns

pd.set_option('display.max_columns', 60)
pd.set_option('display.width', 160)
sns.set_theme(style='whitegrid', palette='deep')
plt.rcParams['figure.figsize'] = (9, 5)
plt.rcParams['axes.titlesize'] = 12

from src import config, utils, internationalization as intl
print('Entorno listo. Raiz del proyecto:', ROOT)
"""


def md(text: str) -> nbf.NotebookNode:
    return nbf.v4.new_markdown_cell(text.strip("\n"))


def code(src: str) -> nbf.NotebookNode:
    return nbf.v4.new_code_cell(src.strip("\n"))


# ---------------------------------------------------------------------------
# Formateo de tablas LaTeX (booktabs) para el informe.
#
# Vive aquí, NO en src/comparative_stats.py: ese módulo es de cálculo puro
# (N1 de la revisión). Esta función solo da formato (presentación), reutilizando
# el dict de precisión `decimales` (comparative_stats.DECIMALES) para que las
# cifras del .tex coincidan EXACTAMENTE con las de data.json (RNF-1 / M1).
# No usa siunitx ni csvsimple (RNF-6): emite tabular/longtable con booktabs.
# ---------------------------------------------------------------------------
def _escape_latex(texto: str) -> str:
    """Escapa los caracteres especiales de LaTeX en texto plano."""
    reemplazos = {
        "\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$",
        "#": r"\#", "_": r"\_", "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    for k, v in reemplazos.items():
        texto = texto.replace(k, v)
    return texto


def _fmt_celda(valor, decimales) -> str:
    """Formatea una celda: números con coma decimal española; None -> '---'."""
    if valor is None:
        return "---"
    if isinstance(valor, bool):
        return "sí" if valor else "no"
    if isinstance(valor, (int,)) and not isinstance(valor, bool):
        return f"{valor:,}".replace(",", ".")
    if isinstance(valor, float):
        if decimales is None:
            # Entero disfrazado de float.
            return f"{valor:,.0f}".replace(",", ".")
        return f"{valor:.{decimales}f}".replace(".", ",")
    return _escape_latex(str(valor))


def df_to_latex_booktabs(df, columnas, decimales_por_col, aligns=None,
                         longtable=False, caption=None, label=None):
    """Convierte un DataFrame en una tabla LaTeX booktabs (sin siunitx/csvsimple).

    Parámetros
    ----------
    df : DataFrame con los datos ya calculados (desde `comp`, sin recomputar).
    columnas : lista de (clave_columna, encabezado_legible).
    decimales_por_col : dict {clave_columna: n_decimales|None}; usar el mismo dict
        de precisión de comparative_stats.DECIMALES (fuente única de redondeo).
    aligns : cadena de alineación por columna (p.ej. 'lrr'); por defecto, primera a
        la izquierda y el resto a la derecha.
    longtable : si True, usa el entorno longtable (tablas largas que parten página).
    caption, label : si se dan, se incluyen como \\caption y \\label.

    Devuelve el código LaTeX como cadena. El redondeo ya viene aplicado en `comp`;
    aquí solo se da formato de presentación (coma decimal, separador de miles).
    """
    claves = [c[0] for c in columnas]
    encabezados = [c[1] for c in columnas]
    n = len(columnas)
    if aligns is None:
        aligns = "l" + "r" * (n - 1)

    entorno = "longtable" if longtable else "tabular"
    lineas = []
    cap = ""
    if caption and longtable:
        cap = r"\caption{%s}" % _escape_latex(caption)
        if label:
            cap += r"\label{%s}" % label
        cap += r"\\"
    header = " & ".join(r"\textbf{%s}" % _escape_latex(h) for h in encabezados) + r" \\"

    lineas.append(r"\begin{%s}{%s}" % (entorno, aligns))
    if cap:
        lineas.append(cap)
    lineas.append(r"\toprule")
    lineas.append(header)
    lineas.append(r"\midrule")
    if longtable:
        lineas.append(r"\endfirsthead")
        lineas.append(r"\toprule " + header)
        lineas.append(r"\midrule")
        lineas.append(r"\endhead")
        lineas.append(r"\bottomrule")
        lineas.append(r"\endfoot")

    for fila in df[claves].to_dict("records"):
        celdas = [
            _fmt_celda(fila.get(clave), decimales_por_col.get(clave))
            for clave in claves
        ]
        lineas.append(" & ".join(celdas) + r" \\")

    if not longtable:
        lineas.append(r"\bottomrule")
    lineas.append(r"\end{%s}" % entorno)
    return "\n".join(lineas)
