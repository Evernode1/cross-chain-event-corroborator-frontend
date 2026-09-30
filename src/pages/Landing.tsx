import { Link } from "react-router-dom";
import { Card, buttonClass } from "../components/ui";
import { Stamp } from "../components/claim";
import { CHAIN_META, SUPPORTED_CHAINS } from "../lib/claims";

const steps = [
  {
    title: "Someone makes a claim",
    body: "They name a chain, a transaction hash and what it did: a mint, a bridge lock, a transfer. They attach a small bounty.",
  },
  {
    title: "A keeper starts a round",
    body: "Anyone can. The contract picks the explorers itself, two independent ones per chain, so nobody can point validators at a page of their choosing.",
  },
  {
    title: "Validators read each page",
    body: "Each validator opens every explorer page and records a result per source: match, mismatch, not found, or unclear.",
  },
  {
    title: "Code counts the results",
    body: "The contract, not the model, turns those per-source results into Confirmed, Rejected or Not decisive, then pays the keeper.",
  },
];

const rules = [
  {
    outcome: "Confirmed",
    tone: "text-jade-400 border-jade-500/40 bg-jade-500/10",
    rule: "Every explorer was reachable and every one matched.",
    why: "A false confirmation is the costly mistake: a bridge may release funds on it.",
  },
  {
    outcome: "Rejected",
    tone: "text-ember-400 border-ember-500/40 bg-ember-500/10",
    rule: "At least two explorers were reachable and all of them reported a mismatch or no such transaction.",
    why: "Wrongly rejecting is bad but recoverable: the claim can be resubmitted.",
  },
  {
    outcome: "Not decisive",
    tone: "text-amber-300 border-amber-500/40 bg-amber-500/10",
    rule: "An explorer was down, a page was unclear, or the explorers disagreed.",
    why: "It stays open for another round. After five, it goes stale and the bounty can be refunded.",
  },
];

export function Landing() {
  return (
    <div className="space-y-24">
      <section className="grid gap-10 pt-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <h1 className="font-display text-[40px] font-semibold leading-[1.06] tracking-tight text-mist-100 sm:text-[54px]">
            Don't take a relayer's word for it.
          </h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-mist-400">
            Submit a claim about a transaction on Ethereum, Polygon, Arbitrum, Optimism or Base. GenLayer validators read
            independent block explorers, and the contract counts their results. Any other contract can then check the verdict
            before it moves real value.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/submit" className={buttonClass("primary", "px-5 py-3 text-[14px]")}>
              Submit a claim
            </Link>
            <Link to="/claims" className={buttonClass("secondary", "px-5 py-3 text-[14px]")}>
              Browse claims
            </Link>
          </div>
        </div>

        {/* The memorable element: a claim being witnessed. The stamps land once, in order. */}
        <Card className="p-6">
          <p className="text-[13px] text-mist-500">Example claim, not a live result</p>
          <p className="mt-2 font-display text-[19px] font-semibold leading-snug text-mist-100">Token transfer of 2,500 USDC on Base</p>
          <p className="mt-1 break-all font-mono text-[12px] text-mist-500">0x9f3c…e41a</p>
          <ul className="mt-4">
            <WitnessRowStatic label="Basescan" verdict="MATCH" delay="0.5s" />
            <WitnessRowStatic label="Blockscout" verdict="MATCH" delay="1.3s" />
          </ul>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-deep-700 pt-4">
            <p className="text-[13px] text-mist-400">Both explorers reachable, both matched.</p>
            <span className="stamp-in inline-block rounded border-2 border-jade-500 px-3 py-1 font-display text-[15px] font-semibold uppercase tracking-wide text-jade-400" style={{ animationDelay: "2.1s" }}>
              Confirmed
            </span>
          </div>
        </Card>
      </section>

      <section>
        <h2 className="font-display text-[28px] font-semibold tracking-tight text-mist-100">How a claim gets settled</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="border-t-2 border-beacon-400 pt-4">
              <span className="font-mono text-[12px] text-beacon-300">Step {i + 1}</span>
              <h3 className="mt-2 font-display text-[18px] font-semibold text-mist-100">{step.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-mist-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="font-display text-[28px] font-semibold tracking-tight text-mist-100">Confirming is harder than rejecting</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-mist-400">
          The two mistakes aren't equally bad, so the bar isn't symmetric. The rule is fixed in the contract and applied by code.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {rules.map((r) => (
            <Card key={r.outcome} className="p-5">
              <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${r.tone}`}>{r.outcome}</span>
              <p className="mt-3 text-[14px] leading-relaxed text-mist-100">{r.rule}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-mist-400">{r.why}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-[28px] font-semibold tracking-tight text-mist-100">Five chains, two explorers each</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-mist-400">
          Explorer addresses are fixed inside the contract. A claim's submitter only supplies a transaction hash, which is checked
          to be plain hex before it goes near a URL.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SUPPORTED_CHAINS.map((c) => (
            <div key={c} className="rounded-lg border border-deep-700 bg-deep-900/80 p-4">
              <p className="font-display text-[16px] font-semibold text-mist-100">{CHAIN_META[c].label}</p>
              <ul className="mt-2 space-y-1 text-[12px] text-mist-500">
                {CHAIN_META[c].sources.map((s) => (
                  <li key={s.name}>{s.label}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="font-display text-[20px] font-semibold text-mist-100">Built to be read by other contracts</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-mist-400">
            A bridge can refuse to mint a wrapped token until{" "}
            <code className="font-mono text-mist-200">is_confirmed(claim_id)</code> is true, instead of trusting one relayer. A
            confirmed or rejected claim keeps its id forever; resubmitting the same details creates a new attempt, never an edit.
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="font-display text-[20px] font-semibold text-mist-100">What it can't do</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-mist-400">
            <li>It reads public explorer pages. If both are down or blocked, the round is simply not decisive.</li>
            <li>Amounts are compared as the explorer displays them, so write them the way the explorer does.</li>
            <li>A confirmation says the transaction matches the claim. It doesn't say the transaction was wise or final on its chain.</li>
          </ul>
        </Card>
      </section>
    </div>
  );
}

function WitnessRowStatic({ label, verdict, delay }: { label: string; verdict: "MATCH"; delay: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-deep-700 py-3.5 last:border-b-0">
      <div>
        <p className="text-[14px] font-medium text-mist-100">{label}</p>
        <p className="mt-0.5 text-[12px] text-mist-500">Independent explorer</p>
      </div>
      <span className="stamp-in inline-block" style={{ animationDelay: delay }}>
        <Stamp verdict={verdict} />
      </span>
    </li>
  );
}
