"""Writes tests/vectors/assertion_keys.json using the REAL contract's `_assertion_key`, so the TypeScript
test can prove the frontend computes identical claim ids.

Run:  python3 tests/contract/generate_vectors.py
"""
import json
import pathlib

from load_contract import ROOT, bare_instance, load

mod = load()
C = bare_instance(mod)

TX = "0x" + "ab" * 32
TX2 = "0x" + "12" * 32
ADDR = "0x" + "cd" * 20
ADDR2 = "0x" + "ef" * 20

CASES = [
    dict(chain="ethereum", event_type="TOKEN_TRANSFER", tx_hash=TX),
    dict(chain="ethereum", event_type="TOKEN_TRANSFER", tx_hash=TX, expected_from=ADDR, expected_amount="1.5 ETH"),
    dict(chain="base", event_type="NFT_MINT", tx_hash=TX2, contract_address=ADDR, expected_to=ADDR2, expected_token_id="42"),
    dict(chain="polygon", event_type="BRIDGE_LOCK", tx_hash=TX, expected_amount="2,500 USDC", expected_token_id="1"),
    dict(chain="arbitrum", event_type="BRIDGE_BURN", tx_hash=TX2, expected_from=ADDR, expected_to=ADDR2, expected_amount="10"),
    dict(chain="optimism", event_type="GENERIC", tx_hash=TX),
    # Non-ASCII free text: Python counts code points, so the frontend must too.
    dict(chain="ethereum", event_type="GENERIC", tx_hash=TX, expected_amount="١٢٣ ₿ 🚀", expected_token_id="ñ"),
]

FIELDS = ("contract_address", "expected_from", "expected_to", "expected_token_id", "expected_amount")

out = []
for c in CASES:
    full = {f: c.get(f, "") for f in FIELDS}
    key = C._assertion_key(
        c["chain"], c["tx_hash"], c["event_type"],
        full["contract_address"], full["expected_from"], full["expected_to"],
        full["expected_token_id"], full["expected_amount"],
    )
    out.append({"chain": c["chain"], "event_type": c["event_type"], "tx_hash": c["tx_hash"], **full, "key": key})

path = ROOT / "tests" / "vectors" / "assertion_keys.json"
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {len(out)} vectors to {path}")
