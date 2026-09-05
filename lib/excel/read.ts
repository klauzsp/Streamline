import { readFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { SaxesParser } from "saxes";

export type RawRow = { row: number; values: string[] };
export type Workbook = Record<string, RawRow[]>;

// Read XML text directly: passing amounts through JS numbers loses precision.
export async function readWorkbook(
  file: string,
  sheets: string[] = [],
): Promise<Workbook> {
  let expanded = 0;
  const zip = unzipSync(await readFile(file), {
    filter(entry) {
      expanded += entry.originalSize;
      if (expanded > 450_000_000)
        throw Error("Workbook expands beyond 450 MB limit");
      return true;
    },
  });
  const xml = (name: string) => {
    if (!zip[name]) throw Error(`Workbook is missing ${name}`);
    return strFromU8(zip[name]);
  };
  const strings: string[] = [];
  if (zip["xl/sharedStrings.xml"]) {
    const p = new SaxesParser({ xmlns: true });
    let value = "",
      inText = false;
    p.on("opentag", (t) => {
      if (t.local === "si") value = "";
      if (t.local === "t") inText = true;
    });
    p.on("text", (t) => {
      if (inText) value += t;
    });
    p.on("closetag", (t) => {
      if (t.local === "t") inText = false;
      if (t.local === "si") strings.push(value);
    });
    p.write(xml("xl/sharedStrings.xml")).close();
  }
  const links = new Map<string, string>();
  const rel = new SaxesParser();
  rel.on("opentag", (t) => {
    if (t.name === "Relationship")
      links.set(String(t.attributes.Id), String(t.attributes.Target));
  });
  rel.write(xml("xl/_rels/workbook.xml.rels")).close();
  const selected: { name: string; target: string }[] = [];
  const workbook = new SaxesParser({ xmlns: true });
  workbook.on("opentag", (t) => {
    if (t.local !== "sheet") return;
    const attrs = Object.values(t.attributes);
    const name = attrs.find((a) => a.local === "name")!.value;
    const target = links.get(attrs.find((a) => a.local === "id")!.value);
    if (!target) throw Error("Workbook sheet relationship is missing");
    if (!sheets.length || sheets.includes(name))
      selected.push({
        name,
        target: target.startsWith("/")
          ? target.slice(1)
          : path.posix.normalize("xl/" + target),
      });
  });
  workbook.write(xml("xl/workbook.xml")).close();
  const result: Workbook = {};
  for (const { name, target } of selected) {
    const rows: RawRow[] = [];
    const p = new SaxesParser({ xmlns: true });
    let row: RawRow | undefined,
      col = 0,
      type = "",
      value = "",
      inline = "",
      capture = "";
    p.on("opentag", (t) => {
      const attr = (name: string) =>
        Object.values(t.attributes).find((a) => a.local === name)?.value || "";
      if (t.local === "row") row = { row: Number(attr("r")), values: [] };
      if (t.local === "c") {
        col = 0;
        for (const c of (
          attr("r").match(/^[A-Za-z]+/)?.[0] || "A"
        ).toUpperCase())
          col = col * 26 + c.charCodeAt(0) - 64;
        type = attr("t");
        value = "";
        inline = "";
      }
      if (t.local === "v" || t.local === "t") capture = t.local;
    });
    p.on("text", (t) => {
      if (capture === "v") value += t;
      if (capture === "t") inline += t;
    });
    p.on("closetag", (t) => {
      if (t.local === "v" || t.local === "t") capture = "";
      if (t.local === "c" && row && col > 0 && col <= 200) {
        while (row.values.length < col) row.values.push("");
        row.values[col - 1] =
          type === "s" ? (strings[Number(value)] ?? "") : value || inline;
      }
      if (t.local === "row" && row) {
        rows.push(row);
        row = undefined;
      }
    });
    p.write(xml(target)).close();
    result[name] = rows;
  }
  return result;
}
export const text = (row: RawRow, i: number) => (row.values[i] || "").trim();
