import { Dataset, Migration, Result } from "@/types";
import { aiConfigured } from "@/lib/vertex";
export function caseView(m: Migration, data: Dataset, result: Result) {
  return {
    migration: m,
    stats: result.stats,
    verified: result.verified,
    aiConfigured: aiConfigured(),
    files: data.files,
    mappings: result.mappings.map((x) => ({
      ...x,
      rowCount: x.rowIds.length,
      rowIds: x.rowIds.slice(0, 5),
    })),
    exceptions: result.exceptions.map((x) => ({
      ...x,
      rowCount: x.rowIds.length,
      rowIds: x.rowIds.slice(0, 5),
    })),
    reconciliation: result.reconciliation.map((x) => ({
      ...x,
      rowIds: x.rowIds.slice(0, 5),
    })),
  };
}
export type CaseView = ReturnType<typeof caseView>;
