import path from "node:path";
import { tmpdir } from "node:os";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { readWorkbook, Workbook } from "@/lib/excel/read";
import { buildMappings, id } from "@/lib/mappings/build";
import { Dataset, SourceRecord, WorkbookInfo } from "@/types";
export const localDir = process.env.VERCEL
  ? path.join(tmpdir(), "streamline")
  : path.join(process.cwd(), ".local");
const referenceSheets = [
  "LE Mapping",
  "Investor Mapping",
  "Deal Mapping",
  "CoA Mapping",
  "Entity Listing",
  "Investors List",
  "Deals List",
  "Corvus CoA",
  "Batch Preference",
  "Mapping Gaps",
];
export function canonicalize(wb: Workbook, file: string): SourceRecord[] {
  const sheet = Object.keys(wb).find(
    (s) =>
      wb[s][0]?.values[0] === "Fund Family" &&
      wb[s][0]?.values[3] === "Legal Entity",
  );
  if (!sheet)
    throw new Error(
      "Unsupported source schema. Upload the 43-column investor-level GL workbook; expected Fund Family in A and Legal Entity in D.",
    );
  const rows = wb[sheet];
  const required: Record<number, string> = {
    5: "Deal Name",
    7: "Position",
    14: "Batch ID",
    19: "GL Account",
    22: "Trans Type",
    26: "Transaction Currency",
    27: "Amount (Local Currency)",
    30: "Legal Entity Currency",
    31: "Amount (Entity Currency)",
    35: "Investor",
    36: "RFX ID",
  };
  for (const [i, h] of Object.entries(required))
    if (rows[0].values[Number(i)] !== h)
      throw new Error(
        `Unsupported source layout: column ${Number(i) + 1} must be ${h}.`,
      );
  const records = rows
    .slice(1)
    .filter((r) => r.values.some((v) => v !== ""))
    .map((r) => {
      const v = r.values;
      return {
        id: id("row", file + sheet + r.row),
        ref: { file, sheet, row: r.row, column: "A:AQ" },
        raw: v,
        fund: v[0] || "",
        entity: v[3] || "",
        vehicle: v[4] || "",
        deal: v[5] || "",
        position: v[7] || "",
        account: v[19] || "",
        transType: v[22] || "",
        currency: v[26] || "",
        local: v[27] || "",
        entityCurrency: v[30] || "",
        amount: v[31] || "",
        investor: v[35] || "",
        externalId: v[36] || "",
        batch: v[14] || "",
        quantity: v[37] || "0",
      };
    });
  if (!records.length)
    throw new Error("Source workbook contains no GL records.");
  return records;
}
function info(wb: Workbook, name: string, role: string): WorkbookInfo {
  return {
    name,
    role,
    sheets: Object.entries(wb).map(([name, rows]) => ({
      name,
      rows: Math.max(0, rows.length - 1),
      columns: rows[0]?.values || [],
    })),
  };
}
let demoPromise: Promise<Dataset> | undefined;
export async function buildDataset(
  sourcePath?: string,
  sourceName?: string,
): Promise<Dataset> {
  const output = path.join(process.cwd(), "data/output");
  const source = path.join(process.cwd(), "data/source");
  const refName = (await readdir(output)).find((f) => f.endsWith(".xlsx"))!;
  const srcName =
    sourceName ||
    (await readdir(source)).find((f) => f.startsWith("Investor-Level"))!;
  const sampleName = (await readdir(source)).find((f) =>
    f.startsWith("Phase I"),
  )!;
  const [raw, ref, sample] = await Promise.all([
    readWorkbook(sourcePath || path.join(source, srcName)),
    readWorkbook(path.join(output, refName), referenceSheets),
    readWorkbook(path.join(source, sampleName)),
  ]);
  const records = canonicalize(raw, srcName);
  const sampleRows = sample[Object.keys(sample)[0]];
  const allocationRules = [
    ...new Set(
      sampleRows
        .slice(1)
        .map((r) => r.values[19])
        .filter(Boolean),
    ),
  ];
  if (allocationRules.length !== 1)
    throw new Error(
      "Target sample must define a single investor allocation rule for this adapter.",
    );
  return {
    records,
    allocationRule: allocationRules[0],
    ...buildMappings(records, ref, refName),
    headers: sample[Object.keys(sample)[0]][0].values.slice(0, 27),
    files: [
      info(raw, srcName, "Source GL"),
      info(sample, sampleName, "Target schema"),
      info(ref, refName, "Reference crosswalks"),
    ],
  };
}
export async function demoDataset(): Promise<Dataset> {
  if (!demoPromise)
    demoPromise = (async () => {
      await mkdir(localDir, { recursive: true });
      const file = path.join(localDir, "demo-dataset-v3.json");
      try {
        return JSON.parse(await readFile(file, "utf8"));
      } catch {
        const data = await buildDataset();
        await writeFile(file, JSON.stringify(data));
        return data;
      }
    })().catch((e) => {
      demoPromise = undefined;
      throw e;
    });
  return demoPromise;
}
