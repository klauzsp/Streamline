# Dataset findings and MVP architecture

Inspected all sheets before implementing (raw samples in workbook-inspection.json).

- Source: Investor-Level GL, 33,902 data rows, 43 columns; a second sheet is a helper/entity list. Duplicate Static Date and GL Date headers must be distinguished by column position. Source amounts are signed; retain the original XML numeric strings, including sub-cent residuals. Local amount is AB, entity amount AF; debit/credit columns are AC/AD and AG/AH.
- Phase I: 94,454 rows, 27 loader columns. It supplies the target schema, not migration records.
- Reference: 18,929 loader rows plus 13 supporting sheets. Source contains all entities; reference is a tranche, so reproducing its row count by dropping unmatched source rows would be incorrect.
- LE Mapping uses row 2 headers: source entity → target name, ID and currency.
- Investor Mapping: join vehicle + RFX external reference (and verify investor name); target specific ID identifies the investor account. Name alone is insufficient.
- Deal Mapping: join deal + position + currency; deal-only rows coexist with position rows.
- CoA Mapping: source account + transaction type → target account, default/debit transaction types, quantity policy, supplier/UDF and default batch type. Some wildcard rows have no source account; these require explicit review.
- Batch Preference: lower numeric priority wins across all transaction types within an entity/batch. Unranked types block instead of receiving an invented priority.
- Mapping Gaps: 11 bank-interest/admin-fee rows have an unapproved proposed target; 8 partner-transfer/legal-fee rows have no proposed target. These are decision requests, not assumed corruption.
- Movements Rec aggregates debit, credit and net by entity/target account. This implementation additionally separates currency and tests both local and entity amounts, row coverage and gross flows. Zero net cannot conceal omitted offsetting rows.
- Known incomplete master lists do not invalidate an explicit reference crosswalk. Such mappings retain a warning; absent target IDs still block. Scope is explicitly all uploaded source rows in this MVP.

## Modules

Next.js App Router + TypeScript + Tailwind, local server-side JSON case storage, Python stdlib XML reader (no floating-point conversion), SheetJS workbook writer, Decimal.js exact sums. One source row creates one canonical transaction; every row is either eligible or blocked. No source edits. Each target field retains source-column references and applied mapping IDs; mappings retain reference-sheet rows. Cached demo avoids repeated workbook parsing. Uploaded GLs must match the documented schema; unsupported formats fail clearly.

Gemini is optional, server-side, using Vertex AI (ADC or express API key) or the Gemini Developer API. It receives bounded deterministic evidence and returns validated candidate IDs only. Offline investigation uses documented mapping gaps and matching transaction types, clearly labelled as deterministic suggestions. Approval always requires a human and a rationale. No external service is called without configuration.

Export recomputes from persisted decisions. A verified package requires every source row mapped and all checks passed. A draft review package is always available and explicitly records omitted loader rows as blocked exceptions. No reference loader values are read by the transformation engine. Amount cells are decimal strings in Excel to preserve exact values; a live Corvus import adapter and numeric-cell rounding policy are outside this MVP.

Local single-user MVP: no authentication, distributed storage or production upload isolation. Daytona is optional and unnecessary for these files; no credential is committed.

## Subsequent inspection findings

Many source rows use the anonymised position label `Clanford` with no source position ID. These are suggested deal-only mappings when an exact deal/currency crosswalk exists; they require reviewer approval. This is deliberately not automatic null normalization. The entire target sample uses one allocation rule (`Eastbury Trentbeck`); the loader uses that template default, preserving the original source rule in canonical raw cells.

Baseline: 6,078 eligible records, 139 mapping decisions, 150 exceptions, 492 passed checks out of 2,068. A reviewer approval of the USD operations deal-only proposal raises eligible rows to 21,548. No source rows are removed.

Reconciliation and exception sheets include up to 100 representative source IDs per group to stay within Excel cell limits; Source References includes every record. Transformation Audit stores compact field provenance; mapping sheets retain full reference workbook/sheet/row evidence.
