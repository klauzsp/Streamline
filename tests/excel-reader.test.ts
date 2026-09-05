import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { readWorkbook } from "../lib/excel/read";

test("Node workbook reader preserves decimal text, sparse cells, shared strings and cached formula values", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "streamline-reader-"));
  try {
    const file = path.join(dir, "input.xlsx");
    const files = {
      "xl/workbook.xml": '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="GL" r:id="r1"/><sheet name="Ignored" r:id="r2"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/missing.xml"/></Relationships>',
      "xl/sharedStrings.xml": '<sst><si><r><t>Fund &amp; </t></r><r><t>Company</t></r></si></sst>',
      "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="3"><c r="A3" t="s"><v>0</v></c><c r="C3"><v>2653876.599999999</v></c><c r="D3"><f>1+1</f><v>2</v></c><c r="E3" t="inlineStr"><is><t>  original  </t></is></c><c r="F3"><v>46136</v></c></row><row r="8"/></sheetData></worksheet>',
    };
    await writeFile(file, zipSync(Object.fromEntries(Object.entries(files).map(([k,v]) => [k,strToU8(v)]))));
    assert.deepEqual(await readWorkbook(file,["GL"]), { GL: [{ row: 3, values: ["Fund & Company", "", "2653876.599999999", "2", "  original  ", "46136"] }, { row: 8, values: [] }] });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
