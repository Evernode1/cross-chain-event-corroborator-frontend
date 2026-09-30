import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import type { ClaimData, ClaimStatus, SourceChain, SourceVerdict } from "../lib/types";
import {
  CHAIN_META,
  EVENT_META,
  chainLabel,
  claimAttempt,
  claimPath,
  explainRound,
  explorerLinks,
  sourceResults,
} from "../lib/claims";
import { NATIVE_SYMBOL, formatIsoTimestamp, fromWei, sameAddress, shortAddress, shortHash } from "../lib/format";
import { AddressPill } from "./ui";

// ---------------------------------------------------------------------------
// Status + verdict chips
// ---------------------------------------------------------------------------

const STATUS: Record<ClaimStatus, { label: string; dot: string; text: string; ring: string }> = {
  PENDING: { label: "Open", dot: "bg-amber-500", text: "text-amber-300", ring: "border-amber-500/40 bg-amber-500/10" },
  CONFIRMED: { label: "Confirmed", dot: "bg-jade-500", text: "text-jade-400", ring: "border-jade-500/40 bg-jade-500/10" },
  REJECTED: { label: "Rejected", dot: "bg-ember-500", text: "text-ember-400", ring: "border-ember-500/40 bg-ember-500/10" },
  STALE: { label: "Stale", dot: "bg-mist-600", text: "text-mist-400", ring: "border-deep-600 bg-deep-800" },
};

export function StatusBadge({ status }: { status: ClaimStatus }) {
  const s = STATUS[status] ?? STATUS.STALE;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${s.ring} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

const VERDICT: Record<SourceVerdict, { label: string; tone: string }> = {
  MATCH: { label: "Match", tone: "border-jade-500 text-jade-400" },
  MISMATCH: { label: "Mismatch", tone: "border-ember-500 text-ember-400" },
  NOT_FOUND: { label: "Not found", tone: "border-ember-500 text-ember-400" },
  COULD_NOT_DETERMINE: { label: "Unclear", tone: "border-amber-500 text-amber-300" },
  NOT_APPLICABLE: { label: "Unreachable", tone: "border-mist-600 text-mist-500" },
};

/** A rubber-stamp style verdict mark. It drops in once when it first appears. */
export function Stamp({ verdict, animate = false }: { verdict: SourceVerdict; animate?: boolean }) {
  const v = VERDICT[verdict];
  return (
    <span
      className={`inline-block -rotate-2 rounded border-2 px-2.5 py-1 font-display text-[13px] font-semibold uppercase tracking-wide ${v.tone} ${
        animate ? "stamp-in" : ""
      }`}
    >
      {v.label}
    </span>
  );
}

export function ChainTag({ chain }: { chain: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-deep-600 bg-deep-900/70 px-2.5 py-0.5 text-[12px] text-mist-200">
      {chainLabel(chain)}
    </span>
  );
}

export function EventTag({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-deep-800 px-2.5 py-0.5 text-[12px] text-mist-400">
      {EVENT_META[type as keyof typeof EVENT_META]?.label ?? type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Witness board — the signature element. One row per explorer, each with its own stamp, then the
// combined outcome. Used live on claim pages and (static) in the landing hero.
// ---------------------------------------------------------------------------

export function WitnessRow({
  label,
  verdict,
  href,
  animate = false,
}: {
  label: string;
  verdict: SourceVerdict | null;
  href?: string;
  animate?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-deep-700 py-3.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-mist-100">{label}</p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-beacon-300 hover:text-beacon-200"
          >
            View the page it read <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <p className="mt-0.5 text-[12px] text-mist-500">Independent explorer</p>
        )}
      </div>
      {verdict ? (
        <Stamp verdict={verdict} animate={animate} />
      ) : (
        <span className="text-[12px] text-mist-500">Not checked yet</span>
      )}
    </li>
  );
}

export function WitnessBoard({ claim }: { claim: ClaimData }) {
  const results = sourceResults(claim);
  const links = explorerLinks(claim.source_chain, claim.tx_hash);
  const explanation = explainRound(claim);
  return (
    <div>
      <ul>
        {results.map((r) => (
          <WitnessRow
            key={r.name}
            label={r.label}
            verdict={r.verdict}
            href={links.find((l) => l.name === r.name)?.href}
          />
        ))}
      </ul>
      {explanation ? (
        <p className="mt-3 text-[13px] leading-relaxed text-mist-400">{explanation}</p>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-mist-400">
          No round has run yet. Anyone can start one; validators will read each explorer page above and report a verdict per
          source.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Claim summary text
// ---------------------------------------------------------------------------

export function claimHeadline(c: ClaimData): string {
  const parts: string[] = [];
  const e = EVENT_META[c.event_type]?.label ?? c.event_type;
  parts.push(e);
  if (c.expected_amount) parts.push(`of ${c.expected_amount}`);
  if (c.expected_token_id) parts.push(`(token ${c.expected_token_id})`);
  return `${parts.join(" ")} on ${chainLabel(c.source_chain)}`;
}

// ---------------------------------------------------------------------------
// List card
// ---------------------------------------------------------------------------

export function ClaimCard({ claim: c, me }: { claim: ClaimData; me?: string | null }) {
  const attempt = claimAttempt(c.claim_id);
  const mine = sameAddress(c.submitter, me);
  return (
    <Link
      to={claimPath(c.claim_id)}
      className="flex h-full flex-col rounded-lg border border-deep-700 bg-deep-900/80 p-4 shadow-sheet transition-colors hover:border-beacon-400"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ChainTag chain={c.source_chain} />
          <EventTag type={c.event_type} />
        </div>
        <StatusBadge status={c.status} />
      </div>

      <p className="mt-3 font-display text-[16px] font-semibold leading-snug text-mist-100">{claimHeadline(c)}</p>
      <p className="mt-1.5 break-all font-mono text-[12px] text-mist-500">{shortHash(c.tx_hash, 14, 10)}</p>

      <div className="mt-4 flex-1" />
      <div className="space-y-2 border-t border-deep-700 pt-3 text-[12px] text-mist-500">
        <div className="flex items-center justify-between gap-2">
          <span>
            Bounty <span className="font-mono text-mist-200">{fromWei(c.bounty, 5)} {NATIVE_SYMBOL}</span>
          </span>
          <span>
            {c.check_attempts} round{c.check_attempts === 1 ? "" : "s"}
            {attempt > 0 ? ` · retry ${attempt}` : ""}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono">{shortAddress(c.submitter)}</span>
          {mine && <span className="rounded-full bg-beacon-400/15 px-2 py-0.5 text-[11px] text-beacon-300">Yours</span>}
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Asserted-fields list
// ---------------------------------------------------------------------------

export function AssertedFields({ claim: c }: { claim: ClaimData }) {
  const rows: [string, string, boolean][] = [
    ["Contract or token", c.contract_address, true],
    ["From", c.expected_from, true],
    ["To", c.expected_to, true],
    ["Token ID", c.expected_token_id, false],
    ["Amount", c.expected_amount, false],
  ];
  const present = rows.filter(([, v]) => v !== "");
  if (present.length === 0) {
    return (
      <p className="text-[13px] leading-relaxed text-mist-400">
        Only the transaction and its type were asserted, so validators check that it exists on {chainLabel(c.source_chain)} and
        looks like a {EVENT_META[c.event_type]?.label.toLowerCase() ?? "matching"} event.
      </p>
    );
  }
  return (
    <dl>
      {present.map(([label, value, isAddress]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 border-b border-deep-700 py-2.5 last:border-b-0">
          <dt className="text-[12px] text-mist-500">{label}</dt>
          <dd className="text-right">{isAddress ? <AddressPill address={value} /> : <span className="font-mono text-[13px] text-mist-100">{value}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ChainGrid({ onPick, value }: { onPick: (c: SourceChain) => void; value: SourceChain }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {(Object.keys(CHAIN_META) as SourceChain[]).map((c) => {
        const active = c === value;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            aria-pressed={active}
            className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
              active ? "border-beacon-400 bg-beacon-400/10" : "border-deep-600 hover:border-beacon-400"
            }`}
          >
            <span className="block text-[14px] font-medium text-mist-100">{CHAIN_META[c].label}</span>
            <span className="block text-[11px] text-mist-500">{CHAIN_META[c].sources.length} explorers</span>
          </button>
        );
      })}
    </div>
  );
}

export function TimeLine({ claim: c }: { claim: ClaimData }) {
  return (
    <dl>
      <div className="flex items-baseline justify-between gap-4 border-b border-deep-700 py-2.5">
        <dt className="text-[12px] text-mist-500">Submitted</dt>
        <dd className="text-[13px] text-mist-100">{formatIsoTimestamp(c.submitted_at)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-b border-deep-700 py-2.5">
        <dt className="text-[12px] text-mist-500">Last round</dt>
        <dd className="text-[13px] text-mist-100">{c.last_check_at ? formatIsoTimestamp(c.last_check_at) : "—"}</dd>
      </div>
      {c.confirmed_at && (
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-[12px] text-mist-500">Confirmed</dt>
          <dd className="text-[13px] text-mist-100">{formatIsoTimestamp(c.confirmed_at)}</dd>
        </div>
      )}
      {c.rejected_at && (
        <div className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-[12px] text-mist-500">Rejected</dt>
          <dd className="text-[13px] text-mist-100">{formatIsoTimestamp(c.rejected_at)}</dd>
        </div>
      )}
    </dl>
  );
}
