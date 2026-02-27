const { ethers } = require("ethers");
const { createObjectCsvWriter } = require("csv-writer");

const WS_URL = "wss://ethereum.publicnode.com";
const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

const abi = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function start() {
  const target = (process.argv[2] || "").trim();
  const threshold = Number(process.argv[3] || 10000); // 默认报警阈值：10000 USDT

  if (!target) {
    console.log("Usage: node realtime.js <wallet_address> [thresholdUSDT]");
    console.log("Example: node realtime.js 0xd8dA6... 10000");
    return;
  }

  const provider = new ethers.WebSocketProvider(WS_URL);
  const contract = new ethers.Contract(USDT, abi, provider);

  const decimals = await contract.decimals();
  const symbol = await contract.symbol();

  const csvWriter = createObjectCsvWriter({
    path: "realtime_transfers.csv",
    header: [
      { id: "direction", title: "direction" },
      { id: "blockNumber", title: "blockNumber" },
      { id: "txHash", title: "txHash" },
      { id: "from", title: "from" },
      { id: "to", title: "to" },
      { id: "value", title: "value" },
      { id: "alert", title: "alert" }
    ],
    append: true,
  });

  console.log("Listening:", symbol);
  console.log("Target:", target);
  console.log("Alert threshold:", threshold, symbol);
  console.log("----");

  const onTransfer = async (from, to, value, event) => {
    const fromL = from.toLowerCase();
    const toL = to.toLowerCase();
    const targetL = target.toLowerCase();

    if (fromL !== targetL && toL !== targetL) return;

    const direction = toL === targetL ? "IN" : "OUT";
    const amountStr = ethers.formatUnits(value, decimals);
    const amount = Number(amountStr);

    const isAlert = amount >= threshold;
    const alertText = isAlert ? "ALERT" : "";

    if (isAlert) {
      console.log("🚨", alertText, direction, amountStr, symbol, "block", event.blockNumber);
    } else {
      console.log(direction, amountStr, symbol, "block", event.blockNumber);
    }

    await csvWriter.writeRecords([{
      direction,
      blockNumber: event.blockNumber,
      txHash: event.log.transactionHash,
      from,
      to,
      value: amountStr,
      alert: alertText
    }]);
  };

  contract.on("Transfer", onTransfer);

  // 断线提示（WebSocketProvider 内部会报错/close）
  const ws = provider._websocket;
  if (ws) {
    ws.on("close", () => console.log("WebSocket closed"));
    ws.on("error", (e) => console.log("WebSocket error:", e?.message || e));
  }
}

async function main() {
  // 简单重连循环：崩了就等 3 秒重启
  while (true) {
    try {
      await start();
      // start() 里会一直监听，所以这里挂起
      await new Promise(() => {});
    } catch (e) {
      console.log("Listener crashed:", e?.message || e);
      console.log("Reconnecting in 3s...");
      await sleep(3000);
    }
  }
}

main().catch(console.error);