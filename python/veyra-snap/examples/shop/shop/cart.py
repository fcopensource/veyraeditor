from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from .models import Item, Size

COUPONS = {"WELCOME10": Decimal("0.10"), "VIP25": Decimal("0.25")}
LARGE_SURCHARGE = Decimal("1.50")


def line_total(item: Item) -> Decimal:
    extra = LARGE_SURCHARGE if item.size is Size.LARGE else Decimal(0)
    return (item.price + extra) * item.qty


def subtotal(items: list[Item]) -> Decimal:
    return sum((line_total(i) for i in items), Decimal(0))


def discount(amount: Decimal, coupon: str | None) -> Decimal:
    if coupon is None:
        return Decimal(0)
    rate = COUPONS.get(coupon.upper())
    if rate is None:
        raise ValueError(f"unknown coupon {coupon!r}")
    return (amount * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def price(items: list[Item], coupon: str | None = None, *, shipping: Decimal = Decimal("4.99")) -> dict[str, Decimal]:
    if not items:
        raise ValueError("the cart is empty")
    sub = subtotal(items)
    off = discount(sub, coupon)
    ship = Decimal(0) if sub >= 50 else shipping
    return {"subtotal": sub, "discount": off, "shipping": ship, "total": sub - off + ship}
