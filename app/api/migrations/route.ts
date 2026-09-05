import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listCases, createCase, getDataset } from "@/lib/migration/store";
import { runMigration } from "@/lib/migration/engine";
import { buildDataset, localDir } from "@/lib/migration/dataset";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { guidedDemoDataset } from "@/lib/migration/guided-demo";
export const runtime = "nodejs";
export async function GET() {
  try {
    const cases = await listCases();
    return NextResponse.json(
      await Promise.all(
        cases.map(async (m) => ({
          migration: m,
          stats: runMigration(await getDataset(m), m).stats,
        })),
      ),
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load migrations." },
      { status: 500 },
    );
  }
}
const schema = z.object({
  name: z.string().trim().min(1).max(120),
  sourceAdmin: z.string().trim().min(1).max(100),
  targetSystem: z.literal("Corvus"),
  date: z.iso.date(),
  baseCurrency: z.enum(["USD", "GBP", "EUR"]),
});
export async function POST(req: NextRequest) {
  let temporary: string | undefined;
  try {
    const form = await req.formData();
    const values = schema.parse(
      Object.fromEntries(
        ["name", "sourceAdmin", "targetSystem", "date", "baseCurrency"].map(
          (k) => [k, form.get(k)],
        ),
      ),
    );
    const file = form.get("file");
    let data;
    if (file instanceof File && file.size) {
      if (!file.name.toLowerCase().endsWith(".xlsx"))
        throw Error("Upload an .xlsx investor-level GL workbook.");
      if (file.size > 30 * 1024 * 1024)
        throw Error("Source file exceeds the 30 MB MVP limit.");
      await mkdir(localDir, { recursive: true });
      temporary = path.join(localDir, randomUUID() + ".xlsx");
      await writeFile(temporary, Buffer.from(await file.arrayBuffer()));
      data = await buildDataset(temporary, path.basename(file.name));
    } else if (form.get("demo") === "guided") {
      data = await guidedDemoDataset();
    } else if (form.get("demo") !== "true")
      throw Error("Choose a source workbook or Load Demo Migration.");
    return NextResponse.json(await createCase(values, data), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Migration creation failed" },
      { status: 400 },
    );
  } finally {
    if (temporary) await unlink(temporary).catch(() => {});
  }
}
