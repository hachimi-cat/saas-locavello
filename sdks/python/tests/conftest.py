"""Make ``forjio_locavello`` importable no matter where pytest runs from."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
