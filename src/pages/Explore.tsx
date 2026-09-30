import { useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { useAllClaims } from "../hooks/useAllClaims";
import { isContractConfigured } from "../lib/networks";
import { CHAIN_META, SUPPORTED_CHAINS } from "../lib/claims";
import type { ClaimStatus, SourceChain } from "../lib/types";
import { Button, Card, EmptyState, HelperText, Input, PageHeader, Select } from "../components/ui";
import { ClaimCard } from "../components/claim";

const PAGE_SIZE = 12;

const STATUS_FILTERS: { value: ClaimStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Any status" },
  { value: "PENDING", label: "Open" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "STALE", label: "Stale" },
];

export function Explore() {
  const wallet = useWallet();
  const { claims, loading, error, refresh } = useAllClaims();
  const [query, setQuery] = useState("");
  const [chain, setChain] = useState<SourceChain | "ALL">("ALL");
  const [status, setStatus] = useState<ClaimStatus | "ALL">("ALL");
  const [sort, setSort] = useState<"newest" | "bounty">("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = claims.filter(
      (c) =>
        (chain === "ALL" || c.source_chain === chain) &&
        (status === "ALL" || c.status === status) &&
        (q === "" ||
          c.claim_id.toLowerCase().includes(q) ||
          c.tx_hash.includes(q) ||
          c.contract_address.includes(q) ||
          c.expected_from.includes(q) ||
          c.expected_to.includes(q) ||
          c.submitter.toLowerCase().includes(q)),
    );
    if (sort === "bounty") {
      return [...list].sort((a, b) => {
        const d = BigInt(b.bounty) - BigInt(a.bounty);
        return d > 0n ? 1 : d < 0n ? -1 : 0;
      });
    }
    return list;
  }, [claims, query, chain, status, sort]);

  const reset = () => setVisible(PAGE_SIZE);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Claims"
        actions={
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={loading} onClick={() => void refresh()}>
            Refresh
          </Button>
        }
      >
        Every claim is public, with each explorer's verdict and the validators' reasoning. Keepers can sort by bounty to find open
        claims worth running.
      </PageHeader>

      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
          <Input
            className="pl-9"
            placeholder="Search by transaction hash, address or claim id"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
          />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          aria-label="Filter by chain"
          value={chain}
          onChange={(e) => {
            setChain(e.target.value as SourceChain | "ALL");
            reset();
          }}
        >
          <option value="ALL">Any chain</option>
          {SUPPORTED_CHAINS.map((c) => (
            <option key={c} value={c}>
              {CHAIN_META[c].label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ClaimStatus | "ALL");
            reset();
          }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as "newest" | "bounty")}>
          <option value="newest">Newest first</option>
          <option value="bounty">Biggest bounty first</option>
        </Select>
      </div>

      {!isContractConfigured && (
        <HelperText tone="error">No contract is configured for this network, so there is nothing to browse yet.</HelperText>
      )}
      {error && <HelperText tone="error">{error}</HelperText>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.slice(0, visible).map((c) => (
          <ClaimCard key={c.claim_id} claim={c} me={wallet.address} />
        ))}
      </div>

      {!loading && filtered.length === 0 && isContractConfigured && (
        <EmptyState title={claims.length === 0 ? "No claims yet" : "Nothing matches"}>
          {claims.length === 0 ? "Be the first to submit one." : "Try a different search, chain or status."}
        </EmptyState>
      )}

      {visible < filtered.length && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}
