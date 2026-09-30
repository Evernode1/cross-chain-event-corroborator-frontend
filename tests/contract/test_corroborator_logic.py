"""Pure-logic tests for CrossChainEventCorroborator, run against the real contract source.

Run:  python3 -m unittest discover -s tests/contract -v
"""
import unittest

from load_contract import bare_instance, load

mod = load()
C = bare_instance(mod)

M, X, N, U, A = "MATCH", "MISMATCH", "NOT_FOUND", "COULD_NOT_DETERMINE", "NOT_APPLICABLE"
TX = "0x" + "ab" * 32
ADDR = "0x" + "cd" * 20


class AggregateTests(unittest.TestCase):
    """CONFIRMED needs every configured source to match; REJECTED needs >= 2 reachable, all negative."""

    def test_all_sources_match_confirms(self):
        self.assertEqual(C._aggregate([M, M], 2), "CONFIRMED")

    def test_one_source_unreachable_cannot_confirm(self):
        self.assertEqual(C._aggregate([M, A], 2), "INSUFFICIENT")

    def test_match_plus_mismatch_is_insufficient(self):
        self.assertEqual(C._aggregate([M, X], 2), "INSUFFICIENT")

    def test_match_plus_not_found_is_insufficient(self):
        self.assertEqual(C._aggregate([M, N], 2), "INSUFFICIENT")

    def test_unanimous_negative_rejects(self):
        self.assertEqual(C._aggregate([X, X], 2), "REJECTED")
        self.assertEqual(C._aggregate([N, N], 2), "REJECTED")
        self.assertEqual(C._aggregate([X, N], 2), "REJECTED")

    def test_single_reachable_negative_cannot_reject(self):
        self.assertEqual(C._aggregate([X, A], 2), "INSUFFICIENT")
        self.assertEqual(C._aggregate([N, A], 2), "INSUFFICIENT")

    def test_unclear_page_blocks_both_verdicts(self):
        self.assertEqual(C._aggregate([M, U], 2), "INSUFFICIENT")
        self.assertEqual(C._aggregate([X, U], 2), "INSUFFICIENT")
        self.assertEqual(C._aggregate([U, U], 2), "INSUFFICIENT")

    def test_nothing_reachable_is_insufficient(self):
        self.assertEqual(C._aggregate([A, A], 2), "INSUFFICIENT")


class GatedResultTests(unittest.TestCase):
    """A source the code saw as unfetchable is forced to NOT_APPLICABLE whatever the model said."""

    def test_unfetched_source_is_forced_not_applicable(self):
        raw = {"fetched_etherscan": False, "result_etherscan": "MATCH"}
        self.assertEqual(C._gated_result(raw, "etherscan"), A)

    def test_fetched_source_keeps_a_valid_verdict(self):
        raw = {"fetched_etherscan": True, "result_etherscan": " match "}
        self.assertEqual(C._gated_result(raw, "etherscan"), M)

    def test_unknown_model_output_becomes_could_not_determine(self):
        raw = {"fetched_etherscan": True, "result_etherscan": "PROBABLY FINE"}
        self.assertEqual(C._gated_result(raw, "etherscan"), U)

    def test_missing_fetch_flag_counts_as_unfetched(self):
        self.assertEqual(C._gated_result({"result_etherscan": "MATCH"}, "etherscan"), A)


class AssertionKeyTests(unittest.TestCase):
    def key(self, **over):
        f = dict(
            chain="ethereum", tx=TX, event_type="TOKEN_TRANSFER", contract_address="",
            expected_from="", expected_to="", expected_token_id="", expected_amount="",
        )
        f.update(over)
        return C._assertion_key(
            f["chain"], f["tx"], f["event_type"], f["contract_address"],
            f["expected_from"], f["expected_to"], f["expected_token_id"], f["expected_amount"],
        )

    def test_shape(self):
        k = self.key()
        chain, tx, digest = k.split(":")
        self.assertEqual((chain, tx), ("ethereum", TX))
        self.assertEqual(len(digest), 32)
        int(digest, 16)

    def test_deterministic(self):
        self.assertEqual(self.key(), self.key())

    def test_any_asserted_field_changes_the_key(self):
        base = self.key()
        for field, value in [
            ("event_type", "NFT_MINT"), ("contract_address", ADDR), ("expected_from", ADDR),
            ("expected_to", ADDR), ("expected_token_id", "7"), ("expected_amount", "1"),
        ]:
            self.assertNotEqual(base, self.key(**{field: value}), field)

    def test_field_boundaries_cannot_be_shifted(self):
        # Length-prefixing means moving characters across a field boundary gives a different key.
        self.assertNotEqual(
            self.key(expected_token_id="12", expected_amount="3"),
            self.key(expected_token_id="1", expected_amount="23"),
        )

    def test_same_tx_different_assertions_do_not_collide(self):
        self.assertNotEqual(self.key(expected_amount="1"), self.key(expected_amount="2"))


class InputValidationTests(unittest.TestCase):
    def raises(self, fn, *args):
        with self.assertRaises(mod.gl.vm.UserError):
            fn(*args)

    def test_tx_hash_rules(self):
        C._require_hex_hash(TX, "tx_hash")
        self.raises(C._require_hex_hash, "0x" + "ab" * 31, "tx_hash")      # too short
        self.raises(C._require_hex_hash, "ab" * 33, "tx_hash")            # no 0x
        self.raises(C._require_hex_hash, "0x" + "zz" * 32, "tx_hash")     # not hex
        self.raises(C._require_hex_hash, "0x" + "AB" * 32, "tx_hash")     # caller must lowercase first

    def test_address_rules(self):
        C._require_hex_address_or_empty("", "to")
        C._require_hex_address_or_empty(ADDR, "to")
        C._require_hex_address_or_empty(ADDR.upper().replace("0X", "0x"), "to")
        self.raises(C._require_hex_address_or_empty, "0x1234", "to")
        self.raises(C._require_hex_address_or_empty, "0x" + "gg" * 20, "to")


class ClockTests(unittest.TestCase):
    def test_add_seconds_simple(self):
        self.assertEqual(C._add_seconds("2026-01-01T00:00:00Z", 600), "2026-01-01T00:10:00Z")

    def test_rolls_over_hour_day_month_year(self):
        self.assertEqual(C._add_seconds("2026-12-31T23:55:00Z", 600), "2027-01-01T00:05:00Z")
        self.assertEqual(C._add_seconds("2026-01-31T23:59:59Z", 1), "2026-02-01T00:00:00Z")

    def test_leap_february(self):
        self.assertEqual(C._add_seconds("2028-02-28T23:59:00Z", 120), "2028-02-29T00:01:00Z")
        self.assertEqual(C._add_seconds("2026-02-28T23:59:00Z", 120), "2026-03-01T00:01:00Z")

    def test_short_timestamp_is_returned_unchanged(self):
        self.assertEqual(C._add_seconds("2026-01-01", 600), "2026-01-01")


class ConstantsTests(unittest.TestCase):
    """The frontend mirrors these; if they change, src/lib/claims.ts must change with them."""

    def test_constants(self):
        self.assertEqual(mod.MIN_SOURCES_REQUIRED, 2)
        self.assertEqual(mod.RECHECK_COOLDOWN_SECONDS, 600)
        self.assertEqual(mod.MAX_CHECK_ATTEMPTS, 5)
        self.assertEqual(mod.KEEPER_REWARD_CAP_WEI, 5 * 10**15)
        self.assertEqual(set(mod.SUPPORTED_CHAINS), {"ethereum", "polygon", "arbitrum", "optimism", "base"})
        self.assertEqual(set(mod.EVENT_TYPES), {"NFT_MINT", "BRIDGE_LOCK", "BRIDGE_BURN", "TOKEN_TRANSFER", "GENERIC"})

    def test_every_chain_has_at_least_the_minimum_sources(self):
        for chain, sources in mod.CHAIN_EXPLORERS.items():
            self.assertGreaterEqual(len(sources), mod.MIN_SOURCES_REQUIRED, chain)
            for _name, template in sources:
                self.assertTrue(template.startswith("https://"), chain)
                self.assertIn("{tx}", template)


if __name__ == "__main__":
    unittest.main()
