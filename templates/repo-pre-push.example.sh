#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "${ROOT_DIR}"

# Keep the always-on hook thin: call exactly one canonical verify command.
<canonical verify command>

# Optional, human-facing reminder for heavier gates.
echo "[harness] visual/acceptance gates remain opt-in and runbook-driven."
