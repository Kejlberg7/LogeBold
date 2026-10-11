import assert from "node:assert/strict";
import { test } from "node:test";
import { buildStatsTimeline, type StatsEntry } from "./stats";

const entry = (values: Partial<StatsEntry> = {}): StatsEntry => ({
  day: "2026-08-21", memberId: 1, teamId: 8, type: "match", amountOre: 5000, ...values,
});

test("an empty season has no invented history", () => {
  assert.deepEqual(buildStatsTimeline([], []), []);
});

test("shared teams sum each member's charge once and retain independent snapshots", () => {
  const points = buildStatsTimeline([
    entry({ day: "2026-08-23", amountOre: 2500 }),
    entry(),
    entry({ memberId: 2 }),
  ], []);
  assert.deepEqual(points.map((p) => p.day), ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"]);
  assert.equal(points[0].chargedOre, 0);
  assert.equal(points[1].chargedOre, 10000);
  assert.equal(points[2].chargedOre, 10000);
  assert.equal(points[1].members[1].chargedOre, 5000);
  assert.equal(points[3].members[1].chargedOre, 7500);
  assert.equal(points[3].members[2].chargedOre, 5000);
  assert.equal(points[3].teams[8], 12500);
  assert.equal(points[3].matchOre, 12500);
});

test("reversals change history on their own day and payouts only affect the pot", () => {
  const points = buildStatsTimeline([
    entry(),
    entry({ type: "fine", teamId: null, amountOre: 1500 }),
    entry({ type: "payment", teamId: null, amountOre: -3000 }),
    entry({ day: "2026-08-22", type: "fine", teamId: null, amountOre: -1500 }),
    entry({ day: "2026-08-22", type: "payment", teamId: null, amountOre: 3000 }),
    entry({ day: "2026-08-22", type: "adjustment", teamId: null, amountOre: -250 }),
  ], [{ day: "2026-08-21", amountOre: 1000 }]);
  assert.equal(points[1].fineOre, 1500);
  assert.equal(points[1].paidOre, 3000);
  const last = points.at(-1)!;
  assert.equal(last.fineOre, 0);
  assert.equal(last.paidOre, 0);
  assert.equal(last.chargedOre, 4750);
  assert.equal(last.adjustmentOre, -250);
  assert.equal(last.paidOre - last.paidOutOre, -1000);
  assert.equal(last.teams[8], 5000);
  for (const point of points) {
    assert.equal(point.chargedOre, point.matchOre + point.fineOre + point.adjustmentOre);
    assert.equal(point.chargedOre, Object.values(point.members).reduce((sum, member) => sum + member.chargedOre, 0));
    assert.equal(point.paidOre, Object.values(point.members).reduce((sum, member) => sum + member.paidOre, 0));
  }
});

test("a payout-only season and month/year boundaries retain valid calendar days", () => {
  const points = buildStatsTimeline([], [{ day: "2027-01-01", amountOre: 2500 }]);
  assert.deepEqual(points.map((p) => p.day), ["2026-12-31", "2027-01-01"]);
  assert.equal(points[1].chargedOre, 0);
  assert.equal(points[1].paidOutOre, 2500);
});
