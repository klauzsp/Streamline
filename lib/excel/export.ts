import * as XLSX from "xlsx";
import { Dataset, Migration, Result } from "@/types";
export function exportWorkbook(
  data: Dataset,
  migration: Migration,
  result: Result,
  verified: boolean,
) {
  if (verified && !result.verified)
    throw Error(
      "Verified export blocked: resolve every exception and pass every reconciliation check.",
    );
  const wb = XLSX.utils.book_new();
  const add = (
    name: string,
    rows: Record<string, unknown>[],
    headers?: string[],
  ) => {
    const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    sheet["!cols"] = (headers || Object.keys(rows[0] || {})).map(() => ({
      wch: 24,
    }));
    if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
    XLSX.utils.book_append_sheet(wb, sheet, name);
  };
  add(
    "Upload Template",
    result.targets.map((t) => t.fields),
    data.headers,
  );
  for (const kind of [
    "Legal entity",
    "Investor",
    "Deal / position",
    "Chart of accounts",
  ] as const)
    add(
      kind === "Deal / position"
        ? "Deal Mapping"
        : kind === "Chart of accounts"
          ? "CoA Mapping"
          : kind + " Mapping",
      result.mappings
        .filter((m) => m.kind === kind)
        .map((m) => ({
          ID: m.id,
          Source: m.source,
          Detail: m.detail,
          Target: m.target?.label || "",
          State: m.status,
          Explanation: m.explanation,
          Warning: m.warning || "",
          Evidence: JSON.stringify(m.target?.evidence || m.evidence),
        })),
    );
  add(
    "Mapping Gaps",
    result.mappings
      .filter((m) => !["Exact", "Approved"].includes(m.status))
      .map((m) => ({
        Source: m.source,
        Detail: m.detail,
        Status: m.status,
        Rows: m.rowIds.length,
        Explanation: m.explanation,
      })),
  );
  add(
    "Reconciliation",
    result.reconciliation.map(({ rowIds, ...r }) => ({
      ...r,
      SourceRows: rowIds.slice(0, 100).join(", "),
    })),
  );
  add(
    "Exceptions",
    result.exceptions.map(({ rowIds, totals, ...e }) => ({
      ...e,
      Rows: rowIds.length,
      Totals: JSON.stringify(totals),
      SourceRows: rowIds.slice(0, 100).join(", "),
    })),
  );
  add("Migration Summary", [
    {
      Name: migration.name,
      Status: verified ? "VERIFIED" : "DRAFT — NOT FOR IMPORT",
      Scope:
        data.scope?.description ||
        "All source rows; blocked rows excluded only from loader and listed in Source References",
      OriginalWorkbookRows: data.scope?.originalRecords || data.records.length,
      OutsideDemoScope: data.scope?.excludedRecords || 0,
      SourceRows: data.records.length,
      LoaderRows: result.targets.length,
      BlockedRows: result.blocked.length,
      ChecksPassed: result.stats.passed,
      ChecksFailed: result.stats.failed,
      Revision: migration.revision,
      GeneratedAt: new Date().toISOString(),
      AmountPolicy:
        "Exact decimal text cells; no rounding. Target sample allocation rule applied. Validate numeric import policy before live integration.",
    },
  ]);
  add("Audit Log", migration.audit);
  const ts = new Map(
    result.targets.map((t, i) => [t.sourceId, { t, row: i + 2 }]),
  );
  const checks = new Map<string, string[]>();
  for (const c of result.reconciliation)
    for (const rid of c.rowIds) {
      const a = checks.get(rid) || [];
      a.push(c.id);
      checks.set(rid, a);
    }
  add(
    "Source References",
    data.records.map((r) => ({
      ID: r.id,
      File: r.ref.file,
      Sheet: r.ref.sheet,
      Row: r.ref.row,
      LocalAmount: r.local,
      EntityAmount: r.amount,
      Quantity: r.quantity,
      Currency: r.currency,
      EntityCurrency: r.entityCurrency,
      Status: ts.has(r.id) ? "Included" : "Blocked",
      UploadRow: ts.get(r.id)?.row || "",
      MappingIDs: ts.get(r.id)?.t.mappingIds.join(", ") || "",
      BatchRule: ts.get(r.id)?.t.batchRule || "",
      Checks: checks.get(r.id)?.join(", "),
    })),
  );
  // One row per source transaction plus full field provenance in compact JSON text.
  add(
    "Transformation Audit",
    result.targets.map((t) => ({
      SourceID: t.sourceId,
      Provenance: JSON.stringify(
        Object.fromEntries(
          Object.entries(t.provenance).map(([field, p]) => [
            field,
            {
              value: p.value,
              sourceColumn: p.sources[0]?.column,
              templateEvidence: !p.mappingId ? p.sources.slice(1) : undefined,
              mappingId: p.mappingId,
              rule: p.rule,
            },
          ]),
        ),
      ),
    })),
  );
  return XLSX.write(wb, {
    bookType: "xlsx",
    type: "buffer",
    compression: true,
  }) as Buffer;
}
