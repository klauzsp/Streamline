import { chromium } from "@playwright/test";
const localBrowser = process.env.CHROMIUM_PATH;
const browser = await chromium.launch({
  headless: true,
  ...(localBrowser ? { executablePath: localBrowser } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });
await page.screenshot({ path: "artifacts/dashboard.png", fullPage: true });
await page
  .getByRole("button", { name: /^Load demo$|^Load Demo Migration$/i })
  .first()
  .click();
await page
  .getByRole("heading", { name: "Migration overview", exact: true })
  .waitFor({ timeout: 60000 });
await page.screenshot({ path: "artifacts/overview.png", fullPage: true });
await page.getByRole("button", { name: /Open exception workspace/ }).click();
await page
  .getByRole("button", { name: /Approve proposed chart of accounts mapping/ })
  .click();
await page
  .getByRole("heading", { name: "Mapping decision", exact: true })
  .waitFor();
await page.screenshot({ path: "artifacts/review.png" });
await page
  .getByRole("button", { name: "Investigate source evidence", exact: true })
  .click();
await page
  .getByText("Evidence retrieved. Review the candidate before approving.")
  .waitFor({ timeout: 60000 });
await page
  .getByPlaceholder(
    "Explain why this target is appropriate, or what needs clarification…",
  )
  .fill(
    "Demo reviewer: confirmed the administration fee target proposed in Mapping Gaps row 2.",
  );
await page
  .getByRole("button", { name: "Approve mapping", exact: true })
  .click();
await page
  .getByText("Review decision saved. Readiness and reconciliation updated.")
  .waitFor({ timeout: 60000 });
await page
  .getByRole("button", { name: "Mapping workspace", exact: true })
  .click();
await page.getByRole("button", { name: "Reviewed", exact: true }).click();
await page
  .getByText("40070 - Interest Income - Bank", { exact: true })
  .waitFor();
await page
  .getByRole("button", { name: "Exceptions", exact: false })
  .first()
  .click();
await page
  .getByRole("button", { name: /Approve proposed deal \/ position mapping/ })
  .filter({ hasText: "Operations (USD)" })
  .first()
  .click();
await page
  .getByRole("heading", { name: "Mapping decision", exact: true })
  .waitFor();
await page
  .getByPlaceholder(
    "Explain why this target is appropriate, or what needs clarification…",
  )
  .fill(
    "Demo reviewer: source has no position ID; approve the documented USD operations deal-only mapping for this test.",
  );
await page
  .getByRole("button", { name: "Approve mapping", exact: true })
  .click();
await page
  .getByRole("heading", { name: "Mapping decision", exact: true })
  .waitFor({ state: "hidden", timeout: 60000 });
await page.getByRole("button", { name: "Reconciliation", exact: true }).click();
await page
  .getByRole("button", { name: "Run reconciliation", exact: true })
  .click();
await page
  .getByText("Reconciliation completed using exact decimal arithmetic.")
  .waitFor({ timeout: 60000 });
await page.screenshot({ path: "artifacts/reconciliation.png", fullPage: true });
await page
  .getByRole("button", { name: "Export package", exact: true })
  .first()
  .click();
await page
  .getByRole("button", { name: "Download verified package" })
  .isDisabled()
  .then((x) => {
    if (!x) throw Error("Verified export incorrectly enabled");
  });
const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
await page.getByRole("button", { name: "Download draft review" }).click();
const download = await downloadPromise;
await download.saveAs("artifacts/draft-review.xlsx");
await page.locator(".busy-toast").waitFor({ state: "hidden", timeout: 60000 });
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Toggle navigation" }).click();
await page.getByRole("button", { name: "Overview", exact: true }).click();
await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "Browser flow passed: demo, evidence, investigation, approval, reconciliation, draft download, mobile layout.",
);
await browser.close();
