const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("https://ethereum.publicnode.com");

  const address = process.argv[2];
  const tokenAddress = process.argv[3];

  if (!address || !tokenAddress) {
    console.log("Usage: node tokenBalance.js <wallet_address> <token_contract>");
    return;
  }

  const abi = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
  ];

  const contract = new ethers.Contract(tokenAddress, abi, provider);

  const balance = await contract.balanceOf(address);
  const decimals = await contract.decimals();
  const symbol = await contract.symbol();

  console.log(symbol + ":", ethers.formatUnits(balance, decimals));
}

main().catch(console.error);