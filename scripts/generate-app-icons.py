"""Regenerate app icons from public/logo.svg."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    script = ROOT / "scripts" / "render-brand-icons.mjs"
    result = subprocess.run(["node", str(script)], cwd=ROOT)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
