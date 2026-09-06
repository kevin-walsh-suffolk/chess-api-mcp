const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CHUNK = 45; // 45 moves needs 46 evaluations, under the free plan's 50 subrequests per invocation
const TOOL = { name: "review_game", description: "Review a chess game. Paste a PGN copied from Chess.com or Lichess; returns one row per move labelled Best/Good/Inaccuracy/Mistake/Miss/Blunder with the eval lost, the better move, and the better line. Long games come back in parts: if the reply has a non-null 'next', call again with 'from' set to it and join the rows. Render the joined rows as an interactive move-by-move browser.", inputSchema: { type: "object", properties: { pgn: { type: "string" }, from: { type: "number" }, depth: { type: "number" } }, required: ["pgn"] } };

// Healthy replies take under a second, so a hung request is worth abandoning early and retrying.
// Never throws: one unanswerable position leaves one row without a score, rather than losing the game.
const ask = async (body, tries = 4) => {
  try { const r = await (await fetch("https://chess-api.com/v1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(6000) })).json(); if (!r.fen && tries) throw 0; return r; }
  catch (e) { return tries ? ask(body, tries - 1) : {}; }
};

async function review(pgn, from = 0, depth = 12) {
  const moves = pgn.replace(/\[[^\]]*\]|\{[^}]*\}|\d+\.+|\$\d+|[?!]+/g, " ").match(/[a-hKQRBNO][^\s]*/g) || [];
  const part = moves.slice(from, from + CHUNK);
  const jobs = part.map((_, k) => (from + k ? { input: moves.slice(0, from + k).join(" "), depth } : { fen: START, depth })).concat({ input: moves.slice(0, from + part.length).join(" "), depth });
  const pos = await Promise.all(jobs.map((j) => ask(j)));
  for (let k = 0; k < pos.length; k++) if (!pos[k].fen) pos[k] = await ask(jobs[k]); // retry stragglers one at a time, off the burst
  const ev = pos.map((p) => (typeof p?.eval === "number" ? Math.max(-10, Math.min(10, p.eval)) : null));
  ev.forEach((e, k) => { if (e === null) ev[k] = k ? ev[k - 1] : 0; }); // a gap inherits the last score, never invents a loss
  const rows = part.map((move, k) => {
    const i = from + k, b = pos[k], sign = i % 2 === 0 ? 1 : -1;
    const before = ev[k], after = ev[k + 1], loss = Math.max(0, (before - after) * sign);
    return {
      n: Math.floor(i / 2) + 1, side: sign > 0 ? "w" : "b", move,
      class: !b.san ? "Unknown" : move.replace(/[+#]/g, "") === b.san.replace(/[+#]/g, "") ? "Best" : before * sign >= 10 && after * sign < 10 ? "Miss" : loss < 0.5 ? "Good" : loss < 1 ? "Inaccuracy" : loss < 2 ? "Mistake" : "Blunder",
      loss: +loss.toFixed(2), best: b.san, line: (b.continuationArr || []).slice(0, 6), eval: after, fen: pos[k + 1]?.fen,
    };
  });
  return { rows, next: from + CHUNK < moves.length ? from + CHUNK : null };
}

export default {
  async fetch(req) {
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const { id, method, params } = await req.json();
    if (id === undefined) return new Response(null, { status: 202 });
    const result = method === "initialize" ? { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "chess", version: "1" } }
      : method === "tools/list" ? { tools: [TOOL] }
      : { content: [{ type: "text", text: JSON.stringify(await review(params.arguments.pgn, params.arguments.from, params.arguments.depth)) }] };
    return Response.json({ jsonrpc: "2.0", id, result });
  },
};
