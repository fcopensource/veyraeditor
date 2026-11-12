import { test, expect } from "@playwright/test";
import { safeSupportUrl } from "../src/support";

test("only https Buy Me a Coffee and Stripe links can be opened", () => {
  expect(safeSupportUrl("https://buymeacoffee.com/veyra")).toBe("https://buymeacoffee.com/veyra");
  expect(safeSupportUrl("https://buy.stripe.com/test_123")).toBe("https://buy.stripe.com/test_123");
  expect(safeSupportUrl("http://buy.stripe.com/x")).toBeNull();
  expect(safeSupportUrl("https://buy.stripe.com.evil.example/x")).toBeNull();
  expect(safeSupportUrl("javascript:alert(1)")).toBeNull();
  expect(safeSupportUrl("")).toBeNull();
});
