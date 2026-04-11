#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python_exe="${PYRIGHT_PYTHON:-}"
if [[ -z "$python_exe" ]]; then
  if command -v python3.13 >/dev/null 2>&1; then
    python_exe="$(command -v python3.13)"
  elif command -v python >/dev/null 2>&1; then
    python_exe="$(command -v python)"
  else
    echo "pyright: Python が見つかりません。conda activate / .venv を有効にするか PYRIGHT_PYTHON を設定してください。" >&2
    exit 1
  fi
fi

exec pyright --pythonpath "$python_exe" "$@"
