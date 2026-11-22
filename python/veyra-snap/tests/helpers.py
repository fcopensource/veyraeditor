from dataclasses import dataclass, field
from enum import Enum
from typing import NamedTuple


class Colour(Enum):
    RED = 1
    BLUE = 2


@dataclass
class Point:
    x: float
    y: float


class Pair(NamedTuple):
    left: str
    right: Colour


@dataclass
class Locked:
    value: int
    secret: int = field(default=0, init=False)
