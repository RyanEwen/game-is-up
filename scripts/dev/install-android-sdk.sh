#!/usr/bin/env bash

set -euo pipefail

ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
ANDROID_API_LEVEL="${ANDROID_API_LEVEL:-35}"
ANDROID_BUILD_TOOLS_VERSIONS="${ANDROID_BUILD_TOOLS_VERSIONS:-35.0.0 34.0.0}"
ANDROID_CMDLINE_TOOLS_VERSION="${ANDROID_CMDLINE_TOOLS_VERSION:-13114758}"

mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools" /tmp/android-cmdline-tools

curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_CMDLINE_TOOLS_VERSION}_latest.zip" -o /tmp/android-cmdline-tools.zip
unzip -q /tmp/android-cmdline-tools.zip -d /tmp/android-cmdline-tools
mv /tmp/android-cmdline-tools/cmdline-tools "$ANDROID_SDK_ROOT/cmdline-tools/latest"
rm -f /tmp/android-cmdline-tools.zip

# `yes` exits with SIGPIPE once sdkmanager finishes consuming input, which is
# expected and should not fail the image build under `set -o pipefail`.
set +o pipefail
yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_SDK_ROOT" --licenses >/dev/null
set -o pipefail

sdk_packages=(
  "platform-tools"
  "platforms;android-${ANDROID_API_LEVEL}"
)

for build_tools_version in $ANDROID_BUILD_TOOLS_VERSIONS; do
  sdk_packages+=("build-tools;${build_tools_version}")
done

"$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_SDK_ROOT" "${sdk_packages[@]}"