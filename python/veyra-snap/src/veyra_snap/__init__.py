"""veyra-snap: run your code, get pytest tests.

veyra-snap records what your functions are given and what they return or raise, then writes those real calls as
pytest regression tests.

    $ veyra-snap run app.py      # use your program as usual
    $ veyra-snap write           # tests/test_snap_*.py
    $ pytest

Or in code::

    from veyra_snap import recording, snap

    with recording():            # every function in your project
        main()

    @snap                        # or just the ones you mark (recorded when VEYRA_SNAP=1)
    def price(cart, coupon=None): ...
"""

from ._encode import Unsupported, encode
from ._record import Recorder, recording, snap
from ._write import write

__version__ = "1.0.0"
__all__ = ["Recorder", "Unsupported", "__version__", "encode", "recording", "snap", "write"]
