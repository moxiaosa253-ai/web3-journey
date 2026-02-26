async function main() {
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd";

  const res = await fetch(url);
  const data = await res.json();

  console.log("ETH price:", data.ethereum.usd, "USD");
  console.log("BTC price:", data.bitcoin.usd, "USD");
}

main().catch(console.error);