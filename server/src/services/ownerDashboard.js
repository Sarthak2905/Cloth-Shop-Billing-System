import { Product } from "../models/Product.js";
import { Sale } from "../models/Sale.js";
import { Variant } from "../models/Variant.js";

const MINUTE = 60000;

// The shop's clock. India is UTC+5:30 = 330 minutes. Render runs in UTC, so
// "today" must be worked out from this offset, not from the server's clock.
export function shopOffsetMinutes() {
  const n = Number(process.env.SHOP_UTC_OFFSET_MINUTES);
  return Number.isFinite(n) ? n : 330;
}

export function tzString(offsetMin) {
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

// Start of today / yesterday / this month ... as real moments in time.
export function shopRanges(now = new Date(), offsetMin = 330) {
  const local = new Date(now.getTime() + offsetMin * MINUTE);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const at = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd) - offsetMin * MINUTE);
  return {
    todayStart: at(y, m, d),
    tomorrowStart: at(y, m, d + 1),
    yesterdayStart: at(y, m, d - 1),
    weekStart: at(y, m, d - 6),
    monthStart: at(y, m, 1),
    nextMonthStart: at(y, m + 1, 1),
    lastMonthStart: at(y, m - 1, 1),
  };
}

// Cost of everything on a bill = cost per unit x quantity (the cost was saved on the
// bill when it was sold, so later price changes never change old profit).
const billCost = {
  $sum: {
    $map: {
      input: "$items",
      as: "i",
      in: { $multiply: ["$$i.costPaise", "$$i.quantity"] },
    },
  },
};

async function summarize(from, to) {
  const [row] = await Sale.aggregate([
    { $match: { status: "completed", soldAt: { $gte: from, $lt: to } } },
    {
      $project: {
        totalPaise: 1,
        taxPaise: 1,
        netPaise: { $sum: "$items.taxableValuePaise" },
        costPaise: billCost,
        noCostLines: {
          $size: {
            $filter: {
              input: "$items",
              as: "i",
              cond: { $eq: ["$$i.costPaise", 0] },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: null,
        bills: { $sum: 1 },
        totalPaise: { $sum: "$totalPaise" },
        taxPaise: { $sum: "$taxPaise" },
        netPaise: { $sum: "$netPaise" },
        costPaise: { $sum: "$costPaise" },
        noCostLines: { $sum: "$noCostLines" },
      },
    },
  ]);
  const r = row ?? {};
  const netPaise = r.netPaise ?? 0;
  const costPaise = r.costPaise ?? 0;
  return {
    bills: r.bills ?? 0,
    totalPaise: r.totalPaise ?? 0, // what customers paid, GST included
    taxPaise: r.taxPaise ?? 0,
    netPaise, // sales without GST
    costPaise,
    profitPaise: netPaise - costPaise, // profit before expenses, GST left out
    noCostLines: r.noCostLines ?? 0,
  };
}

async function lastSevenDays(from, to, offsetMin) {
  const rows = await Sale.aggregate([
    { $match: { status: "completed", soldAt: { $gte: from, $lt: to } } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$soldAt",
            timezone: tzString(offsetMin),
          },
        },
        totalPaise: { $sum: "$totalPaise" },
        bills: { $sum: 1 },
      },
    },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r]));
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const dayStart = new Date(from.getTime() + i * 24 * 60 * MINUTE);
    const key = new Date(dayStart.getTime() + offsetMin * MINUTE)
      .toISOString()
      .slice(0, 10);
    days.push({
      date: key,
      totalPaise: byDay.get(key)?.totalPaise ?? 0,
      bills: byDay.get(key)?.bills ?? 0,
    });
  }
  return days;
}

// Money customers still owe: bills left as "pending", less anything received or let go.
async function customerDues() {
  const [row] = await Sale.aggregate([
    { $match: { status: "completed", paymentStatus: "pending" } },
    {
      $project: {
        due: {
          $subtract: [
            "$totalPaise",
            { $add: [{ $ifNull: ["$receivedPaise", 0] }, { $ifNull: ["$shortPaise", 0] }] },
          ],
        },
      },
    },
    { $match: { due: { $gt: 0 } } },
    { $group: { _id: null, count: { $sum: 1 }, totalPaise: { $sum: "$due" } } },
  ]);
  return { count: row?.count ?? 0, totalPaise: row?.totalPaise ?? 0 };
}

async function stockSummary() {
  const byCategory = await Variant.aggregate([
    { $match: { status: "active" } },
    {
      $lookup: {
        from: Product.collection.name,
        localField: "productId",
        foreignField: "_id",
        as: "p",
      },
    },
    {
      $set: {
        category: { $ifNull: [{ $arrayElemAt: ["$p.category", 0] }, "Other"] },
        qty: { $max: ["$currentStock", 0] },
      },
    },
    {
      $group: {
        _id: "$category",
        variants: { $sum: 1 },
        pieces: { $sum: "$qty" },
        costValuePaise: { $sum: { $multiply: ["$qty", "$costPaise"] } },
        sellValuePaise: { $sum: { $multiply: ["$qty", "$sellingPricePaise"] } },
        lowStock: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gt: ["$reorderThreshold", 0] },
                  { $lte: ["$currentStock", "$reorderThreshold"] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { costValuePaise: -1 } },
  ]);

  const noCost = await Variant.aggregate([
    { $match: { status: "active", costPaise: 0, currentStock: { $gt: 0 } } },
    {
      $lookup: {
        from: Product.collection.name,
        localField: "productId",
        foreignField: "_id",
        as: "p",
      },
    },
    { $sort: { currentStock: -1 } },
    {
      $facet: {
        count: [{ $count: "n" }],
        items: [
          { $limit: 20 },
          {
            $project: {
              _id: 0,
              name: { $ifNull: [{ $arrayElemAt: ["$p.name", 0] }, ""] },
              size: 1,
              barcode: 1,
              stock: "$currentStock",
            },
          },
        ],
      },
    },
  ]);

  const sum = (key) => byCategory.reduce((total, c) => total + c[key], 0);
  return {
    totalCostValuePaise: sum("costValuePaise"),
    totalSellValuePaise: sum("sellValuePaise"),
    totalPieces: sum("pieces"),
    lowStockCount: sum("lowStock"),
    byCategory: byCategory.map((c) => ({
      category: c._id,
      variants: c.variants,
      pieces: c.pieces,
      costValuePaise: c.costValuePaise,
      sellValuePaise: c.sellValuePaise,
      lowStock: c.lowStock,
    })),
    noCost: {
      count: noCost[0]?.count[0]?.n ?? 0,
      items: noCost[0]?.items ?? [],
    },
  };
}

export async function buildDashboard(now = new Date()) {
  const offset = shopOffsetMinutes();
  const r = shopRanges(now, offset);

  const [today, yesterday, month, lastMonth, last7Days, dues, stock] =
    await Promise.all([
      summarize(r.todayStart, r.tomorrowStart),
      summarize(r.yesterdayStart, r.todayStart),
      summarize(r.monthStart, r.nextMonthStart),
      summarize(r.lastMonthStart, r.monthStart),
      lastSevenDays(r.weekStart, r.tomorrowStart, offset),
      customerDues(),
      stockSummary(),
    ]);

  return {
    generatedAt: now.toISOString(),
    today,
    yesterday,
    month,
    lastMonth,
    last7Days,
    customerDues: dues,
    stock,
  };
}