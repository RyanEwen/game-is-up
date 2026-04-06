#!/usr/bin/env bash

set -euo pipefail

port="${1:-${API_PORT:-4000}}"
serial_filter="${ADB_SERIAL:-}"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is not installed or not on PATH." >&2
  exit 1
fi

mapfile -t connected_devices < <(
  adb devices | awk 'NR > 1 && $2 == "device" { print $1 }'
)

if [ -n "$serial_filter" ]; then
  matched_devices=()
  for serial in "${connected_devices[@]}"; do
    if [ "$serial" = "$serial_filter" ]; then
      matched_devices+=("$serial")
    fi
  done
  connected_devices=("${matched_devices[@]}")
fi

if [ "${#connected_devices[@]}" -eq 0 ]; then
  echo "No adb devices are connected. Connect a device first, or set ADB_SERIAL to a visible device." >&2
  exit 1
fi

for serial in "${connected_devices[@]}"; do
  adb -s "$serial" reverse "tcp:${port}" "tcp:${port}" >/dev/null
  echo "Reversed tcp:${port} for ${serial}"
done

echo "Android localhost:${port} now routes to the adb host on the same port."