const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.WebSocketProvider(
    "wss://ethereum.publicnode.com"
  );

  const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

  const abi = [
    "function transfer(address to, uint256 amount)",
    "function transferFrom(address from, address to, uint256 amount)",
    "function decimals() view returns (uint8)"
  ];

  const iface = new ethers.Interface(abi);

  const threshold = Number(process.argv[2] || 100000); // 默认 10万 USDT

  console.log("Listening mempool...");
  console.log("Threshold:", threshold, "USDT");
  console.log("----");

  provider.on("pending", async (txHash) => {
    try {
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

      if (!parsed) return;

      const decimals = 6; // USDT 固定6位
      const method = parsed.name;

      let amount;

      if (method === "transfer") {
        amount = parsed.args.amount;
      } else if (method === "transferFrom") {
        amount = parsed.args.amount;
      } else {
        return;
      }

      const formatted = Number(ethers.formatUnits(amount, decimals));

      if (formatted >= threshold) {
        console.log("🚨 LARGE PENDING TX");
        console.log("Method:", method);
        console.log("Amount:", formatted, "USDT");
        console.log("From:", tx.from);
        console.log("Hash:", txHash);
        console.log("----");
      }

    } catch (e) {
      // 忽略错误
    }
  });
}

main().catch(console.error);