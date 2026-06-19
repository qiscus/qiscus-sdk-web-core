#!/usr/bin/env bash
#
# Build qiscus-sdk-core across multiple Node.js major versions to verify
# engine compatibility (see "engines.node" in package.json).
#
# Each version is built in an isolated Docker container, so it never touches
# your host node / node_modules. The project is mounted READ-ONLY and copied
# into the container, so a newer pnpm can't rewrite your host pnpm-lock.yaml.
# A shared pnpm store volume is reused across versions to avoid re-downloading
# dependencies every time.
#
# pnpm: pinned to 8.15.9 by default (matches package.json "packageManager").
# This is the newest pnpm line that runs across the whole Node 16..26 range we
# test -- pnpm >=10/11 require the node:sqlite builtin (Node 22.5+) and refuse
# to start on older Node. Override for a newer-Node-only run, e.g.:
#   PNPM_SPEC=pnpm@latest scripts/build-matrix.sh 22 24 26
#
# Usage:
#   scripts/build-matrix.sh                # default: 16 18 20 22 24 26
#   scripts/build-matrix.sh 20 22 26       # custom set of major versions
#
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORE_VOLUME="qiscus_pnpm_store"          # cached pnpm store, shared across versions
PNPM_SPEC="${PNPM_SPEC:-pnpm@8.15.9}"     # pnpm to install in each container

# Node major versions to test (override via CLI args).
if [ "$#" -gt 0 ]; then
  VERSIONS=("$@")
else
  VERSIONS=(16 18 20 22 24 26)
fi

# --- preflight: Docker must be available and running ----------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found. Install Docker Desktop, or build with a node" >&2
  echo "       version manager (asdf/fnm/nvm) instead." >&2
  exit 127
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: the Docker daemon is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

echo "Project : $PROJECT_DIR"
echo "Versions: ${VERSIONS[*]}"
echo "pnpm    : $PNPM_SPEC"
echo

declare -a SUMMARY
overall_rc=0

for ver in "${VERSIONS[@]}"; do
  PM="$PNPM_SPEC"
  echo "=================================================================="
  echo "==> Node ${ver} (${PM}): install deps + \`pnpm run build\`"
  echo "=================================================================="

  # Mount the project read-only at /src, copy the build inputs into a fresh
  # /app inside the container, then install + build there. The host tree is
  # never modified. --ignore-workspace avoids the parent pnpm-workspace.yaml;
  # disabling manage-package-manager-versions stops pnpm from auto-switching
  # back to the version pinned in package.json's "packageManager" field.
  if docker run --rm \
      -v "$PROJECT_DIR":/src:ro \
      -v "${STORE_VOLUME}":/root/.local/share/pnpm/store \
      "node:${ver}-slim" \
      bash -c '
        set -e
        export npm_config_manage_package_manager_versions=false
        mkdir -p /app && cd /src
        cp -a package.json pnpm-lock.yaml webpack.config.js .eslintrc .npmrc /app/ 2>/dev/null || true
        cp -a src /app/
        cd /app
        npm install -g '"$PM"' >/dev/null 2>&1
        echo "using: node $(node -v) / pnpm $(pnpm -v)"
        pnpm install --ignore-workspace
        pnpm run build'; then
    echo "==> Node ${ver}: PASS"
    SUMMARY+=("Node ${ver} (${PM}): PASS")
  else
    echo "==> Node ${ver}: FAIL"
    SUMMARY+=("Node ${ver} (${PM}): FAIL")
    overall_rc=1
  fi
  echo
done

echo "=================================================================="
echo "Build matrix summary"
echo "=================================================================="
for line in "${SUMMARY[@]}"; do
  echo "  $line"
done

exit "$overall_rc"
