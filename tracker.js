const { ethers } = require("ethers");

const WS_URL = "wss://ethereum.publicnode.com";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

// 只解析 transfer / transferFrom
const ABI = [
  "function transfer(address to, uint256 amount)",
  "function transferFrom(address from, address to, uint256 amount)",
];

const iface = new ethers.Interface(ABI);

// USDT 固定 6 位
const USDT_DECIMALS = 6;

function nowMs() {
  return Date.now();
}

function msToSec(ms) {
  return Math.round(ms / 100) / 10; // 0.1s 精度
}

async function main() {
  const threshold = Number(process.argv[2] || 10000); // 默认 1万 USDT
  console.log("Starting tracker...");
  console.log("Threshold:", threshold, "USDT");
  console.log("----");

  const provider = new ethers.WebSocketProvider(WS_URL);

  // 记录我们已追踪的交易：hash -> { t0, amount, from, method }
  const tracked = new Map();

  // 清理太久未上链的交易（避免内存无限增长）
  setInterval(() => {
    const ttlMs = 10 * 60 * 1000; // 10 分钟
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

      const info = {
        t0: nowMs(),
        amount,
        from: tx.from,
        method,
      };

      tracked.set(txHash, info);

      console.log("🚨 TRACKING LARGE PENDING TX");
      console.log("Method:", method);
      console.log("Amount:", amount, "USDT");
      console.log("From:", tx.from);
      console.log("Hash:", txHash);
      console.log("----");

      // 异步等待确认（不会阻塞继续监听）
      waitForMined(provider, txHash, info).catch(() => {});
    } catch {
      // 忽略错误
    }
  });

  provider._websocket?.on("close", () => console.log("WebSocket closed"));
  provider._websocket?.on("error", (e) => console.log("WebSocket error:", e?.message || e));
}

// 等待交易被打包并输出统计
async function waitForMined(provider, txHash, info) {
  try {
    const receipt = await provider.waitForTransaction(txHash, 1); // 等 1 次确认
    if (!receipt) return;

    const delay = msToSec(nowMs() - info.t0);
    const ok = receipt.status === 1;

    const gasUsed = receipt.gasUsed?.toString?.() ?? String(receipt.gasUsed);
    const effGasPrice = receipt.effectiveGasPrice?.toString?.() ?? String(receipt.effectiveGasPrice);

    console.log(ok ? "✅ MINED" : "❌ REVERTED");
    console.log("Hash:", txHash);
    console.log("Block:", receipt.blockNumber);
    console.log("Delay:", delay, "seconds");
    console.log("GasUsed:", gasUsed);
    console.log("EffectiveGasPrice:", effGasPrice);
    console.log("----");
  } catch (e) {
    // 可能被替换/丢弃
    console.log("⚠️ NOT MINED (dropped/replaced?)");
    console.log("Hash:", txHash);
    console.log("----");
  }
}

main().catch(console.error);