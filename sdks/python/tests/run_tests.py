#!/usr/bin/env python3
"""Plain-assert test runner — runs the same test functions as pytest,
with zero test-framework dependencies.

Usage: python3 tests/run_tests.py
"""

from __future__ import annotations

import os
import sys
import traceback

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_HERE))  # package root -> forjio_locavello
sys.path.insert(0, _HERE)  # tests dir -> test_client

import test_client  # noqa: E402


def main() -> int:
    tests = [
        (name, fn)
        for name, fn in vars(test_client).items()
        if name.startswith("test_") and callable(fn)
    ]
    failed = 0
    for name, fn in tests:
        try:
            fn()
        except Exception:
            failed += 1
            print(f"FAIL {name}")
            traceback.print_exc()
        else:
            print(f"PASS {name}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
