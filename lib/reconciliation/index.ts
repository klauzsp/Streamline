import Decimal from "decimal.js";
import {
  SourceRecord,
  TargetRecord,
  Mapping,
  ReconciliationResult,
} from "@/types";
import { id, key } from "@/lib/mappings/build";
Decimal.set({ precision: 60 });
export const numeric = (s: string) => s !== "" && new Decimal(s).isFinite();
export function reconcile(
  records: SourceRecord[],
  targets: TargetRecord[],
  mappings: Mapping[],
): ReconciliationResult[] {
  const targetById = new Map(targets.map((t) => [t.sourceId, t]));
  const accountByRow = new Map<string, string>();
  for (const m of mappings)
    if (m.kind === "Chart of accounts")
      for (const rid of m.rowIds)
        accountByRow.set(
          rid,
          m.target?.values.account || m.source + " [unmapped]",
        );
  const groups = new Map<string, ReconciliationResult>();
  for (const r of records)
    for (const basis of ["Entity", "Local"] as const) {
      const account = accountByRow.get(r.id) || r.account;
      const currency = basis === "Entity" ? r.entityCurrency : r.currency;
      const k = key(r.entity, account, currency, basis);
      const amount = basis === "Entity" ? r.amount : r.local;
      let g = groups.get(k);
      if (!g) {
        g = {
          id: id("rec", k),
          entity: r.entity,
          account,
          currency,
          basis,
          source: "0",
          target: "0",
          difference: "0",
          sourceDebit: "0",
          targetDebit: "0",
          sourceCredit: "0",
          targetCredit: "0",
          rows: 0,
          included: 0,
          status: "PASS",
          rowIds: [],
        };
        groups.set(k, g);
      }
      g.rows++;
      g.rowIds.push(r.id);
      try {
        if (!numeric(amount)) throw Error();
      } catch {
        g.status = "FAIL";
        continue;
      }
      const a = new Decimal(amount);
      g.source = new Decimal(g.source).plus(a).toString();
      const side = a.isNegative() ? "Credit" : "Debit";
      g[`source${side}`] = new Decimal(g[`source${side}`])
        .plus(a.abs())
        .toString();
      const target = targetById.get(r.id);
      if (target) {
        const value =
          basis === "Entity" ? target.signedEntity : target.signedLocal;
        const b = new Decimal(value);
        g.target = new Decimal(g.target).plus(b).toString();
        const targetSide = b.isNegative() ? "Credit" : "Debit";
        g[`target${targetSide}`] = new Decimal(g[`target${targetSide}`])
          .plus(b.abs())
          .toString();
        g.included++;
      }
    }
  for (const g of groups.values()) {
    g.difference = new Decimal(g.source).minus(g.target).toString();
    if (
      g.status === "FAIL" ||
      g.rows !== g.included ||
      g.difference !== "0" ||
      g.sourceDebit !== g.targetDebit ||
      g.sourceCredit !== g.targetCredit
    )
      g.status = "FAIL";
  }
  return [...groups.values()];
}
