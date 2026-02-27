const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// ====== 简单内存数据（后面会由 analyzer 推送进来）======
const state = {
  startedAt: Date.now(),
  threshold: 10000,
  rpc: "wss://ethereum.publicnode.com",
  stats: { seen: 0, mined: 0, reverted: 0, dropped: 0, avgDelay: 0, maxDelay: 0 },
  latest: [], // 最新事件列表
};

// ====== API ======
app.get("/api/status", (req, res) => {
  res.json({
    startedAt: state.startedAt,
    uptimeSec: Math.floor((Date.now() - state.startedAt) / 1000),
    threshold: state.threshold,
    rpc: state.rpc,
    stats: state.stats,
    latest: state.latest.slice(0, 20),
  });
});

// 下载 CSV（如果存在）
app.get("/download/:file", (req, res) => {
  const f = req.params.file;
  const allow = new Set(["whale_delay.csv", "usdt_transfers.csv"]);
  if (!allow.has(f)) return res.status(404).send("Not allowed");

  const p = path.join(__dirname, f);
  if (!fs.existsSync(p)) return res.status(404).send("File not found");
  res.download(p);
});

// ====== 前端页面 ======
app.get("/", (req, res) => {
  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Whale Delay Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .row { display: flex; gap: 16px; flex-wrap: wrap; }
    .card { border: 1px solid #ddd; border-radius: 12px; padding: 12px 14px; min-width: 260px; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; font-size: 14px; }
    .tag { padding: 2px 8px; border-radius: 999px; background: #f1f5f9; display: inline-block; }
    .ok { color: #16a34a; } .bad { color: #dc2626; } .warn { color: #d97706; }
  </style>
</head>
<body>
  <h2>🐋 Whale Delay Dashboard</h2>

  <div class="row">
    <div class="card">
      <div><b>Status</b></div>
      <div id="uptime"></div>
      <div class="mono" id="rpc"></div>
      <div id="threshold"></div>
      <div style="margin-top:10px">
        <a href="/download/whale_delay.csv">Download whale_delay.csv</a> |
        <a href="/download/usdt_transfers.csv">Download usdt_transfers.csv</a>
      </div>
    </div>

    <div class="card">
      <div><b>Stats</b></div>
      <div id="stats"></div>
    </div>
  </div>

  <h3>Latest (Top 20)</h3>
  <table>
    <thead>
      <tr>
        <th>Time</th><th>Status</th><th>Amount</th><th>To</th><th>Tag</th><th>Hash</th><th>Delay(s)</th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>

  <script>
    function short(s){ return s ? (s.slice(0,6)+"..."+s.slice(-4)) : "" }
    function cls(status){
      if(status==="MINED") return "ok";
      if(status==="REVERTED") return "bad";
      if(status==="DROPPED") return "warn";
      return "";
    }
    async function tick(){
      const r = await fetch("/api/status");
      const d = await r.json();

      document.getElementById("uptime").innerText = "Uptime: " + d.uptimeSec + "s";
      document.getElementById("rpc").innerText = "RPC: " + d.rpc;
      document.getElementById("threshold").innerText = "Threshold: " + d.threshold + " USDT";

      document.getElementById("stats").innerHTML =
        "Seen: " + d.stats.seen +
        "<br>Mined: " + d.stats.mined +
        "<br>Reverted: " + d.stats.reverted +
        "<br>Dropped: " + d.stats.dropped +
        "<br>AvgDelay: " + d.stats.avgDelay +
        "<br>MaxDelay: " + d.stats.maxDelay;

      const tb = document.getElementById("tbody");
      tb.innerHTML = "";
      for(const it of d.latest){
        const tr = document.createElement("tr");
        tr.innerHTML = \`
          <td>\${new Date(it.ts).toLocaleTimeString()}</td>
          <td class="\${cls(it.status)}"><b>\${it.status}</b></td>
          <td>\${it.amount}</td>
          <td class="mono">\${short(it.to)}</td>
          <td>\${it.tag ? '<span class="tag">'+it.tag+'</span>' : ''}</td>
          <td class="mono">\${short(it.hash)}</td>
          <td>\${it.delay_s ?? ""}</td>
        \`;
        tb.appendChild(tr);
      }
    }
    tick();
    setInterval(tick, 2000);
  </script>
</body>
</html>
  `);
});

// ====== 启动 ======
app.listen(PORT, () => {
  console.log("Dashboard running on http://localhost:" + PORT);
});