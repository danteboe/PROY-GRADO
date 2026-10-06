"""Generador y ejecutor de los notebooks del proyecto.

En lugar de escribir el JSON de los .ipynb a mano, cada notebook se define aquí
como una lista de celdas (markdown / código). Este script:

1. construye los .ipynb con nbformat,
2. los ejecuta en orden con nbclient (kernel python3),
3. deja los notebooks ejecutados en notebooks/.

Uso:
    python build_notebooks.py            # construye y ejecuta todos
    python build_notebooks.py 01 03      # solo los indicados (por prefijo)
"""
from __future__ import annotations

import sys
from pathlib import Path

import asyncio

import nbformat as nbf
from nbclient import NotebookClient

from nb_helpers import BOOTSTRAP, code, md  # noqa: F401 (re-export for defs)

# En Windows, evitar el warning de zmq/Proactor usando el selector event loop.
if sys.platform.startswith("win"):
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except AttributeError:
        pass

ROOT = Path(__file__).resolve().parent
NB_DIR = ROOT / "notebooks"
NB_DIR.mkdir(exist_ok=True)


def make_notebook(cells: list[nbf.NotebookNode]) -> nbf.NotebookNode:
    nb = nbf.v4.new_notebook()
    nb.cells = cells
    nb.metadata = {
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python", "version": "3.12"},
    }
    return nb


# ---------------------------------------------------------------------------
# Importar las definiciones de celdas de cada notebook.
# ---------------------------------------------------------------------------
from notebook_defs import NOTEBOOKS  # noqa: E402


def build_and_run(selected: list[str] | None = None) -> None:
    for prefix, (title, cells) in NOTEBOOKS.items():
        if selected and not any(prefix.startswith(s) for s in selected):
            continue
        nb = make_notebook(cells)
        path = NB_DIR / f"{prefix}.ipynb"
        nbf.write(nb, path)
        print(f"[build] {path.name} ({len(cells)} celdas) -> ejecutando...", flush=True)
        client = NotebookClient(
            nb, timeout=1800, kernel_name="python3",
            resources={"metadata": {"path": str(NB_DIR)}},
        )
        client.execute()
        nbf.write(nb, path)
        print(f"[ok]    {path.name} ejecutado y guardado.", flush=True)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:]]
    build_and_run(args or None)
