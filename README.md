# 🐋 Whale Delay Analyzer (Ethereum)

CLI tool to monitor large USDT transfers in mempool
and measure confirmation delay on Ethereum.

---

## Features

- Monitor large pending USDT transfers
- Track mined / reverted / dropped
- Measure confirmation delay
- Tag exchange inflows
- Export CSV
- CLI usage

---

## Install

npm install

---

## Run

node bin/whale-delay.js -t 10000

or

npm start

---

## Options

--threshold    Minimum USDT amount
--ws           WebSocket RPC
--tag          exchanges.json file
--out          CSV output file

---

## Example

node bin/whale-delay.js -t 50000 --out data.csv

---

## Output CSV Fields

hash
method
amount_usdt
from
to
tag
block
status
delay_s
gasUsed
effectiveGasPrice_gwei