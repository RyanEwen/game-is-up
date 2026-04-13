FROM mcr.microsoft.com/devcontainers/typescript-node:1-20-bookworm

ARG DEBIAN_FRONTEND=noninteractive

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      ripgrep \
      unzip