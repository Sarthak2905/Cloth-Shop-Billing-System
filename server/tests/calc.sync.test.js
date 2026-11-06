import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { allocateProportionally, calculateTotals } from "../src/domain/calc.js";

const clientCalc = new URL("../../client/src/billing/calc.js", import.meta.url);
const serverCalc = new URL("../src/domain/calc.js", import.meta.url);
const normalize = (text) => text.replace(/\r\n/g, "\n").trim();

// The server must calculate exactly like the app. If this fails, copy the file again:
//   Copy-Item ..\client\src\billing\calc.js src\domain\calc.js
test.skipIf(!existsSync(clientCalc))(
  "the server copy of the money calculation is identical to the app copy",
  () => {
    expect(normalize(readFileSync(serverCalc, "utf8"))).toBe(
      normalize(readFileSync(clientCalc, "utf8")),
    );
  },
);

test("a 10% bill discount on a tax-inclusive item matches the app (₹799 → ₹719)", () => {
  const totals = calculateTotals({
    lines: [
      {
        variantId: "a",
        unitPricePaise: 79900,
        quantity: 1,
        taxRatePercent: 5,
        priceIncludesTax: true,
        discount: null,
      },
    ],
    billDiscount: { type: "percent", value: 10 },
  });

  expect(totals.billDiscountPaise).toBe(7990);
  expect(totals.taxPaise).toBe(3424);
  expect(totals.exactTotalPaise).toBe(71910);
  expect(totals.roundOffPaise).toBe(-10);
  expect(totals.totalPaise).toBe(71900);
});

test("tax added on top, and discounts shared without losing a paisa", () => {
  const exclusive = calculateTotals({
    lines: [
      {
        variantId: "a",
        unitPricePaise: 10000,
        quantity: 1,
        taxRatePercent: 18,
        priceIncludesTax: false,
        discount: null,
      },
    ],
    billDiscount: null,
  });
  expect(exclusive.taxAddedPaise).toBe(1800);
  expect(exclusive.totalPaise).toBe(11800);

  expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
});
