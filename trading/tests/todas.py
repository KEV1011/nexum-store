#!/usr/bin/env python3
"""Corre todas las pruebas del paquete.

    python3 trading/tests/todas.py
"""

import sys
import unittest
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))

if __name__ == "__main__":
    suite = unittest.TestLoader().discover(str(AQUI), pattern="test_*.py")
    resultado = unittest.TextTestRunner(verbosity=1).run(suite)
    print(f"\n{resultado.testsRun} pruebas")
    raise SystemExit(0 if resultado.wasSuccessful() else 1)
