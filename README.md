# chess-api-mcp

Paste a chess game, get a Chess.com-style review. MCP server on Cloudflare Workers.

1. `npm install && npx wrangler deploy`
2. Add the printed `workers.dev` URL in Claude: Settings > Connectors > Add custom connector.
3. Paste a PGN and say "review this game".

chess-api.com scores one position per request, so a 92-move game needs ~93 of them. The worker
splits the game and calls itself once per 45 positions, so each invocation stays under the free
plan's 50-subrequest limit. A full game takes ~20s.
