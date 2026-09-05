import { Dataset, Mapping, Migration, Result } from "@/types";
import { runMigration } from "./engine";
export function decisionCopy(mapping: Mapping) {
  const proposed = mapping.candidates[0] || mapping.target;
  if (
    mapping.kind === "Deal / position" &&
    mapping.detail.startsWith("Operations (")
  )
    return {
      title: "Do these entries belong to the fund or a specific investment?",
      problem:
        "The source names an investment holding but does not identify it with an ID. Confirm whether these entries need a specific holding, or belong to the fund’s general operations.",
      recommendation: `Use ${proposed?.values.name || "the operations record"} without an investment position.`,
      reason:
        "This connects fund-level entries to an existing operations record, instead of inventing a missing investment.",
      question:
        "Check whether all affected entries are general fund activity. If any belong to a specific investment, request its identifier before approving.",
      approval: "Use the operations record",
      approvalNote:
        "I reviewed the source evidence and confirm these are fund-level entries. Use the proposed operations deal with no investment position.",
      request: `Please confirm whether the entries labelled "${mapping.source}" (${mapping.detail}) represent fund-level activity without an investment position. If a position is required, please supply its name and identifier.`,
    };
  if (mapping.kind === "Chart of accounts")
    return {
      title:
        mapping.detail === "Expense: Administration Fees"
          ? "Is this an administration fee?"
          : "Which account should these entries use?",
      problem:
        mapping.detail === "Expense: Administration Fees"
          ? "The old account says “Interest Income – Bank”, but the transaction type says “Administration Fees”. These tell different stories."
          : "The source account and transaction type do not have an approved match in your system.",
      recommendation: proposed
        ? `Use ${proposed.values.account} with ${proposed.values.transType}.`
        : "Ask the previous administrator for the intended account and transaction type.",
      reason:
        "The classification determines where the client’s historical activity appears in your accounting system. A matching amount alone cannot settle this decision.",
      question:
        "Check the transaction descriptions or supporting documents. Do they support the selected accounting category? Matching amounts alone do not confirm the category.",
      approval: "Confirm this classification",
      approvalNote:
        "I reviewed the transaction description and reference proposal and confirm the proposed target account and transaction type.",
      request: `Please confirm the intended classification for source account "${mapping.source}" and transaction type "${mapping.detail}". ${proposed ? `The proposed target is ${proposed.label}. ` : ""}Please provide supporting documentation or the correct account; these rows are held until confirmed.`,
    };
  return {
    title:
      mapping.kind === "Investor"
        ? "Which investor does this activity belong to?"
        : mapping.kind === "Legal entity"
          ? "Which fund entity is this?"
          : "Which investment record should we use?",
    problem: `We could not safely confirm the ${mapping.kind.toLowerCase()} relationship for ${mapping.source}.`,
    recommendation: proposed
      ? `Review the proposed record: ${proposed.label}.`
      : "Request the missing identifier from the previous administrator.",
    reason:
      "The client’s records must be attached to the correct target record before import.",
    question:
      "Can you confirm this target record from the supporting evidence?",
    approval: "Confirm this record",
    approvalNote:
      "I reviewed the source evidence and confirm the selected target record.",
    request: `Please confirm the target identity for ${mapping.kind.toLowerCase()}: ${mapping.source} (${mapping.detail}). Supply the correct identifier or supporting documentation.`,
  };
}
export function guidance(data: Dataset, m: Migration, result: Result) {
  const decisions = result.mappings.filter(
    (x) => !["Exact", "Approved"].includes(x.status),
  );
  const initialTotal = data.mappings.filter(
    (x) => !["Exact", "Approved"].includes(x.status),
  ).length;
  return {
    initialTotal,
    remaining: decisions.length,
    completed: result.mappings.filter((x) => x.status === "Approved").length,
    otherBlockers: result.exceptions.filter((e) => e.kind === "Data validation")
      .length,
    decisions: decisions
      .map((mapping) => {
        const copy = decisionCopy(mapping);
        const latest = m.decisions
          .filter((d) => d.mappingId === mapping.id)
          .at(-1);
        let unlocks: number | undefined;
        const candidate = mapping.candidates[0] || mapping.target;
        // Preview the actual engine result for the small guided demo only.
        if (data.scope && candidate) {
          const preview = runMigration(data, {
            ...m,
            decisions: [
              ...m.decisions,
              {
                mappingId: mapping.id,
                action: "approve",
                candidateId: candidate.id,
                note: "Impact preview only — not persisted",
                reviewer: "Preview",
                at: m.createdAt,
              },
            ],
          });
          unlocks = preview.stats.eligible - result.stats.eligible;
        }
        return {
          id: mapping.id,
          kind: mapping.kind,
          source: mapping.source,
          detail: mapping.detail,
          rows: mapping.rowIds.length,
          candidate,
          unlocks,
          waiting: latest?.action === "request",
          ...copy,
        };
      })
      .sort(
        (a, b) =>
          (a.waiting ? 1 : 0) - (b.waiting ? 1 : 0) ||
          (b.unlocks || 0) - (a.unlocks || 0),
      ),
  };
}
