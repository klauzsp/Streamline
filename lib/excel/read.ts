import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
export type RawRow = { row: number; values: string[] };
export type Workbook = Record<string, RawRow[]>;
export async function readWorkbook(
  file: string,
  sheets: string[] = [],
): Promise<Workbook> {
  const python =
    process.env.PYTHON_PATH ||
    (process.platform === "darwin" ? "/usr/bin/python3" : "python3");
  const { stdout } = await promisify(execFile)(
    python,
    [path.join(process.cwd(), "scripts/read_workbook.py"), file, ...sheets],
    { maxBuffer: 180 * 1024 * 1024, timeout: 120000 },
  );
  return JSON.parse(stdout);
}
export const text = (row: RawRow, i: number) => (row.values[i] || "").trim();
