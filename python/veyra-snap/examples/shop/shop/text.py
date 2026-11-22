import re
import unicodedata
import uuid


def slugify(title: str, max_length: int = 40) -> str:
    text = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:max_length].rstrip("-")


def order_number(customer_id: int, sequence: int) -> str:
    return f"FC-{customer_id:05d}-{sequence:04d}"


def new_order_id() -> str:
    """Changes every call: veyra-snap notices and writes no test for it."""
    return uuid.uuid4().hex[:12]


def write_receipt(lines: list, out) -> int:
    """Takes an open file: that argument can't be written in a test, so these calls are left out."""
    return out.write("\n".join(lines))
