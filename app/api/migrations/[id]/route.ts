import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  getCase,
  getDataset,
  mutateCase,
  saveCase,
} from "@/lib/migration/store";
import { runMigration } from "@/lib/migration/engine";
import { caseView } from "@/lib/migration/view";
import { investigate } from "@/lib/agents/investigate";
import { exportWorkbook } from "@/lib/excel/export";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, ctx: Context) {
  try {
    const m = await getCase((await ctx.params).id);
    const data = await getDataset(m);
    const result = runMigration(data, m);
    const query = req.nextUrl.searchParams;
    if (query.has("mapping") || query.has("check") || query.has("exception")) {
      const mapping = result.mappings.find(
        (x) => x.id === query.get("mapping"),
      );
      const check = result.reconciliation.find(
        (x) => x.id === query.get("check"),
      );
      const exception = result.exceptions.find(
        (x) => x.id === query.get("exception"),
      );
      const ids = mapping?.rowIds || check?.rowIds || exception?.rowIds;
      if (!ids)
        return NextResponse.json(
          { error: "Evidence not found" },
          { status: 404 },
        );
      const wanted = new Set(ids.slice(0, 30));
      const targets = new Map(
        result.targets
          .filter((t) => wanted.has(t.sourceId))
          .map((t) => [t.sourceId, t]),
      );
      return NextResponse.json({
        mapping,
        check,
        exception,
        total: ids.length,
        rows: data.records
          .filter((r) => wanted.has(r.id))
          .map((r) => ({ source: r, target: targets.get(r.id) })),
        catalog: mapping ? data.catalog[mapping.kind] : [],
      });
    }
    return NextResponse.json(caseView(m, data, result));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load case" },
      { status: 404 },
    );
  }
}
const actionSchema = z
  .object({
    action: z.enum([
      "approve",
      "unresolved",
      "request",
      "investigate",
      "reconcile",
      "export",
    ]),
    revision: z.number().int().nonnegative(),
    mappingId: z.string().optional(),
    candidateId: z.string().optional(),
    note: z.string().trim().max(2000).optional(),
    reviewer: z.string().trim().min(1).max(100).default("Local reviewer"),
    verified: z.boolean().optional(),
  })
  .strict();
export async function POST(req: NextRequest, ctx: Context) {
  try {
    const input = actionSchema.parse(await req.json());
    const caseId = (await ctx.params).id;
    return await mutateCase(caseId, async (m) => {
      if (input.revision !== m.revision)
        return NextResponse.json(
          {
            error:
              "This case changed. Refresh before applying another decision.",
          },
          { status: 409 },
        );
      const data = await getDataset(m);
      let result = runMigration(data, m);
      const mapping = result.mappings.find((x) => x.id === input.mappingId);
      const at = new Date().toISOString();
      let detail = "";
      if (
        ["approve", "unresolved", "request", "investigate"].includes(
          input.action,
        ) &&
        !mapping
      )
        throw Error("Mapping not found");
      if (input.action === "investigate") {
        const suggestion = await investigate(data, mapping!);
        m.suggestions[mapping!.id] = suggestion;
        detail = suggestion.provider + ": " + suggestion.explanation;
      } else if (
        input.action === "approve" ||
        input.action === "unresolved" ||
        input.action === "request"
      ) {
        if (!input.note) throw Error("A reviewer rationale is required.");
        if (
          input.action === "approve" &&
          !data.catalog[mapping!.kind].some((c) => c.id === input.candidateId)
        )
          throw Error("Choose an existing target record.");
        m.decisions.push({
          mappingId: mapping!.id,
          action: input.action,
          candidateId: input.candidateId,
          note: input.note,
          at,
          reviewer: input.reviewer,
        });
        detail = `${mapping!.source} / ${mapping!.detail}: ${input.note}`;
      } else if (input.action === "reconcile")
        detail = `Deterministic reconciliation: ${result.stats.passed} passed, ${result.stats.failed} failed; ${result.stats.blocked} source rows blocked.`;
      else if (input.action === "export") {
        if (input.verified && !result.verified)
          throw Error(
            "Verified export is blocked until all records are mapped and all reconciliation checks pass.",
          );
        detail = input.verified
          ? "Verified migration package generated."
          : "Draft review package generated; not for import.";
      }
      m.revision++;
      m.audit.push({
        id: randomUUID(),
        at,
        action: input.action,
        detail,
        mappingId: mapping?.id,
        reviewer:
          input.action === "investigate"
            ? "Evidence assistant"
            : input.reviewer,
      });
      if (input.action === "export") {
        const buffer = exportWorkbook(data, m, result, !!input.verified);
        await saveCase(m);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${input.verified ? "verified-migration" : "draft-review"}-${caseId.slice(0, 8)}.xlsx"`,
          },
        });
      }
      await saveCase(m);
      result = runMigration(data, m);
      return NextResponse.json(caseView(m, data, result));
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Action failed" },
      { status: 400 },
    );
  }
}
