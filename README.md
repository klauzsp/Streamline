# Handover

A fund administration migration MVP built around the supplied Kestrel workbooks.

**Upload → Understand → Map → Reconcile → Review → Export**

## Run

```bash
npm install
npm run preprocess
npm run build
npm start
```

Open **http://localhost:3000** and select **Load Demo Migration**.

For development, use `npm run dev`. The scripts use Next.js's webpack compiler because Turbopack's CSS worker cannot bind its internal port in this workspace's sandbox. Stop the development server before building; use the production server for the demo.

Requires Node.js 22+ and Python 3 with the standard library. No Python packages, database, AI key or Daytona account are required. On macOS the reader uses `/usr/bin/python3`; set `PYTHON_PATH` to override it. Launch commands from the repository root so the reader can find `data/` and `scripts/`.

## What works

- Multiple migration cases, a dashboard, and a drag-and-drop creation form.
- Deterministic XLSX inspection and cached demo processing of **33,902 source records**.
- Entity, investor, deal/position and chart-of-accounts crosswalks from the reference workbook.
- Exact, suggested, missing, requires-review and approved mapping states; candidate selection, reviewer rationale, request-information and reopening actions.
- Exception investigation using reference evidence offline, or Gemini when configured.
- Batch override using the lowest numeric priority from Batch Preference; incomplete transaction mappings hold their batch.
- Both local and entity-currency reconciliation, separated by entity, mapped account and currency. Checks cover net movements, gross debits/credits and row completeness.
- Source evidence drawers, per-field provenance, persistent decision history and audit events.
- A regenerated 12-sheet XLSX package, with verified export blocked until every source row is eligible and every check passes. Draft review packages remain available.

The reference **Upload Template is never used to generate loader records**. Source files are not modified.

## Three-minute demo

1. Load the demo. Show 33,902 source rows and the actual readiness score.
2. Open **Exceptions**. Open the first suggested deal/position mapping: source position `Clanford`, context `Operations (USD)`.
3. Explain that the source has no position ID; the reference provides a deal-only mapping. Inspect a source row, select the proposal and enter a demo reviewer rationale confirming that no position is needed. Approve it.
4. Readiness rises from **17% to 63%**, and eligible rows rise from **6,078 to 21,548**. These are calculated results, not scripted counters.
5. Open the account gap for **40070 - Interest Income - Bank / Expense: Administration Fees**. Click **Investigate source evidence**. The Mapping Gaps sheet supplies an unapproved proposal. Review and approve with a rationale.
6. Rerun reconciliation; open a failed check to see exact amounts and held-row coverage.
7. Download the **draft review package**, showing the loader, exceptions, reconciliation and source audit.

The all-entity source has more scope than the reference tranche. A fresh case correctly starts with **139 mapping decisions and 150 exceptions**. Two demonstration approvals do **not** resolve the entire dataset. Verified export remains gated; there is no artificial “approve everything” shortcut. Tests also exercise a fully resolved case and its verified-export path.

## Gemini later

Copy `.env.example` to `.env.local`, then choose one configuration and restart the server.

**Gemini Developer API / AI Studio key:**

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-flash
```

**Vertex AI with application default credentials:**

```dotenv
AI_PROVIDER=vertex
GOOGLE_CLOUD_PROJECT=your-project
GOOGLE_CLOUD_LOCATION=global
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
GEMINI_MODEL=gemini-2.5-flash
```

Alternatively, Vertex Express mode accepts `AI_PROVIDER=vertex` plus its own `GEMINI_API_KEY`, without a project. An AI Studio key and a Vertex key are different provider configurations. The model name is configurable.

The adapter calls the configured model only when a reviewer starts an investigation. It sends a bounded source sample and existing candidates, validates structured JSON with Zod, rejects invented candidate IDs and records the action. AI never calculates totals or approves a mapping. Live Gemini calls have not been tested because no Gemini credential was supplied.

Daytona is not used: local processing already handles this dataset. No supplied credential is stored in this project.

## Data and implementation

Read [dataset findings and architecture](docs/architecture.md) and [raw inspection results](docs/workbook-inspection.json).

| Module                     | Responsibility                                                      |
| -------------------------- | ------------------------------------------------------------------- |
| `scripts/read_workbook.py` | Read raw XLSX XML values as strings, retaining original row numbers |
| `lib/excel`                | Reader bridge and workbook export                                   |
| `lib/migration`            | Canonical records, transformation, persistence and view models      |
| `lib/mappings`             | Composite-key crosswalks and deterministic IDs                      |
| `lib/reconciliation`       | Exact decimal arithmetic and coverage checks                        |
| `lib/agents`               | Bounded evidence tools and investigation                            |
| `lib/vertex`               | Server-side Gemini / Vertex adapter and response schema             |
| `types`                    | Canonical domain types                                              |
| `app`                      | Review UI and API routes                                            |

Local cases, decisions and caches live in `.local/`, which is gitignored. Decisions are saved atomically, serialized per case within one process, and protected by revision checks. Existing demo cases use the versioned demo dataset cache. This is a local, single-user application; it has no authentication or distributed locking.

Monetary amounts remain exact decimal strings from the XLSX XML through Decimal.js and the generated workbook. Excel amount cells intentionally contain **text**, avoiding a binary floating-point roundtrip. Two-decimal displays are presentation only; evidence drawers show exact values. The source signed amount becomes an absolute loader amount plus `Is Debit`, and reconciliation reconstructs the signed target value from those loader fields.

The target sample supplies its single investor allocation rule (`Eastbury Trentbeck`); source allocation values remain available in the raw record. Quantity and supplier defaults follow the account crosswalk. A live Corvus import adapter, numeric-cell rounding policy and target-system master-data creation remain outside this MVP.

New uploads support the supplied 43-column investor-level GL schema, using the provided crosswalks and target sample. Unsupported layouts and non-XLSX files are rejected explicitly. This MVP does not claim arbitrary Excel/PDF parsing.

## Validate

```bash
npm test
npm run build
```

Tests cover full-dataset coverage, an actual approval increasing readiness, sub-cent amounts, debit/credit signs, zero-net missing rows, changed target amounts, batch priorities, invalid source data, approval reopening, export gating, workbook roundtrips and AI JSON validation.

For browser checks, start the production server first:

```bash
npx playwright install chromium
npm run test:browser
```

Optionally set `CHROMIUM_PATH` to an existing Chromium executable. The browser check creates a demo case and saves screenshots plus a draft workbook in `artifacts/`. Demo review notes are explicitly labelled as test decisions.

## Implementation references

- [Google: structured JSON generation](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/generativeaionvertexai-gemini-controlled-generation-response-schema-2)
- [Google: express-mode REST endpoints](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/express-mode/api-reference)
- [SheetJS: official current package distribution](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)
