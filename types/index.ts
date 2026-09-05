export type SourceReference = {
  file: string;
  sheet: string;
  row: number;
  column: string;
};
export type Provenance = {
  value: string;
  sources: SourceReference[];
  mappingId?: string;
  rule?: string;
};
export type Fund = { name: string };
export type LegalEntity = { name: string; currency: string; targetId?: string };
export type Investor = { name: string; externalId: string; vehicle: string };
export type Deal = { name: string; currency: string };
export type Position = { name: string; deal: string };
export type GLAccount = { name: string; transactionType: string };
export type Batch = { id: string; entity: string; type: string };
export type SourceRecord = {
  id: string;
  ref: SourceReference;
  raw: string[];
  fund: string;
  entity: string;
  vehicle: string;
  investor: string;
  externalId: string;
  deal: string;
  position: string;
  account: string;
  transType: string;
  currency: string;
  entityCurrency: string;
  local: string;
  amount: string;
  batch: string;
  quantity: string;
};
export type Transaction = SourceRecord;
export type MappingKind =
  "Legal entity" | "Investor" | "Deal / position" | "Chart of accounts";
export type MappingState =
  "Exact" | "Suggested" | "Missing" | "Requires review" | "Approved";
export type Candidate = {
  id: string;
  label: string;
  values: Record<string, string>;
  evidence: SourceReference[];
};
export type Mapping = {
  id: string;
  kind: MappingKind;
  key: string;
  source: string;
  detail: string;
  status: MappingState;
  target?: Candidate;
  candidates: Candidate[];
  explanation: string;
  confidence?: number;
  evidence: SourceReference[];
  rowIds: string[];
  warning?: string;
};
export type Decision = {
  mappingId: string;
  action: "approve" | "unresolved" | "request";
  candidateId?: string;
  note: string;
  at: string;
  reviewer: string;
};
export type AuditEvent = {
  id: string;
  at: string;
  action: string;
  detail: string;
  mappingId?: string;
  reviewer: string;
};
export type ReconciliationResult = {
  id: string;
  entity: string;
  account: string;
  currency: string;
  basis: "Entity" | "Local";
  source: string;
  target: string;
  difference: string;
  sourceDebit: string;
  targetDebit: string;
  sourceCredit: string;
  targetCredit: string;
  rows: number;
  included: number;
  status: "PASS" | "WARNING" | "FAIL";
  rowIds: string[];
};
export type MigrationException = {
  id: string;
  mappingId?: string;
  title: string;
  kind: "Decision required" | "Data validation";
  severity: "High" | "Medium";
  explanation: string;
  rowIds: string[];
  totals: Record<string, string>;
};
export type TargetRecord = {
  sourceId: string;
  fields: Record<string, string>;
  provenance: Record<string, Provenance>;
  account: string;
  signedLocal: string;
  signedEntity: string;
  mappingIds: string[];
  batchRule: string;
};
export type WorkbookInfo = {
  name: string;
  role: string;
  sheets: { name: string; rows: number; columns: string[] }[];
};
export type Dataset = {
  records: SourceRecord[];
  mappings: Mapping[];
  catalog: Record<MappingKind, Candidate[]>;
  batchPriority: Record<string, number>;
  files: WorkbookInfo[];
  headers: string[];
  allocationRule: string;
};
export type Migration = {
  id: string;
  name: string;
  sourceAdmin: string;
  targetSystem: string;
  date: string;
  baseCurrency: string;
  createdAt: string;
  revision: number;
  decisions: Decision[];
  suggestions: Record<
    string,
    {
      candidates: string[];
      explanation: string;
      provider: string;
      confidence?: number;
    }
  >;
  audit: AuditEvent[];
  datasetFile: string;
};
export type Result = {
  mappings: Mapping[];
  targets: TargetRecord[];
  exceptions: MigrationException[];
  reconciliation: ReconciliationResult[];
  blocked: string[];
  stats: {
    records: number;
    eligible: number;
    blocked: number;
    mappings: number;
    gaps: number;
    passed: number;
    failed: number;
    readiness: number;
    files: number;
  };
  verified: boolean;
};
