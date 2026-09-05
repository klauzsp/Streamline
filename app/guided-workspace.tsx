"use client";
import BrandMark from "./brand-mark";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Download,
  ShieldCheck,
  Sparkles,
  MessageSquare,
  ExternalLink,
  X,
  Upload,
  SearchCheck,
  ClipboardCheck,
  ArrowUpRight,
} from "lucide-react";
import type { CaseView } from "@/lib/migration/view";
import type {
  Candidate,
  Mapping,
  Migration,
  SourceRecord,
  TargetRecord,
} from "@/types";
import "./guided.css";
type Step = "understand" | "review" | "finish";
type Evidence = {
  mapping: Mapping;
  total: number;
  rows: { source: SourceRecord; target?: TargetRecord }[];
  catalog: Candidate[];
};
const number = (n: number) => n.toLocaleString("en-GB");
async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
function saveDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function GuidedWorkspace() {
  const [view, setView] = useState<CaseView | null>(null),
    [demoIntro, setDemoIntro] = useState(false),
    [step, setStep] = useState<Step>("understand"),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [evidence, setEvidence] = useState<Evidence | null>(null),
    [candidate, setCandidate] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [note, setNote] = useState(""),
    [requestOpen, setRequestOpen] = useState(false),
    [requestText, setRequestText] = useState(""),
    [change, setChange] = useState<{
      ready: number;
      unlocked: number;
      remaining: number;
    } | null>(null),
    [downloaded, setDownloaded] = useState(false),
    [create, setCreate] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("case");
    if (id) {
      setBusy("Opening client handover");
      json("/api/migrations/" + encodeURIComponent(id))
        .then((v) => {
          setView(v);
          setStep("understand");
        })
        .catch((e) => setError(e.message))
        .finally(() => setBusy(""));
    }
  }, []);
  const decision =
    view?.guidance.decisions.find((d) => d.id === selected) ||
    view?.guidance.decisions[0];
  useEffect(() => {
    setConfirmed(false);
    setNote("");
    setRequestOpen(false);
    setEvidence(null);
    setCandidate(decision?.candidate?.id || "");
    if (!view || !decision || step !== "review") return;
    let current = true;
    json(`/api/migrations/${view.migration.id}?mapping=${decision.id}`)
      .then((e) => {
        if (current) {
          setEvidence(e);
          setCandidate(
            view.migration.suggestions[decision.id]?.candidates[0] ??
              (view.migration.suggestions[decision.id]
                ? ""
                : e.mapping.candidates[0]?.id || e.mapping.target?.id || ""),
          );
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [view?.migration.id, decision?.id, step]);
  useEffect(() => {
    if (!create) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCreate(false);
    };
    window.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", key);
    };
  }, [create]);
  function home() {
    setDemoIntro(false);
    setView(null);
    setStep("understand");
    setChange(null);
    setError("");
    setMessage("");
    setDownloaded(false);
    window.history.replaceState(null, "", "/");
  }
  async function open(id: string) {
    setBusy("Opening client handover");
    setError("");
    try {
      const v = await json("/api/migrations/" + id);
      setView(v);
      setStep("understand");
      setChange(null);
      setDownloaded(false);
      window.history.replaceState(null, "", "/?case=" + id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function startDemo() {
    setBusy("Reading Westvale’s handover and checking existing matches");
    setError("");
    try {
      const form = new FormData();
      Object.entries({
        name: "Westvale · client onboarding",
        sourceAdmin: "Legacy Admin",
        targetSystem: "Corvus",
        date: "2026-06-30",
        baseCurrency: "GBP",
        demo: "guided",
      }).forEach(([k, v]) => form.set(k, v));
      const m = await json("/api/migrations", { method: "POST", body: form });
      await open(m.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setBusy("Reading your workbook and identifying decisions");
    setError("");
    try {
      const form = new FormData(e.currentTarget);
      form.set("file", file);
      const m = await json("/api/migrations", { method: "POST", body: form });
      setCreate(false);
      await open(m.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!view) return;
    setError("");
    setMessage("");
    setBusy(
      action === "investigate"
        ? "Gemini is inspecting source evidence"
        : action === "export"
          ? "Preparing your migration package"
          : action === "reconcile"
            ? "Checking every amount and source row"
            : "Saving your decision and checking the result",
    );
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
        throw Error(body.error || "Could not complete this step");
      }
      if (action === "export") {
        saveDownload(
          await res.blob(),
          extra.detailed
            ? "handover-detailed-audit.xlsx"
            : extra.verified
              ? "Westvale-verified-demo.xlsx"
              : "handover-review-draft.xlsx",
        );
        setView(await json("/api/migrations/" + view.migration.id));
        setDownloaded(true);
      } else {
        const next: CaseView = await res.json();
        setView(next);
        if (action === "approve") {
          setChange({
            ready: next.stats.eligible,
            unlocked: next.stats.eligible - view.stats.eligible,
            remaining: next.guidance.remaining,
          });
          setConfirmed(false);
          setNote("");
        }
        if (action === "investigate" && decision) {
          const s = next.migration.suggestions[decision.id];
          setCandidate(s?.candidates[0] || "");
          setConfirmed(false);
          setEvidence(
            await json(
              `/api/migrations/${view.migration.id}?mapping=${decision.id}`,
            ),
          );
        }
        if (action === "request") {
          saveDownload(
            new Blob([requestText], { type: "text/plain" }),
            "request-to-previous-administrator.txt",
          );
          setRequestOpen(false);
          setMessage(
            "Request saved and downloaded. Send it to the previous administrator; these records stay on hold.",
          );
        }
        if (action === "reconcile")
          setMessage(
            next.verified
              ? "Every record in this package passed. Your original amounts are preserved."
              : "Some records still need a decision. No verified package has been released.",
          );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function request() {
    if (!view || !decision) return;
    const refs =
      evidence?.rows
        .slice(0, 5)
        .map(
          (r) =>
            `${r.source.ref.file} / ${r.source.ref.sheet}, row ${r.source.ref.row}`,
        )
        .join("\n") || "See the original handover workbook.";
    setRequestText(
      `To: ${view.migration.sourceAdmin}\nSubject: Clarification needed — ${view.migration.name}\n\nWe are preparing this client's historical records for import into ${view.migration.targetSystem}.\n\n${decision.request.split("The proposed target is")[0]}\nCurrently selected target: ${evidence?.catalog.find((c) => c.id === candidate)?.label || "None — please clarify"}.\n\nAffected records: ${decision.rows}\nSource references:\n${refs}\n\nPlease reply with confirmation and supporting evidence. We will hold the affected records until this is resolved.\n`,
    );
    setRequestOpen(true);
  }
  const suggestion = decision && view?.migration.suggestions[decision.id];
  const hasModel = !!suggestion?.provider.startsWith("Gemini");
  const chosen = evidence?.catalog.find((c) => c.id === candidate);
  const exact = view?.mappings.filter((m) => m.status === "Exact").length || 0;
  return (
    <div className="guided-shell">
      <header className="gd-header">
        <button className="gd-brand" onClick={home}>
          <BrandMark />
          streamline<span className="gd-dot">.</span>
        </button>
      </header>
      <main className={view ? "gd-main" : "gd-main gd-landing"}>
        {error && (
          <div className="gd-error" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {!view && demoIntro ? (
          <section className="gd-demo-brief" aria-labelledby="demo-brief-title">
            <button className="gd-back" onClick={home}>
              <ArrowLeft size={14} /> Back
            </button>

            <h1 id="demo-brief-title">
              A fund is changing administrators.
              <br />
              You’re taking over its records.
            </h1>
            <p className="gd-brief-lead">
              Westvale is the anonymised fund in this example. You work for the
              incoming fund administrator, which, is the team responsible for
              keeping its accounts and reporting to its investors.
            </p>
            <div className="gd-brief-sections">
              <section>
                <h2>What has arrived</h2>
                <p>
                  The previous administrator has sent a quarter’s accounting
                  records: expenses, investment movements and amounts assigned
                  to investors. This demo includes all 528 entries for Westvale.
                </p>
              </section>
              <section>
                <h2>Why you can’t just upload it</h2>
                <p>
                  Your system uses different account categories and identifiers.
                  Some records have an agreed match; others need clarification.
                  For example, one account says “Interest Income – Bank”, while
                  its transaction type says “Administration Fees”.
                </p>
              </section>
              <section>
                <h2>What Streamline does</h2>
                <p>
                  It applies the supplied reference mappings, holds uncertain
                  records for review and checks that the prepared output
                  preserves the amounts. Gemini helps investigate the evidence;
                  you decide whether to approve a match or ask for more
                  information.
                </p>
              </section>
            </div>
            <div className="gd-brief-next">
              <p>
                <strong>Your walkthrough</strong>
                <br />
                Review two decisions, inspect the checks and download the
                prepared Excel package. Nothing is uploaded to a live accounting
                system.
              </p>
              <button
                className="gd-primary"
                onClick={startDemo}
                disabled={!!busy}
              >
                Open Westvale’s handover <ArrowRight size={16} />
              </button>
            </div>
          </section>
        ) : !view ? (
          <>
            <div className="gd-hero">
              <div className="gd-hero-copy">
                <h1>
                  A new client.
                  <br />A handover you can trust.
                </h1>

                <div className="gd-hero-actions">
                  <button
                    className="gd-primary"
                    onClick={() => {
                      setDemoIntro(true);
                      window.scrollTo(0, 0);
                    }}
                    disabled={!!busy}
                  >
                    Try the 3-minute demo <ArrowRight size={16} />
                  </button>
                  <button
                    className="gd-secondary"
                    onClick={() => setCreate(true)}
                  >
                    Upload your own handover <Upload size={16} />
                  </button>
                </div>
              </div>
              <figure
                className="gd-landing-preview"
                aria-label="How Company X’s records become a prepared import file"
              >
                <figcaption>
                  <span>Company X handover</span>
                </figcaption>
                <div className="gd-preview-journey">
                  <div>
                    <FileSpreadsheet size={20} />
                    <section>
                      <h3>The old administrator sends a file</h3>
                      <p>
                        Company X’s accounting records arrive in the old
                        system’s format.
                      </p>
                    </section>
                  </div>
                  <div>
                    <SearchCheck size={20} />
                    <section>
                      <h3>Streamline prepares it for your system</h3>
                      <p>
                        Records are matched to your template. You review
                        anything uncertain, and the amounts are checked.
                      </p>
                    </section>
                  </div>
                  <div>
                    <Download size={20} />
                    <section>
                      <h3>You receive a checked import file</h3>
                      <p>
                        Download the prepared records and the history of what
                        was changed and approved.
                      </p>
                    </section>
                  </div>
                </div>
              </figure>
            </div>
            <section
              className="gd-landing-process"
              aria-label="Checks behind the prepared file"
            >
              <article>
                <h2>You control the decisions</h2>
                <p>
                  AI suggestions are not approvals. Uncertain records stay on
                  hold until a reviewer confirms the match. If information is
                  missing, you can request clarification.
                </p>
              </article>
              <article>
                <h2>The numbers must match</h2>
                <p>
                  Calculations compare the original and prepared amounts and
                  check for missing records. A verified export is blocked while
                  any required check fails.
                </p>
              </article>
              <article>
                <h2>Every change has a source</h2>
                <p>
                  Follow a prepared entry back to its original spreadsheet row,
                  the mappings applied and the reviewer’s decision. The detailed
                  audit package keeps that evidence with the output.
                </p>
              </article>
            </section>
          </>
        ) : (
          <>
            <div className="gd-case-top">
              <button className="gd-back" onClick={home}>
                <ArrowLeft size={14} />
                Client handovers
              </button>
            </div>
            <div className="gd-case-title">
              <div>
                <h1>
                  {view.scope ? "Westvale’s handover" : view.migration.name}
                </h1>
              </div>
            </div>
            <nav className="gd-steps" aria-label="Onboarding steps">
              {[
                {
                  id: "understand" as Step,
                  label: "Understand the handover",
                  icon: FolderOpen,
                },
                {
                  id: "review" as Step,
                  label: "Make the decisions",
                  icon: ClipboardCheck,
                },
                {
                  id: "finish" as Step,
                  label: "Check & download",
                  icon: ShieldCheck,
                },
              ].map((s, i) => (
                <button
                  key={s.id}
                  className={step === s.id ? "gd-step-active" : ""}
                  onClick={() => {
                    setStep(s.id);
                    setChange(null);
                    setMessage("");
                  }}
                >
                  <span>
                    {(s.id === "review" && !view.guidance.remaining) ||
                    (s.id === "finish" && view.verified) ? (
                      <Check size={15} />
                    ) : (
                      i + 1
                    )}
                  </span>
                  {s.label}
                  <s.icon size={17} />
                </button>
              ))}
            </nav>
            {step === "understand" && (
              <>
                <section className="gd-intake">
                  <div className="gd-intake-copy">
                    <h2>
                      The records arrived.
                      <br />
                      We’ve done the first pass.
                    </h2>
                    <p>
                      We inspected the old administrator’s files and matched the
                      fund, investors, investments and accounts to records in
                      your system.
                    </p>
                    <p className="gd-role-explain">
                      <strong>Your job now:</strong> confirm the uncertain
                      relationships. You don’t need to check every spreadsheet
                      row.
                    </p>
                    <button
                      className="gd-primary"
                      onClick={() =>
                        setStep(view.guidance.remaining ? "review" : "finish")
                      }
                    >
                      {view.guidance.remaining
                        ? `Review ${view.guidance.remaining === 2 ? "the two" : number(view.guidance.remaining)} decisions`
                        : "Check & download"}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="gd-intake-summary">
                    <div className="gd-file-heading">
                      <FileSpreadsheet size={23} />
                      <div>
                        <strong>
                          {view.scope
                            ? "Westvale · Q2 2026"
                            : view.migration.name}
                        </strong>
                        <span>Historical fund records</span>
                      </div>
                    </div>
                    <div className="gd-intake-count">
                      <strong>{number(view.stats.records)}</strong>
                      <span>records in this handover</span>
                    </div>
                    <div className="gd-summary-line">
                      <CheckCircle2 size={17} />
                      <span>
                        {number(exact)} relationships matched automatically
                      </span>
                    </div>
                    <div className="gd-summary-line">
                      <CheckCircle2 size={17} />
                      <span>
                        {number(view.stats.eligible)} records currently ready
                      </span>
                    </div>
                    <div className="gd-summary-line gd-needs-review">
                      <MessageSquare size={17} />
                      <span>
                        {view.guidance.remaining} decisions need your judgement
                      </span>
                    </div>
                  </div>
                </section>

                {!view.guidance.remaining && (
                  <div className="gd-inline-success">
                    <CheckCircle2 size={19} />
                    No mapping decisions remain. Continue to the final checks.
                  </div>
                )}
              </>
            )}
            {step === "review" && (
              <>
                {message && (
                  <div className="gd-inline-success" role="status">
                    <CheckCircle2 size={17} />
                    {message}
                  </div>
                )}
                {change ? (
                  <section className="gd-change">
                    <span className="gd-large-check">
                      <Check size={29} />
                    </span>
                    <span className="gd-eyebrow">DECISION RECORDED</span>
                    <h2>
                      {change.unlocked
                        ? `${number(change.unlocked)} more records are ready.`
                        : "Your decision has been recorded."}
                    </h2>
                    <p>
                      {change.unlocked
                        ? "That one approval updated every affected record and reran the amount checks."
                        : "Some records depend on another decision too. They stay on hold until all their mappings are confirmed."}
                    </p>
                    <div className="gd-change-progress">
                      <span>
                        {number(change.ready)} of {number(view.stats.records)}{" "}
                        records ready
                      </span>
                      <div>
                        <i style={{ width: view.stats.readiness + "%" }} />
                      </div>
                    </div>
                    <button
                      className="gd-primary"
                      onClick={() => {
                        setChange(null);
                        setSelected("");
                        if (!change.remaining) setStep("finish");
                      }}
                    >
                      {change.remaining
                        ? `Next decision · ${change.remaining} remaining`
                        : "See the checked package"}
                      <ArrowRight size={17} />
                    </button>
                    <small>
                      Your approval and its source references are in the audit
                      trail.
                    </small>
                  </section>
                ) : decision ? (
                  <div className="gd-review-layout">
                    <aside className="gd-decision-nav">
                      <span className="gd-mini-label">YOUR REVIEW</span>
                      <h2>
                        {view.guidance.remaining}{" "}
                        {view.guidance.remaining === 1
                          ? "decision"
                          : "decisions"}{" "}
                        left
                      </h2>

                      {view.guidance.decisions.slice(0, 20).map((d, i) => (
                        <button
                          key={d.id}
                          className={
                            decision.id === d.id ? "gd-decision-active" : ""
                          }
                          onClick={() => {
                            setSelected(d.id);
                            setError("");
                            setMessage("");
                          }}
                        >
                          <span>{i + 1}</span>
                          <div>
                            {d.title}
                            <small>
                              {d.waiting
                                ? "Awaiting information"
                                : `${number(d.rows)} related records`}
                            </small>
                          </div>
                        </button>
                      ))}
                      <div className="gd-admin-tip">
                        <MessageSquare size={19} />
                        <strong>Don’t know the answer?</strong>
                        <p>
                          Ask the previous administrator. We prepare the
                          question and keep the affected records on hold.
                        </p>
                      </div>
                    </aside>
                    <section className="gd-decision">
                      <div className="gd-decision-heading">
                        <span className="gd-record-count">
                          {number(decision.rows)} affected records
                        </span>
                      </div>
                      <h2>{decision.title}</h2>
                      <p className="gd-decision-problem">{decision.problem}</p>
                      <div className="gd-agent gd-agent-featured">
                        <div className="gd-agent-heading">
                          <span>
                            <Sparkles size={16} />
                            {hasModel
                              ? "Gemini’s investigation"
                              : view.aiConfigured
                                ? "Gemini decision advice"
                                : "Reference evidence assistant"}
                          </span>
                        </div>
                        {suggestion ? (
                          <div>
                            {suggestion.advice ? (
                              <dl className="gd-advice">
                                <div>
                                  <dt>Recommendation</dt>
                                  <dd>{suggestion.advice.recommendation}</dd>
                                </div>
                                <div>
                                  <dt>Supporting evidence</dt>
                                  <dd>{suggestion.advice.evidence}</dd>
                                </div>
                                <div>
                                  <dt>What’s still uncertain</dt>
                                  <dd>{suggestion.advice.uncertainty}</dd>
                                </div>
                                <div>
                                  <dt>Your next action</dt>
                                  <dd>{suggestion.advice.nextAction}</dd>
                                </div>
                              </dl>
                            ) : (
                              <p>{suggestion.explanation}</p>
                            )}
                            {suggestion.trace && (
                              <details className="gd-advice-trace">
                                <summary>Evidence inspected</summary>
                                <ul>
                                  {suggestion.trace.map((line) => (
                                    <li key={line}>{line}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                            {!suggestion.candidates.length && (
                              <strong>
                                No match recommended. Request clarification or
                                explicitly select a target after review.
                              </strong>
                            )}
                          </div>
                        ) : (
                          <p>
                            Get a recommendation, the evidence behind it and a
                            specific next step. Gemini will identify what still
                            needs your confirmation.
                          </p>
                        )}
                        <button
                          className="gd-primary"
                          disabled={!!busy || !evidence}
                          onClick={() =>
                            act("investigate", { mappingId: decision.id })
                          }
                        >
                          <Sparkles size={14} />
                          {suggestion
                            ? view.aiConfigured
                              ? "Refresh Gemini advice"
                              : "Refresh reference evidence"
                            : view.aiConfigured
                              ? "Investigate with Gemini"
                              : "Inspect the reference evidence"}
                        </button>
                        {!view.aiConfigured && (
                          <small>
                            Gemini isn’t connected. Reference-based
                            investigation is still available.
                          </small>
                        )}
                      </div>
                      {evidence?.rows[0] ? (
                        <DecisionComparison
                          kind={decision.kind}
                          source={evidence.rows[0].source}
                          chosen={chosen}
                        />
                      ) : (
                        <p>Loading the original fields…</p>
                      )}

                      <details className="gd-evidence">
                        <summary>
                          Show me the evidence
                          <ChevronDown size={15} />
                        </summary>
                        {!evidence ? (
                          <p>Loading source evidence…</p>
                        ) : (
                          <>
                            <p>{evidence.mapping.explanation}</p>
                            {evidence.mapping.evidence.map((ref, i) => (
                              <div className="gd-reference" key={i}>
                                <FileSpreadsheet size={16} />
                                <span>
                                  <strong>
                                    {ref.sheet} · row {ref.row}
                                  </strong>
                                  <small>{ref.file}</small>
                                </span>
                              </div>
                            ))}
                            <span className="gd-mini-label">
                              EXAMPLES FROM THE ORIGINAL FILE
                            </span>
                            {evidence.rows.slice(0, 3).map(({ source: r }) => (
                              <div className="gd-source-example" key={r.id}>
                                <span>Source row {r.ref.row}</span>
                                <strong>{r.raw[18] || r.transType}</strong>
                                <p>
                                  {r.account} · {r.transType}
                                </p>
                                <small>
                                  {r.currency} {r.local} · original amount,
                                  unchanged
                                </small>
                              </div>
                            ))}
                            <a href={`/advanced?case=${view.migration.id}`}>
                              Open all records and mapping details
                              <ExternalLink size={12} />
                            </a>
                          </>
                        )}
                      </details>
                      <div className="gd-decision-actions">
                        {requestOpen ? (
                          <>
                            <h3>Ask the previous administrator</h3>
                            <p>
                              Here’s a request you can send. Include the source
                              references so they can answer without searching
                              the whole workbook.
                            </p>
                            <textarea
                              aria-label="Request to previous administrator"
                              rows={10}
                              value={requestText}
                              onChange={(e) => setRequestText(e.target.value)}
                            />
                            <div className="gd-action-row">
                              <button
                                className="gd-primary"
                                disabled={!!busy || !requestText.trim()}
                                onClick={() =>
                                  act("request", {
                                    mappingId: decision.id,
                                    note: requestText.slice(0, 2000),
                                  })
                                }
                              >
                                <Download size={15} />
                                Save & download request
                              </button>
                              <button
                                className="gd-text-button"
                                onClick={() => setRequestOpen(false)}
                              >
                                Back to the decision
                              </button>
                            </div>
                            <small>
                              Draft only. Nothing is emailed. These records
                              remain blocked until you confirm a resolution.
                            </small>
                          </>
                        ) : (
                          <>
                            {decision.waiting && (
                              <div className="gd-waiting-note">
                                <ClockLabel />
                                Request recorded. When you receive an answer,
                                add it below and review the mapping again.
                              </div>
                            )}
                            <label className="gd-confirm">
                              <input
                                type="checkbox"
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                              />
                              <span>
                                I confirm the selected destination is correct
                                for all affected records.
                              </span>
                            </label>
                            <label className="gd-note-label">
                              {decision.waiting
                                ? "Administrator response / reviewer note (required)"
                                : "Reviewer note (optional)"}
                              <textarea
                                rows={2}
                                placeholder={
                                  decision.waiting
                                    ? "Record the confirmation you received before approving…"
                                    : "Add context for the audit trail…"
                                }
                                value={note}
                                maxLength={1500}
                                onChange={(e) => setNote(e.target.value)}
                              />
                            </label>
                            <div className="gd-action-row">
                              <button
                                className="gd-primary"
                                disabled={
                                  !!busy ||
                                  !evidence ||
                                  !candidate ||
                                  !confirmed ||
                                  (decision.waiting && !note.trim())
                                }
                                onClick={() =>
                                  act("approve", {
                                    mappingId: decision.id,
                                    candidateId: candidate,
                                    note:
                                      `I reviewed the evidence and confirm target ${chosen?.label} (ID: ${candidate}).` +
                                      (note.trim()
                                        ? " Reviewer note: " + note.trim()
                                        : ""),
                                  })
                                }
                              >
                                <Check size={16} />
                                {decision.approval}
                              </button>
                              <button
                                className="gd-secondary"
                                onClick={request}
                                disabled={!!busy}
                              >
                                <MessageSquare size={15} />
                                Ask previous administrator
                              </button>
                            </div>

                            <details className="gd-alternate">
                              <summary>Need a different target record?</summary>
                              <label>
                                Select an existing record
                                <select
                                  aria-label="Alternative target record"
                                  value={candidate}
                                  onChange={(e) => {
                                    setCandidate(e.target.value);
                                    setConfirmed(false);
                                  }}
                                >
                                  <option value="">Choose a target</option>
                                  {evidence?.catalog.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <p>
                                Missing from this list? Request the correct
                                target identifier. We won’t invent a new record.
                              </p>
                            </details>
                          </>
                        )}
                      </div>
                    </section>
                  </div>
                ) : (
                  <section className="gd-change">
                    <span className="gd-large-check">
                      <Check size={29} />
                    </span>
                    <h2>Your mapping review is complete.</h2>
                    <p>Let’s check the amounts and prepare the package.</p>
                    <button
                      className="gd-primary"
                      onClick={() => setStep("finish")}
                    >
                      Check & download
                      <ArrowRight size={17} />
                    </button>
                  </section>
                )}
              </>
            )}
            {step === "finish" && (
              <>
                <section
                  className={
                    "gd-finish " + (view.verified ? "gd-finish-ready" : "")
                  }
                >
                  <span className="gd-finish-icon">
                    <ShieldCheck size={35} />
                  </span>
                  <span className="gd-eyebrow">
                    {view.verified
                      ? "THE HANDOVER IS CHECKED"
                      : "A FEW THINGS STILL NEED YOUR INPUT"}
                  </span>
                  <h2>
                    {view.verified
                      ? "Ready for your import review."
                      : "The package is on hold."}
                  </h2>
                  <p>
                    {view.verified
                      ? `All ${number(view.stats.records)} records in this ${view.scope ? "demo " : ""}package are mapped, and every amount check passes. You can now download the loader and its supporting evidence.`
                      : `${number(view.stats.blocked)} records are still held. Resolve the remaining decisions before we release a verified package.`}
                  </p>
                  <p>
                    <strong>
                      {number(view.stats.eligible)} records prepared ·{" "}
                      {number(view.stats.blocked)} blocked
                    </strong>
                  </p>
                  <div className="gd-check-list">
                    <CheckLine
                      pass={view.stats.eligible === view.stats.records}
                      text={`${number(view.stats.eligible)} of ${number(view.stats.records)} records ready`}
                    />
                    <CheckLine
                      pass={view.guidance.remaining === 0}
                      text={
                        view.guidance.remaining
                          ? `${view.guidance.remaining} decisions still need confirmation`
                          : "All mapping decisions confirmed"
                      }
                    />
                    <CheckLine
                      pass={view.stats.failed === 0}
                      text={
                        view.stats.failed
                          ? `${view.stats.failed} amount checks affected by held or invalid records`
                          : "Original amounts preserved — all checks passed"
                      }
                    />
                    <CheckLine
                      pass={true}
                      text="Source references and your decisions included"
                    />
                  </div>
                  {message && (
                    <p className="gd-check-message" role="status">
                      {message}
                    </p>
                  )}
                  <div className="gd-finish-actions">
                    {view.verified ? (
                      <button
                        className="gd-primary"
                        disabled={!!busy}
                        onClick={() => act("export", { verified: true })}
                      >
                        <Download size={17} />
                        {downloaded
                          ? "Download again"
                          : view.scope
                            ? "Download verified demo package"
                            : "Download verified package"}
                      </button>
                    ) : (
                      <button
                        className="gd-primary"
                        onClick={() => {
                          setStep("review");
                          setChange(null);
                        }}
                      >
                        Return to the decisions
                        <ArrowRight size={16} />
                      </button>
                    )}
                    <button
                      className="gd-secondary"
                      disabled={!!busy}
                      onClick={() => act("reconcile")}
                    >
                      <ShieldCheck size={15} />
                      Run checks again
                    </button>
                  </div>
                  {downloaded && (
                    <div className="gd-download-success" role="status">
                      <CheckCircle2 size={18} />
                      Package downloaded. No data has been uploaded to Corvus.
                    </div>
                  )}
                </section>
                <div className="gd-package-info">
                  <div>
                    <span className="gd-mini-label">
                      WHAT YOU HAND TO YOUR IMPORT TEAM
                    </span>
                    <h3>The loader and the proof behind it.</h3>
                    <p>
                      Three tabs: Upload Template, Reconciliation and Migration
                      Summary. Full mapping and source evidence remain available
                      in the optional detailed audit package.
                    </p>
                  </div>
                  <div>
                    <span className="gd-mini-label">WHAT HAPPENS NEXT</span>
                    <h3>Review, then import into Corvus.</h3>
                    <p>
                      Your team reviews the package and validates the target
                      system’s import requirements. This demo prepares the
                      handover; it does not connect to or upload into Corvus.
                    </p>
                  </div>
                </div>
                <details className="gd-quiet-details">
                  <summary>See one amount check and the approval trail</summary>
                  {view.reconciliation.slice(0, 1).map((check) => (
                    <div key={check.id}>
                      <h3>
                        {check.account} · {check.currency}
                      </h3>
                      <p>
                        Original: {check.source} → Prepared: {check.target}
                      </p>
                      <p>
                        Difference: {check.difference} · {check.included} of{" "}
                        {check.rows} records included · {check.status}
                      </p>
                      <p>
                        This checks preservation during conversion, not whether
                        the original accounting was correct.
                      </p>
                    </div>
                  ))}
                  <ul>
                    {view.migration.decisions
                      .filter((d) => d.action === "approve")
                      .map((d, i) => (
                        <li key={i}>
                          {d.reviewer}: {d.note}
                        </li>
                      ))}
                  </ul>
                </details>
                <ScopeNote view={view} />
                <details className="gd-quiet-details">
                  <summary>
                    Supporting checks & optional downloads
                    <ChevronDown size={14} />
                  </summary>
                  <p>
                    {view.stats.passed} of{" "}
                    {view.stats.passed + view.stats.failed} checks passed. We
                    verify both currencies, signed amounts, gross movements and
                    row completeness using exact arithmetic.
                  </p>
                  <button
                    className="gd-secondary"
                    disabled={!!busy}
                    onClick={() => act("export", { verified: false })}
                  >
                    <Download size={14} />
                    Download draft review package
                  </button>
                  <button
                    className="gd-secondary"
                    disabled={!!busy}
                    onClick={() =>
                      act("export", { verified: view.verified, detailed: true })
                    }
                  >
                    <Download size={14} />
                    Download detailed audit package (12 tabs)
                  </button>
                  <a href={`/advanced?case=${view.migration.id}`}>
                    Inspect the detailed reconciliation
                    <ExternalLink size={13} />
                  </a>
                </details>
              </>
            )}
          </>
        )}
        {view && (
          <footer className="gd-footer">
            <a
              href={view ? `/advanced?case=${view.migration.id}` : "/advanced"}
            >
              Detailed workspace
              <ExternalLink size={12} />
            </a>
          </footer>
        )}
      </main>
      {busy && (
        <div className="gd-busy" role="status">
          <Loader2 size={17} className="spin" />
          {busy}…
        </div>
      )}
      {create && (
        <div className="gd-modal-backdrop" onClick={() => setCreate(false)}>
          <section
            className="gd-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Upload a client handover"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gd-modal-title">
              <h2>Start a client handover</h2>
              <button
                onClick={() => setCreate(false)}
                aria-label="Close upload"
              >
                <X size={19} />
              </button>
            </div>
            <p>
              Upload the historical fund records you received from the previous
              administrator.
            </p>
            {error && (
              <p className="gd-error" role="alert">
                {error}
              </p>
            )}
            <form onSubmit={upload}>
              <label>
                Client / fund name
                <input
                  required
                  name="name"
                  placeholder="Client name"
                  maxLength={120}
                />
              </label>
              <div className="gd-form-grid">
                <label>
                  Previous administrator
                  <input
                    required
                    name="sourceAdmin"
                    defaultValue="Legacy Admin"
                  />
                </label>
                <label>
                  Your target system
                  <select name="targetSystem">
                    <option>Corvus</option>
                  </select>
                </label>
                <label>
                  Handover date
                  <input
                    type="date"
                    required
                    name="date"
                    defaultValue="2026-06-30"
                  />
                </label>
                <label>
                  Base currency
                  <select name="baseCurrency">
                    <option>GBP</option>
                    <option>USD</option>
                    <option>EUR</option>
                  </select>
                </label>
              </div>
              <label
                className="gd-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  setFile(e.dataTransfer.files[0] || null);
                }}
              >
                <Upload size={24} />
                <strong>{file?.name || "Drop the source workbook here"}</strong>
                <span>Or click to choose an .xlsx file</span>
                <input
                  type="file"
                  aria-label="Source workbook"
                  accept=".xlsx"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <small>
                Supports the supplied investor-level GL layout, up to 30 MB.
                Other layouts need an adapter.
              </small>
              <button className="gd-primary" disabled={!file || !!busy}>
                Read the handover
                <ArrowRight size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
function ScopeNote({ view }: { view: CaseView }) {
  return view.scope ? (
    <details className="gd-scope-note">
      <summary>
        <ShieldCheck size={14} />
        Demo scope: one complete fund, not the whole workbook
        <ChevronDown size={14} />
      </summary>
      <p>
        Includes all <strong>{number(view.scope.includedRecords)}</strong>{" "}
        source rows for {view.scope.entity}, with every batch intact. The
        original workbook has {number(view.scope.originalRecords)} rows; the
        other {number(view.scope.excludedRecords)} belong to other entities and
        are outside this package. Their unresolved items remain unchanged.
      </p>
    </details>
  ) : (
    <div className="gd-scope-note">
      <p>
        This case includes all {number(view.stats.records)} uploaded source
        rows. No records are removed to improve readiness.
      </p>
    </div>
  );
}
function CheckLine({ pass, text }: { pass: boolean; text: string }) {
  return (
    <div className={pass ? "gd-check-pass" : "gd-check-pending"}>
      {pass ? <CheckCircle2 size={19} /> : <MessageSquare size={19} />}
      <span>{text}</span>
    </div>
  );
}
function ClockLabel() {
  return <MessageSquare size={15} />;
}

function DecisionComparison({
  kind,
  source,
  chosen,
}: {
  kind: Mapping["kind"];
  source: SourceRecord;
  chosen?: Candidate;
}) {
  const v = chosen?.values;
  const blank = (value?: string) => value || "Not provided";
  const target = (value?: string) =>
    chosen ? value || "None selected" : "Choose a destination";
  const rows: [string, string, string][] =
    kind === "Chart of accounts"
      ? [
          ["Accounting category", blank(source.account), target(v?.account)],
          ["Transaction type", blank(source.transType), target(v?.transType)],
        ]
      : kind === "Deal / position"
        ? [
            ["Deal / activity", blank(source.deal), target(v?.name)],
            [
              "Specific holding (position)",
              blank(source.position),
              chosen
                ? v?.position || "No specific investment holding"
                : "Choose a destination",
            ],
            [
              "Holding identifier",
              blank(source.raw[8]),
              chosen
                ? v?.positionId || "No holding identifier"
                : "Choose a destination",
            ],
          ]
        : kind === "Investor"
          ? [
              ["Investor", blank(source.investor), target(v?.name)],
              ["Investor identifier", blank(source.externalId), target(v?.id)],
            ]
          : [
              ["Fund / legal entity", blank(source.entity), target(v?.name)],
              [
                "Destination identifier",
                "Uses the old system’s identity",
                target(v?.id),
              ],
            ];
  return (
    <section
      className="gd-decision-comparison"
      aria-label="Original fields and proposed destination"
    >
      <div className="gd-comparison-title">
        <h3>What would change</h3>
      </div>
      <div className="gd-comparison-scroll">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Original file</th>
              <th>Selected destination</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, before, after]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{before}</td>
                <td>{after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <small>
        {source.ref.sheet} · source row {source.ref.row}. This is one example
        from the affected records.
      </small>
    </section>
  );
}
