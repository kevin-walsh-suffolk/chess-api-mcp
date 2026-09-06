import { Chess } from "chess.js";

const TOOL = { name: "review_game", description: "Review a chess game. Paste a PGN copied from Chess.com or Lichess; returns one row per move labelled Best/Good/Inaccuracy/Mistake/Miss/Blunder with the eval lost, the better move, and the better line. Render it as an interactive move-by-move browser.", inputSchema: { type: "object", properties: { pgn: { type: "string" }, depth: { type: "number" } }, required: ["pgn"] } };

async function review(pgn, depth = 12) {
  const game = new Chess();
  game.loadPgn(pgn);
  const hist = game.history({ verbose: true });
  const fens = hist.map((m) => m.before).concat(game.fen());
  const ws = (await fetch("https://chess-api.com/v1", { headers: { Upgrade: "websocket" } })).webSocket;
  ws.accept();
  const pos = await new Promise((resolve, reject) => {
    const out = [];
    ws.addEventListener("message", (e) => {
      const d = JSON.parse(e.data);
      if (d.type !== "bestmove") return;
      out.push(d);
      if (out.length < fens.length) ws.send(JSON.stringify({ fen: fens[out.length], depth }));
      else resolve(out);
    });
    ws.addEventListener("close", () => reject(new Error("chess-api closed the connection early")));
    ws.send(JSON.stringify({ fen: fens[0], depth }));
  });
  ws.close();
  const ev = (p, d) => (typeof p?.eval === "number" ? Math.max(-10, Math.min(10, p.eval)) : d);
  return hist.map((m, i) => {
    const b = pos[i], sign = m.color === "w" ? 1 : -1;
    const before = ev(b, 0), after = ev(pos[i + 1], before), loss = Math.max(0, (before - after) * sign);
    return {
      n: Math.floor(i / 2) + 1, side: m.color, move: m.san,
      class: m.san.replace(/[+#]/g, "") === (b.san || "").replace(/[+#]/g, "") ? "Best" : before * sign >= 10 ? "Miss" : loss < 0.5 ? "Good" : loss < 1 ? "Inaccuracy" : loss < 2 ? "Mistake" : "Blunder",
      loss: +loss.toFixed(2), best: b.san, line: (b.continuationArr || []).slice(0, 6), eval: after, fen: m.after,
    };
  });
}

export default {
  async fetch(req) {
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const { id, method, params } = await req.json();
    if (id === undefined) return new Response(null, { status: 202 });
    const result = method === "initialize" ? { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "chess", version: "1" } }
      : method === "tools/list" ? { tools: [TOOL] }
      : { content: [{ type: "text", text: JSON.stringify(await review(params.arguments.pgn, params.arguments.depth)) }] };
    return Response.json({ jsonrpc: "2.0", id, result });
  },
};
