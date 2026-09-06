const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CHUNK = 45; // stay under the free plan's 50 subrequests per invocation
const TOOL = { name: "review_game", description: "Review a chess game. Paste a PGN copied from Chess.com or Lichess; returns one row per move labelled Best/Good/Inaccuracy/Mistake/Miss/Blunder with the eval lost, the better move, and the better line. Render it as an interactive move-by-move browser.", inputSchema: { type: "object", properties: { pgn: { type: "string" }, depth: { type: "number" } }, required: ["pgn"] } };

const ask = async (body, tries = 4) => {
  try { return await (await fetch("https://chess-api.com/v1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })).json(); }
  catch (e) { if (!tries) throw e; return ask(body, tries - 1); }
};

async function review(pgn, depth = 12, url) {
  const moves = pgn.replace(/\[[^\]]*\]|\{[^}]*\}|\d+\.+|\$\d+|[?!]+/g, " ").match(/[a-hKQRBNO][^\s]*/g) || [];
  const jobs = moves.map((_, i) => (i ? { input: moves.slice(0, i).join(" "), depth } : { fen: START, depth })).concat({ input: moves.join(" "), depth });
  const chunks = Array.from({ length: Math.ceil(jobs.length / CHUNK) }, (_, i) => jobs.slice(i * CHUNK, i * CHUNK + CHUNK));
  const pos = (await Promise.all(chunks.map((chunk) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chunk }) }).then((r) => r.json())))).flat();
  const ev = (p, d) => (typeof p?.eval === "number" ? Math.max(-10, Math.min(10, p.eval)) : d);
  return moves.map((move, i) => {
    const b = pos[i], sign = i % 2 === 0 ? 1 : -1;
    const before = ev(b, 0), after = ev(pos[i + 1], before), loss = Math.max(0, (before - after) * sign);
    return {
      n: Math.floor(i / 2) + 1, side: sign > 0 ? "w" : "b", move,
      class: move.replace(/[+#]/g, "") === (b.san || "").replace(/[+#]/g, "") ? "Best" : before * sign >= 10 ? "Miss" : loss < 0.5 ? "Good" : loss < 1 ? "Inaccuracy" : loss < 2 ? "Mistake" : "Blunder",
      loss: +loss.toFixed(2), best: b.san, line: (b.continuationArr || []).slice(0, 6), eval: after, fen: pos[i + 1]?.fen,
    };
  });
}

export default {
  async fetch(req) {
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const body = await req.json();
    if (body.chunk) return Response.json(await Promise.all(body.chunk.map((j) => ask(j))));
    const { id, method, params } = body;
    if (id === undefined) return new Response(null, { status: 202 });
    const result = method === "initialize" ? { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "chess", version: "1" } }
      : method === "tools/list" ? { tools: [TOOL] }
      : { content: [{ type: "text", text: JSON.stringify(await review(params.arguments.pgn, params.arguments.depth, req.url)) }] };
    return Response.json({ jsonrpc: "2.0", id, result });
  },
};
