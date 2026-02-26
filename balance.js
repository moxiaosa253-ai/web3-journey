const { ethers } = require("ethers");

async function tryProvider(url) {
  const provider = new ethers.JsonRpcProvider(url);

  // 先检测网络是否通（chainId）
  const network = await provider.getNetwork();

  // 查询余额
  const address = process.argv[2] || "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // Vitalik
  const balance = await provider.getBalance(address);

  return {
    url,
    chainId: network.chainId.toString(),
    eth: ethers.formatEther(balance),
  };
}

async function main() {
  // 多个 RPC 轮询，哪个能用就用哪个
  const urls = [
    "https://ethereum.publicnode.com",
    "https://rpc.ankr.com/eth",           // 这个可能要 key，但先留着备用
    "https://cloudflare-eth.com",
  ];

  for (const url of urls) {
    try {
      const r = await tryProvider(url);
      console.log("RPC OK:", r.url);
      console.log("chainId:", r.chainId);
      console.log("ETH Balance:", r.eth);
      return;
    } catch (e) {
      console.log("RPC FAIL:", url);
      console.log(String(e?.shortMessage || e?.message || e));
      console.log("----");
    }
  }

  console.log("All RPC endpoints failed. Likely network/DNS/proxy issue.");
}

main().catch(console.error);