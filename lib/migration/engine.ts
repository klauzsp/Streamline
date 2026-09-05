import Decimal from "decimal.js";
import {
  Dataset,
  Migration,
  Mapping,
  Result,
  TargetRecord,
  MigrationException,
  SourceRecord,
} from "@/types";
import { reconcile, numeric } from "@/lib/reconciliation";
import { id, key } from "@/lib/mappings/build";
export function effectiveMappings(
  data: Dataset,
  migration: Migration,
): Mapping[] {
  return data.mappings.map((original) => {
    const m = { ...original, candidates: [...original.candidates] };
    const suggestion = migration.suggestions[m.id];
    if (suggestion) {
      m.confidence = suggestion.confidence;
      m.candidates = suggestion.candidates
        .map((cid) => data.catalog[m.kind].find((c) => c.id === cid)!)
        .filter(Boolean);
      m.explanation = suggestion.explanation;
      if (m.status === "Missing" && m.candidates.length) m.status = "Suggested";
    }
    const decision = migration.decisions
      .filter((d) => d.mappingId === m.id)
      .at(-1);
    if (decision) {
      if (decision.action === "approve") {
        m.target = data.catalog[m.kind].find(
          (c) => c.id === decision.candidateId,
        );
        m.status = m.target ? "Approved" : "Missing";
        m.explanation = decision.note;
      } else {
        m.status = "Requires review";
        m.target = undefined;
        m.explanation = decision.note;
      }
    }
    return m;
  });
}
export function runMigration(data: Dataset, migration: Migration): Result {
  const mappings = effectiveMappings(data, migration);
  const byRow = new Map<string, Mapping[]>();
  for (const m of mappings)
    for (const rid of m.rowIds) {
      const list = byRow.get(rid) || [];
      list.push(m);
      byRow.set(rid, list);
    }
  const exceptions: MigrationException[] = [];
  const recordById = new Map(data.records.map((r) => [r.id, r]));
  function issue(e: Omit<MigrationException, "totals">) {
    const totals: Record<string, string> = {};
    for (const rid of e.rowIds) {
      const r = recordById.get(rid)!;
      try {
        if (numeric(r.amount))
          totals[r.entityCurrency] = new Decimal(totals[r.entityCurrency] || 0)
            .plus(r.amount)
            .toString();
      } catch {}
    }
    exceptions.push({ ...e, totals });
  }
  for (const m of mappings)
    if (!["Exact", "Approved"].includes(m.status) || !m.target)
      issue({
        id: id("ex", m.id),
        mappingId: m.id,
        title:
          (m.status === "Suggested" ? "Approve proposed " : "Resolve ") +
          m.kind.toLowerCase() +
          " mapping",
        kind: "Decision required",
        severity: m.status === "Suggested" ? "Medium" : "High",
        explanation: m.explanation,
        rowIds: m.rowIds,
      });
  const batchTypes = new Map<string, Set<string>>();
  for (const r of data.records) {
    const coa = byRow.get(r.id)?.find((m) => m.kind === "Chart of accounts");
    const k = key(r.entity, r.batch);
    const set = batchTypes.get(k) || new Set<string>();
    const resolved = coa && ["Exact", "Approved"].includes(coa.status);
    set.add(resolved ? coa.target?.values.batch || "" : "");
    batchTypes.set(k, set);
  }
  const batches = new Map<string, { type: string; rule: string }>();
  for (const [k, types] of batchTypes) {
    const list = [...types];
    if (list.some((t) => !t || data.batchPriority[t] === undefined)) continue;
    list.sort((a, b) => data.batchPriority[a] - data.batchPriority[b]);
    batches.set(k, {
      type: list[0],
      rule: `Lowest numeric priority wins: ${list.map((t) => `${t} (${data.batchPriority[t]})`).join(", ")}`,
    });
  }
  const targets: TargetRecord[] = [];
  const blocked: string[] = [];
  const batchIssues = new Map<string, string[]>();
  for (const r of data.records) {
    const ms = byRow.get(r.id) || [];
    let invalid = "";
    try {
      if (!numeric(r.amount) || !numeric(r.local) || !numeric(r.quantity))
        invalid = "Missing or non-finite amount / quantity";
      else if (
        new Decimal(r.amount).isNegative() !==
          new Decimal(r.local).isNegative() &&
        !new Decimal(r.amount).isZero() &&
        !new Decimal(r.local).isZero()
      )
        invalid =
          "Local and entity amounts have conflicting debit / credit signs";
    } catch {
      invalid = "Invalid decimal amount / quantity";
    }
    if (
      !r.entity ||
      !r.batch ||
      !r.currency ||
      !r.entityCurrency ||
      !r.raw[23] ||
      !r.raw[25] ||
      !r.raw[15] ||
      !r.raw[16]
    )
      invalid =
        "Missing required entity, batch, currency, date or journal identifier";
    if (
      !invalid &&
      [r.raw[23], r.raw[25]].some(
        (v) =>
          !/^\d+(\.\d+)?$/.test(v) || Number(v) <= 0 || Number(v) > 2958465,
      )
    )
      invalid = "Invalid Excel GL or effective date";
    if (invalid)
      issue({
        id: id("invalid", r.id),
        title: invalid,
        kind: "Data validation",
        severity: "High",
        explanation:
          "Source row needs correction or clarification. Original cells have been preserved.",
        rowIds: [r.id],
      });
    const batch = batches.get(key(r.entity, r.batch));
    if (!batch) {
      const k = key(r.entity, r.batch);
      const rows = batchIssues.get(k) || [];
      rows.push(r.id);
      batchIssues.set(k, rows);
    }
    if (
      invalid ||
      !batch ||
      ms.length !== 4 ||
      ms.some((m) => !m.target || !["Exact", "Approved"].includes(m.status))
    ) {
      blocked.push(r.id);
      continue;
    }
    const le = ms.find((m) => m.kind === "Legal entity")!;
    const inv = ms.find((m) => m.kind === "Investor")!;
    const deal = ms.find((m) => m.kind === "Deal / position")!;
    const coa = ms.find((m) => m.kind === "Chart of accounts")!;
    const cv = coa.target!.values;
    if (
      le.target!.values.currency !== r.entityCurrency ||
      deal.target!.values.currency !== r.currency
    ) {
      blocked.push(r.id);
      issue({
        id: id("currency", r.id),
        title: "Target mapping currency conflicts with source",
        kind: "Data validation",
        severity: "High",
        explanation:
          "No FX conversion is performed in a migration. Choose a target record with the source currency.",
        rowIds: [r.id],
      });
      continue;
    }
    const supplier = r.raw[39] || cv.supplier || "";
    if (cv.mandatorySupplier === "YES" && !supplier) {
      blocked.push(r.id);
      issue({
        id: id("supplier", r.id),
        title: "Required supplier missing",
        kind: "Decision required",
        severity: "High",
        explanation:
          "The account crosswalk requires a supplier; neither source nor mapping provides one.",
        rowIds: [r.id],
      });
      continue;
    }
    const local = new Decimal(r.local),
      entity = new Decimal(r.amount);
    const debit = local.isZero() ? !entity.isNegative() : !local.isNegative();
    const fields: Record<string, string> = {};
    const provenance: TargetRecord["provenance"] = {};
    function set(
      name: string,
      value: string,
      col: string,
      m?: Mapping,
      rule?: string,
    ) {
      fields[name] = value;
      provenance[name] = {
        value,
        sources: [{ ...r.ref, column: col }, ...(m?.target?.evidence || [])],
        mappingId: m?.id,
        rule,
      };
    }
    set(
      "Batch Index",
      String(parseInt(id("", key(r.entity, r.batch)).slice(1, 13), 16)),
      "O",
      undefined,
      "Deterministic entity + source batch index",
    );
    set("JE Index", r.raw[15], "P");
    set("Transaction Index", r.raw[16], "Q");
    set("Legal Entity", le.target!.values.name, "D", le);
    set("Legal Entity ID", le.target!.values.id, "D", le);
    set("GL Date", r.raw[23], "X");
    set("Effective Date", r.raw[25], "Z");
    set("Deal Name", deal.target!.values.name, "F", deal);
    set("Deal ID", deal.target!.values.id, "F", deal);
    set("Position", deal.target!.values.position, "H", deal);
    set("Position ID", deal.target!.values.positionId, "H", deal);
    set(
      "Trans Type",
      debit && cv.debitType ? cv.debitType : cv.transType,
      "T/W/AB",
      coa,
      "Debit override when signed local amount is nonnegative",
    );
    set("Transaction Currency", r.currency, "AA");
    set(
      "Investor Amount (Local)",
      local.abs().toFixed(),
      "AB",
      undefined,
      "Absolute amount; original sign retained by Is Debit",
    );
    set("Is Debit", debit ? "Y" : "N", "AB");
    set("Investor Amount (LE)", entity.abs().toFixed(), "AF");
    set("Batch Type", batch.type, "O/W", coa, batch.rule);
    set("Batch Comments", r.raw[17] || "", "R");
    set("Transaction Comments", r.raw[18] || "", "S");
    set(
      "Allocation Rule",
      data.allocationRule,
      "AI",
      undefined,
      "Investor-level allocation rule from the target sample; original source rule retained in raw source record",
    );
    const template = data.files.find((file) => file.role === "Target schema");
    if (template)
      provenance["Allocation Rule"].sources.push({
        file: template.name,
        sheet: template.sheets[0].name,
        row: 2,
        column: "T",
      });
    set("Investor Account ID", inv.target!.values.id, "AJ/AK", inv);
    set("Vehicle", inv.target!.values.vehicle, "E", inv);
    set("Bank Account", r.raw[38] || "", "AM");
    set("UDF Lookup", cv.udf || "", "T/W", coa);
    set("UDF Text", "", "");
    set(
      "Supplier",
      supplier,
      "AN",
      coa,
      "Source supplier, else crosswalk default",
    );
    set(
      "Investor Quantity",
      cv.quantity === "1" ? r.quantity : "",
      "AL",
      coa,
      "Crosswalk quantity policy; original quantity retained in source references",
    );
    // Reconstruct signs from serialized loader fields, not the original amounts.
    const sign = fields["Is Debit"] === "Y" ? 1 : -1;
    targets.push({
      sourceId: r.id,
      fields,
      provenance,
      account: cv.account,
      signedLocal: new Decimal(fields["Investor Amount (Local)"])
        .mul(sign)
        .toString(),
      signedEntity: new Decimal(fields["Investor Amount (LE)"])
        .mul(sign)
        .toString(),
      mappingIds: ms.map((m) => m.id),
      batchRule: batch.rule,
    });
  }
  for (const [k, rows] of batchIssues)
    issue({
      id: id("batch", k),
      title: "Batch type awaits complete mappings",
      kind: "Decision required",
      severity: "High",
      explanation:
        "At least one transaction has no approved, ranked batch type. The whole entity/batch is held to prevent a partial batch.",
      rowIds: rows,
    });
  const reconciliation = reconcile(data.records, targets, mappings);
  const passed = reconciliation.filter((r) => r.status === "PASS").length;
  const gaps = mappings.filter(
    (m) => !["Exact", "Approved"].includes(m.status),
  ).length;
  return {
    mappings,
    targets,
    exceptions,
    reconciliation,
    blocked,
    stats: {
      records: data.records.length,
      eligible: targets.length,
      blocked: blocked.length,
      mappings: mappings.length,
      gaps,
      passed,
      failed: reconciliation.length - passed,
      readiness: Math.floor((targets.length / data.records.length) * 100),
      files: data.files.length,
    },
    verified:
      blocked.length === 0 &&
      passed === reconciliation.length &&
      exceptions.length === 0,
  };
}
