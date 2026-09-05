import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";
const data = JSON.parse(await readFile(".local/demo-dataset-v3.json", "utf8"));
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  workbook,
  XLSX.utils.aoa_to_sheet([
    data.files[0].sheets[0].columns,
    ...data.records.slice(0, 2).map((r) => r.raw),
  ]),
  "Investor-Level GL",
);
await writeFile(
  ".local/upload-test.xlsx",
  XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://127.0.0.1:3000/advanced");
await page.getByRole("button", { name: "New migration", exact: true }).click();
await page
  .getByLabel("Client / fund name")
  .fill("Upload validation · two real source rows");
await page
  .getByLabel("Source workbook", { exact: true })
  .setInputFiles(".local/upload-test.xlsx");
await page.getByRole("button", { name: "Create & process migration" }).click();
await page
  .getByRole("heading", { name: "Migration overview", exact: true })
  .waitFor({ timeout: 90000 });
await page
  .getByRole("button", { name: "Export package", exact: true })
  .first()
  .click();
const verified = page.getByRole("button", {
  name: "Download verified package",
});
await verified.waitFor();
if (await verified.isDisabled())
  throw Error("Fully mapped uploaded file did not verify");
const pending = page.waitForEvent("download", { timeout: 60000 });
await verified.click();
const file = await pending;
await file.saveAs("artifacts/verified-upload-test.xlsx");
const wb = XLSX.read(await readFile("artifacts/verified-upload-test.xlsx"), {
  type: "buffer",
});
const summary = XLSX.utils.sheet_to_json(wb.Sheets["Migration Summary"])[0];
if (
  summary.Status !== "VERIFIED" ||
  summary.SourceRows !== 2 ||
  summary.LoaderRows !== 2
)
  throw Error("Verified package summary is wrong");
const rows = XLSX.utils.sheet_to_json(wb.Sheets["Upload Template"]);
if (rows[0]["Investor Amount (Local)"] !== data.records[0].local)
  throw Error("Upload roundtrip changed original amount");
console.log(
  "Upload browser flow passed: two real source rows parsed, mapped, reconciled, and downloaded as a verified package.",
);
await browser.close();
