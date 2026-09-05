import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { Dataset, Migration, Mapping, SourceRecord, Candidate } from "../types";
import { runMigration } from "../lib/migration/engine";
import { reconcile } from "../lib/reconciliation";
import { exportWorkbook } from "../lib/excel/export";
import { canonicalize } from "../lib/migration/dataset";
import { suggestionSchema } from "../lib/vertex";
const migration = (): Migration => ({
  id: "test",
  name: "Test Fund",
  sourceAdmin: "Legacy",
  targetSystem: "Corvus",
  date: "2026-06-30",
  baseCurrency: "USD",
  createdAt: "2026-01-01T00:00:00Z",
  revision: 0,
  decisions: [],
  suggestions: {},
  audit: [],
  datasetFile: "test",
});
function fixture(amounts = ["0.1", "-0.1"]): Dataset {
  const records: SourceRecord[] = amounts.map((amount, i) => {
    const raw = Array(43).fill("");
    raw[15] = "1";
    raw[16] = String(i + 1);
    raw[23] = "46203";
    raw[25] = "46203";
    raw[34] = "Specific investor";
    return {
      id: "r" + i,
      ref: { file: "input.xlsx", sheet: "GL", row: i + 2, column: "A:AQ" },
      raw,
      fund: "Fund",
      entity: "Entity",
      vehicle: "Entity",
      investor: "Investor",
      externalId: "external-1",
      deal: "Deal",
      position: "Position",
      account: "Source cash",
      transType: "Cash movement",
      currency: "USD",
      entityCurrency: "USD",
      local: amount,
      amount,
      batch: "1",
      quantity: "0",
    };
  });
  const evidence = [
    { file: "mapping.xlsx", sheet: "Crosswalk", row: 2, column: "A:E" },
  ];
  const spec: [Mapping["kind"], Record<string, string>][] = [
    ["Legal entity", { name: "Entity", id: "1", currency: "USD" }],
    ["Investor", { name: "Investor", id: "2", vehicle: "Entity" }],
    [
      "Deal / position",
      {
        name: "Deal",
        id: "3",
        position: "Position",
        positionId: "4",
        currency: "USD",
      },
    ],
    [
      "Chart of accounts",
      {
        id: "10000",
        account: "10000 - Cash",
        transType: "Cash paid",
        debitType: "Cash received",
        batch: "General",
        quantity: "0",
      },
    ],
  ];
  const mappings: Mapping[] = spec.map(([kind, values], i) => {
    const target: Candidate = {
      id: "c" + i,
      label: kind + " target",
      values,
      evidence,
    };
    return {
      id: "m" + i,
      kind,
      key: kind,
      source: kind,
      detail: kind,
      status: "Exact",
      target,
      candidates: [target],
      explanation: "Crosswalk match",
      evidence,
      rowIds: records.map((r) => r.id),
    };
  });
  return {
    records,
    mappings,
    allocationRule: "Specific investor",
    catalog: Object.fromEntries(
      mappings.map((m) => [m.kind, m.candidates]),
    ) as Dataset["catalog"],
    batchPriority: { General: 10, Call: 1 },
    files: [],
    headers: [
      "Batch Index",
      "Investor Amount (Local)",
      "Investor Amount (LE)",
      "Is Debit",
    ],
  };
}
test("decimal arithmetic preserves cents, sub-cent residuals and debit overrides", () => {
  const data = fixture(["0.1", "0.2", "-0.3", "9.094947017729282e-13"]);
  const result = runMigration(data, migration());
  assert.equal(result.verified, true);
  assert.equal(result.reconciliation[0].source, "9.094947017729282e-13");
  assert.equal(result.targets[0].fields["Trans Type"], "Cash received");
  assert.equal(result.targets[2].fields["Trans Type"], "Cash paid");
  assert.equal(result.targets[2].fields["Is Debit"], "N");
  assert.equal(result.targets[2].fields["Investor Amount (LE)"], "0.3");
  assert.equal(
    result.targets[3].provenance["Investor Amount (Local)"].sources[0].column,
    "AB",
  );
});
test("zero net omitted rows fail coverage and gross-flow reconciliation", () => {
  const data = fixture(["100", "-100"]);
  const result = reconcile(data.records, [], data.mappings);
  assert.equal(result[0].difference, "0");
  assert.equal(result[0].status, "FAIL");
  assert.equal(result[0].sourceDebit, "100");
  assert.equal(result[0].targetDebit, "0");
});
test("reconciliation detects corrupted target amount and reversed sign", () => {
  const data = fixture();
  const result = runMigration(data, migration());
  result.targets[0].signedEntity = "9";
  assert.equal(
    reconcile(data.records, result.targets, result.mappings).find(
      (r) => r.basis === "Entity",
    )!.status,
    "FAIL",
  );
});
test("suggested mappings block verified export; approval recomputes targets; unresolved reverses approval", () => {
  const data = fixture();
  const m = migration();
  data.mappings[3].status = "Suggested";
  data.mappings[3].target = undefined;
  let result = runMigration(data, m);
  assert.equal(result.targets.length, 0);
  assert.throws(() => exportWorkbook(data, m, result, true), /blocked/);
  m.decisions.push({
    mappingId: "m3",
    action: "approve",
    candidateId: "c3",
    note: "Confirmed by reviewer",
    at: "2026-01-01",
    reviewer: "Reviewer",
  });
  result = runMigration(data, m);
  assert.equal(result.verified, true);
  assert.equal(result.targets.length, 2);
  m.decisions.push({
    mappingId: "m3",
    action: "unresolved",
    note: "Reopened for clarification",
    at: "2026-01-02",
    reviewer: "Reviewer",
  });
  assert.equal(runMigration(data, m).verified, false);
});
test("batch override selects lowest priority; unranked batch blocks every affected row", () => {
  const data = fixture();
  const call = structuredClone(data.mappings[3]);
  call.id = "call";
  call.target!.id = "call-candidate";
  call.target!.values.batch = "Call";
  call.rowIds = ["r1"];
  data.mappings[3].rowIds = ["r0"];
  data.mappings.push(call);
  let result = runMigration(data, migration());
  assert.ok(result.targets.every((t) => t.fields["Batch Type"] === "Call"));
  call.target!.values.batch = "Unranked";
  result = runMigration(data, migration());
  assert.equal(result.targets.length, 0);
  assert.ok(result.exceptions.some((e) => e.title.includes("Batch type")));
});
test("invalid and opposite-sign amounts are surfaced as validation exceptions", () => {
  const data = fixture(["not a number"]);
  let result = runMigration(data, migration());
  assert.equal(result.verified, false);
  assert.ok(result.exceptions.some((e) => e.kind === "Data validation"));
  const other = fixture(["1"]);
  other.records[0].local = "-1";
  result = runMigration(other, migration());
  assert.equal(result.targets.length, 0);
});
test("local zero uses entity amount sign and retains an exact signed entity amount", () => {
  const data = fixture(["-1"]);
  data.records[0].local = "0";
  const result = runMigration(data, migration());
  assert.equal(result.targets[0].fields["Is Debit"], "N");
  assert.equal(result.verified, true);
});
test("workbook roundtrip contains regenerated loader, draft label, exact amounts and every source reference", () => {
  const data = fixture(["0.0000000000009094947017729282"]);
  const m = migration();
  const result = runMigration(data, m);
  const wb = XLSX.read(exportWorkbook(data, m, result, false, true), {
    type: "buffer",
  });
  assert.equal(wb.SheetNames.length, 12);
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
    wb.Sheets["Upload Template"],
  );
  assert.equal(
    rows[0]["Investor Amount (Local)"],
    "0.0000000000009094947017729282",
  );
  const summary = XLSX.utils.sheet_to_json<Record<string, string>>(
    wb.Sheets["Migration Summary"],
  );
  assert.equal(summary[0].Status, "DRAFT — NOT FOR IMPORT");
  assert.equal(
    XLSX.utils.sheet_to_json(wb.Sheets["Source References"]).length,
    1,
  );
  const audit = XLSX.utils.sheet_to_json<Record<string, string>>(
    wb.Sheets["Transformation Audit"],
  );
  assert.ok(audit[0].Provenance.includes("Investor Amount (Local)"));
});
test("unsupported source layout and malformed AI output are rejected", () => {
  assert.throws(
    () =>
      canonicalize(
        { Sheet: [{ row: 1, values: ["Bad schema"] }] },
        "source.xlsx",
      ),
    /Unsupported/,
  );
  assert.throws(() =>
    suggestionSchema.parse({
      candidateIds: ["invented"],
      explanation: "x",
      confidence: 4,
    }),
  );
  assert.throws(() =>
    suggestionSchema.parse({
      candidateIds: [],
      explanation: "x",
      confidence: 0.3,
      approve: true,
    }),
  );
});

test("default export has only three core sheets and preserves the exact loader", () => {
  const data = fixture(["0.0000000000009094947017729282"]);
  const m = migration();
  const result = runMigration(data, m);
  const core = XLSX.read(exportWorkbook(data, m, result, true), {
    type: "buffer",
  });
  const audit = XLSX.read(exportWorkbook(data, m, result, true, true), {
    type: "buffer",
  });
  assert.deepEqual(core.SheetNames, [
    "Upload Template",
    "Reconciliation",
    "Migration Summary",
  ]);
  assert.equal(audit.SheetNames.length, 12);
  assert.deepEqual(
    XLSX.utils.sheet_to_json(core.Sheets["Upload Template"]),
    XLSX.utils.sheet_to_json(audit.Sheets["Upload Template"]),
  );
  assert.equal(
    XLSX.utils.sheet_to_json<Record<string, string>>(
      core.Sheets["Reconciliation"],
    )[0].Status,
    "PASS",
  );
});
