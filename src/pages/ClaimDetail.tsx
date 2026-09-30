import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useClaim } from "../hooks/useClaim";
import { useAllClaims } from "../hooks/useAllClaims";
import { attemptsOf } from "../lib/client";
import { CHAIN_META, MAX_CHECK_ATTEMPTS, claimAttempt, claimPath, explorerLinks } from "../lib/claims";
import { NATIVE_SYMBOL, fromWei, sameAddress, shortHash } from "../lib/format";
import { Card, CopyButton, HelperText, InfoRow, SectionTitle, Spinner } from "../components/ui";
import {
  AssertedFields,
  ChainTag,
  EventTag,
  StatusBadge,
  TimeLine,
  WitnessBoard,
  claimHeadline,
} from "../components/claim";
import { ClaimActions } from "../components/ClaimActions";
import { AddressPill } from "../components/ui";

export function ClaimDetail() {
  const { id } = useParams<{ id: string }>();
  const wallet = useWallet();
  const { claim: c, loading, notFound, error, refresh } = useClaim(id ?? null);
  const { claims: all } = useAllClaims();

  if (!id) return <p className="text-[14px] text-mist-400">No claim id given.</p>;

  if (loading && !c) {
    return (
      <div className="flex items-center gap-2 text-[14px] text-mist-400">
        <Spinner /> Loading claim…
      </div>
    );
  }
  if (error && !c) {
    return (
      <Card className="p-6">
        <HelperText tone="error">{error}</HelperText>
      </Card>
    );
  }
  if (notFound || !c) {
    return (
      <Card className="space-y-2 p-6">
        <p className="font-display text-[18px] font-semibold text-mist-100">Claim not found</p>
        <p className="text-[13px] text-mist-400">
          No claim has this id.{" "}
          <Link to="/claims" className="text-beacon-300 hover:text-beacon-200">
            Browse the claims that exist
          </Link>
          .
        </p>
      </Card>
    );
  }

  const links = explorerLinks(c.source_chain, c.tx_hash);
  const siblings = attemptsOf([...all].reverse(), c.claim_id).filter((s) => s.claim_id !== c.claim_id);
  const attempt = claimAttempt(c.claim_id);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Link to="/claims" className="inline-flex items-center gap-1.5 text-[13px] text-mist-500 hover:text-mist-100">
          <ArrowLeft className="h-3.5 w-3.5" /> All claims
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <ChainTag chain={c.source_chain} />
              <EventTag type={c.event_type} />
              <StatusBadge status={c.status} />
              {attempt > 0 && <span className="text-[12px] text-mist-500">retry {attempt}</span>}
            </div>
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight text-mist-100">
              {claimHeadline(c)}
            </h1>
            <p className="break-all font-mono text-[13px] text-mist-400">{c.tx_hash}</p>
          </div>
          <button
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1.5 rounded-md border border-deep-600 px-2.5 py-1.5 text-[12px] text-mist-400 hover:border-beacon-400"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-6">
          <Card className="p-6">
            <SectionTitle
              aside={
                <span className="text-[12px] text-mist-500">
                  {c.check_attempts} of {MAX_CHECK_ATTEMPTS} rounds used
                </span>
              }
            >
              What the explorers said
            </SectionTitle>
            <WitnessBoard claim={c} />
            {c.verdict_rationale && (
              <div className="mt-5 border-t border-deep-700 pt-4">
                <p className="text-[12px] text-mist-500">Validators' reasoning</p>
                <blockquote className="mt-1.5 whitespace-pre-wrap break-words rounded-md border-l-2 border-beacon-400/60 bg-deep-850 px-3.5 py-3 text-[13px] leading-relaxed text-mist-200">
                  {c.verdict_rationale}
                </blockquote>
              </div>
            )}
          </Card>

          <Card className="p-6">
            <SectionTitle>What was claimed</SectionTitle>
            <AssertedFields claim={c} />
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-deep-700 pt-3">
              {links.map((l) => (
                <a
                  key={l.name}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-[12px] text-beacon-300 hover:text-beacon-200"
                >
                  Open on {l.label} <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle aside={<CopyButton value={c.claim_id} label="Copy claim id" />}>Use this verdict in your contract</SectionTitle>
            <p className="text-[13px] leading-relaxed text-mist-400">
              A settled claim is a public fact. Gate a mint, a release or a reputation update on it by reading{" "}
              <code className="font-mono text-mist-200">is_confirmed</code> with this claim id. Confirmed and rejected verdicts stay
              readable at this id permanently.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md border border-deep-700 bg-deep-850 p-3.5 font-mono text-[12px] leading-relaxed text-mist-200">
{`is_confirmed("${shortHash(c.claim_id, 30, 14)}")
  -> ${c.status === "CONFIRMED" ? "true" : "false"}`}
            </pre>
            <p className="mt-2 text-[12px] text-mist-500">
              Full id: <span className="break-all font-mono">{c.claim_id}</span>
            </p>
          </Card>

          {siblings.length > 0 && (
            <Card className="p-6">
              <SectionTitle>Other attempts at this exact claim</SectionTitle>
              <ul className="divide-y divide-deep-700">
                {siblings.map((s) => (
                  <li key={s.claim_id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link to={claimPath(s.claim_id)} className="text-[13px] text-beacon-300 hover:text-beacon-200">
                      Attempt {claimAttempt(s.claim_id) + 1}
                    </Link>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:sticky lg:top-6">
          <ClaimActions claim={c} refresh={refresh} />

          <Card className="p-5">
            <h3 className="font-display text-[16px] font-semibold text-mist-100">The claim</h3>
            <dl className="mt-2">
              <InfoRow label="Submitted by">
                <AddressPill address={c.submitter} you={sameAddress(c.submitter, wallet.address)} />
              </InfoRow>
              <InfoRow label="Bounty left">
                <span className="font-mono">
                  {fromWei(c.bounty, 6)} {NATIVE_SYMBOL}
                </span>
              </InfoRow>
              <InfoRow label="Explorers used">{CHAIN_META[c.source_chain]?.sources.length ?? "—"}</InfoRow>
            </dl>
            <div className="mt-3 border-t border-deep-700 pt-2">
              <TimeLine claim={c} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
