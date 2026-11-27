#!/usr/bin/env bash
# Fetches the rules data sources into .sources/ (git-ignored).
#  - BSData 11th edition data (BattleScribe JSON) - list building logic, points, wargear
#  - Wahapedia CSV export mirror - stratagems & detachment rule text
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .sources
BSDATA_REPO="${BSDATA_REPO:-https://github.com/momper14/wh40k-11e}"
WAHA_REPO="${WAHA_REPO:-https://github.com/N041M/grimstat-wahapedia}"
fetch() {
  local url="$1" dir="$2"
  if [ -d "$dir/.git" ]; then
    git -C "$dir" fetch --depth 1 origin HEAD && git -C "$dir" reset --hard FETCH_HEAD
  else
    GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 "$url" "$dir"
  fi
}
fetch "$BSDATA_REPO" .sources/bsdata
fetch "$WAHA_REPO" .sources/wahapedia
