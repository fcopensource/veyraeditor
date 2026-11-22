"""A tiny shop to try veyra-snap on:

    veyra-snap run app.py
    veyra-snap write
    pytest
"""

import io
from decimal import Decimal

from shop.cart import price
from shop.models import Item, Size
from shop.text import new_order_id, order_number, slugify, write_receipt


def main() -> None:
    mug = Item("Veyra mug", Decimal("12.00"), qty=2)
    hoodie = Item("FlightCoders hoodie", Decimal("39.00"), size=Size.LARGE)
    stickers = Item("Sticker pack", Decimal("3.50"), qty=4)

    carts = [([mug], None), ([mug, stickers], "welcome10"), ([hoodie, mug], "VIP25"), ([stickers], None)]
    for n, (items, coupon) in enumerate(carts, start=1):
        bill = price(items, coupon)
        receipt = [f"Order {order_number(42, n)}", *(f"{i.qty} x {i.name}" for i in items), f"Total {bill['total']}"]
        write_receipt(receipt, io.StringIO())
        print(f"{order_number(42, n)}  {slugify(items[0].name)}  {bill['total']}")

    for bad in ([], [mug]):
        try:
            price(bad, "FREEBIE" if bad else None)
        except ValueError as error:
            print("refused:", error)

    print("internal id", new_order_id())
    print("internal id", new_order_id())


if __name__ == "__main__":
    main()
