# chess-api-mcp

Paste a chess game, get a Chess.com-style review. MCP server on Cloudflare Workers.

1. `npm install && npx wrangler deploy`
2. Add the printed `workers.dev` URL in Claude: Settings > Connectors > Add custom connector.
3. Paste a PGN and say "review this game".

chess-api.com scores one position per request, so a 92-move game needs ~93 of them, and Cloudflare's
free plan allows 50 outbound requests per invocation. So games come back in parts of 45 moves: when a
reply carries a non-null `next`, call again with `from` set to it and join the rows. Claude does this
on its own. A full game takes a few seconds.
