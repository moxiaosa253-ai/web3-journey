const { ethers } = require("ethers");
const { createObjectCsvWriter } = require("csv-writer");

async function main() {
  const provider = new ethers.JsonRpcProvider("https://ethereum.publicnode.com");

  const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  const abi = [
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];

  const target = (process.argv[2] || "").trim();
  if (!target) {
    console.log("Usage: node exportUsdtCsv.js <wallet_address> [lookbackBlocks]");
    console.log("Example: node exportUsdtCsv.js 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 200000");
    return;
  }

  const lookback = Number(process.argv[3] || 200000); // 默认往回查 200k
  const MAX_RANGE = 50000; // 这个是 RPC 限制

  const contract = new ethers.Contract(USDT, abi, provider);
  const decimals = await contract.decimals();
  const symbol = await contract.symbol();

  const latest = await provider.getBlockNumber();
  const start = Math.max(0, latest - lookback);

  console.log("Token:", symbol);
  console.log("Target:", target);
  console.log("Scanning blocks:", start, "->", latest);

  const csvWriter = createObjectCsvWriter({
    path: "usdt_transfers.csv",
    header: [
      { id: "direction", title: "direction" },
      { id: "blockNumber", title: "blockNumber" },
      { id: "txHash", title: "txHash" },
      { id: "from", title: "from" },
      { id: "to", title: "to" },
      { id: "value", title: "value" },
    ],
    append: false,
  });

  // 先写表头（写入空数据也会创建文件）
  await csvWriter.writeRecords([]);

  const rows = [];
  function pushRow(direction, log) {
    const value = ethers.formatUnits(log.args.value, decimals);
    rows.push({
      direction,
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
      from: log.args.from,
      to: log.args.to,
      value,
    });
  }

  // 分段扫描：每段最多 50000 区块
  for (let fromBlock = start; fromBlock <= latest; fromBlock += MAX_RANGE) {
    const toBlock = Math.min(latest, fromBlock + MAX_RANGE - 1);
    console.log("Chunk:", fromBlock, "->", toBlock);

    const outFilter = contract.filters.Transfer(target, null);
    const inFilter = contract.filters.Transfer(null, target);

    const [outLogs, inLogs] = await Promise.all([
      contract.queryFilter(outFilter, fromBlock, toBlock),
      contract.queryFilter(inFilter, fromBlock, toBlock),
    ]);

    for (const log of outLogs) pushRow("OUT", log);
    for (const log of inLogs) pushRow("IN", log);

    // 每个 chunk 写一次，避免 rows 太大
    if (rows.length > 0) {
      // 这里用 append 写入
      const chunkWriter = createObjectCsvWriter({
        path: "usdt_transfers.csv",
        header: [
          { id: "direction", title: "direction" },
          { id: "blockNumber", title: "blockNumber" },
          { id: "txHash", title: "txHash" },
          { id: "from", title: "from" },
          { id: "to", title: "to" },
          { id: "value", title: "value" },
        ],
        append: true,
      });
      await chunkWriter.writeRecords(rows);
      console.log("Wrote rows:", rows.length);
      rows.length = 0;
    } else {
      console.log("Wrote rows: 0");
    }
  }

  console.log("Done. Output: usdt_transfers.csv");
}

main().catch(console.error);