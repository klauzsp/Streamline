import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(process.env.BASE_URL || "http://127.0.0.1:3000", { waitUntil: "networkidle" });
await page.screenshot({ path: "artifacts/guided-home.png", fullPage: true });
await page.getByRole("button", { name: "Try the 3-minute demo" }).click();
await page
  .getByRole("button", { name: "Open Westvale’s handover", exact: true })
  .click();
await page
  .getByRole("heading", { name: "Westvale’s handover" })
  .waitFor({ timeout: 60000 });
const caseId = new URL(page.url()).searchParams.get("case");
await writeFile("artifacts/guided-test-case.txt", caseId);
await page.screenshot({ path: "artifacts/guided-intake.png", fullPage: true });
await page.getByRole("button", { name: "Review the two decisions" }).click();
await page
  .getByRole("heading", {
    name: "Do these entries belong to the fund or a specific investment?",
    exact: true,
  })
  .waitFor();
await page
  .getByRole("button", { name: "Ask previous administrator", exact: true })
  .click();
const requestDownload = page.waitForEvent("download");
await page.getByRole("button", { name: "Save & download request" }).click();
await (await requestDownload).saveAs("artifacts/guided-clarification.txt");
await page.locator(".gd-busy").waitFor({ state: "hidden", timeout: 60000 });
let result = await page.evaluate(async (id) => {
  const response = await fetch("/api/migrations/" + id);
  if (!response.ok)
    throw new Error("Persistence request failed: " + response.status);
  return response.json();
}, caseId);
if (result.stats.eligible !== 132 || result.verified)
  throw Error("Request incorrectly released records");
await page
  .locator(".gd-decision-nav")
  .getByRole("button", { name: /Do these entries belong to the fund/ })
  .click();
await page
  .getByLabel("Administrator response / reviewer note (required)")
  .fill(
    "DEMO TEST RESPONSE: the previous administrator confirmed that these are fund-level entries with no investment position.",
  );
await page.getByRole("checkbox").check();
await page
  .getByRole("button", { name: "Use the operations record", exact: true })
  .click();
await page
  .getByRole("heading", { name: "352 more records are ready." })
  .waitFor({ timeout: 60000 });
await page.screenshot({ path: "artifacts/guided-impact.png", fullPage: true });
await page.getByRole("button", { name: "Next decision · 1 remaining" }).click();
await page
  .getByRole("heading", { name: "Is this an administration fee?", exact: true })
  .waitFor();
if (process.env.TEST_LIVE_GEMINI === "true") {
  await page
    .getByRole("button", { name: "Investigate with Gemini", exact: true })
    .click();
  await page
    .getByText("Gemini’s investigation", { exact: true })
    .waitFor({ timeout: 60000 });
}
await page.getByText("Show me the evidence", { exact: true }).click();
await page.screenshot({
  path: "artifacts/guided-decision.png",
  fullPage: true,
});
await page.getByRole("checkbox").check();
await page
  .getByLabel("Reviewer note (optional)")
  .fill(
    "DEMO TEST: reviewer confirms the documented administration-fee proposal.",
  );
await page
  .getByRole("button", { name: "Confirm this classification", exact: true })
  .click();
await page
  .getByRole("heading", { name: "44 more records are ready." })
  .waitFor({ timeout: 60000 });
await page.getByRole("button", { name: "See the checked package" }).click();
await page
  .getByRole("heading", { name: "Ready for your import review." })
  .waitFor();
const pending = page.waitForEvent("download");
await page
  .getByRole("button", { name: "Download verified demo package", exact: true })
  .click();
await (await pending).saveAs("artifacts/Westvale-verified-demo.xlsx");
await page.locator(".gd-busy").waitFor({ state: "hidden", timeout: 60000 });
await page.screenshot({
  path: "artifacts/guided-complete.png",
  fullPage: true,
});
const wb = XLSX.read(await readFile("artifacts/Westvale-verified-demo.xlsx"), {
  type: "buffer",
});
const summary = XLSX.utils.sheet_to_json(wb.Sheets["Migration Summary"])[0];
if (
  summary.SourceRows !== 528 ||
  summary.LoaderRows !== 528 ||
  summary.OutsideDemoScope !== 33374 ||
  summary.Status !== "VERIFIED"
)
  throw Error("Incorrect scoped export");
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: "artifacts/guided-mobile.png", fullPage: true });
if (
  await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
)
  throw Error("Mobile page overflows horizontally");
await page.reload();
await page.getByRole("heading", { name: "Westvale’s handover" }).waitFor();
result = await page.evaluate(async (id) => {
  const response = await fetch("/api/migrations/" + id);
  if (!response.ok)
    throw new Error("Persistence request failed: " + response.status);
  return response.json();
}, caseId);
if (
  process.env.TEST_LIVE_GEMINI === "true" &&
  !Object.values(result.migration.suggestions).some(
    (s) => s.provider.startsWith("Gemini") && s.trace?.length >= 2,
  )
)
  throw Error("Two-stage live investigation was not recorded");
if (!result.verified || result.guidance.remaining !== 0)
  throw Error("Approvals did not persist");
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "Guided browser flow passed: two real decisions, clarification request holds rows, live investigation (if enabled), approvals, verified scoped export, reload persistence and mobile layout.",
);
await browser.close();
