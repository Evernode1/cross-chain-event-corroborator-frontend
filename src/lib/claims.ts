import type { ClaimData, ClaimStatus, EventType, SourceChain, SourceVerdict } from "./types";
import { toWei } from "./format";

// ---------------------------------------------------------------------------
// Constants mirrored from CrossChainEventCorroborator.py. The contract stays the source of truth;
// these exist so the UI can reject bad input before it costs a transaction.
// ---------------------------------------------------------------------------

export const MIN_SOURCES_REQUIRED = 2;
export const RECHECK_COOLDOWN_SECONDS = 600;
export const MAX_CHECK_ATTEMPTS = 5;
export const KEEPER_REWARD_CAP_WEI = 5n * 10n ** 15n;
export const MAX_FIELD_LEN = 100;

export const TX_HASH_RE = /^0x[0-9a-f]{64}$/;
export const HEX_ADDRESS_RE = /^0x[0-9a-f]{40}$/;

export const SUPPORTED_CHAINS: SourceChain[] = ["ethereum", "polygon", "arbitrum", "optimism", "base"];
export const EVENT_TYPES: EventType[] = ["NFT_MINT", "BRIDGE_LOCK", "BRIDGE_BURN", "TOKEN_TRANSFER", "GENERIC"];

export interface ExplorerSource {
  name: string;
  label: string;
  /** `{tx}` is replaced with the transaction hash. Same literals the contract fetches. */
  urlTemplate: string;
}

export const CHAIN_META: Record<SourceChain, { label: string; short: string; sources: ExplorerSource[] }> = {
  ethereum: {
    label: "Ethereum",
    short: "ETH",
    sources: [
      { name: "etherscan", label: "Etherscan", urlTemplate: "https://etherscan.io/tx/{tx}" },
      { name: "blockscout", label: "Blockscout", urlTemplate: "https://eth.blockscout.com/tx/{tx}" },
    ],
  },
  polygon: {
    label: "Polygon",
    short: "POL",
    sources: [
      { name: "polygonscan", label: "Polygonscan", urlTemplate: "https://polygonscan.com/tx/{tx}" },
      { name: "blockscout", label: "Blockscout", urlTemplate: "https://polygon.blockscout.com/tx/{tx}" },
    ],
  },
  arbitrum: {
    label: "Arbitrum",
    short: "ARB",
    sources: [
      { name: "arbiscan", label: "Arbiscan", urlTemplate: "https://arbiscan.io/tx/{tx}" },
      { name: "blockscout", label: "Blockscout", urlTemplate: "https://arbitrum.blockscout.com/tx/{tx}" },
    ],
  },
  optimism: {
    label: "Optimism",
    short: "OP",
    sources: [
      { name: "optimistic_etherscan", label: "Optimistic Etherscan", urlTemplate: "https://optimistic.etherscan.io/tx/{tx}" },
      { name: "blockscout", label: "Blockscout", urlTemplate: "https://optimism.blockscout.com/tx/{tx}" },
    ],
  },
  base: {
    label: "Base",
    short: "BASE",
    sources: [
      { name: "basescan", label: "Basescan", urlTemplate: "https://basescan.org/tx/{tx}" },
      { name: "blockscout", label: "Blockscout", urlTemplate: "https://base.blockscout.com/tx/{tx}" },
    ],
  },
};

export const EVENT_META: Record<EventType, { label: string; blurb: string }> = {
  NFT_MINT: { label: "NFT mint", blurb: "A token was minted to an address." },
  BRIDGE_LOCK: { label: "Bridge lock", blurb: "Assets were locked in a bridge on the source chain." },
  BRIDGE_BURN: { label: "Bridge burn", blurb: "A wrapped asset was burned to release it elsewhere." },
  TOKEN_TRANSFER: { label: "Token transfer", blurb: "A token or native asset moved between addresses." },
  GENERIC: { label: "Generic event", blurb: "Any other transaction you want independently verified." },
};

export function chainLabel(chain: string): string {
  return CHAIN_META[chain as SourceChain]?.label ?? chain;
}

export function explorerLinks(chain: string, tx: string): { name: string; label: string; href: string }[] {
  const meta = CHAIN_META[chain as SourceChain];
  if (!meta) return [];
  return meta.sources.map((s) => ({ name: s.name, label: s.label, href: s.urlTemplate.replace("{tx}", tx) }));
}

export function sourceCount(chain: string): number {
  return CHAIN_META[chain as SourceChain]?.sources.length ?? 2;
}

// ---------------------------------------------------------------------------
// Aggregation — the same rule as `_aggregate` in the contract, used to explain a verdict.
// ---------------------------------------------------------------------------

export type Aggregate = "CONFIRMED" | "REJECTED" | "INSUFFICIENT";

export function aggregate(results: SourceVerdict[], expectedCount: number): Aggregate {
  const fetchable = results.filter((r) => r !== "NOT_APPLICABLE");
  if (fetchable.length === expectedCount && fetchable.every((r) => r === "MATCH")) return "CONFIRMED";
  if (fetchable.length >= MIN_SOURCES_REQUIRED && fetchable.every((r) => r === "MISMATCH" || r === "NOT_FOUND")) {
    return "REJECTED";
  }
  return "INSUFFICIENT";
}

export interface SourceResult {
  name: string;
  label: string;
  verdict: SourceVerdict | null; // null = no round has run yet
}

/** Per-source verdicts from a claim's `source_summary` JSON, ordered as the contract's sources. */
export function sourceResults(claim: ClaimData): SourceResult[] {
  const meta = CHAIN_META[claim.source_chain];
  let parsed: Record<string, string> = {};
  try {
    const raw = claim.source_summary ? JSON.parse(claim.source_summary) : {};
    if (raw && typeof raw === "object") parsed = raw as Record<string, string>;
  } catch {
    /* a truncated summary is treated as "no per-source data" */
  }
  const sources = meta?.sources ?? Object.keys(parsed).map((name) => ({ name, label: name, urlTemplate: "" }));
  return sources.map((s) => {
    const v = parsed[s.name];
    const known: SourceVerdict[] = ["MATCH", "MISMATCH", "NOT_FOUND", "COULD_NOT_DETERMINE", "NOT_APPLICABLE"];
    return { name: s.name, label: s.label, verdict: known.includes(v as SourceVerdict) ? (v as SourceVerdict) : null };
  });
}

/** Plain-language reason for the latest round's outcome. */
export function explainRound(claim: ClaimData): string | null {
  const rs = sourceResults(claim);
  if (claim.check_attempts === 0 || rs.every((r) => r.verdict === null)) return null;
  const results = rs.map((r) => r.verdict ?? "COULD_NOT_DETERMINE");
  const outcome = aggregate(results, rs.length);
  const fetchable = results.filter((r) => r !== "NOT_APPLICABLE");
  if (outcome === "CONFIRMED") {
    return `All ${rs.length} explorers were reachable and every one matched, which is the bar for confirming.`;
  }
  if (outcome === "REJECTED") {
    return `${fetchable.length} explorers were reachable and every one of them reported a mismatch or no such transaction. Two unanimous negatives are enough to reject.`;
  }
  const unreachable = results.length - fetchable.length;
  const parts: string[] = [];
  if (unreachable > 0) parts.push(`${unreachable} explorer${unreachable === 1 ? "" : "s"} couldn't be reached`);
  if (fetchable.includes("COULD_NOT_DETERMINE")) parts.push("a page wasn't legible enough to judge");
  if (fetchable.includes("MATCH") && fetchable.some((r) => r === "MISMATCH" || r === "NOT_FOUND")) {
    parts.push("the explorers disagreed");
  }
  const why = parts.length ? parts.join(", ") : "the results didn't reach either bar";
  return `Not decisive: ${why}. Confirming needs every explorer to match; rejecting needs at least ${MIN_SOURCES_REQUIRED} reachable explorers all reporting a mismatch. Anything else stays open for another round.`;
}

// ---------------------------------------------------------------------------
// Submission form
// ---------------------------------------------------------------------------

export interface ClaimForm {
  chain: SourceChain;
  eventType: EventType;
  txHash: string;
  contractAddress: string;
  from: string;
  to: string;
  tokenId: string;
  amount: string;
  bounty: string; // native units
}

export function emptyClaimForm(): ClaimForm {
  return {
    chain: "ethereum",
    eventType: "TOKEN_TRANSFER",
    txHash: "",
    contractAddress: "",
    from: "",
    to: "",
    tokenId: "",
    amount: "",
    bounty: "0.01",
  };
}

/** What the contract will actually receive: same normalisation it applies itself. */
export function normalizeClaim(form: ClaimForm) {
  return {
    chain: form.chain,
    eventType: form.eventType,
    txHash: form.txHash.trim().toLowerCase(),
    contractAddress: form.contractAddress.trim().toLowerCase(),
    from: form.from.trim().toLowerCase(),
    to: form.to.trim().toLowerCase(),
    tokenId: form.tokenId.trim(),
    amount: form.amount.trim(),
  };
}

export function validateClaim(form: ClaimForm): string | null {
  const n = normalizeClaim(form);
  if (!TX_HASH_RE.test(n.txHash)) {
    return "The transaction hash must be 0x followed by 64 hex characters.";
  }
  const addr: [string, string][] = [
    ["Contract or token address", n.contractAddress],
    ["From address", n.from],
    ["To address", n.to],
  ];
  for (const [label, v] of addr) {
    if (v !== "" && !HEX_ADDRESS_RE.test(v)) return `${label} must be empty or 0x followed by 40 hex characters.`;
  }
  if (n.tokenId.length > MAX_FIELD_LEN) return `Token ID must be at most ${MAX_FIELD_LEN} characters.`;
  if (n.amount.length > MAX_FIELD_LEN) return `Amount must be at most ${MAX_FIELD_LEN} characters.`;
  const b = form.bounty.trim();
  if (b !== "") {
    if (!/^\d*\.?\d*$/.test(b) || b === "." || (b.split(".")[1] ?? "").length > 18) {
      return "The bounty must be a plain number with at most 18 decimals, or empty.";
    }
  }
  return null;
}

export function bountyWei(form: ClaimForm): bigint {
  const b = form.bounty.trim();
  return b === "" ? 0n : toWei(b);
}

export function fieldCount(form: ClaimForm): number {
  const n = normalizeClaim(form);
  return [n.contractAddress, n.from, n.to, n.tokenId, n.amount].filter((v) => v !== "").length;
}

// ---------------------------------------------------------------------------
// Claim ids — computed exactly as the contract does, so the app can find the claim it just made.
//   assertion_key = f"{chain}:{tx}:{sha256(len-prefixed fields)[:32]}"   claim_id = f"{key}#{attempt}"
// ---------------------------------------------------------------------------

export async function assertionKey(form: ClaimForm): Promise<string> {
  const n = normalizeClaim(form);
  const fields = [n.chain, n.txHash, n.eventType, n.contractAddress, n.from, n.to, n.tokenId, n.amount];
  // Python's len() counts code points, so count code points here too.
  const payload = fields.map((f) => `${[...f].length}:${f}`).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${n.chain}:${n.txHash}:${hex.slice(0, 32)}`;
}

/** The base of a claim id (everything before the `#attempt` suffix) — shared by every attempt of one assertion. */
export function claimBase(claimId: string): string {
  const i = claimId.lastIndexOf("#");
  return i === -1 ? claimId : claimId.slice(0, i);
}

export function claimAttempt(claimId: string): number {
  const i = claimId.lastIndexOf("#");
  return i === -1 ? 0 : Number(claimId.slice(i + 1)) || 0;
}

export function claimPath(claimId: string): string {
  return `/claim/${encodeURIComponent(claimId)}`;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

export const TERMINAL: ClaimStatus[] = ["CONFIRMED", "REJECTED", "STALE"];

export function isTerminal(status: ClaimStatus): boolean {
  return TERMINAL.includes(status);
}

export function keeperReward(bountyWeiStr: string): bigint {
  const b = BigInt(bountyWeiStr);
  return b <= KEEPER_REWARD_CAP_WEI ? b : KEEPER_REWARD_CAP_WEI;
}
