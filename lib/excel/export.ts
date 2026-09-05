import * as XLSX from "xlsx";
import { Dataset, Migration, Result } from "@/types";
export function exportWorkbook(
  data: Dataset,
  migration: Migration,
  result: Result,
  verified: boolean,
  detailed = false,
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
  const sourceRef = data.records[0]?.ref;
  const sourceHeaders =
    data.files
      .find((file) => file.name === sourceRef?.file)
      ?.sheets.find((sheet) => sheet.name === sourceRef?.sheet)?.columns ||
    Array.from(
      { length: data.records[0]?.raw.length || 0 },
      (_, i) => `Source column ${i + 1}`,
    );
  // Arrays preserve duplicate source column names and exact original strings.
  const original = XLSX.utils.aoa_to_sheet([
    sourceHeaders,
    ...data.records.map((record) => record.raw),
  ]);
  original["!cols"] = sourceHeaders.map(() => ({ wch: 24 }));
  if (original["!ref"]) original["!autofilter"] = { ref: original["!ref"] };
  XLSX.utils.book_append_sheet(wb, original, "Original Data");
  add(
    "Upload Template",
    result.targets.map((t) => t.fields),
    data.headers,
  );
  // Keep Excel's numeric date values while displaying human-readable dates.
  const upload = wb.Sheets["Upload Template"];
  for (const header of ["GL Date", "Effective Date"]) {
    const column = data.headers.indexOf(header);
    if (column < 0) continue;
    for (let row = 1; row <= result.targets.length; row++) {
      const cell = upload[XLSX.utils.encode_cell({ r: row, c: column })];
      if (!cell || cell.v === "" || cell.v == null) continue;
      const serial = Number(cell.v);
      if (!Number.isFinite(serial)) continue;
      cell.t = "n";
      cell.v = serial;
      cell.z = "dd mmm yyyy";
      delete cell.w;
    }
  }
  if (detailed) {
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
  }
  add(
    "Reconciliation",
    result.reconciliation.map(({ rowIds, ...r }) =>
      detailed
        ? {
            ...r,
            SourceRows: rowIds.slice(0, 100).join(", "),
          }
        : {
            Entity: r.entity,
            Account: r.account,
            Currency: r.currency,
            Basis: r.basis,
            "Original amount": r.source,
            "Prepared amount": r.target,
            Difference: r.difference,
            "Original records": r.rows,
            "Prepared records": r.included,
            Status: r.status,
          },
    ),
  );
  if (detailed)
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
        "All source rows are in scope. Blocked rows are excluded from the loader and remain in the case for review.",
      OriginalData:
        "Original Data contains every in-scope source record in its original column order. Upload Template contains prepared eligible records only. Draft exports may have fewer prepared rows; compare using identifiers, not row position.",
      OriginalWorkbookRows: data.scope?.originalRecords || data.records.length,
      OutsideDemoScope: data.scope?.excludedRecords || 0,
      SourceRows: data.records.length,
      LoaderRows: result.targets.length,
      BlockedRows: result.blocked.length,
      ChecksPassed: result.stats.passed,
      ChecksFailed: result.stats.failed,
      Revision: migration.revision,
      GeneratedAt: new Date().toISOString(),
      AuditEvidence: detailed
        ? "Full mapping and source-reference sheets included"
        : "Full audit evidence retained in the application; available in the optional detailed audit package",
      AmountPolicy:
        "Exact decimal text cells; no rounding. Target sample allocation rule applied. Validate numeric import policy before live integration.",
    },
  ]);
  if (detailed) {
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
  }
  return XLSX.write(wb, {
    bookType: "xlsx",
    type: "buffer",
    compression: true,
  }) as Buffer;
}
