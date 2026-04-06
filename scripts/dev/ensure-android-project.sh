#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
sdk_dir="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"

cd "$repo_root"
npm run build --workspace @game-is-up/web

cd apps/android
if [ -d android ]; then
  npx cap sync android
else
  npx cap add android
fi

if [ -n "$sdk_dir" ]; then
  printf 'sdk.dir=%s\n' "$sdk_dir" > android/local.properties
fi