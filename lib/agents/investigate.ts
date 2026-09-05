import { Dataset, Mapping } from "@/types";
import { agentTools } from "./tools";
import { aiConfigured, reason } from "@/lib/vertex";
export async function investigate(data: Dataset, m: Mapping) {
  const tools = agentTools(data);
  const candidates = tools.lookupCandidates(m);
  const evidence = {
    mapping: {
      source: m.source,
      detail: m.detail,
      kind: m.kind,
      explanation: m.explanation,
    },
    sourceRows: tools.getSourceRows(m.rowIds),
    candidates,
  };
  if (!aiConfigured())
    return {
      candidates: candidates.map((c) => c.id),
      explanation: m.candidates.length
        ? m.explanation +
          " Evidence was retrieved from the supplied crosswalks. No AI model was called."
        : "Candidate records share description terms with the source. This is a deterministic search, not an approved relationship. Confirm account, transaction type and batch policy with the administrator before approval.",
      provider: "Deterministic evidence search",
    };
  const answer = await reason(evidence);
  const allowed = new Set(candidates.map((c) => c.id));
  if (answer.candidateIds.some((id) => !allowed.has(id)))
    throw Error("AI returned an unknown target ID. Suggestion rejected.");
  return {
    candidates: answer.candidateIds,
    explanation: answer.explanation,
    provider: "Gemini · " + (process.env.AI_PROVIDER || "vertex"),
    confidence: answer.confidence,
  };
}
