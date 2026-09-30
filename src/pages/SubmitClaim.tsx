import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useToast } from "../context/ToastContext";
import { findSubmittedClaimId, submitClaim } from "../lib/client";
import { isContractConfigured } from "../lib/networks";
import {
  EVENT_META,
  EVENT_TYPES,
  MAX_FIELD_LEN,
  TX_HASH_RE,
  bountyWei,
  chainLabel,
  claimPath,
  emptyClaimForm,
  explorerLinks,
  fieldCount,
  normalizeClaim,
  validateClaim,
} from "../lib/claims";
import type { ClaimForm } from "../lib/claims";
import { NATIVE_SYMBOL, fromWeiExact } from "../lib/format";
import type { EventType } from "../lib/types";
import { Button, Card, HelperText, Input, Label, PageHeader, Select } from "../components/ui";
import { ChainGrid } from "../components/claim";
import { WalletPanel } from "../components/WalletPanel";

function Field({ label, hint, children, help }: { label: string; hint?: string; children: React.ReactNode; help?: string }) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      {children}
      {help && <HelperText>{help}</HelperText>}
    </div>
  );
}

export function SubmitClaim() {
  const wallet = useWallet();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState<ClaimForm>(() => emptyClaimForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (patch: Partial<ClaimForm>) => setForm((f) => ({ ...f, ...patch }));
  const normalized = normalizeClaim(form);
  const hashOk = TX_HASH_RE.test(normalized.txHash);
  const strictness = fieldCount(form);
  const links = hashOk ? explorerLinks(form.chain, normalized.txHash) : [];

  const submit = async () => {
    setFormError(null);
    const err = validateClaim(form);
    if (err) {
      setFormError(err);
      return;
    }
    if (!wallet.signer) {
      setFormError("Connect a wallet first.");
      return;
    }
    setSubmitting(true);
    try {
      await submitClaim(wallet.signer, form);
      let id: string | null = null;
      try {
        id = await findSubmittedClaimId(form, wallet.signer.address);
      } catch {
        /* fall back to the list below */
      }
      toast.push("success", "Claim submitted", "Anyone can now run corroboration on it.");
      navigate(id ? claimPath(id) : "/dashboard");
    } catch (e) {
      toast.push("error", "Could not submit the claim", e instanceof Error ? e.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  const bounty = (() => {
    try {
      return bountyWei(form);
    } catch {
      return 0n;
    }
  })();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Submit a claim">
        Say what a transaction did. Validators will open independent block explorers, read the transaction and report whether it
        matches. You attach a bounty so someone is paid to run the check.
      </PageHeader>

      {!isContractConfigured && (
        <Card className="p-4">
          <HelperText tone="error">
            No contract is configured for this network. Set VITE_CONTRACT_ADDRESS or paste an address in the network menu.
          </HelperText>
        </Card>
      )}

      <Card className="space-y-4 p-6">
        <div>
          <Label>Which chain did it happen on?</Label>
          <ChainGrid value={form.chain} onPick={(chain) => set({ chain })} />
        </div>
        <Field label="What kind of event is it?">
          <Select value={form.eventType} onChange={(e) => set({ eventType: e.target.value as EventType })}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_META[t].label}
              </option>
            ))}
          </Select>
          <HelperText>{EVENT_META[form.eventType].blurb}</HelperText>
        </Field>
        <Field label="Transaction hash" hint={`on ${chainLabel(form.chain)}`}>
          <Input
            className="font-mono"
            placeholder="0x…"
            value={form.txHash}
            onChange={(e) => set({ txHash: e.target.value })}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          {form.txHash.trim() !== "" && !hashOk ? (
            <HelperText tone="error">A transaction hash is 0x followed by 64 hex characters.</HelperText>
          ) : hashOk ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {links.map((l) => (
                <a
                  key={l.name}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-[12px] text-beacon-300 hover:text-beacon-200"
                >
                  Check it on {l.label} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          ) : (
            <HelperText>Paste the hash exactly as your explorer shows it. Letter case doesn't matter.</HelperText>
          )}
        </Field>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <Label>What should the transaction show?</Label>
          <p className="text-[13px] leading-relaxed text-mist-400">
            All optional, but each one you fill in must match what the explorers show. The more you assert, the more a
            confirmation actually means, and a single wrong detail turns the verdict into a mismatch.
          </p>
        </div>
        <Field label="Contract or token address">
          <Input className="font-mono" placeholder="0x…" value={form.contractAddress} onChange={(e) => set({ contractAddress: e.target.value })} spellCheck={false} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From">
            <Input className="font-mono" placeholder="0x…" value={form.from} onChange={(e) => set({ from: e.target.value })} spellCheck={false} />
          </Field>
          <Field label="To">
            <Input className="font-mono" placeholder="0x…" value={form.to} onChange={(e) => set({ to: e.target.value })} spellCheck={false} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Token ID" hint={`up to ${MAX_FIELD_LEN} characters`}>
            <Input value={form.tokenId} onChange={(e) => set({ tokenId: e.target.value })} />
          </Field>
          <Field label="Amount" hint="as the explorer shows it">
            <Input placeholder="e.g. 1.5 ETH or 2500 USDC" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
        </div>
        <HelperText>
          {strictness === 0
            ? "Nothing beyond the hash and event type is asserted, so validators only check that the transaction exists and looks like this kind of event."
            : `${strictness} detail${strictness === 1 ? "" : "s"} asserted. Each one is checked against every explorer.`}
        </HelperText>
      </Card>

      <Card className="space-y-3 p-6">
        <Field label="Bounty" hint={NATIVE_SYMBOL}>
          <Input inputMode="decimal" className="max-w-[12rem]" value={form.bounty} onChange={(e) => set({ bounty: e.target.value })} />
        </Field>
        <HelperText>
          Whoever runs the round that reaches a verdict is paid from this, up to 0.005 {NATIVE_SYMBOL}. Whatever is left can be
          refunded to you. {bounty > 0n ? `You will send ${fromWeiExact(bounty)} ${NATIVE_SYMBOL} with this claim.` : "With no bounty, nobody is paid to run it, though anyone still can."}
        </HelperText>
      </Card>

      <Card className="space-y-4 p-6">
        {formError && <HelperText tone="error">{formError}</HelperText>}
        {wallet.address ? (
          <Button className="w-full" loading={submitting} onClick={submit}>
            Submit claim
          </Button>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-[14px] text-mist-200">Connect or create a wallet to submit this claim.</p>
            <WalletPanel />
          </div>
        )}
        <HelperText>
          Submitting doesn't run the check yet. It records the claim and the bounty; then you or any keeper can start a round from
          the claim page. Submitting identical details while an earlier claim is still open is refused; top up that one instead.
        </HelperText>
      </Card>
    </div>
  );
}
