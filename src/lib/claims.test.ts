import { describe, expect, it } from "vitest";
import vectors from "../../tests/vectors/assertion_keys.json";
import {
  KEEPER_REWARD_CAP_WEI,
  aggregate,
  assertionKey,
  bountyWei,
  claimAttempt,
  claimBase,
  claimPath,
  emptyClaimForm,
  explainRound,
  explorerLinks,
  fieldCount,
  isTerminal,
  keeperReward,
  normalizeClaim,
  sourceResults,
  validateClaim,
} from "./claims";
import type { ClaimForm } from "./claims";
import type { ClaimData, EventType, SourceChain, SourceVerdict } from "./types";

const TX = "0x" + "ab".repeat(32);
const ADDR = "0x" + "cd".repeat(20);

function form(over: Partial<ClaimForm> = {}): ClaimForm {
  return { ...emptyClaimForm(), txHash: TX, ...over };
}

function claim(over: Partial<ClaimData> = {}): ClaimData {
  return {
    claim_id: `ethereum:${TX}:0123456789abcdef0123456789abcdef#0`,
    submitter: ADDR,
    source_chain: "ethereum",
    event_type: "TOKEN_TRANSFER",
    tx_hash: TX,
    contract_address: "",
    expected_from: "",
    expected_to: "",
    expected_token_id: "",
    expected_amount: "",
    submitted_at: "2026-09-30T10:00:00Z",
    status: "PENDING",
    check_attempts: 0,
    last_check_at: "",
    verdict_rationale: "",
    source_summary: "",
    bounty: "10000000000000000",
    confirmed_at: "",
    rejected_at: "",
    ...over,
  };
}

// The contract's own `_assertion_key` produced these ids (tests/contract/generate_vectors.py).
describe("claim id parity with the contract", () => {
  for (const v of vectors) {
    it(`${v.chain} ${v.event_type} ${v.key.slice(-8)}`, async () => {
      const f = form({
        chain: v.chain as SourceChain,
        eventType: v.event_type as EventType,
        txHash: v.tx_hash,
        contractAddress: v.contract_address,
        from: v.expected_from,
        to: v.expected_to,
        tokenId: v.expected_token_id,
        amount: v.expected_amount,
      });
      expect(await assertionKey(f)).toBe(v.key);
    });
  }

  it("is insensitive to letter case and padding, like the contract's normalisation", async () => {
    const a = await assertionKey(form({ txHash: TX.toUpperCase().replace("0X", "0x"), from: ADDR.toUpperCase().replace("0X", "0x") }));
    const b = await assertionKey(form({ txHash: `  ${TX}  `, from: ADDR }));
    expect(a).toBe(b);
  });
});

describe("aggregate (mirrors the contract's _aggregate)", () => {
  const M: SourceVerdict = "MATCH";
  const X: SourceVerdict = "MISMATCH";
  const N: SourceVerdict = "NOT_FOUND";
  const U: SourceVerdict = "COULD_NOT_DETERMINE";
  const A: SourceVerdict = "NOT_APPLICABLE";

  it("confirms only when every configured source was reachable and matched", () => {
    expect(aggregate([M, M], 2)).toBe("CONFIRMED");
    expect(aggregate([M, A], 2)).toBe("INSUFFICIENT");
    expect(aggregate([M, X], 2)).toBe("INSUFFICIENT");
    expect(aggregate([M, N], 2)).toBe("INSUFFICIENT");
    expect(aggregate([M, U], 2)).toBe("INSUFFICIENT");
  });

  it("rejects only with at least two reachable sources, all negative", () => {
    expect(aggregate([X, X], 2)).toBe("REJECTED");
    expect(aggregate([N, N], 2)).toBe("REJECTED");
    expect(aggregate([X, N], 2)).toBe("REJECTED");
    expect(aggregate([X, A], 2)).toBe("INSUFFICIENT");
    expect(aggregate([X, U], 2)).toBe("INSUFFICIENT");
  });

  it("is insufficient when nothing is reachable", () => {
    expect(aggregate([A, A], 2)).toBe("INSUFFICIENT");
  });
});

describe("validateClaim", () => {
  it("accepts a bare claim", () => {
    expect(validateClaim(form())).toBeNull();
  });

  it("rejects malformed hashes", () => {
    expect(validateClaim(form({ txHash: "0x1234" }))).toContain("64 hex");
    expect(validateClaim(form({ txHash: "ab".repeat(33) }))).toContain("64 hex");
    expect(validateClaim(form({ txHash: "0x" + "zz".repeat(32) }))).toContain("64 hex");
  });

  it("checks optional addresses only when present", () => {
    expect(validateClaim(form({ from: ADDR }))).toBeNull();
    expect(validateClaim(form({ from: "0x12" }))).toContain("From address");
    expect(validateClaim(form({ to: "nope" }))).toContain("To address");
    expect(validateClaim(form({ contractAddress: "0x12" }))).toContain("Contract or token address");
  });

  it("enforces the 100 character limit on free-text fields", () => {
    expect(validateClaim(form({ tokenId: "1".repeat(100) }))).toBeNull();
    expect(validateClaim(form({ tokenId: "1".repeat(101) }))).toContain("Token ID");
    expect(validateClaim(form({ amount: "1".repeat(101) }))).toContain("Amount");
  });

  it("validates the bounty", () => {
    expect(validateClaim(form({ bounty: "" }))).toBeNull();
    expect(validateClaim(form({ bounty: "0.5" }))).toBeNull();
    expect(validateClaim(form({ bounty: "abc" }))).toContain("bounty");
    expect(validateClaim(form({ bounty: "1.0000000000000000001" }))).toContain("bounty");
  });
});

describe("form helpers", () => {
  it("normalises like the contract", () => {
    const n = normalizeClaim(form({ txHash: ` ${TX.toUpperCase().replace("0X", "0x")} `, from: ADDR.toUpperCase().replace("0X", "0x") }));
    expect(n.txHash).toBe(TX);
    expect(n.from).toBe(ADDR);
  });

  it("converts the bounty to wei exactly", () => {
    expect(bountyWei(form({ bounty: "0.01" }))).toBe(10_000_000_000_000_000n);
    expect(bountyWei(form({ bounty: "" }))).toBe(0n);
  });

  it("counts asserted details", () => {
    expect(fieldCount(form())).toBe(0);
    expect(fieldCount(form({ from: ADDR, amount: "1" }))).toBe(2);
  });
});

describe("claim ids and paths", () => {
  it("splits the attempt suffix off", () => {
    expect(claimBase("ethereum:0xabc:deadbeef#3")).toBe("ethereum:0xabc:deadbeef");
    expect(claimAttempt("ethereum:0xabc:deadbeef#3")).toBe(3);
    expect(claimAttempt("ethereum:0xabc:deadbeef")).toBe(0);
  });

  it("encodes ids for URLs", () => {
    expect(claimPath("ethereum:0xabc:deadbeef#0")).toBe("/claim/ethereum%3A0xabc%3Adeadbeef%230");
  });
});

describe("explorers", () => {
  it("builds the same two explorer links per chain as the contract", () => {
    const links = explorerLinks("base", TX);
    expect(links.map((l) => l.name)).toEqual(["basescan", "blockscout"]);
    expect(links[0].href).toBe(`https://basescan.org/tx/${TX}`);
    expect(links[1].href).toBe(`https://base.blockscout.com/tx/${TX}`);
  });

  it("returns nothing for an unknown chain", () => {
    expect(explorerLinks("solana", TX)).toEqual([]);
  });
});

describe("rewards and status", () => {
  it("caps the keeper reward", () => {
    expect(keeperReward("1000")).toBe(1000n);
    expect(keeperReward((KEEPER_REWARD_CAP_WEI * 10n).toString())).toBe(KEEPER_REWARD_CAP_WEI);
  });

  it("knows terminal statuses", () => {
    expect(isTerminal("PENDING")).toBe(false);
    expect(isTerminal("CONFIRMED")).toBe(true);
    expect(isTerminal("REJECTED")).toBe(true);
    expect(isTerminal("STALE")).toBe(true);
  });
});

describe("per-source results and explanations", () => {
  it("reads the contract's source_summary JSON in source order", () => {
    const rs = sourceResults(claim({ source_summary: JSON.stringify({ blockscout: "NOT_FOUND", etherscan: "MATCH" }) }));
    expect(rs.map((r) => [r.name, r.verdict])).toEqual([
      ["etherscan", "MATCH"],
      ["blockscout", "NOT_FOUND"],
    ]);
  });

  it("treats a missing or broken summary as not checked", () => {
    expect(sourceResults(claim()).every((r) => r.verdict === null)).toBe(true);
    expect(sourceResults(claim({ source_summary: "{broken" })).every((r) => r.verdict === null)).toBe(true);
  });

  it("says nothing before a round has run", () => {
    expect(explainRound(claim())).toBeNull();
  });

  it("explains each outcome", () => {
    const both = (a: SourceVerdict, b: SourceVerdict) =>
      claim({ check_attempts: 1, source_summary: JSON.stringify({ etherscan: a, blockscout: b }) });
    expect(explainRound(both("MATCH", "MATCH"))).toContain("every one matched");
    expect(explainRound(both("MISMATCH", "NOT_FOUND"))).toContain("unanimous");
    expect(explainRound(both("MATCH", "NOT_APPLICABLE"))).toContain("couldn't be reached");
    expect(explainRound(both("MATCH", "MISMATCH"))).toContain("disagreed");
    expect(explainRound(both("COULD_NOT_DETERMINE", "MATCH"))).toContain("legible");
  });
});
