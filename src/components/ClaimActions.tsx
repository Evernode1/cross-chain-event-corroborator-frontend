import { useState } from "react";
import { useWallet } from "../context/WalletContext";
import { useRunner } from "../hooks/useRunner";
import { useCountdown } from "../hooks/useCountdown";
import { addBounty, refundRemainingBounty, requestCorroboration } from "../lib/client";
import type { ClaimData } from "../lib/types";
import {
  KEEPER_REWARD_CAP_WEI,
  MAX_CHECK_ATTEMPTS,
  RECHECK_COOLDOWN_SECONDS,
  isTerminal,
  keeperReward,
} from "../lib/claims";
import {
  NATIVE_SYMBOL,
  formatCountdown,
  fromWei,
  fromWeiExact,
  isValidAmount,
  isoToUnixSeconds,
  sameAddress,
  toWei,
} from "../lib/format";
import { Button, Card, HelperText, Input, Label, Notice } from "./ui";
import { WalletPanel } from "./WalletPanel";

function ConsensusNotice() {
  return (
    <div className="flex items-start gap-3 rounded-md border border-beacon-400/30 bg-beacon-400/10 p-3.5">
      <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-beacon-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-beacon-400" />
      </span>
      <div className="text-[13px] leading-relaxed">
        <p className="font-medium text-mist-100">Validators are reading the explorers…</p>
        <p className="mt-1 text-mist-400">
          Each validator opens every explorer page for this transaction and judges it against the claim. This usually takes a
          few minutes. Keep this tab open.
        </p>
      </div>
    </div>
  );
}

export function ClaimActions({ claim: c, refresh }: { claim: ClaimData; refresh: () => Promise<void> }) {
  const wallet = useWallet();
  const { busy, run } = useRunner(refresh);
  const [topUp, setTopUp] = useState("");
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const anyBusy = busy !== null;
  const pending = c.status === "PENDING";
  const terminal = isTerminal(c.status);
  const bounty = BigInt(c.bounty);
  const isSubmitter = sameAddress(c.submitter, wallet.address);

  // The contract enforces a cooldown between rounds once at least one has run.
  const cooldownEnd = c.check_attempts > 0 && c.last_check_at ? isoToUnixSeconds(c.last_check_at) + RECHECK_COOLDOWN_SECONDS : null;
  const cooldownLeft = useCountdown(cooldownEnd);
  const coolingDown = pending && cooldownLeft > 0;
  const roundsLeft = MAX_CHECK_ATTEMPTS - c.check_attempts;
  const reward = keeperReward(c.bounty);

  const header = <h3 className="font-display text-[16px] font-semibold text-mist-100">What you can do</h3>;

  if (!wallet.address) {
    return (
      <Card className="space-y-4 p-5">
        {header}
        <p className="text-[13px] leading-relaxed text-mist-400">
          Connect a wallet to run a round, top up the bounty or claim a refund. Reading claims never needs one.
        </p>
        <WalletPanel />
      </Card>
    );
  }

  const submitTopUp = async () => {
    setTopUpError(null);
    if (!isValidAmount(topUp)) {
      setTopUpError("Enter an amount greater than zero.");
      return;
    }
    const ok = await run(
      "topup",
      (s) => addBounty(s, c.claim_id, toWei(topUp)),
      "Bounty added",
      `${topUp.trim()} ${NATIVE_SYMBOL} was added to the reward for whoever runs the round.`,
    );
    if (ok) setTopUp("");
  };

  return (
    <Card className="space-y-5 p-5">
      {header}

      {pending && (
        <div className="space-y-3">
          <Button
            className="w-full"
            loading={busy === "corroborate"}
            disabled={anyBusy || coolingDown}
            onClick={() =>
              run(
                "corroborate",
                (s) => requestCorroboration(s, c.claim_id),
                "Round finished",
                "The verdict and each explorer's result are now on the claim.",
              )
            }
          >
            {coolingDown ? `Next round in ${formatCountdown(cooldownLeft)}` : c.check_attempts === 0 ? "Run corroboration" : "Run another round"}
          </Button>
          {busy === "corroborate" && <ConsensusNotice />}
          <HelperText>
            Anyone can run it. If it ends in a verdict, you're paid up to {fromWei(KEEPER_REWARD_CAP_WEI, 4)} {NATIVE_SYMBOL} from
            the bounty (this claim would pay you {fromWei(reward, 5)} {NATIVE_SYMBOL}).{" "}
            {c.check_attempts > 0
              ? `${roundsLeft} round${roundsLeft === 1 ? "" : "s"} left before the claim goes stale.`
              : `A claim gets ${MAX_CHECK_ATTEMPTS} rounds to reach a verdict.`}
          </HelperText>
        </div>
      )}

      {pending && (
        <div className="space-y-2 border-t border-deep-700 pt-4">
          <Label hint={NATIVE_SYMBOL}>Add to the bounty</Label>
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              placeholder="e.g. 0.01"
              value={topUp}
              onChange={(e) => {
                setTopUp(e.target.value);
                setTopUpError(null);
              }}
            />
            <Button variant="secondary" loading={busy === "topup"} disabled={anyBusy} onClick={submitTopUp}>
              Add
            </Button>
          </div>
          {topUpError ? (
            <HelperText tone="error">{topUpError}</HelperText>
          ) : (
            <HelperText>Anyone can top up an open claim to make it worth running sooner.</HelperText>
          )}
        </div>
      )}

      {terminal && bounty > 0n && (
        <div className="space-y-2">
          <Button
            className="w-full"
            variant="secondary"
            loading={busy === "refund"}
            disabled={anyBusy}
            onClick={() =>
              run(
                "refund",
                (s) => refundRemainingBounty(s, c.claim_id),
                "Refund sent",
                "The leftover bounty went to the address that submitted the claim.",
              )
            }
          >
            Refund {fromWeiExact(bounty)} {NATIVE_SYMBOL} to the submitter
          </Button>
          <HelperText>
            Anyone can trigger this, but the money only ever goes to{" "}
            {isSubmitter ? "you, the submitter" : "the address that submitted the claim"}.
            {c.status === "STALE" ? " A stale claim never paid a keeper, so the whole bounty is refundable." : ""}
          </HelperText>
        </div>
      )}

      {terminal && bounty === 0n && <Notice tone="info">This claim is settled and has no bounty left to move.</Notice>}

      {c.status === "CONFIRMED" && (
        <Notice tone="success" title="Confirmed">
          Every explorer agreed. Other contracts can rely on this now by reading is_confirmed for this claim id.
        </Notice>
      )}
      {c.status === "REJECTED" && (
        <Notice tone="error" title="Rejected">
          The explorers reported a mismatch or no such transaction. This verdict stays readable at this id. To try again with
          different details, submit a new claim.
        </Notice>
      )}
      {c.status === "STALE" && (
        <Notice tone="warn" title="Stale">
          {MAX_CHECK_ATTEMPTS} rounds ran without a decisive result. Submitting the same claim again starts a fresh attempt.
        </Notice>
      )}
    </Card>
  );
}
