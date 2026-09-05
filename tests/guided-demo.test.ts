import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { guidedDemoDataset, DEMO_ENTITY } from "../lib/migration/guided-demo";
import { demoDataset } from "../lib/migration/dataset";
import { runMigration } from "../lib/migration/engine";
import { guidance } from "../lib/migration/guidance";
import { exportWorkbook } from "../lib/excel/export";
import type { Migration } from "../types";
test("guided demo retains one complete real fund and verifies after two explicit decisions", async () => {
  const original = await demoDataset();
  const data = await guidedDemoDataset();
  assert.equal(data.records.length, 528);
  assert.equal(data.scope?.excludedRecords, 33374);
  assert.deepEqual(
    data.records.map((r) => r.id),
    original.records.filter((r) => r.entity === DEMO_ENTITY).map((r) => r.id),
  );
  const m: Migration = {
    id: "guided-test",
    name: "Westvale demo",
    sourceAdmin: "Legacy Admin",
    targetSystem: "Corvus",
    date: "2026-06-30",
    baseCurrency: "GBP",
    createdAt: "2026-09-05",
    revision: 0,
    decisions: [],
    suggestions: {},
    audit: [],
    datasetFile: "fixture",
    scope: data.scope,
  };
  let result = runMigration(data, m);
  let g = guidance(data, m, result);
  assert.equal(g.remaining, 2);
  assert.equal(result.stats.eligible, 132);
  assert.equal(result.exceptions.length, 3);
  assert.equal(g.decisions[0].unlocks, 352);
  assert.throws(() => exportWorkbook(data, m, result, true), /blocked/);
  const first = g.decisions[0];
  m.decisions.push({
    mappingId: first.id,
    action: "request",
    note: "Please clarify the missing position",
    reviewer: "Test",
    at: m.createdAt,
  });
  result = runMigration(data, m);
  g = guidance(data, m, result);
  assert.equal(g.decisions.find((d) => d.id === first.id)?.waiting, true);
  assert.equal(result.verified, false);
  assert.equal(result.stats.eligible, 132);
  m.decisions.push({
    mappingId: first.id,
    action: "approve",
    candidateId: first.candidate!.id,
    note: "Administrator confirmed fund-level activity",
    reviewer: "Test",
    at: m.createdAt,
  });
  result = runMigration(data, m);
  assert.equal(result.stats.eligible, 484);
  g = guidance(data, m, result);
  assert.equal(g.remaining, 1);
  assert.equal(g.decisions[0].unlocks, 44);
  assert.equal(g.decisions[0].rows, 11);
  m.decisions.push({
    mappingId: g.decisions[0].id,
    action: "approve",
    candidateId: g.decisions[0].candidate!.id,
    note: "Confirmed administration fee classification",
    reviewer: "Test",
    at: m.createdAt,
  });
  result = runMigration(data, m);
  assert.equal(result.verified, true);
  assert.equal(result.stats.eligible, 528);
  assert.equal(result.stats.passed, 28);
  assert.equal(result.exceptions.length, 0);
  const wb = XLSX.read(exportWorkbook(data, m, result, true), {
    type: "buffer",
  });
  const summary = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets["Migration Summary"],
  )[0];
  assert.equal(summary.OutsideDemoScope, 33374);
  assert.equal(summary.OriginalWorkbookRows, 33902);
  assert.match(String(summary.Scope), /Westvale/);
  assert.equal(
    XLSX.utils.sheet_to_json(wb.Sheets["Upload Template"]).length,
    528,
  );
  assert.equal(
    XLSX.utils.sheet_to_json(wb.Sheets["Source References"]).length,
    528,
  );
  assert.equal(original.records.length, 33902);
  assert.equal(
    original.mappings.find((x) => x.id === first.id)?.status,
    "Suggested",
  );
});
