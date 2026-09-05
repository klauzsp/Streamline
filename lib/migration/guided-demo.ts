import { Dataset } from "@/types";
import { demoDataset } from "./dataset";
export const DEMO_ENTITY = "Kestrel Westvale Co-Invest LP";
/** A complete legal entity, not a cherry-picked set of passing rows. */
export async function guidedDemoDataset(): Promise<Dataset> {
  const original = await demoDataset();
  const records = original.records.filter((r) => r.entity === DEMO_ENTITY);
  if (!records.length)
    throw new Error("Westvale demo entity not found in the supplied workbook.");
  const ids = new Set(records.map((r) => r.id));
  const mappings = original.mappings
    .map((m) => ({ ...m, rowIds: m.rowIds.filter((id) => ids.has(id)) }))
    .filter((m) => m.rowIds.length);
  return {
    ...original,
    records,
    mappings,
    scope: {
      kind: "guided-demo",
      entity: DEMO_ENTITY,
      originalRecords: original.records.length,
      includedRecords: records.length,
      excludedRecords: original.records.length - records.length,
      description: `All ${records.length} source records for ${DEMO_ENTITY}. Other legal entities are outside this demo package; their migration status is unchanged.`,
    },
  };
}
