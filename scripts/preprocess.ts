import { demoDataset } from "../lib/migration/dataset";
import { runMigration } from "../lib/migration/engine";
async function main() {
  const data = await demoDataset();
  const result = runMigration(data, {
    id: "demo",
    name: "Kestrel",
    sourceAdmin: "Legacy Admin",
    targetSystem: "Corvus",
    date: "2026-06-30",
    baseCurrency: "USD",
    createdAt: new Date().toISOString(),
    revision: 0,
    decisions: [],
    suggestions: {},
    audit: [],
    datasetFile: "demo",
  });
  console.log(
    JSON.stringify(
      {
        stats: result.stats,
        exceptions: result.exceptions.length,
        kinds: Object.fromEntries(
          [
            "Legal entity",
            "Investor",
            "Deal / position",
            "Chart of accounts",
          ].map((k) => [
            k,
            result.mappings.filter(
              (m) => m.kind === k && !["Exact", "Approved"].includes(m.status),
            ).length,
          ]),
        ),
        samples: result.mappings
          .filter((m) => !["Exact", "Approved"].includes(m.status))
          .slice(0, 6)
          .map((m) => ({
            source: m.source,
            detail: m.detail,
            status: m.status,
            candidates: m.candidates.length,
          })),
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
