import { createClient, createAccount } from "genlayer-js";
import { TransactionStatus, ExecutionResult } from "genlayer-js/types";
import { activeChain, CONTRACT_ADDRESS } from "./networks";
import type { ClaimData, Signer } from "./types";
import { withActiveProvider } from "./injectedWallets";
import { ensureWalletOnActiveNetwork } from "./evm";
import { assertionKey, claimBase } from "./claims";
import type { ClaimForm } from "./claims";
import { normalizeClaim, bountyWei } from "./claims";
import { sameAddress } from "./format";

// A read-only client needs no signer at all: every view method is a free call with no wallet
// interaction, so the app can show claims before any wallet exists.
const readClient = createClient({ chain: activeChain });

/**
 * Builds a write-capable client bound to a specific signer for exactly one transaction.
 * `signer` is either a raw private key (burner wallet) or an already-connected injected
 * address string (MetaMask etc, per genlayer-js's own account-as-address pattern).
 */
function writeClientFor(signer: `0x${string}`, isPrivateKey: boolean) {
  const account: unknown = isPrivateKey ? createAccount(signer) : signer;
  return createClient({ chain: activeChain, account } as Parameters<typeof createClient>[0]);
}

export type { Signer };

/** Native-token balance for a wallet address (for a "have I got gas" hint in the UI). */
export async function readClientBalance(address: `0x${string}`): Promise<bigint> {
  const client = readClient as unknown as {
    getBalance: (args: { address: `0x${string}` }) => Promise<bigint>;
  };
  return client.getBalance({ address });
}

/**
 * genlayer-js can hand back decoded contract dicts as `Map`s and integers as `bigint`s. The UI
 * wants plain objects and numbers, so normalise once here: Map -> object, bigint -> number when
 * it is safe (otherwise a decimal string, which is what wei fields already are).
 */
function normalize(value: unknown): unknown {
  if (value instanceof Map) {
    const obj: Record<string, unknown> = {};
    value.forEach((v, k) => {
      obj[String(k)] = normalize(v);
    });
    return obj;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= -BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value && typeof value === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) obj[k] = normalize(v);
    return obj;
  }
  return value;
}

async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  const raw = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    stateStatus: "accepted",
  });
  return normalize(raw) as T;
}

/** Shape of the fields we care about on a transaction receipt -- kept loose/`unknown`-cast at
 * the call site since we don't depend on genlayer-js's exact receipt type surface. */
interface ReceiptExecutionInfo {
  txExecutionResultName?: string;
  stderr?: string;
  result?: { stderr?: string };
  data?: { stderr?: string };
}

/** `request_corroboration` runs a consensus round (validators fetch explorer pages and run the
 * model), which takes far longer than a plain state change. */
const RETRIES_PLAIN = 60;
const RETRIES_CONSENSUS = 160;
const POLL_INTERVAL_MS = 3000;

async function write(
  signer: Signer,
  functionName: string,
  args: unknown[],
  opts: { valueWei?: bigint; consensus?: boolean } = {},
): Promise<string> {
  const isPrivateKey = !!signer.privateKey;

  // Auto network switch: a browser wallet must be on the GenLayer network to sign for it. If it
  // isn't, this triggers the wallet's own "switch network" / "add network" popup first.
  if (!isPrivateKey && signer.provider) {
    await ensureWalletOnActiveNetwork(signer.provider);
  }

  const client = writeClientFor(signer.privateKey ?? signer.address, isPrivateKey);
  // For an injected wallet, make sure the wallet the user actually picked is the one that signs
  // (matters when several extensions are installed). No-op for the burner wallet.
  const hash = await withActiveProvider(isPrivateKey ? null : (signer.provider ?? null), () =>
    client.writeContract({
      address: CONTRACT_ADDRESS,
      functionName,
      args,
      value: opts.valueWei ?? 0n,
    }),
  );
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: opts.consensus ? RETRIES_CONSENSUS : RETRIES_PLAIN,
    interval: POLL_INTERVAL_MS,
    fullTransaction: true,
  });

  // Consensus reaching ACCEPTED only means validators agreed on an outcome -- that outcome can
  // itself be a failed execution (a contract-side validation error, for instance). Treating
  // ACCEPTED alone as success would show a false "success" toast while nothing was written.
  const r = receipt as unknown as ReceiptExecutionInfo;
  if (r.txExecutionResultName === ExecutionResult.FINISHED_WITH_ERROR) {
    const detail = r.stderr || r.result?.stderr || r.data?.stderr;
    throw new Error(
      detail
        ? `The contract rejected this transaction: ${cleanContractError(detail)}`
        : "The contract rejected this transaction (execution failed). Double-check your inputs.",
    );
  }
  if (r.txExecutionResultName === ExecutionResult.NOT_VOTED) {
    throw new Error(
      "The network hasn't finished voting on this transaction yet. Wait a moment and check whether it went through before retrying.",
    );
  }
  return hash;
}

/** The contract prefixes its user-facing errors with [EXPECTED] / [TRANSIENT] / [LLM_ERROR]. */
function cleanContractError(detail: string): string {
  const match = detail.match(/\[(EXPECTED|TRANSIENT|LLM_ERROR)\]\s*([^\n]*)/);
  if (!match) return detail;
  const [, kind, message] = match;
  if (kind === "TRANSIENT") return `${message} (temporary — try again in a moment)`;
  if (kind === "LLM_ERROR") return `${message} (the consensus model call failed — try again)`;
  return message;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const getClaim = (claimId: string) => read<ClaimData>("get_claim", [claimId]);
export const isConfirmed = (claimId: string) => read<boolean>("is_confirmed", [claimId]);
export const listClaims = (offset: number, limit: number) => read<ClaimData[]>("list_claims", [offset, limit]);

/** Pages through every claim (oldest first, as stored). Capped so a huge registry can't hang the UI. */
export async function listAllClaims(cap = 600, pageSize = 50): Promise<ClaimData[]> {
  const out: ClaimData[] = [];
  for (let offset = 0; offset < cap; offset += pageSize) {
    const page = await listClaims(offset, pageSize);
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

/**
 * After `submit_claim` the new id isn't reliably in the receipt, so recompute it the way the
 * contract does (the assertion key plus an attempt number) and probe attempts until one is
 * missing. Falls back to the submitter's newest claim if the probe finds nothing.
 */
export async function findSubmittedClaimId(form: ClaimForm, submitter: string): Promise<string | null> {
  try {
    const key = await assertionKey(form);
    let last: string | null = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      const id = `${key}#${attempt}`;
      try {
        await getClaim(id);
        last = id;
      } catch {
        break;
      }
    }
    if (last) return last;
  } catch {
    /* fall through to the scan */
  }
  try {
    const all = await listAllClaims();
    const tx = normalizeClaim(form).txHash;
    for (let i = all.length - 1; i >= 0; i--) {
      if (sameAddress(all[i].submitter, submitter) && all[i].tx_hash === tx) return all[i].claim_id;
    }
  } catch {
    /* nothing more to try */
  }
  return null;
}

/** All attempts that share a claim's assertion (same `claim_id` base), oldest first. */
export function attemptsOf(all: ClaimData[], claimId: string): ClaimData[] {
  const base = claimBase(claimId);
  return all.filter((c) => claimBase(c.claim_id) === base);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const submitClaim = (signer: Signer, form: ClaimForm) => {
  const n = normalizeClaim(form);
  return write(
    signer,
    "submit_claim",
    [n.chain, n.eventType, n.txHash, n.contractAddress, n.from, n.to, n.tokenId, n.amount],
    { valueWei: bountyWei(form) },
  );
};

export const addBounty = (signer: Signer, claimId: string, amountWei: bigint) =>
  write(signer, "add_bounty", [claimId], { valueWei: amountWei });

/** Runs the consensus round: validators fetch every configured explorer page for this claim. */
export const requestCorroboration = (signer: Signer, claimId: string) =>
  write(signer, "request_corroboration", [claimId], { consensus: true });

export const refundRemainingBounty = (signer: Signer, claimId: string) =>
  write(signer, "refund_remaining_bounty", [claimId]);
