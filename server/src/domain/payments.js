// Payments on a sale. The same rules as the app (client/src/lib/payments.js).
// A bill can have NO payment (it is "pending" and paid later), or one or several
// lines: cash + UPI + card. A short amount is accepted (a bargain). Only cash can
// give change.

export const PAYMENT_METHODS = ["cash", "upi", "card"];

// Returns { error } when a line is wrong, otherwise:
//   payments, receivedPaise, changePaise, shortPaise, status ('paid' | 'pending'),
//   summary { method: 'cash'|'upi'|'card'|'split'|'pending', amountTenderedPaise, changePaise, reference }
export function summarizePayments(totalPaise, raw) {
  const payments = [];
  for (const p of raw ?? []) {
    if (!PAYMENT_METHODS.includes(p?.method)) {
      return { error: "Unknown payment method" };
    }
    const amount = p.amountPaise ?? 0;
    if (!Number.isInteger(amount) || amount < 0) {
      return { error: "Enter a valid payment amount" };
    }
    if (amount === 0) continue;
    const reference = String(p.reference ?? "").trim();
    if (reference.length > 40) {
      return { error: "The reference is too long (40 characters at most)" };
    }
    payments.push({ method: p.method, amountPaise: amount, reference });
  }

  const receivedPaise = payments.reduce((sum, p) => sum + p.amountPaise, 0);
  const cashPaise = payments
    .filter((p) => p.method === "cash")
    .reduce((sum, p) => sum + p.amountPaise, 0);
  const over = Math.max(0, receivedPaise - totalPaise);
  if (over > cashPaise) {
    return {
      error:
        "UPI and card amounts cannot be more than the bill. Only cash can give change.",
    };
  }

  const methods = [...new Set(payments.map((p) => p.method))];
  const method =
    methods.length === 0
      ? "pending"
      : methods.length === 1
        ? methods[0]
        : "split";
  return {
    payments,
    receivedPaise,
    changePaise: over,
    shortPaise: Math.max(0, totalPaise - receivedPaise),
    status: payments.length === 0 ? "pending" : "paid",
    summary: {
      method,
      amountTenderedPaise: receivedPaise,
      changePaise: over,
      reference: payments.find((p) => p.reference)?.reference ?? "",
    },
  };
}
