import { Dataset, Mapping } from "@/types";
import { agentTools } from "./tools";
import { aiConfigured, reason } from "@/lib/vertex";
export async function investigate(
  data: Dataset,
  m: Mapping,
  model = reason,
  configured = aiConfigured(),
) {
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
  if (!configured)
    return {
      candidates: candidates.map((c) => c.id),
      explanation: m.candidates.length
        ? m.explanation +
          " Evidence was retrieved from the supplied crosswalks. No AI model was called."
        : "Candidate records share description terms with the source. This is a deterministic search, not an approved relationship. Confirm account, transaction type and batch policy with the administrator before approval.",
      provider: "Deterministic evidence search",
    };
  const plan = await model({
    phase: "plan",
    mapping: evidence.mapping,
    availableTools: {
      sourceRows:
        "Retrieve up to eight affected entries with descriptions and source references",
      candidates: "Look up allowed target records and their reference evidence",
      mappingReferences:
        "Retrieve the supplied mapping references and explanation",
    },
  });
  const requested = [...new Set(plan.requestedTools || [])];
  // Both records and allowed targets are mandatory before a recommendation.
  const selected = [...new Set([...requested, "sourceRows", "candidates"])];
  const retrieved: Record<string, unknown> = {};
  const trace: string[] = [];
  for (const name of selected) {
    if (name === "sourceRows") {
      retrieved.sourceRows = tools.getSourceRows(m.rowIds);
      trace.push(
        `Read ${evidence.sourceRows.length} source entries (bounded sample of ${m.rowIds.length})`,
      );
    } else if (name === "candidates") {
      retrieved.candidates = candidates;
      trace.push(`Retrieved ${candidates.length} allowed target candidates`);
    } else if (name === "mappingReferences") {
      retrieved.mappingReferences = {
        refs: m.evidence,
        explanation: m.explanation,
      };
      trace.push(`Retrieved ${m.evidence.length} mapping references`);
    }
  }
  const answer = await model({
    phase: "conclude",
    mapping: evidence.mapping,
    retrieved,
  });
  const allowed = new Set(candidates.map((c) => c.id));
  if (answer.candidateIds.some((id) => !allowed.has(id)))
    throw Error("AI returned an unknown target ID. Suggestion rejected.");
  return {
    candidates: answer.candidateIds,
    explanation: answer.explanation,
    provider: "Gemini · " + (process.env.AI_PROVIDER || "vertex"),
    confidence: answer.confidence,
    trace,
  };
}
