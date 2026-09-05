"use client";
import { useEffect, useState, useCallback } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  LayoutDashboard,
  GitBranch,
  Scale,
  TriangleAlert,
  Files,
  Download,
  Upload,
  ShieldCheck,
  Activity,
  X,
  Loader2,
  Sparkles,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  PanelLeft,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import type { CaseView } from "@/lib/migration/view";
import type {
  Migration,
  Result,
  Mapping,
  Candidate,
  SourceRecord,
  TargetRecord,
  ReconciliationResult,
} from "@/types";
type Tab =
  | "Overview"
  | "Mapping workspace"
  | "Reconciliation"
  | "Exceptions"
  | "Source files"
  | "Audit trail"
  | "Export package";
type Summary = { migration: Migration; stats: Result["stats"] };
type Evidence = {
  mapping?: Mapping;
  check?: ReconciliationResult;
  total: number;
  rows: { source: SourceRecord; target?: TargetRecord }[];
  catalog: Candidate[];
};
const fmt = (n: number) => n.toLocaleString("en-GB");
const money = (s: string) =>
  Number(s).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const nav = [
  { label: "Overview" as Tab, icon: LayoutDashboard },
  { label: "Mapping workspace" as Tab, icon: GitBranch },
  { label: "Reconciliation" as Tab, icon: Scale },
  { label: "Exceptions" as Tab, icon: TriangleAlert },
];
const steps = ["Upload", "Understand", "Map", "Reconcile", "Review", "Export"];
function Badge({ status }: { status: string }) {
  return (
    <span
      className={
        "badge " +
        (["Exact", "Approved", "PASS", "Verified", "Included"].includes(status)
          ? "green"
          : ["Missing", "FAIL", "High", "Blocked"].includes(status)
            ? "red"
            : [
                  "Suggested",
                  "Review required",
                  "Requires review",
                  "Medium",
                ].includes(status)
              ? "amber"
              : "neutral")
      }
    >
      <i />
      {status === "PASS" ? "Passed" : status === "FAIL" ? "Failed" : status}
    </span>
  );
}
async function jsonFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok) throw Error(body.error || "Request failed");
  return body;
}
export default function Workspace() {
  const [cases, setCases] = useState<Summary[]>([]),
    [view, setView] = useState<CaseView | null>(null),
    [tab, setTab] = useState<Tab>("Overview"),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [create, setCreate] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [kind, setKind] = useState("All types"),
    [page, setPage] = useState(0),
    [detail, setDetail] = useState<Evidence | null>(null),
    [candidate, setCandidate] = useState(""),
    [note, setNote] = useState(""),
    [targetSearch, setTargetSearch] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [mobile, setMobile] = useState(false),
    [expandedRow, setExpandedRow] = useState("");
  useEffect(() => {
    if (!detail && !create) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetail(null);
        setCreate(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [detail, create]);
  const refreshCases = useCallback(
    async () => setCases(await jsonFetch("/api/migrations")),
    [],
  );
  useEffect(() => {
    refreshCases().catch((e) => setError(e.message));
  }, [refreshCases]);
  const openCase = async (id: string) => {
    setBusy("Opening migration");
    setError("");
    try {
      setView(await jsonFetch("/api/migrations/" + id));
      setTab("Overview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const navigate = (next: Tab) => {
    setTab(next);
    setSearch("");
    setFilter("All");
    setKind("All types");
    setPage(0);
    setDetail(null);
    setMobile(false);
  };
  async function loadDemo() {
    setBusy("Inspecting source and preparing migration");
    setError("");
    try {
      const form = new FormData();
      Object.entries({
        name: "Kestrel · Q2 migration",
        sourceAdmin: "Legacy Admin",
        targetSystem: "Corvus",
        date: "2026-06-30",
        baseCurrency: "USD",
        demo: "true",
      }).forEach(([k, v]) => form.set(k, v));
      const m = await jsonFetch("/api/migrations", {
        method: "POST",
        body: form,
      });
      await refreshCases();
      await openCase(m.id);
      setCreate(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function submitCase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("Inspecting workbook and applying crosswalks");
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      if (file) form.set("file", file);
      const m = await jsonFetch("/api/migrations", {
        method: "POST",
        body: form,
      });
      await refreshCases();
      await openCase(m.id);
      setCreate(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function evidence(query: string) {
    if (!view) return;
    setBusy("Loading source evidence");
    setError("");
    try {
      const e: Evidence = await jsonFetch(
        `/api/migrations/${view.migration.id}?${query}`,
      );
      setDetail(e);
      setCandidate(e.mapping?.target?.id || e.mapping?.candidates[0]?.id || "");
      setNote("");
      setTargetSearch("");
      setExpandedRow("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function action(action: string, extra: Record<string, unknown> = {}) {
    if (!view) return;
    setBusy(
      action === "investigate"
        ? "Investigating source evidence"
        : action === "export"
          ? "Building migration workbook"
          : "Applying decision and reconciling",
    );
    setError("");
    try {
      const res = await fetch("/api/migrations/" + view.migration.id, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          revision: view.migration.revision,
          ...extra,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw Error(body.error || "Action failed");
      }
      if (action === "export") {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = extra.verified
          ? "verified-migration.xlsx"
          : "draft-review.xlsx";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setView(await jsonFetch("/api/migrations/" + view.migration.id));
        setNotice("Migration workbook downloaded.");
      } else {
        const next: CaseView = await res.json();
        setView(next);
        if (action === "investigate" && detail?.mapping) {
          const updated: Evidence = await jsonFetch(
            `/api/migrations/${view.migration.id}?mapping=${detail.mapping.id}`,
          );
          setDetail(updated);
          setCandidate(updated.mapping?.candidates[0]?.id || "");
          setNotice(
            "Evidence retrieved. Review the candidate before approving.",
          );
        } else {
          setDetail(null);
          setNotice(
            action === "reconcile"
              ? "Reconciliation completed using exact decimal arithmetic."
              : "Review decision saved. Readiness and reconciliation updated.",
          );
        }
      }
      await refreshCases();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 6000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  const s = view?.stats;
  const activeStep = view?.verified
    ? 6
    : s?.gaps
      ? 2
      : s?.failed
        ? 3
        : view?.exceptions.length
          ? 4
          : 5;
  const filteredMappings =
    view?.mappings.filter(
      (m) =>
        (kind === "All types" || m.kind === kind) &&
        (filter === "All" ||
          (filter === "Reviewed"
            ? m.status === "Approved"
            : m.status === filter)) &&
        `${m.source} ${m.detail} ${m.target?.label || ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  const filteredChecks =
    view?.reconciliation.filter(
      (r) =>
        (filter === "All" || r.status === filter) &&
        `${r.entity} ${r.account} ${r.currency}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  const filteredExceptions =
    view?.exceptions
      .filter(
        (e) =>
          (filter === "All" || e.severity === filter) &&
          `${e.title} ${e.explanation} ${view.mappings.find((m) => m.id === e.mappingId)?.source || ""}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      )
      .sort(
        (a, b) =>
          (view.mappings.find((m) => m.id === b.mappingId)?.status ===
          "Suggested"
            ? 1
            : 0) -
          (view.mappings.find((m) => m.id === a.mappingId)?.status ===
          "Suggested"
            ? 1
            : 0),
      ) || [];
  const pagination = (length: number) => (
    <div className="pagination">
      <span>
        {length
          ? `${fmt(page * 20 + 1)}–${fmt(Math.min((page + 1) * 20, length))}`
          : "0"}{" "}
        of {fmt(length)} results
      </span>
      <div>
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(length / 20))}
        </span>
        <button
          disabled={(page + 1) * 20 >= length}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
  const searchBox = (
    <div className="search">
      <Search size={15} />
      <input
        aria-label="Search records"
        placeholder={
          tab === "Exceptions"
            ? "Search exceptions…"
            : "Search by name, account or currency…"
        }
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
      />
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar mobile-open" : "sidebar"}>
        <button
          className="brand"
          onClick={() => {
            setView(null);
            setDetail(null);
          }}
        >
          <span className="brand-symbol">
            <GitBranch size={22} />
          </span>
          handover<span className="brand-dot">.</span>
        </button>
        <div className="workspace-label">WORKSPACE</div>
        <button
          className="org-switch"
          onClick={() => {
            setView(null);
            setDetail(null);
          }}
        >
          <span className="org-avatar">K</span>
          <span>
            Kestrel administration<small>Fund operations</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <button
          className={"nav-item all-cases " + (!view ? "active" : "")}
          onClick={() => {
            setView(null);
            setDetail(null);
          }}
        >
          <FolderOpen size={17} />
          All migrations<span className="nav-count">{cases.length}</span>
        </button>
        <div className="workspace-label">MIGRATION WORKSPACE</div>
        {nav.map((n) => (
          <button
            key={n.label}
            className={"nav-item " + (view && tab === n.label ? "active" : "")}
            disabled={!view}
            onClick={() => navigate(n.label)}
          >
            <n.icon size={17} />
            {n.label}
            {n.label === "Exceptions" && s ? (
              <span className="nav-count alert-count">
                {view?.exceptions.length}
              </span>
            ) : null}
          </button>
        ))}
        <div className="nav-divider" />
        {[
          { label: "Source files" as Tab, icon: Files },
          { label: "Audit trail" as Tab, icon: Activity },
          { label: "Export package" as Tab, icon: Download },
        ].map((n) => (
          <button
            key={n.label}
            className={"nav-item " + (view && tab === n.label ? "active" : "")}
            disabled={!view}
            onClick={() => navigate(n.label)}
          >
            <n.icon size={17} />
            {n.label}
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="trust-note">
            <ShieldCheck size={18} />
            <div>
              Built for a clear audit trail
              <small>
                AI interprets. Code verifies.
                <br />
                You approve.
              </small>
            </div>
          </div>
          <div className="profile">
            <span className="user-avatar">LR</span>
            <div>
              Local reviewer<small>Fund administration</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="mobile-toggle icon-btn"
              onClick={() => setMobile(!mobile)}
              aria-label="Toggle navigation"
            >
              <PanelLeft size={18} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <button
              onClick={() => {
                setView(null);
                setDetail(null);
              }}
            >
              Migrations
            </button>
            {view && (
              <>
                <ChevronRight size={13} />
                <strong>{view.migration.name}</strong>
              </>
            )}
          </div>
          <div>
            <span className="environment">
              <i />
              Local workspace
            </span>
            <span className="top-avatar">LR</span>
          </div>
        </header>
        <main>
          {error && (
            <div role="alert" className="message error">
              <TriangleAlert size={17} />
              <span>{error}</span>
              <button
                className="icon-btn"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="message success">
              <CheckCircle2 size={17} />
              {notice}
            </div>
          )}
          {!view ? (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">FUND ADMINISTRATION</div>
                  <h1>Every handover. Accounted for.</h1>
                  <p>
                    Bring incoming fund data into focus, from first file to
                    verified loader.
                  </p>
                </div>
                <button className="primary" onClick={() => setCreate(true)}>
                  <Plus size={16} />
                  New migration
                </button>
              </div>
              <div className="metrics home-metrics">
                <Metric
                  label="Active migrations"
                  value={fmt(cases.length)}
                  sub="Your onboarding workspace"
                />
                <Metric
                  label="Source records"
                  value={fmt(cases.reduce((a, c) => a + c.stats.records, 0))}
                  sub="Inspected and traceable"
                />
                <Metric
                  label="Ready to load"
                  value={fmt(cases.reduce((a, c) => a + c.stats.eligible, 0))}
                  sub="Mapped source records"
                />
                <Metric
                  label="Mapping decisions"
                  value={fmt(cases.reduce((a, c) => a + c.stats.gaps, 0))}
                  sub="Awaiting administrator review"
                />
              </div>
              <div className="section-title">
                <h2>
                  Migration cases{" "}
                  <span className="count-pill">{cases.length}</span>
                </h2>
                <span>Incoming fund onboarding</span>
              </div>
              <section className="panel">
                {cases.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Migration / fund</th>
                          <th>Source → Target</th>
                          <th>Records</th>
                          <th>Readiness</th>
                          <th>Status</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {cases.map((c) => (
                          <tr
                            key={c.migration.id}
                            onClick={() => openCase(c.migration.id)}
                            className="clickable"
                          >
                            <td>
                              <div className="fund-cell">
                                <span className="fund-icon">
                                  <FolderOpen size={19} />
                                </span>
                                <div>
                                  <strong>{c.migration.name}</strong>
                                  <small>As of {c.migration.date}</small>
                                </div>
                              </div>
                            </td>
                            <td>
                              {c.migration.sourceAdmin}
                              <ArrowRight className="inline-arrow" size={13} />
                              {c.migration.targetSystem}
                            </td>
                            <td className="mono">{fmt(c.stats.records)}</td>
                            <td>
                              <div className="mini-readiness">
                                <div className="progress">
                                  <i
                                    style={{ width: c.stats.readiness + "%" }}
                                  />
                                </div>
                                {c.stats.readiness}%
                              </div>
                            </td>
                            <td>
                              <Badge
                                status={
                                  c.stats.blocked
                                    ? "Review required"
                                    : "Verified"
                                }
                              />
                            </td>
                            <td>
                              <ArrowUpRight size={17} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <FolderOpen size={30} />
                    </div>
                    <h2>Your next migration starts here</h2>
                    <p>
                      Create a case and upload a source workbook.
                      <br />
                      Or explore the full workflow with the supplied Kestrel
                      dataset.
                    </p>
                    <button
                      className="primary"
                      onClick={loadDemo}
                      disabled={!!busy}
                    >
                      <FileSpreadsheet size={16} />
                      Load Demo Migration
                      <ArrowRight size={16} />
                    </button>
                    <small>
                      33,902 source records · 3 workbooks · Real mapping
                      decisions
                    </small>
                  </div>
                )}
              </section>
              <section className="demo-banner">
                <div className="demo-art">
                  <FileSpreadsheet size={32} />
                  <ArrowRight size={21} />
                  <ShieldCheck size={36} />
                </div>
                <div>
                  <div className="eyebrow">FROM HANDOVER TO CONFIDENCE</div>
                  <h2>A complete migration, with the evidence attached.</h2>
                  <p>
                    Inspect files. Resolve mappings. Prove the numbers. Review
                    what matters.
                  </p>
                </div>
                <button onClick={loadDemo} disabled={!!busy}>
                  Load demo <ArrowUpRight size={16} />
                </button>
              </section>
              <div className="principles">
                {[
                  {
                    n: "01",
                    t: "Understand the handover",
                    d: "Source sheets, fields and records, brought into one structured workspace.",
                  },
                  {
                    n: "02",
                    t: "Review with context",
                    d: "Every exception comes with source evidence and a clear decision to make.",
                  },
                  {
                    n: "03",
                    t: "Export with confidence",
                    d: "Amounts reconciled by code. Every mapping and approval traceable.",
                  },
                ].map((p) => (
                  <div key={p.n}>
                    <span>{p.n}</span>
                    <h3>{p.t}</h3>
                    <p>{p.d}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="case-heading">
                <div className="eyebrow">
                  MIGRATION {view.migration.id.slice(0, 8).toUpperCase()}
                  <span className="separator">/</span>Q2 HANDOVER
                </div>
                <div className="case-title">
                  <h1>{view.migration.name}</h1>
                  <Badge
                    status={view.verified ? "Verified" : "Review required"}
                  />
                  <button
                    className="secondary"
                    onClick={() => navigate("Export package")}
                  >
                    <Download size={15} />
                    Export package
                  </button>
                </div>
                <p>
                  {view.migration.sourceAdmin}
                  <ArrowRight size={13} />
                  {view.migration.targetSystem}
                  <span>•</span>As of {view.migration.date}
                  <span>•</span>All source entities<span>•</span>Multiple
                  currencies
                </p>
              </div>
              <div className="pipeline">
                {steps.map((step, i) => (
                  <button
                    key={step}
                    onClick={() =>
                      navigate(
                        (
                          [
                            "Source files",
                            "Source files",
                            "Mapping workspace",
                            "Reconciliation",
                            "Exceptions",
                            "Export package",
                          ] as Tab[]
                        )[i],
                      )
                    }
                    className={
                      i < activeStep
                        ? "done"
                        : i === activeStep
                          ? "current"
                          : ""
                    }
                  >
                    <span>
                      {i < activeStep ? (
                        <Check size={13} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    {step}
                    {i !== 5 && <ChevronRight size={14} />}
                  </button>
                ))}
              </div>
              {tab === "Overview" && (
                <>
                  <div className="section-title overview-title">
                    <h2>Migration overview</h2>
                    <span>
                      <Clock3 size={13} />
                      Saved locally · revision {view.migration.revision}
                    </span>
                  </div>
                  <div className="metrics">
                    <Metric
                      label="Records processed"
                      value={fmt(s!.records)}
                      sub={`${s!.files} workbooks inspected`}
                      icon={<Files size={16} />}
                    />
                    <Metric
                      label="Records ready to load"
                      value={fmt(s!.eligible)}
                      sub={`${fmt(s!.blocked)} held for review`}
                      icon={<GitBranch size={16} />}
                    />
                    <Metric
                      label="Reconciliation checks"
                      value={`${fmt(s!.passed)} / ${fmt(s!.passed + s!.failed)}`}
                      sub="Entity and local currency movements"
                      icon={<Scale size={16} />}
                    />
                    <Metric
                      label="Open exceptions"
                      value={fmt(view.exceptions.length)}
                      sub={`${fmt(s!.gaps)} distinct mapping decisions`}
                      icon={<TriangleAlert size={16} />}
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel readiness-panel">
                      <div className="panel-heading">
                        <h2>Migration readiness</h2>
                        <span className="tiny-tag">LIVE</span>
                      </div>
                      <div className="readiness-body">
                        <div
                          className="readiness-ring"
                          style={{
                            background: `conic-gradient(#247468 ${s!.readiness * 3.6}deg, #e9eeeb 0deg)`,
                          }}
                        >
                          <div>
                            <strong>
                              {s!.readiness}
                              <span>%</span>
                            </strong>
                            <small>READY TO LOAD</small>
                          </div>
                        </div>
                        <div className="readiness-description">
                          <h3>
                            {view.verified
                              ? "All checks passed"
                              : "Your next decisions are identified."}
                          </h3>
                          <p>
                            {fmt(s!.eligible)} source records have complete
                            mappings and ranked batch types. Review held records
                            before a verified export.
                          </p>
                          <div>
                            <span>
                              <i className="legend green-dot" />
                              Eligible <b>{fmt(s!.eligible)}</b>
                            </span>
                            <span>
                              <i className="legend amber-dot" />
                              Held <b>{fmt(s!.blocked)}</b>
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="readiness-footer">
                        <ShieldCheck size={16} />
                        <span>
                          Every source row is accounted for. No silent
                          exclusions.
                        </span>
                      </div>
                    </section>
                    <section className="panel next-panel">
                      <div className="panel-heading">
                        <h2>Next best action</h2>
                        <span className="badge amber">Review</span>
                      </div>
                      <div className="next-body">
                        <span className="action-icon">
                          <GitBranch size={21} />
                        </span>
                        <h3>Resolve mapping decisions</h3>
                        <p>
                          Start with a documented proposal, then work through
                          missing crosswalks and incomplete batches.
                        </p>
                        <button
                          className="primary"
                          onClick={() => navigate("Exceptions")}
                        >
                          Open exception workspace
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </section>
                  </div>
                  <div className="section-title">
                    <h2>
                      Needs your attention{" "}
                      <span className="count-pill">
                        {view.exceptions.length}
                      </span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => navigate("Exceptions")}
                    >
                      View all exceptions
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <section className="panel">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Exception</th>
                            <th>Source / context</th>
                            <th>Affected rows</th>
                            <th>Priority</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {[...view.exceptions]
                            .sort(
                              (a, b) =>
                                (view.mappings.find((m) => m.id === b.mappingId)
                                  ?.status === "Suggested"
                                  ? 1
                                  : 0) -
                                (view.mappings.find((m) => m.id === a.mappingId)
                                  ?.status === "Suggested"
                                  ? 1
                                  : 0),
                            )
                            .slice(0, 4)
                            .map((e) => (
                              <tr
                                className="clickable"
                                key={e.id}
                                onClick={() =>
                                  evidence(
                                    e.mappingId
                                      ? "mapping=" + e.mappingId
                                      : "exception=" + e.id,
                                  )
                                }
                              >
                                <td>
                                  <strong>{e.title}</strong>
                                  <small>{e.kind}</small>
                                </td>
                                <td className="truncate-cell">
                                  {view.mappings.find(
                                    (m) => m.id === e.mappingId,
                                  )?.source || "Entity / batch rule"}
                                </td>
                                <td className="mono">{fmt(e.rowCount)}</td>
                                <td>
                                  <Badge status={e.severity} />
                                </td>
                                <td>
                                  <ArrowUpRight size={16} />
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <div className="bottom-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Source package</h2>
                        <button
                          className="text-button"
                          onClick={() => navigate("Source files")}
                        >
                          View files
                          <ArrowRight size={13} />
                        </button>
                      </div>
                      {view.files.map((f) => (
                        <div className="file-row" key={f.name}>
                          <span className="file-icon">
                            <FileSpreadsheet size={19} />
                          </span>
                          <div>
                            <strong>{f.role}</strong>
                            <small>{f.name}</small>
                          </div>
                          <CheckCircle2 size={16} className="green-text" />
                        </div>
                      ))}
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Recent activity</h2>
                        <button
                          className="text-button"
                          onClick={() => navigate("Audit trail")}
                        >
                          Full audit
                          <ArrowRight size={13} />
                        </button>
                      </div>
                      {view.migration.audit
                        .slice(-3)
                        .reverse()
                        .map((a) => (
                          <div className="activity-row" key={a.id}>
                            <span className="activity-dot" />
                            <div>
                              <strong>{a.action}</strong>
                              <p>{a.detail}</p>
                              <small>
                                {a.reviewer} ·{" "}
                                {new Date(a.at).toLocaleTimeString("en-GB", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </small>
                            </div>
                          </div>
                        ))}
                    </section>
                  </div>
                </>
              )}
              {tab === "Mapping workspace" && (
                <>
                  <div className="section-title page-section">
                    <div>
                      <h2>Mapping workspace</h2>
                      <p>
                        Review source-to-target relationships. Exact crosswalks
                        retain their original evidence.
                      </p>
                    </div>
                    <span className="subtle">
                      {fmt(s!.mappings)} relationships
                    </span>
                  </div>
                  <section className="panel">
                    <div className="toolbar">
                      <div className="filter-tabs">
                        {[
                          "All",
                          "Exact",
                          "Suggested",
                          "Missing",
                          "Requires review",
                          "Reviewed",
                        ].map((f) => (
                          <button
                            className={filter === f ? "selected" : ""}
                            key={f}
                            onClick={() => {
                              setFilter(f);
                              setPage(0);
                            }}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="toolbar">
                      {searchBox}
                      <select
                        aria-label="Mapping type"
                        value={kind}
                        onChange={(e) => {
                          setKind(e.target.value);
                          setPage(0);
                        }}
                      >
                        {[
                          "All types",
                          "Legal entity",
                          "Investor",
                          "Deal / position",
                          "Chart of accounts",
                        ].map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Source relationship</th>
                            <th />
                            <th>Target record</th>
                            <th>Status</th>
                            <th>Rows</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMappings
                            .slice(page * 20, (page + 1) * 20)
                            .map((m) => (
                              <tr
                                key={m.id}
                                className="clickable"
                                onClick={() => evidence("mapping=" + m.id)}
                              >
                                <td className="wide-cell">
                                  <span className="table-kicker">{m.kind}</span>
                                  <strong>
                                    {m.source || "(empty source value)"}
                                  </strong>
                                  <small>{m.detail}</small>
                                </td>
                                <td>
                                  <ArrowRight size={14} className="muted" />
                                </td>
                                <td className="wide-cell">
                                  {m.target?.label ||
                                    m.candidates[0]?.label || (
                                      <span className="muted">
                                        No target mapping
                                      </span>
                                    )}
                                  {m.warning && (
                                    <small className="amber-text">
                                      Incomplete master list · crosswalk
                                      retained
                                    </small>
                                  )}
                                </td>
                                <td>
                                  <Badge status={m.status} />
                                </td>
                                <td className="mono">{fmt(m.rowCount)}</td>
                                <td>
                                  <ChevronRight size={16} />
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {!filteredMappings.length && (
                      <div className="no-results">
                        No mappings match these filters.
                      </div>
                    )}
                    {pagination(filteredMappings.length)}
                  </section>
                </>
              )}
              {tab === "Reconciliation" && (
                <>
                  <div className="section-title page-section">
                    <div>
                      <h2>Movement reconciliation</h2>
                      <p>
                        Exact decimal checks by entity, mapped account, currency
                        and amount basis.
                      </p>
                    </div>
                    <button
                      className="primary"
                      disabled={!!busy}
                      onClick={() => action("reconcile")}
                    >
                      <Scale size={15} />
                      Run reconciliation
                    </button>
                  </div>
                  <div className="metrics three">
                    <Metric
                      label="Checks passed"
                      value={fmt(s!.passed)}
                      sub="Net, gross flows and row coverage preserved"
                    />
                    <Metric
                      label="Checks failed"
                      value={fmt(s!.failed)}
                      sub="Includes movements held by incomplete mappings"
                    />
                    <Metric
                      label="Checks reconciled"
                      value={
                        ((s!.passed / (s!.passed + s!.failed)) * 100).toFixed(
                          1,
                        ) + "%"
                      }
                      sub="Local and entity currency checked separately"
                    />
                  </div>
                  <div className="info-strip">
                    <ShieldCheck size={16} />A zero net difference is not
                    enough. Missing rows and unequal gross debits or credits
                    also fail.
                  </div>
                  <section className="panel">
                    <div className="toolbar">
                      <div className="filter-tabs">
                        {["All", "PASS", "FAIL"].map((f) => (
                          <button
                            key={f}
                            className={filter === f ? "selected" : ""}
                            onClick={() => {
                              setFilter(f);
                              setPage(0);
                            }}
                          >
                            {f === "All"
                              ? "All checks"
                              : f === "PASS"
                                ? "Passed"
                                : "Failed"}
                          </button>
                        ))}
                      </div>
                      {searchBox}
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Legal entity / account</th>
                            <th>Currency</th>
                            <th className="number">Source</th>
                            <th className="number">Target</th>
                            <th className="number">Difference</th>
                            <th>Coverage</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredChecks
                            .slice(page * 20, (page + 1) * 20)
                            .map((r) => (
                              <tr
                                key={r.id}
                                className="clickable"
                                onClick={() => evidence("check=" + r.id)}
                              >
                                <td className="wide-cell">
                                  <strong>{r.entity}</strong>
                                  <small>{r.account}</small>
                                </td>
                                <td>
                                  {r.currency}
                                  <small>{r.basis}</small>
                                </td>
                                <td className="number mono" title={r.source}>
                                  {money(r.source)}
                                </td>
                                <td className="number mono" title={r.target}>
                                  {money(r.target)}
                                </td>
                                <td
                                  className={
                                    "number mono " +
                                    (r.difference === "0" ? "" : "red-text")
                                  }
                                  title={r.difference}
                                >
                                  {money(r.difference)}
                                </td>
                                <td className="mono">
                                  {r.included}/{r.rows}
                                </td>
                                <td>
                                  <Badge status={r.status} />
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {!filteredChecks.length && (
                      <div className="no-results">
                        No reconciliation checks match.
                      </div>
                    )}
                    {pagination(filteredChecks.length)}
                  </section>
                  <p className="footnote">
                    Table values display two decimal places. Open any check for
                    exact amounts, gross flows and source rows.
                  </p>
                </>
              )}
              {tab === "Exceptions" && (
                <>
                  <div className="section-title page-section">
                    <div>
                      <h2>Exception workspace</h2>
                      <p>
                        The decisions between a mapped workbook and a migration
                        you can trust.
                      </p>
                    </div>
                    <span className="badge amber">
                      {view.exceptions.length} open
                    </span>
                  </div>
                  <div className="info-strip">
                    <TriangleAlert size={16} />
                    <span>
                      Known mapping gaps are requests for a decision. An
                      unmatched record does not automatically mean corrupt data.
                    </span>
                  </div>
                  <section className="panel">
                    <div className="toolbar">
                      <div className="filter-tabs">
                        {["All", "High", "Medium"].map((f) => (
                          <button
                            key={f}
                            className={filter === f ? "selected" : ""}
                            onClick={() => {
                              setFilter(f);
                              setPage(0);
                            }}
                          >
                            {f === "All" ? "All exceptions" : f + " priority"}
                          </button>
                        ))}
                      </div>
                      {searchBox}
                    </div>
                    <div className="exception-list">
                      {filteredExceptions
                        .slice(page * 20, (page + 1) * 20)
                        .map((e) => {
                          const m = view.mappings.find(
                            (m) => m.id === e.mappingId,
                          );
                          return (
                            <button
                              className="exception-card"
                              key={e.id}
                              onClick={() =>
                                evidence(
                                  e.mappingId
                                    ? "mapping=" + e.mappingId
                                    : "exception=" + e.id,
                                )
                              }
                            >
                              <span className="exception-icon">
                                <TriangleAlert size={20} />
                              </span>
                              <div className="exception-main">
                                <div>
                                  <h3>{e.title}</h3>
                                  <Badge status={e.severity} />
                                  {m?.status === "Suggested" && (
                                    <span className="proposal-tag">
                                      Proposal available
                                    </span>
                                  )}
                                </div>
                                <strong>
                                  {m?.source ||
                                    "Batch completeness / source validation"}
                                </strong>
                                <p>{m?.detail || e.explanation}</p>
                                <span className="exception-meta">
                                  {e.kind}
                                  <span>·</span>
                                  {fmt(e.rowCount)} source rows<span>·</span>
                                  {Object.entries(e.totals)
                                    .slice(0, 3)
                                    .map(([c, v]) => `${c} ${money(v)}`)
                                    .join(" / ")}
                                </span>
                              </div>
                              <ArrowUpRight size={18} />
                            </button>
                          );
                        })}
                    </div>
                    {!filteredExceptions.length && (
                      <div className="no-results">
                        <CheckCircle2 size={25} />
                        <p>No open exceptions match this filter.</p>
                      </div>
                    )}
                    {pagination(filteredExceptions.length)}
                  </section>
                </>
              )}
              {tab === "Source files" && (
                <>
                  <div className="section-title page-section">
                    <div>
                      <h2>Source package</h2>
                      <p>
                        Deterministic workbook inspection. Original files remain
                        untouched.
                      </p>
                    </div>
                    <span className="badge green">3 workbooks</span>
                  </div>
                  {view.files.map((f) => (
                    <section className="panel workbook" key={f.name}>
                      <div className="panel-heading">
                        <span className="file-icon">
                          <FileSpreadsheet size={22} />
                        </span>
                        <div>
                          <h2>{f.name}</h2>
                          <p>
                            {f.role} · {f.sheets.length} inspected sheets
                          </p>
                        </div>
                        <Badge status="Inspected" />
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Sheet</th>
                              <th>Data rows</th>
                              <th>Columns / detected fields</th>
                            </tr>
                          </thead>
                          <tbody>
                            {f.sheets.map((sh) => (
                              <tr key={sh.name}>
                                <td>
                                  <strong>{sh.name}</strong>
                                </td>
                                <td className="mono">{fmt(sh.rows)}</td>
                                <td>
                                  <div className="column-chips">
                                    {sh.columns
                                      .filter(Boolean)
                                      .slice(0, 8)
                                      .map((c, i) => (
                                        <span key={i}>{c}</span>
                                      ))}
                                    {sh.columns.length > 8 && (
                                      <span>+{sh.columns.length - 8} more</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                  <p className="footnote">
                    Reference crosswalk sheets are inspected for mapping. The
                    verified reference loader is not used to generate output.
                  </p>
                </>
              )}
              {tab === "Audit trail" && (
                <>
                  <div className="section-title page-section">
                    <div>
                      <h2>Audit trail</h2>
                      <p>
                        A persistent record of reviewer decisions,
                        investigations and reconciliation runs.
                      </p>
                    </div>
                    <span className="subtle">
                      {view.migration.audit.length} events
                    </span>
                  </div>
                  <section className="panel audit-panel">
                    {view.migration.audit
                      .slice()
                      .reverse()
                      .map((a) => (
                        <div className="audit-event" key={a.id}>
                          <span className="audit-icon">
                            <Activity size={17} />
                          </span>
                          <div>
                            <h3>{a.action}</h3>
                            <p>{a.detail}</p>
                            <small>
                              {a.reviewer}
                              {a.mappingId && " · " + a.mappingId}
                            </small>
                          </div>
                          <time>{new Date(a.at).toLocaleString("en-GB")}</time>
                        </div>
                      ))}
                  </section>
                </>
              )}
              {tab === "Export package" && (
                <>
                  <div className="section-title page-section">
                    <div>
                      <h2>Migration package</h2>
                      <p>
                        The loader, the decisions and the proof, in one
                        reviewable workbook.
                      </p>
                    </div>
                  </div>
                  <div className="export-grid">
                    <section className="panel export-main">
                      <div className="export-illustration">
                        <FileSpreadsheet size={40} />
                        <ShieldCheck size={26} />
                      </div>
                      <h2>
                        {view.verified
                          ? "Your verified package is ready"
                          : "Complete the review to verify this migration"}
                      </h2>
                      <p>
                        {view.verified
                          ? "All source records are eligible and every reconciliation check passes."
                          : `${fmt(s!.blocked)} source rows are held. Download a draft to review the full evidence, or resolve the remaining decisions to unlock verification.`}
                      </p>
                      <div className="export-checks">
                        {[
                          {
                            ok: true,
                            text: `${fmt(s!.records)} source rows accounted for`,
                          },
                          {
                            ok: !s!.gaps,
                            text: `${fmt(s!.gaps)} mapping decisions remaining`,
                          },
                          {
                            ok: !s!.failed,
                            text: `${fmt(s!.passed)} of ${fmt(s!.passed + s!.failed)} reconciliation checks passed`,
                          },
                          {
                            ok: !s!.blocked,
                            text: `${fmt(s!.blocked)} blocked source rows`,
                          },
                        ].map((c) => (
                          <div key={c.text}>
                            {c.ok ? (
                              <CheckCircle2 size={18} className="green-text" />
                            ) : (
                              <Clock3 size={18} className="amber-text" />
                            )}
                            {c.text}
                          </div>
                        ))}
                      </div>
                      <div className="export-actions">
                        <button
                          className="primary"
                          disabled={!view.verified || !!busy}
                          onClick={() => action("export", { verified: true })}
                        >
                          <ShieldCheck size={16} />
                          Download verified package
                        </button>
                        <button
                          className="secondary"
                          disabled={!!busy}
                          onClick={() => action("export", { verified: false })}
                        >
                          <Download size={16} />
                          Download draft review
                        </button>
                      </div>
                      <small>
                        Exact decimal amount cells · XLSX · Source files never
                        overwritten
                      </small>
                    </section>
                    <section className="panel package-contents">
                      <div className="panel-heading">
                        <h2>Inside your package</h2>
                        <span className="count-pill">12</span>
                      </div>
                      {[
                        "Upload Template",
                        "Legal Entity Mapping",
                        "Investor Mapping",
                        "Deal Mapping",
                        "CoA Mapping",
                        "Mapping Gaps",
                        "Reconciliation",
                        "Exceptions",
                        "Migration Summary",
                        "Audit Log",
                        "Source References",
                        "Transformation Audit",
                      ].map((name, i) => (
                        <div key={name}>
                          <span className="mono">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <FileSpreadsheet size={15} />
                          {name}
                        </div>
                      ))}
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          <footer>
            <span>
              handover<span className="brand-dot">.</span>
              <span className="footer-divider">/</span>Fund migration workspace
            </span>
            <span>
              <ShieldCheck size={13} />
              Traceable from source to loader
            </span>
          </footer>
        </main>
      </div>
      {error && (detail || create) && (
        <div role="alert" className="floating-error">
          <TriangleAlert size={16} />
          {error}
          <button aria-label="Dismiss" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-toast" role="status">
          <Loader2 size={17} className="spin" />
          {busy}…
        </div>
      )}
      {create && (
        <div
          className="modal-backdrop"
          onClick={() => !busy && setCreate(false)}
        >
          <section
            className="create-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Create migration"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <div>
                <div className="eyebrow">NEW HANDOVER</div>
                <h2>Create a migration</h2>
              </div>
              <button
                className="icon-btn"
                aria-label="Close"
                onClick={() => setCreate(false)}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={submitCase}>
              <label>
                Client / fund name
                <input
                  name="name"
                  required
                  placeholder="e.g. Northstar Fund III"
                  maxLength={120}
                />
              </label>
              <div className="form-grid">
                <label>
                  Source administrator
                  <input
                    name="sourceAdmin"
                    required
                    defaultValue="Legacy Admin"
                  />
                </label>
                <label>
                  Target system
                  <select name="targetSystem">
                    <option>Corvus</option>
                  </select>
                </label>
                <label>
                  Migration date
                  <input
                    type="date"
                    name="date"
                    required
                    defaultValue="2026-06-30"
                  />
                </label>
                <label>
                  Base currency
                  <select name="baseCurrency">
                    <option>USD</option>
                    <option>GBP</option>
                    <option>EUR</option>
                  </select>
                </label>
              </div>
              <label
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setFile(e.dataTransfer.files[0] || null);
                }}
              >
                <Upload size={26} />
                <strong>
                  {file ? file.name : "Drop your source workbook here"}
                </strong>
                <span>or click to browse · .xlsx · up to 30 MB</span>
                <input
                  type="file"
                  accept=".xlsx"
                  aria-label="Source workbook"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <p className="footnote">
                Accepts the investor-level GL schema. Uses the supplied target
                crosswalks. Other layouts require a schema adapter.
              </p>
              <button
                className="primary full"
                type="submit"
                disabled={!file || !!busy}
              >
                Create & process migration
                <ArrowRight size={16} />
              </button>
              <div className="or-divider">
                <span>OR EXPLORE THE SUPPLIED DATA</span>
              </div>
              <button
                className="secondary full"
                type="button"
                onClick={loadDemo}
                disabled={!!busy}
              >
                <FileSpreadsheet size={16} />
                Load Demo Migration
              </button>
            </form>
          </section>
        </div>
      )}
      {detail && (
        <div className="drawer-backdrop" onClick={() => setDetail(null)}>
          <section
            className="evidence-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Source evidence and review"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <span>
                <span className="eyebrow">REVIEW WORKSPACE</span>
                <h2>
                  {detail.mapping ? "Mapping decision" : "Movement evidence"}
                </h2>
              </span>
              <button
                className="icon-btn"
                aria-label="Close review"
                onClick={() => setDetail(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="drawer-body">
              {detail.mapping ? (
                <>
                  <div className="detail-title">
                    <Badge status={detail.mapping.status} />
                    <span>{detail.mapping.kind}</span>
                  </div>
                  <h2 className="source-title">{detail.mapping.source}</h2>
                  <p className="subtle">{detail.mapping.detail}</p>
                  <div className="detail-summary">
                    <span>
                      <strong>{fmt(detail.total)}</strong>affected source rows
                    </span>
                    <span>
                      <strong>{detail.mapping.evidence.length || "—"}</strong>
                      crosswalk references
                    </span>
                  </div>
                  {detail.mapping.warning && (
                    <div className="info-strip amber-info">
                      {detail.mapping.warning}
                    </div>
                  )}
                  <div className="evidence-section">
                    <div className="section-title">
                      <h3>Investigation & evidence</h3>
                      <span className="tiny-tag">
                        {view?.aiConfigured
                          ? "GEMINI AVAILABLE"
                          : "DETERMINISTIC"}
                      </span>
                    </div>
                    <p>{detail.mapping.explanation}</p>
                    <small>
                      {detail.mapping.confidence !== undefined
                        ? `Model confidence: ${Math.round(detail.mapping.confidence * 100)}% · unapproved semantic assessment`
                        : "Evidence-based proposal · no model confidence score"}
                    </small>
                    {detail.mapping.evidence.map((r, i) => (
                      <div className="source-link" key={i}>
                        <FileSpreadsheet size={15} />
                        <div>
                          {r.sheet} · row {r.row}
                          <small>{r.file}</small>
                        </div>
                      </div>
                    ))}
                    <button
                      className="secondary full"
                      disabled={!!busy}
                      onClick={() =>
                        action("investigate", { mappingId: detail.mapping!.id })
                      }
                    >
                      <Sparkles size={15} />
                      {view?.aiConfigured
                        ? "Investigate with Gemini"
                        : "Investigate source evidence"}
                      <ArrowRight size={14} />
                    </button>
                    <small className="footnote">
                      {view?.aiConfigured
                        ? "Gemini proposes existing target IDs. Your approval is required."
                        : "Gemini is not connected. Uses crosswalk evidence and description matching."}
                    </small>
                  </div>
                  <div className="evidence-section">
                    <h3>Choose target mapping</h3>
                    <p className="subtle">
                      Suggested candidates are unapproved until you record a
                      decision.
                    </p>
                    {detail.mapping.candidates.slice(0, 6).map((c) => (
                      <label
                        className={
                          "candidate " + (candidate === c.id ? "chosen" : "")
                        }
                        key={c.id}
                      >
                        <input
                          type="radio"
                          name="candidate"
                          checked={candidate === c.id}
                          onChange={() => setCandidate(c.id)}
                        />
                        <span>
                          <strong>{c.label}</strong>
                          <small>
                            {c.evidence[0]?.sheet} · row {c.evidence[0]?.row}
                            {c.values.batch && " · Batch: " + c.values.batch}
                          </small>
                        </span>
                      </label>
                    ))}
                    <input
                      placeholder="Search all existing target records…"
                      aria-label="Search target records"
                      value={targetSearch}
                      onChange={(e) => setTargetSearch(e.target.value)}
                    />
                    <select
                      aria-label="Select existing target"
                      value={candidate}
                      onChange={(e) => setCandidate(e.target.value)}
                    >
                      <option value="">Select an existing target record</option>
                      {detail.catalog
                        .filter(
                          (c) =>
                            c.id === candidate ||
                            c.label
                              .toLowerCase()
                              .includes(targetSearch.toLowerCase()),
                        )
                        .map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.label}
                          </option>
                        ))}
                    </select>
                    <label>
                      Reviewer rationale
                      <textarea
                        placeholder="Explain why this target is appropriate, or what needs clarification…"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={2000}
                      />
                    </label>
                    <div className="review-buttons">
                      <button
                        className="primary"
                        disabled={!candidate || !note.trim() || !!busy}
                        onClick={() =>
                          action("approve", {
                            mappingId: detail.mapping!.id,
                            candidateId: candidate,
                            note,
                          })
                        }
                      >
                        <Check size={15} />
                        Approve mapping
                      </button>
                      <button
                        className="secondary"
                        disabled={!note.trim() || !!busy}
                        onClick={() =>
                          action("request", {
                            mappingId: detail.mapping!.id,
                            note,
                          })
                        }
                      >
                        Request information
                      </button>
                    </div>
                    <button
                      className="text-button unresolved"
                      disabled={!note.trim() || !!busy}
                      onClick={() =>
                        action("unresolved", {
                          mappingId: detail.mapping!.id,
                          note,
                        })
                      }
                    >
                      Mark unresolved
                    </button>
                  </div>
                </>
              ) : detail.check ? (
                <>
                  <Badge status={detail.check.status} />
                  <h2 className="source-title">{detail.check.entity}</h2>
                  <p>
                    {detail.check.account} · {detail.check.currency} ·{" "}
                    {detail.check.basis} basis
                  </p>
                  <div className="exact-values">
                    {[
                      ["Source net", detail.check.source],
                      ["Target net", detail.check.target],
                      ["Exact difference", detail.check.difference],
                      ["Source gross debits", detail.check.sourceDebit],
                      ["Target gross debits", detail.check.targetDebit],
                      ["Source gross credits", detail.check.sourceCredit],
                      ["Target gross credits", detail.check.targetCredit],
                      [
                        "Row coverage",
                        `${detail.check.included} / ${detail.check.rows}`,
                      ],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        <strong className="mono">{v}</strong>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="info-strip">
                  These rows are held by a batch completeness or source
                  validation exception. Resolve related mappings before
                  rerunning reconciliation.
                </div>
              )}
              <div className="evidence-section">
                <div className="section-title">
                  <h3>Underlying source rows</h3>
                  <span>
                    {Math.min(30, detail.total)} of {fmt(detail.total)}
                  </span>
                </div>
                <p className="footnote">
                  Open a row for field-level provenance. The export includes
                  references for every source row.
                </p>
                {detail.rows.map(({ source: r, target: t }) => (
                  <div className="source-record" key={r.id}>
                    <button
                      onClick={() =>
                        setExpandedRow(expandedRow === r.id ? "" : r.id)
                      }
                    >
                      <span className="row-number">{r.ref.row}</span>
                      <span>
                        <strong>{r.entity}</strong>
                        <small>{r.investor}</small>
                        <span className="mono">
                          {r.entityCurrency} {r.amount}
                        </span>
                      </span>
                      <Badge status={t ? "Included" : "Blocked"} />
                      <ChevronDown size={14} />
                    </button>
                    {expandedRow === r.id && (
                      <div className="row-expanded">
                        <div className="source-link">
                          <FileSpreadsheet size={15} />
                          <div>
                            {r.ref.sheet} · row {r.ref.row}
                            <small>{r.ref.file}</small>
                          </div>
                        </div>
                        <p>
                          Account: {r.account}
                          <br />
                          Transaction: {r.transType}
                          <br />
                          Batch: {r.batch}
                          <br />
                          Local amount (AB):{" "}
                          <span className="mono">{r.local}</span>
                          <br />
                          Entity amount (AF):{" "}
                          <span className="mono">{r.amount}</span>
                        </p>
                        {t ? (
                          <>
                            <h4>Source → loader transformations</h4>
                            {Object.entries(t.provenance).map(([field, p]) => (
                              <div className="provenance-row" key={field}>
                                <strong>{field}</strong>
                                <span>{p.value || "—"}</span>
                                <small>
                                  {p.sources
                                    .map(
                                      (s) =>
                                        `${s.sheet}!${s.column} · row ${s.row}`,
                                    )
                                    .join(" ← ")}
                                  {p.rule && " · " + p.rule}
                                </small>
                              </div>
                            ))}
                          </>
                        ) : (
                          <p className="amber-text">
                            Held for review. No loader row generated.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div>
        {label}
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}
