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

# Persist bash history to a named volume mounted at /commandhistory so it
# survives devcontainer rebuilds. The volume is declared in compose.yml.
RUN set -eux; \
    mkdir -p /commandhistory; \
    touch /commandhistory/.bash_history; \
    chown -R node:node /commandhistory; \
    printf '\n# Persist bash history across devcontainer rebuilds.\nexport HISTFILE=/commandhistory/.bash_history\nexport PROMPT_COMMAND="history -a; ${PROMPT_COMMAND:-}"\n' >> /home/node/.bashrc