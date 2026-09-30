# Event Corroborator — frontend

Frontend for the `CrossChainEventCorroborator` Intelligent Contract on [GenLayer](https://genlayer.com).
Anyone submits a claim about a transaction on Ethereum, Polygon, Arbitrum, Optimism or Base, with a small
bounty. A keeper starts a consensus round; validators read two fixed block explorers per chain; the contract
counts the per-source results into Confirmed, Rejected or Not decisive.

Vite + React + TypeScript + Tailwind, talking to the chain directly through `genlayer-js`. No backend.

## Wallet (same as the other frontends, extended)

- **Built-in wallet**: encrypted in-browser key (create or import), unchanged.
- **Any EVM browser wallet**: discovered through EIP-6963, legacy `window.ethereum` (including the multi-provider
  array), and vendor globals (Phantom, OKX, Trust, Coinbase, Binance). Reconnects silently to the last wallet used.
- **Auto network switch**: connecting a wallet moves it onto the GenLayer network. Before every transaction the app
  checks the wallet's chain again and switches it if needed.
- **Add-network popup**: if the wallet doesn't know the network, the app asks it to add it (the wallet's own popup,
  using the RPC and currency from `genlayer-js`). A "wrong network" dialog appears whenever the wallet sits on another
  chain, including when the user switches inside the extension, with one-tap Switch and Add network buttons.
- **Network menu** in the header: switch between GenLayer Studio, Asimov, Bradbury and Localnet (reloads the app), set
  a contract address per network in the browser, and add the current network to the wallet.
- On phones with no injected wallet, the connect dialog offers deep links that reopen the page inside MetaMask,
  Coinbase Wallet or Trust Wallet.

## Pages

- **Overview**: what it does and the asymmetric confirm/reject rule.
- **Submit a claim**: chain, event type, tx hash, optional asserted fields, bounty; links to check the hash on each
  explorer first. The claim id is recomputed client-side (same SHA-256 scheme as the contract) to open the new claim.
- **Claims**: search by hash, address or claim id; filter by chain and status; sort by bounty (keeper view).
- **Claim page**: per-explorer stamps, validators' reasoning, plain-language reason for the verdict, run / re-run a
  round (with the 10-minute cooldown countdown), top up the bounty, refund leftovers, other attempts at the same claim.
- **My claims**: open, ready for refund, settled.

## Setup

1. Deploy `CrossChainEventCorroborator.py` in GenLayer Studio and copy the address.
2. `cp .env.example .env`, set `VITE_CONTRACT_ADDRESS` (and `VITE_GENLAYER_NETWORK` if not Studio).
3. `npm install && npm run dev`
4. Vercel: import as a Vite project and add the same env vars (they're baked in at build, so redeploy after changing).

## Contract and tests

```
contracts/CrossChainEventCorroborator.py   the Intelligent Contract this frontend talks to
tests/contract/                            Python tests that run against the real contract source
tests/vectors/assertion_keys.json          claim ids produced by the contract, used by the frontend test
src/lib/claims.test.ts                     frontend tests (vitest)
```

- `npm test` runs the frontend tests (Node 20+, needs `npm install` first).
- `npm run test:contract` runs the contract tests (Python 3, no packages needed). They load the contract with a small
  stand-in for the `genlayer` package and exercise its pure logic: the confirm/reject aggregation rule, the code-level
  gating of unreachable sources, claim-id derivation, input validation, the cooldown clock and the constants.
- `npm run test:vectors` regenerates `assertion_keys.json` from the contract. The frontend test then checks that the
  browser computes the same claim ids (including non-ASCII free text), which is how the app finds a claim it just made.

What these tests do not cover: anything that needs the GenLayer VM, meaning `submit_claim`, `request_corroboration`,
bounty payouts and refunds, and real explorer fetches. Test those on GenLayer Studio or a localnet with the deployed
contract.

## Notes

- `request_corroboration` runs a consensus round; the client waits up to ~8 minutes for it.
- Amounts show as `GEN` (`NATIVE_SYMBOL` in `src/lib/format.ts`).
- There is no per-address view on the contract, so Claims and My claims page through `list_claims` and filter
  client-side (capped at 600). Use an indexer beyond demo scale.
- Not included: WalletConnect (needs a project id and an extra dependency). Mobile wallets work through their in-app
  browser instead.
- The built-in wallet is a convenience signer for Studio/testnet, not a hardened wallet.
