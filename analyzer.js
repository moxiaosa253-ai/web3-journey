const fs = require("fs");
const { ethers } = require("ethers");
const { createObjectCsvWriter } = require("csv-writer");

const WS_URL = "wss://ethereum.publicnode.com";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

// 只解析 transfer / transferFrom
const ABI = [
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
];

const iface = new ethers.Interface(ABI);
const USDT_DECIMALS = 6;

function nowMs() {
  return Date.now();
}

function msToSec(ms) {
  return Math.round(ms / 100) / 10; // 0.1s 精度
}

function feeToGwei(bn) {
  if (!bn) return "";
  try {
    return ethers.formatUnits(bn, "gwei");
  } catch {
    return "";
  }
}

function loadExchangeTags() {
  // exchanges.json 结构示例：
  // { "binance": ["0x...","0x..."], "okx": ["0x..."] }
  let exchangeMap = {};
  try {
    exchangeMap = JSON.parse(fs.readFileSync("exchanges.json", "utf-8"));
  } catch {
    exchangeMap = {};
  }

  const exchangeTags = new Map(); // addrLower -> EXCHANGE_NAME
  for (const [name, arr] of Object.entries(exchangeMap)) {
    for (const addr of (arr || [])) {
      if (typeof addr === "string" && addr.startsWith("0x") && addr.length === 42) {
        exchangeTags.set(addr.toLowerCase(), name.toUpperCase());
      }
    }
  }
  return exchangeTags;
}

async function waitForMined(provider, txHash, info, csvWriter) {
  try {
    const receipt = await provider.waitForTransaction(txHash, 1); // 等 1 次确认
    if (!receipt) return null;

    const delay = msToSec(nowMs() - info.t0);
    const status = receipt.status === 1 ? "MINED" : "REVERTED";
    const gasUsed = receipt.gasUsed?.toString?.() ?? String(receipt.gasUsed);
    const effGwei = feeToGwei(receipt.effectiveGasPrice);

    await csvWriter.writeRecords([
      {
        hash: txHash,
        method: info.method,
        amount_usdt: info.amount,
        from: info.from,
        to: info.to,
        tag: info.tag,
        block: receipt.blockNumber,
        status,
        delay_s: delay,
        gasUsed,
        effectiveGasPrice_gwei: effGwei,
      },
    ]);

    console.log(status === "MINED" ? "✅ MINED" : "❌ REVERTED");
    if (info.tag) console.log("🏷", info.tag);
    console.log("To:", info.to);
    console.log("Delay:", delay, "s", "Block:", receipt.blockNumber, "GasUsed:", gasUsed, "EffGwei:", effGwei);
    console.log("----");

    return { status, delay };
  } catch {
    // 可能被替换/丢弃
    await csvWriter.writeRecords([
      {
        hash: txHash,
        method: info.method,
        amount_usdt: info.amount,
        from: info.from,
        to: info.to,
        tag: info.tag,
        block: "",
        status: "DROPPED",
        delay_s: "",
        gasUsed: "",
        effectiveGasPrice_gwei: "",
      },
    ]);

    console.log("⚠️ DROPPED/REPLACED");
    if (info.tag) console.log("🏷", info.tag);
    console.log("Hash:", txHash);
    console.log("----");

    return { status: "DROPPED", delay: null };
  }
}

async function main() {
  const threshold = Number(process.argv[2] || 10000);

  console.log("Whale Delay Analyzer...");
  console.log("Threshold:", threshold, "USDT");
  console.log("----");

  const provider = new ethers.WebSocketProvider(WS_URL);

  // 加载交易所地址标签
  const exchangeTags = loadExchangeTags();

  // txHash -> { t0, amount, from, to, method, tag }
  const tracked = new Map();

  // 统计
  let seen = 0;
  let mined = 0;
  let reverted = 0;
  let dropped = 0;

  let sumDelay = 0;
  let maxDelay = 0;

  // CSV
  const csvPath = "whale_delay.csv";
  const exists = fs.existsSync(csvPath);

  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: "hash", title: "hash" },
      { id: "method", title: "method" },
      { id: "amount_usdt", title: "amount_usdt" },
      { id: "from", title: "from" },
      { id: "to", title: "to" },
      { id: "tag", title: "tag" },
      { id: "block", title: "block" },
      { id: "status", title: "status" },
      { id: "delay_s", title: "delay_s" },
      { id: "gasUsed", title: "gasUsed" },
      { id: "effectiveGasPrice_gwei", title: "effectiveGasPrice_gwei" },
    ],
    append: exists,
  });

  // 定时清理：10 分钟还没上链就丢弃记录（防止内存增长）
  setInterval(() => {
    const ttlMs = 10 * 60 * 1000;
    const t = nowMs();
    for (const [hash, info] of tracked.entries()) {
      if (t - info.t0 > ttlMs) tracked.delete(hash);
    }
  }, 60 * 1000);

  provider.on("pending", async (txHash) => {
    try {
      if (tracked.has(txHash)) return;

      const tx = await provider.getTransaction(txHash);
      if (!tx || !tx.to) return;
      if (tx.to.toLowerCase() !== USDT.toLowerCase()) return;
      if (!tx.data || tx.data === "0x") return;

      let parsed;
      try {
        parsed = iface.parseTransaction({ data: tx.data });
      } catch {
        return;
      }

      const method = parsed.name;
      if (method !== "transfer" && method !== "transferFrom") return;

      const amountBN = parsed.args.amount;
      const amount = Number(ethers.formatUnits(amountBN, USDT_DECIMALS));
      if (amount < threshold) return;

      // 解析 to 地址
      let toAddr = "";
      if (method === "transfer") toAddr = parsed.args.to;
      if (method === "transferFrom") toAddr = parsed.args.to;

      // 命中交易所地址就打标签
      const toTag = exchangeTags.get((toAddr || "").toLowerCase()) || "";
      const tag = toTag ? `INFLOW_${toTag}` : "";

      seen += 1;

      const info = {
        t0: nowMs(),
        amount,
        from: tx.from,
        to: toAddr,
        method,
        tag,
      };

      tracked.set(txHash, info);

      console.log("🚨 TRACK", `#${seen}`, method, amount, "USDT");
      console.log("To:", toAddr, tag ? `[${tag}]` : "");
      console.log("Hash:", txHash);
      console.log("----");

      waitForMined(provider, txHash, info, csvWriter)
        .then((res) => {
          if (!res) return;

          if (res.status === "MINED") mined += 1;
          if (res.status === "REVERTED") reverted += 1;
          if (res.status === "DROPPED") dropped += 1;

          const denom = mined + reverted + dropped;

          if (typeof res.delay === "number") {
            sumDelay += res.delay;
            if (res.delay > maxDelay) maxDelay = res.delay;
          }

          const avgDelay = denom > 0 ? Math.round((sumDelay / denom) * 10) / 10 : 0;

          console.log("📊 STATS");
          console.log("Seen:", seen, "Done:", denom, "Mined:", mined, "Reverted:", reverted, "Dropped:", dropped);
          console.log("AvgDelay(s):", avgDelay, "MaxDelay(s):", Math.round(maxDelay * 10) / 10);
          console.log("----");
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  });

  provider._websocket?.on("close", () => console.log("WebSocket closed"));
  provider._websocket?.on("error", (e) => console.log("WebSocket error:", e?.message || e));
}

main().catch(console.error);