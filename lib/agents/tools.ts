import { Dataset, Mapping } from "@/types";
export function agentTools(data: Dataset) {
  return {
    inspectWorkbook: () => data.files,
    getSourceRows: (ids: string[]) => {
      const wanted = new Set(ids.slice(0, 8));
      return data.records
        .filter((r) => wanted.has(r.id))
        .map((r) => ({
          ref: r.ref,
          entity: r.entity,
          account: r.account,
          transType: r.transType,
          deal: r.deal,
          position: r.position,
          investor: r.investor,
          externalId: r.externalId,
          comments: r.raw[18],
        }));
    },
    lookupCandidates: (mapping: Mapping) => {
      if (mapping.candidates.length) return mapping.candidates.slice(0, 8);
      const words = new Set(
        (mapping.source + " " + mapping.detail)
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((s) => s.length > 3),
      );
      return data.catalog[mapping.kind]
        .map((c) => ({
          c,
          score: c.label
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .reduce((s, w) => s + (words.has(w) ? 1 : 0), 0),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((x) => x.c);
    },
  };
}
