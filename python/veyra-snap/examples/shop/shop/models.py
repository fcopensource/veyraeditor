from dataclasses import dataclass
from decimal import Decimal
from enum import Enum


class Size(Enum):
    SMALL = "S"
    MEDIUM = "M"
    LARGE = "L"


@dataclass
class Item:
    name: str
    price: Decimal
    qty: int = 1
    size: Size = Size.MEDIUM
