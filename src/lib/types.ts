export type ClaimStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "STALE";

export type SourceVerdict = "MATCH" | "MISMATCH" | "NOT_FOUND" | "COULD_NOT_DETERMINE" | "NOT_APPLICABLE";

export type SourceChain = "ethereum" | "polygon" | "arbitrum" | "optimism" | "base";

export type EventType = "NFT_MINT" | "BRIDGE_LOCK" | "BRIDGE_BURN" | "TOKEN_TRANSFER" | "GENERIC";

/** Mirrors the dict returned by `get_claim` / `list_claims`. `bounty` is wei as a decimal string. */
export interface ClaimData {
  claim_id: string;
  submitter: string;
  source_chain: SourceChain;
  event_type: EventType;
  tx_hash: string;
  contract_address: string;
  expected_from: string;
  expected_to: string;
  expected_token_id: string;
  expected_amount: string;
  submitted_at: string;
  status: ClaimStatus;
  check_attempts: number;
  last_check_at: string;
  verdict_rationale: string;
  source_summary: string; // JSON: {"etherscan":"MATCH","blockscout":"NOT_FOUND"}
  bounty: string;
  confirmed_at: string;
  rejected_at: string;
}

export type WalletMode = "none" | "burner-locked" | "burner-unlocked" | "injected";

/** A usable signer: an address, optionally paired with the private key that controls it
 *  (present for an unlocked burner wallet, absent for an injected/extension wallet, where
 *  the extension itself holds the key and signs via the browser). */
export interface Signer {
  address: `0x${string}`;
  privateKey?: `0x${string}`;
  /** The EIP-1193 provider of the injected wallet the user picked (absent for the burner). */
  provider?: import("./injectedWallets").Eip1193Provider;
}
