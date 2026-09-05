import { createHash } from "node:crypto";
import {
  Candidate,
  Dataset,
  Mapping,
  MappingKind,
  SourceRecord,
  SourceReference,
} from "@/types";
import { Workbook, RawRow, text as t } from "@/lib/excel/read";
export const id = (prefix: string, key: string) =>
  prefix + "-" + createHash("sha256").update(key).digest("hex").slice(0, 16);
export const key = (...parts: string[]) =>
  JSON.stringify(parts.map((p) => p.trim()));
const valid = (v: string) =>
  !!v && !["#N/A", "#VALUE!", "TBD", "0"].includes(v);
export function buildMappings(
  records: SourceRecord[],
  wb: Workbook,
  file: string,
): Pick<Dataset, "mappings" | "catalog" | "batchPriority"> {
  const kinds: MappingKind[] = [
    "Legal entity",
    "Investor",
    "Deal / position",
    "Chart of accounts",
  ];
  const catalog = Object.fromEntries(
    kinds.map((k) => [k, [] as Candidate[]]),
  ) as Dataset["catalog"];
  const lookups = Object.fromEntries(
    kinds.map((k) => [k, new Map<string, Candidate[]>()]),
  ) as Record<MappingKind, Map<string, Candidate[]>>;
  function add(
    kind: MappingKind,
    k: string,
    label: string,
    values: Record<string, string>,
    sheet: string,
    row: RawRow,
  ) {
    const evidence: SourceReference[] = [
      {
        file,
        sheet,
        row: row.row,
        column:
          "A:" + String.fromCharCode(64 + Math.min(row.values.length, 26)),
      },
    ];
    const candidate: Candidate = {
      id: id("c", kind + JSON.stringify(values)),
      label,
      values,
      evidence,
    };
    const existing = catalog[kind].find((c) => c.id === candidate.id);
    if (!existing) catalog[kind].push(candidate);
    const list = lookups[kind].get(k) || [];
    if (!list.some((c) => c.id === candidate.id)) list.push(candidate);
    lookups[kind].set(k, list);
  }
  for (const r of (wb["LE Mapping"] || []).slice(2))
    if (valid(t(r, 4)))
      add(
        "Legal entity",
        key(t(r, 1)),
        t(r, 3) + " · " + t(r, 4),
        { name: t(r, 3), id: t(r, 4), currency: t(r, 5) },
        "LE Mapping",
        r,
      );
  for (const r of (wb["Investor Mapping"] || []).slice(1))
    if (valid(t(r, 10)))
      add(
        "Investor",
        key(t(r, 2), t(r, 3)),
        t(r, 8) + " · " + t(r, 10),
        { name: t(r, 8), id: t(r, 10), vehicle: t(r, 6), sourceName: t(r, 4) },
        "Investor Mapping",
        r,
      );
  for (const r of (wb["Deal Mapping"] || []).slice(1))
    if (valid(t(r, 6)) && (!t(r, 2) || valid(t(r, 8))))
      add(
        "Deal / position",
        key(t(r, 0), t(r, 2), t(r, 4)),
        (t(r, 7) || t(r, 5)) + " · " + (t(r, 8) || t(r, 6)),
        {
          name: t(r, 5),
          id: t(r, 6),
          position: t(r, 7),
          positionId: t(r, 8),
          currency: t(r, 9),
        },
        "Deal Mapping",
        r,
      );
  for (const r of (wb["CoA Mapping"] || []).slice(1))
    if (valid(t(r, 3)) && valid(t(r, 6)))
      add(
        "Chart of accounts",
        key(t(r, 0), t(r, 2)),
        t(r, 4) + " / " + t(r, 6),
        {
          account: t(r, 4),
          id: t(r, 3),
          transType: t(r, 6),
          debitType: t(r, 7),
          quantity: t(r, 8),
          udf: t(r, 9),
          mandatorySupplier: t(r, 10),
          supplier: t(r, 11),
          batch: t(r, 12),
        },
        "CoA Mapping",
        r,
      );
  // Master chart candidates are selectable but are never silently approved.
  for (const r of (wb["Corvus CoA"] || []).slice(1))
    if (valid(t(r, 1)) && valid(t(r, 5))) {
      const previous = catalog["Chart of accounts"].find(
        (c) => c.values.id === t(r, 1) && c.values.transType === t(r, 5),
      );
      if (!previous)
        add(
          "Chart of accounts",
          key("__catalog__", t(r, 4)),
          t(r, 2) + " / " + t(r, 5),
          {
            account: t(r, 2),
            id: t(r, 1),
            transType: t(r, 5),
            debitType: "",
            quantity: "0",
            udf: "",
            supplier: "",
            mandatorySupplier: "",
            batch: "General",
          },
          "Corvus CoA",
          r,
        );
    }
  const entityList = new Set(
    (wb["Entity Listing"] || []).slice(1).map((r) => t(r, 1)),
  );
  const investors = new Set(
    (wb["Investors List"] || []).slice(1).map((r) => t(r, 4)),
  );
  const deals = new Set((wb["Deals List"] || []).slice(1).map((r) => t(r, 4)));
  const maps = new Map<string, Mapping>();
  for (const r of records) {
    const specs: [MappingKind, string, string, string][] = [
      ["Legal entity", key(r.entity), r.entity, r.entityCurrency],
      [
        "Investor",
        key(r.vehicle, r.externalId),
        r.investor,
        r.vehicle + " · " + r.externalId,
      ],
      [
        "Deal / position",
        key(r.deal, r.position, r.currency),
        r.position || r.deal,
        r.deal + " · " + r.currency,
      ],
      [
        "Chart of accounts",
        key(r.account, r.transType),
        r.account,
        r.transType,
      ],
    ];
    for (const [kind, k, source, detail] of specs) {
      const mid = id("map", kind + k);
      const old = maps.get(mid);
      if (old) {
        old.rowIds.push(r.id);
        continue;
      }
      const matches = lookups[kind].get(k) || [];
      const target = matches.length === 1 ? matches[0] : undefined;
      let warning: string | undefined;
      if (
        target &&
        kind === "Legal entity" &&
        !entityList.has(target.values.name)
      )
        warning =
          "Explicit crosswalk exists; target is absent from the supplied entity listing. Known incomplete master list.";
      if (target && kind === "Investor" && !investors.has(target.values.id))
        warning =
          "Explicit crosswalk exists; investor is absent from the supplied investor list. Known incomplete master list.";
      if (target && kind === "Deal / position" && !deals.has(target.values.id))
        warning =
          "Explicit crosswalk exists; deal is absent from the supplied deals list. Known incomplete master list.";
      let status: Mapping["status"] = target
        ? "Exact"
        : matches.length
          ? "Requires review"
          : "Missing";
      if (
        target &&
        kind === "Investor" &&
        target.values.sourceName !== r.investor
      )
        status = "Requires review";
      if (
        target &&
        kind === "Legal entity" &&
        target.values.currency !== r.entityCurrency
      )
        status = "Requires review";
      let candidates = [...matches];
      let explanation = target
        ? "Exact composite-key match to the supplied reference crosswalk."
        : "No unambiguous target crosswalk exists. Administrator decision required.";
      if (!target && kind === "Deal / position" && !r.raw[8]) {
        candidates = lookups[kind].get(key(r.deal, "", r.currency)) || [];
        if (candidates.length) {
          status = "Suggested";
          explanation =
            "The source has a position label but no position ID. An exact deal-only crosswalk exists. Confirm that no target position is required; the original source label remains in the audit evidence.";
        }
      }
      const gap = (wb["Mapping Gaps"] || [])
        .slice(1)
        .find(
          (g) =>
            kind === "Chart of accounts" &&
            t(g, 0) === r.account &&
            t(g, 1) === r.transType,
        );
      if (!target && gap && t(gap, 4)) {
        candidates = catalog[kind].filter(
          (c) =>
            c.values.account === t(gap, 4) && c.values.transType === t(gap, 5),
        );
        if (candidates.length) {
          status = "Suggested";
          explanation =
            "The Mapping Gaps sheet proposes this account and transaction type, but its Approval cell is blank. Human approval is required.";
        }
      }
      maps.set(mid, {
        id: mid,
        kind,
        key: k,
        source,
        detail,
        status,
        target,
        candidates,
        explanation,
        warning,
        evidence:
          target?.evidence ||
          (gap
            ? [{ file, sheet: "Mapping Gaps", row: gap.row, column: "A:G" }]
            : candidates.flatMap((c) => c.evidence)),
        rowIds: [r.id],
      });
    }
  }
  const batchPriority: Record<string, number> = {};
  for (const r of (wb["Batch Preference"] || []).slice(1))
    if (t(r, 1) !== "") batchPriority[t(r, 0)] = Number(t(r, 1));
  return { mappings: [...maps.values()], catalog, batchPriority };
}
