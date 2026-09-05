import test from "node:test";
import assert from "node:assert/strict";
import Decimal from "decimal.js";
import { demoDataset } from "../lib/migration/dataset";
import { runMigration } from "../lib/migration/engine";
import { Migration } from "../types";
test("supplied dataset has complete source coverage; a real approval increases readiness", async () => {
  const data = await demoDataset();
  const m: Migration = {
    id: "dataset-test",
    name: "Dataset test",
    sourceAdmin: "Legacy",
    targetSystem: "Corvus",
    date: "2026-06-30",
    baseCurrency: "USD",
    createdAt: "2026-01-01",
    revision: 0,
    decisions: [],
    suggestions: {},
    audit: [],
    datasetFile: "demo",
  };
  assert.equal(data.records.length, 33902);
  assert.equal(data.headers.length, 27);
  assert.equal(data.allocationRule, "Eastbury Trentbeck");
  const result = runMigration(data, m);
  assert.equal(result.targets.length + result.blocked.length, 33902);
  assert.equal(
    new Set([...result.targets.map((t) => t.sourceId), ...result.blocked]).size,
    33902,
  );
  assert.ok(result.targets.length > 6000);
  assert.equal(result.verified, false);
  const proposal = data.mappings.find(
    (x) =>
      x.kind === "Deal / position" &&
      x.key === JSON.stringify(["Operations (USD)", "Clanford", "USD"]),
  )!;
  assert.equal(proposal.status, "Suggested");
  m.decisions.push({
    mappingId: proposal.id,
    action: "approve",
    candidateId: proposal.candidates[0].id,
    note: "Test approval of documented deal-only crosswalk",
    at: "2026-01-01",
    reviewer: "Test reviewer",
  });
  const after = runMigration(data, m);
  assert.ok(after.stats.eligible > result.stats.eligible);
  assert.ok(after.stats.readiness > result.stats.readiness);
  const targetMap = new Map(after.targets.map((t) => [t.sourceId, t]));
  for (const r of data.records) {
    const t = targetMap.get(r.id);
    if (t) {
      assert.ok(new Decimal(t.signedEntity).eq(r.amount));
      assert.ok(new Decimal(t.signedLocal).eq(r.local));
      assert.equal(
        t.provenance["Investor Account ID"].sources[0].row,
        r.ref.row,
      );
    }
  }
  assert.ok(
    after.mappings.some((x) => x.warning && x.status === "Exact"),
    "Known incomplete lists preserve explicit crosswalks",
  );
  console.log(
    `Real data: ${result.stats.eligible} → ${after.stats.eligible} eligible records after one explicit review; ${after.stats.readiness}% readiness.`,
  );
});
