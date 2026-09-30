"""A minimal stand-in for the `genlayer` package, just enough to import the contract source and call
its pure helper methods (`_assertion_key`, `_aggregate`, `_add_seconds`, hex validators, ...).

It does NOT simulate consensus, storage or web access. Anything that needs the GenLayer VM (submit_claim,
request_corroboration, refunds) must be tested on a real GenLayer network (Studio / localnet).
"""
import sys
import types


class UserError(Exception):
    pass


class _Permissive:
    """Attribute access returns itself; calling it with one callable/class returns that object
    unchanged (so decorators like @gl.public.view are no-ops), anything else returns itself."""

    def __getattr__(self, _name):
        return self

    def __call__(self, *args, **kwargs):
        if len(args) == 1 and not kwargs and callable(args[0]):
            return args[0]
        return self


class _Contract:
    pass


class _Generic:
    def __class_getitem__(cls, _item):
        return cls


def install():
    gl = _Permissive()
    # Real objects where the contract body needs them.
    object.__setattr__(gl, "__dict__", {})  # keep _Permissive's __getattr__ for everything else
    gl.__dict__["Contract"] = _Contract
    gl.__dict__["vm"] = types.SimpleNamespace(UserError=UserError)

    module = types.ModuleType("genlayer")
    module.gl = gl
    module.allow_storage = lambda cls: cls
    module.u256 = int
    module.DynArray = _Generic
    module.TreeMap = _Generic
    module.Address = str
    module.__all__ = ["gl", "allow_storage", "u256", "DynArray", "TreeMap", "Address"]
    sys.modules["genlayer"] = module
    return module
