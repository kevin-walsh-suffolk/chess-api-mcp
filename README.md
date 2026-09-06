# chess-api-mcp

Paste a chess game, get a Chess.com-style review. MCP server on Cloudflare Workers.

1. `npm install && npx wrangler deploy`
2. Add the printed `workers.dev` URL in Claude: Settings > Connectors > Add custom connector.
3. Paste a PGN and say "review this game".

Analyses stream over one WebSocket, so a full game costs a single subrequest (~20s).
