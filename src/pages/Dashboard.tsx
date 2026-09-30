import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useAllClaims } from "../hooks/useAllClaims";
import { isContractConfigured } from "../lib/networks";
import { isTerminal } from "../lib/claims";
import { sameAddress } from "../lib/format";
import { Button, buttonClass, Card, EmptyState, HelperText, PageHeader, SectionTitle } from "../components/ui";
import { ClaimCard } from "../components/claim";
import { WalletPanel } from "../components/WalletPanel";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-deep-700 bg-deep-900/80 px-4 py-3 shadow-sheet">
      <p className="font-display text-[28px] font-semibold leading-none text-mist-100">{value}</p>
      <p className="mt-1.5 text-[12px] text-mist-500">{label}</p>
    </div>
  );
}

export function Dashboard() {
  const wallet = useWallet();
  const { claims, loading, error, refresh } = useAllClaims();
  const me = wallet.address;

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <PageHeader title="My claims">Every claim you've submitted, and what each one needs next.</PageHeader>
        <Card className="flex flex-col items-start gap-4 p-6">
          <p className="text-[14px] text-mist-200">Connect or create a wallet to see your claims.</p>
          <WalletPanel />
        </Card>
      </div>
    );
  }

  const mine = claims.filter((c) => sameAddress(c.submitter, me));
  const open = mine.filter((c) => c.status === "PENDING");
  const refundable = mine.filter((c) => isTerminal(c.status) && BigInt(c.bounty) > 0n);
  const settled = mine.filter((c) => isTerminal(c.status) && BigInt(c.bounty) === 0n);
  const confirmed = mine.filter((c) => c.status === "CONFIRMED").length;

  return (
    <div className="space-y-10">
      <PageHeader
        title="My claims"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={loading} onClick={() => void refresh()}>
              Refresh
            </Button>
            <Link to="/submit" className={buttonClass("primary")}>
              Submit a claim
            </Link>
          </div>
        }
      >
        Every claim you've submitted, and what each one needs next.
      </PageHeader>

      {!isContractConfigured && (
        <HelperText tone="error">No contract is configured for this network, so there is nothing to load yet.</HelperText>
      )}
      {error && <HelperText tone="error">{error}</HelperText>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Submitted" value={mine.length} />
        <Stat label="Open" value={open.length} />
        <Stat label="Confirmed" value={confirmed} />
        <Stat label="Bounty to reclaim" value={refundable.length} />
      </div>

      {!loading && mine.length === 0 && isContractConfigured && (
        <EmptyState title="No claims yet">
          Submit a transaction you want independently verified. It takes one form and a small bounty.
        </EmptyState>
      )}

      {open.length > 0 && (
        <section>
          <SectionTitle aside={<span className="text-[12px] text-mist-500">Waiting for a round, or between rounds</span>}>
            Open
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((c) => (
              <ClaimCard key={c.claim_id} claim={c} me={me} />
            ))}
          </div>
        </section>
      )}

      {refundable.length > 0 && (
        <section>
          <SectionTitle aside={<span className="text-[12px] text-mist-500">Leftover bounty you can pull back</span>}>
            Ready for a refund
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {refundable.map((c) => (
              <ClaimCard key={c.claim_id} claim={c} me={me} />
            ))}
          </div>
        </section>
      )}

      {settled.length > 0 && (
        <section>
          <SectionTitle>Settled</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {settled.map((c) => (
              <ClaimCard key={c.claim_id} claim={c} me={me} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
