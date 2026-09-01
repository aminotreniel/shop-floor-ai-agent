import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addEvent } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(__dirname, "../data");
const readJson = (filename) => JSON.parse(fs.readFileSync(path.join(dataDirectory, filename), "utf8"));

const panels = readJson("panels.json");
const workstations = readJson("workstations.json");
const sops = readJson("sops.json");

function normalized(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function getPanel({ panel_code }) {
  const panel = panels.find((item) => item.panelCode === normalized(panel_code));
  if (!panel) {
    return { found: false, error: "PANEL_NOT_FOUND", source: "Panel data" };
  }
  return { found: true, panel, source: `Panel ${panel.panelCode}` };
}

export function getWorkstationRequirements({ workstation_id }) {
  const workstation = workstations.find((item) => item.workstationId === normalized(workstation_id));
  if (!workstation) {
    return { found: false, error: "WORKSTATION_NOT_FOUND", source: "Workstation data" };
  }
  return { found: true, workstation, source: `Workstation ${workstation.workstationId}` };
}

export function searchSop({ query }) {
  const terms = (typeof query === "string" ? query : "").toLowerCase().split(/\s+/).filter(Boolean);
  const results = sops.filter((sop) =>
    sop.keywords.some((keyword) => terms.some((term) => keyword.includes(term) || term.includes(keyword)))
  );
  return {
    found: results.length > 0,
    results,
    source: results.map((sop) => sop.title),
  };
}

export function recordEvent({ type, panel_code, workstation_id, question, outcome }) {
  const event = addEvent({
    type: type || "SCAN",
    panelCode: panel_code || null,
    workstationId: workstation_id || null,
    question: question || null,
    outcome: outcome || "Completed",
  });
  return { recorded: true, event, source: "Activity history" };
}

export function escalateToSupervisor({ reason, panel_code, workstation_id }) {
  const escalation = addEvent({
    type: "ESCALATION",
    panelCode: panel_code || null,
    workstationId: workstation_id || null,
    reason: reason || "Information requires supervisor review.",
    outcome: "Supervisor review requested",
    status: "OPEN",
  });
  return { escalated: true, escalation, source: "Escalation log" };
}

export const toolHandlers = {
  get_panel: getPanel,
  get_workstation_requirements: getWorkstationRequirements,
  search_sop: searchSop,
  record_event: recordEvent,
  escalate_to_supervisor: escalateToSupervisor,
};

export function getReferenceData() {
  return { panels, workstations };
}
