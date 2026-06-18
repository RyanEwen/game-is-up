FROM mcr.microsoft.com/devcontainers/typescript-node:1-20-bookworm

ARG DEBIAN_FRONTEND=noninteractive

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      bat \
      ca-certificates \
      curl \
      fd-find \
      gh \
      git \
      htop \
      jq \
      less \
      ripgrep \
      tree \
      unzip; \
    ln -sf /usr/bin/fdfind /usr/local/bin/fd; \
    ln -sf /usr/bin/batcat /usr/local/bin/bat; \
    rm -rf /var/lib/apt/lists/*

# Persisted-volume ownership is reconciled at runtime by
# .devcontainer/fix-volume-perms.sh (run from postCreateCommand).

# Pre-create /home/node/.vscode-server owned by node. This MUST live in the
# image, not in fix-volume-perms.sh (postCreateCommand): the persist overlay
# mounts a named volume at the SUB-path .vscode-server/extensions, so Docker
# auto-creates the parent .vscode-server as root. VS Code then installs its
# server (mkdir .vscode-server/bin) *before* postCreate runs, so a postCreate
# chown is too late — it fails with "permission denied". Creating the parent
# (and the extensions mountpoint) node-owned here makes the bin install work
# and lets the fresh volume initialize with node ownership. Do not fold this
# back into the generic volume-perms script.
RUN set -eux; \
    mkdir -p /home/node/.vscode-server/extensions; \
    chown -R node:node /home/node/.vscode-server