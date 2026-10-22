# Minimal Dockerfile for chainanalyzer-mcp — used for Glama MCP server
# directory (https://glama.ai/mcp/servers). Container just needs to
# start and answer MCP introspection requests (list tools / capabilities).
# No secrets required for that; actual scans require X402_WALLET_PRIVATE_KEY
# or CHAINANALYZER_API_KEY at runtime.

# Pinned to an exact patch release; bump when Node ships a security release
# (22.23.4 = 2026-10-21 security release: tls / dns / brotli High CVEs).
FROM node:22.23.4-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm install --production=false

# Start the MCP server over stdio. Glama's probe attaches to stdio,
# sends an MCP `initialize` + `tools/list`, and expects a valid
# response — no external credentials required for that handshake.
CMD ["npx", "tsx", "src/index.ts"]
