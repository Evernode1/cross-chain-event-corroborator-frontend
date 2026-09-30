"""Imports contracts/CrossChainEventCorroborator.py against the genlayer stub."""
import importlib.util
import pathlib

from genlayer_stub import install

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTRACT_PATH = ROOT / "contracts" / "CrossChainEventCorroborator.py"


def load():
    install()
    spec = importlib.util.spec_from_file_location("ccec_contract", CONTRACT_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def bare_instance(mod):
    """A contract object with no storage, enough for the pure helper methods."""
    return object.__new__(mod.CrossChainEventCorroborator)
