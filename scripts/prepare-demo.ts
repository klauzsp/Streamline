import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDataset } from "../lib/migration/dataset";
import { selectWestvale } from "../lib/migration/guided-demo";

// Rebuild from the supplied workbooks, never a developer's cached/saved case.
async function main() {
  const data = selectWestvale(await buildDataset());
  const directory = path.join(process.cwd(), ".generated");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "westvale-demo.json"),
    JSON.stringify(data),
  );
  console.log(
    `Prepared ${data.records.length} Westvale records for deployment.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
