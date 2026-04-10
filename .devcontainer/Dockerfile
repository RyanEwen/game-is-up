FROM mcr.microsoft.com/devcontainers/typescript-node:1-20-bookworm

ARG DEBIAN_FRONTEND=noninteractive

RUN set -eux; \
    architecture="$(dpkg --print-architecture)"; \
    if [ "$architecture" = "arm64" ]; then \
      dpkg --add-architecture amd64; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      ripgrep \
      unzip; \
    if [ "$architecture" = "arm64" ]; then \
      apt-get install -y --no-install-recommends \
        libc6:amd64 \
        libgcc-s1:amd64 \
        libncurses6:amd64 \
        libstdc++6:amd64 \
        libtinfo6:amd64 \
        libxml2:amd64 \
        zlib1g:amd64; \
    fi

RUN set -eux; \
    architecture="$(dpkg --print-architecture)"; \
    case "$architecture" in \
      amd64) java_arch="x64" ;; \
      arm64) java_arch="aarch64" ;; \
      *) echo "Unsupported architecture: $architecture" >&2; exit 1 ;; \
    esac; \
    mkdir -p /opt/java; \
    curl -fsSL "https://api.adoptium.net/v3/binary/latest/21/ga/linux/${java_arch}/jdk/hotspot/normal/eclipse?project=jdk" -o /tmp/openjdk.tar.gz; \
    tar -xzf /tmp/openjdk.tar.gz -C /opt/java; \
    mv /opt/java/jdk-* /opt/java/openjdk; \
    rm -f /tmp/openjdk.tar.gz

ENV JAVA_HOME=/opt/java/openjdk
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=/opt/java/openjdk/bin:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:${PATH}

COPY scripts/dev/install-android-sdk.sh /tmp/install-android-sdk.sh

RUN chmod +x /tmp/install-android-sdk.sh \
  && /tmp/install-android-sdk.sh \
  && chown -R node:node /opt/android-sdk /opt/java \
  && rm -f /tmp/install-android-sdk.sh