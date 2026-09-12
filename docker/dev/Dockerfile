FROM node:22.22.3-bookworm-slim

# Prisma requires OpenSSL at generation and runtime. Git supports application
# workflows that inspect repository metadata from the source-mounted checkout.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
