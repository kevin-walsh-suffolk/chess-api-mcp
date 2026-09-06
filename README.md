# chess-api-mcp

Paste a chess game, get a Chess.com-style review. MCP server on Cloudflare Workers, no dependencies.

1. `npx wrangler deploy` (or connect the repo to Cloudflare and push to `main`)
2. Add the printed `workers.dev` URL in Claude: Settings > Connectors > Add custom connector.
3. Paste a PGN and say "review this game".

chess-api.com scores one position per request, so a 92-move game needs ~93 of them while Cloudflare's
free plan allows 50 outbound requests per invocation. Games therefore come back in parts of 45 moves:
when a reply carries a non-null `next`, call again with `from` set to it and join the rows. Claude does
this on its own. Requests are staggered 150ms apart because this server drops requests that start at the
same instant. A 104-move game takes about 17 seconds.
