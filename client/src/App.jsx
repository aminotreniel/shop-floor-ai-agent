import { useEffect, useMemo, useState } from "react";

const demos = [
  { label: "Correct station", workstationId: "EDGE-01", panelCode: "P-1001", question: "" },
  { label: "Wrong station", workstationId: "EDGE-01", panelCode: "P-1002", question: "" },
  { label: "Unsupported question", workstationId: "DRILL-01", panelCode: "P-1002", question: "What spindle speed should I use?" },
  { label: "Unknown panel", workstationId: "EDGE-01", panelCode: "P-9999", question: "" },
  { label: "Label mismatch", workstationId: "EDGE-01", panelCode: "P-1001", question: "The physical panel label does not match the system information." },
];

const statusLabels = {
  SAFE_TO_PROCESS: "Safe to process",
  DO_NOT_PROCESS: "Do not process",
  PANEL_NOT_FOUND: "Panel not found",
  ESCALATED: "Supervisor review requested",
  NEEDS_VERIFICATION: "Needs verification",
};

function prettyTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Trace({ entries }) {
  if (!entries?.length) return <p className="empty">Run a check to see the agent's tool activity.</p>;
  return <ol className="trace-list">
    {entries.map((entry, index) => (
      <li key={`${entry.tool}-${index}`} className={entry.success ? "trace-success" : "trace-failure"}>
        <span aria-hidden="true">{entry.success ? "✓" : "!"}</span>
        <code>{entry.tool}({JSON.stringify(entry.input)})</code>
        {entry.source && <small>Source: {Array.isArray(entry.source) ? entry.source.join(", ") : entry.source}</small>}
      </li>
    ))}
  </ol>;
}

function PanelFacts({ panel }) {
  if (!panel) return null;
  return <dl className="panel-facts">
    <div><dt>Panel code</dt><dd>{panel.panelCode}</dd></div>
    <div><dt>Cabinet ID</dt><dd>{panel.cabinetId}</dd></div>
    <div><dt>Panel name</dt><dd>{panel.panelName}</dd></div>
    <div><dt>Dimensions</dt><dd>{panel.dimensions}</dd></div>
    <div><dt>Material</dt><dd>{panel.material}</dd></div>
    <div><dt>Required operation</dt><dd>{panel.requiredOperation.replaceAll("_", " ")}</dd></div>
  </dl>;
}

export default function App() {
  const [workstationId, setWorkstationId] = useState("EDGE-01");
  const [panelCode, setPanelCode] = useState("P-1001");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [reference, setReference] = useState({ panels: [], workstations: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedWorkstation = useMemo(
    () => reference.workstations.find((station) => station.workstationId === workstationId),
    [reference.workstations, workstationId],
  );

  async function loadHistory() {
    const response = await fetch("/api/history");
    if (response.ok) setHistory(await response.json());
  }

  useEffect(() => {
    Promise.all([fetch("/api/reference"), fetch("/api/history")])
      .then(async ([referenceResponse, historyResponse]) => {
        if (referenceResponse.ok) setReference(await referenceResponse.json());
        if (historyResponse.ok) setHistory(await historyResponse.json());
      })
      .catch(() => setError("Unable to contact the server. Start the backend and try again."));
  }, []);

  async function submit(event) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workstationId, panelCode, question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The request could not be completed.");
      setResult(data);
      await loadHistory();
    } catch (requestError) {
      setError(requestError.message || "The request could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  function runDemo(demo) {
    setWorkstationId(demo.workstationId);
    setPanelCode(demo.panelCode);
    setQuestion(demo.question);
    setResult(null);
    setError("");
    window.setTimeout(() => {
      const form = document.getElementById("operator-form");
      form?.requestSubmit();
    }, 0);
  }

  return <main className="app-shell">
    <header className="hero">
      <p className="eyebrow">ABC Cabinet · Prototype</p>
      <h1>Shop-Floor AI Agent</h1>
      <p>Verify a panel, check its workstation, and follow only approved production information.</p>
    </header>

    <section className="demo-strip" aria-label="Required assessment examples">
      <span>Quick demos</span>
      {demos.map((demo) => <button type="button" className="chip" key={demo.label} onClick={() => runDemo(demo)}>{demo.label}</button>)}
    </section>

    <div className="content-grid">
      <section className="card operator-card">
        <h2>Operator check</h2>
        <form id="operator-form" onSubmit={submit}>
          <label htmlFor="workstation">Selected workstation</label>
          <select id="workstation" value={workstationId} onChange={(event) => setWorkstationId(event.target.value)}>
            {reference.workstations.length ? reference.workstations.map((station) => (
              <option value={station.workstationId} key={station.workstationId}>{station.name} ({station.workstationId})</option>
            )) : <><option value="EDGE-01">Edge Banding (EDGE-01)</option><option value="DRILL-01">Drilling (DRILL-01)</option></>}
          </select>
          {selectedWorkstation && <p className="station-hint">Handles: {selectedWorkstation.supportedOperations.join(", ").replaceAll("_", " ")}</p>}

          <label htmlFor="panel-code">Panel code</label>
          <input id="panel-code" value={panelCode} onChange={(event) => setPanelCode(event.target.value)} placeholder="Example: P-1001" autoComplete="off" />

          <label htmlFor="question">Question <span>(optional)</span></label>
          <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask only about panel data or approved SOP information." rows="3" />

          <button className="primary" disabled={loading}>{loading ? "Checking…" : "Check panel"}</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <section className="card response-card" aria-live="polite">
        <div className="section-heading"><h2>Agent response</h2>{result && <span className={`status status-${result.status}`}>{statusLabels[result.status] || result.status}</span>}</div>
        {!result && <p className="empty">Enter a panel code to receive grounded instructions and a visible tool trace.</p>}
        {result && <>
          <p className="mode">{result.mode === "live-claude" ? "Live Claude tool-calling" : "Guided local demo — add ANTHROPIC_API_KEY for live tool-calling"}</p>
          <p className="answer">{result.answer}</p>
          <PanelFacts panel={result.panel} />
          {result.sources?.length > 0 && <p className="sources"><strong>Sources:</strong> {result.sources.join(" · ")}</p>}
        </>}
      </section>

      <section className="card trace-card">
        <h2>Agent tool trace</h2>
        <p className="muted">Execution log only—no private reasoning.</p>
        <Trace entries={result?.trace} />
      </section>

      <section className="card history-card">
        <h2>Recent activity</h2>
        {!history.length ? <p className="empty">No events recorded yet.</p> : <ul className="history-list">
          {history.map((event) => <li key={event.id}>
            <span className="history-type">{event.type}</span>
            <div><strong>{event.outcome}</strong><small>{event.panelCode || "No panel"} · {event.workstationId || "No station"} · {prettyTime(event.timestamp)}</small></div>
          </li>)}
        </ul>}
      </section>
    </div>

    <footer>Production facts are retrieved from structured mock data. The assistant must not invent missing machine settings or safety procedures.</footer>
  </main>;
}
