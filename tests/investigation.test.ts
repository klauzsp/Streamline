import test from "node:test";
import assert from "node:assert/strict";
import { investigate } from "../lib/agents/investigate";
import { guidedDemoDataset } from "../lib/migration/guided-demo";

test("investigation retrieves requested evidence and permits abstention without approval", async () => {
  const data = await guidedDemoDataset();
  const mapping = data.mappings.find(
    (m) => m.kind === "Chart of accounts" && m.status !== "Exact",
  )!;
  let calls = 0;
  const answer = await investigate(
    data,
    mapping,
    async (input: unknown) => {
      const e = input as { phase: string; retrieved?: Record<string, unknown> };
      calls++;
      if (e.phase === "plan")
        return {
          candidateIds: [],
          explanation: "Need references",
          confidence: 0,
          requestedTools: ["mappingReferences"],
        };
      assert.ok(e.retrieved?.sourceRows);
      assert.ok(e.retrieved?.candidates);
      assert.ok(e.retrieved?.mappingReferences);
      return {
        candidateIds: [],
        explanation: "Ask administrator for supporting evidence.",
        confidence: 0,
      };
    },
    true,
  );
  assert.equal(calls, 2);
  assert.deepEqual(answer.candidates, []);
  assert.equal(answer.trace?.length, 3);
  assert.notEqual(mapping.status, "Approved");
});

test("investigation rejects a fabricated target after tool retrieval", async () => {
  const data = await guidedDemoDataset();
  const mapping = data.mappings.find((m) => m.status !== "Exact")!;
  await assert.rejects(
    investigate(
      data,
      mapping,
      async () => ({
        candidateIds: ["invented"],
        explanation: "Invalid",
        confidence: 1,
      }),
      true,
    ),
    /unknown target ID/,
  );
});
