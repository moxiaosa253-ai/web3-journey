const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("https://ethereum.publicnode.com");

  const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const abi = [
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "function decimals() view returns (uint8)"
  ];

  // 你要查的地址：命令行第一个参数
  const target = (process.argv[2] || "").trim();
  if (!target) {
    console.log("Usage: node events.js <wallet_address> [blocks]");
    console.log("Example: node events.js 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 20000");
    return;
  }

  // 默认查最近 20000 个区块（大概 2-3 天左右），你也可以传第二个参数改范围
  const lookback = Number(process.argv[3] || 20000);

  const contract = new ethers.Contract(USDT, abi, provider);
  const decimals = await contract.decimals();

  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - lookback);

  console.log("Target:", target);
  console.log("Scanning blocks:", fromBlock, "->", latest);

  // 只查 “转出” 或 “转入” 两种情况
  const outFilter = contract.filters.Transfer(target, null);
  const inFilter = contract.filters.Transfer(null, target);

  const [outLogs, inLogs] = await Promise.all([
    contract.queryFilter(outFilter, fromBlock, latest),
    contract.queryFilter(inFilter, fromBlock, latest),
  ]);

  console.log("USDT Transfers OUT:", outLogs.length);
  console.log("USDT Transfers IN :", inLogs.length);

  function printLogs(title, logs) {
    console.log("===", title, "===");
    for (const log of logs.slice(-5)) { // 只打印最后 5 条
      const from = log.args.from;
      const to = log.args.to;
      const value = ethers.formatUnits(log.args.value, decimals);
      console.log(`block ${log.blockNumber}  ${from} -> ${to}  ${value} USDT`);
    }
  }

  printLogs("LAST 5 OUT", outLogs);
  printLogs("LAST 5 IN", inLogs);
}

main().catch(console.error);