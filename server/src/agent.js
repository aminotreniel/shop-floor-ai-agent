import Anthropic from "@anthropic-ai/sdk";
import { tools } from "./tool-definitions.js";
import { toolHandlers } from "./tools.js";

const SYSTEM_PROMPT = `You are Shop-Floor Assistant, a cautious production-support agent.

Your job is to identify a panel, determine whether it is at the correct workstation, and give concise instructions only from approved tool results.

Rules:
- Never invent panel facts, cabinet IDs, dimensions, materials, operations, SOP steps, machine settings, speeds, tooling parameters, or safety procedures.
- Before describing a panel, call get_panel. Before deciding whether a selected station is correct, call get_workstation_requirements.
- For a normal scan with a found panel, retrieve relevant SOP information with search_sop before final instructions.
- If a panel is unknown, say exactly "Panel Not Found" and never invent panel details.
- When the panel operation is not supported by the selected station, clearly say "Do not process this panel at this workstation" and state the trusted next workstation.
- If the question cannot be supported by returned panel/SOP data, say the available data does not provide the answer. Do not guess. For machine setting, tooling, speed, safety-sensitive questions, or a reported physical-label/system mismatch, call escalate_to_supervisor and tell the operator to stop processing.
- After reaching an outcome, call record_event.
- Cite concise tool sources in the answer. Do not reveal chain-of-thought; only provide the operational result.
`;

function initialContext({ workstationId, panelCode, question }) {
  return [
    `Selected workstation ID: ${workstationId}`,
    `Scanned panel code: ${panelCode || "not provided"}`,
    `Operator question: ${question || "none"}`,
  ].join("\n");
}

function sourcesFromTrace(trace) {
  return [...new Set(trace.flatMap((item) => Array.isArray(item.source) ? item.source : [item.source]).filter(Boolean))];
}

function deriveStatus(toolResults) {
  const panelResult = toolResults.find((item) => item.tool === "get_panel")?.result;
  const stationResult = toolResults.find((item) => item.tool === "get_workstation_requirements")?.result;
  const escalated = toolResults.some((item) => item.tool === "escalate_to_supervisor" && item.result?.escalated);

  if (panelResult && !panelResult.found) return "PANEL_NOT_FOUND";
  if (escalated) return "ESCALATED";
  if (panelResult?.panel && stationResult?.workstation && !stationResult.workstation.supportedOperations.includes(panelResult.panel.requiredOperation)) {
    return "DO_NOT_PROCESS";
  }
  if (panelResult?.panel && stationResult?.workstation) return "SAFE_TO_PROCESS";
  return "NEEDS_VERIFICATION";
}

function escalationReason(question) {
  if (/label.*(does not match|mismatch|different)|system information.*(does not match|mismatch)/i.test(question || "")) {
    return "Physical panel label does not match system information.";
  }
  if (/spindle|speed|rpm|tooling|machine setting|setting/i.test(question || "")) {
    return "Unsupported machine setting or safety-sensitive question.";
  }
  return null;
}

function enforceSafetyFinalAnswer({ status, answer, panel }) {
  if (status === "PANEL_NOT_FOUND") {
    return "Panel Not Found. Do not process this panel until its code has been verified.";
  }
  if (status === "DO_NOT_PROCESS") {
    return `Do not process this panel at this workstation. ${panel?.panelCode || "The panel"} requires ${panel?.requiredOperation || "a different operation"} and must move to ${panel?.nextWorkstationId || "the verified next workstation"}.`;
  }
  if (status === "ESCALATED") {
    return "Stop processing. The available system data cannot safely resolve this issue, so a supervisor review has been requested.";
  }
  if (status === "NEEDS_VERIFICATION") {
    return "The panel information could not be verified. Do not process the panel until it has been checked by a supervisor.";
  }
  return answer;
}

function publicTrace(toolResults) {
  return toolResults.map(({ tool, input, success, source, error }) => ({ tool, input, success, source, error }));
}

function executeTool(name, input, toolResults) {
  const handler = toolHandlers[name];
  if (!handler) {
    const result = { error: "UNKNOWN_TOOL" };
    toolResults.push({ tool: name, input, success: false, error: result.error, result });
    return result;
  }
  try {
    const result = handler(input);
    toolResults.push({ tool: name, input, success: true, source: result.source, result });
    return result;
  } catch {
    const result = { error: "TOOL_FAILED", message: "The requested data could not be retrieved." };
    toolResults.push({ tool: name, input, success: false, error: result.error, result });
    return result;
  }
}

function localAnswer({ panelCode, workstationId, question, toolResults }) {
  const panelResult = toolResults.find((item) => item.tool === "get_panel")?.result;
  const stationResult = toolResults.find((item) => item.tool === "get_workstation_requirements")?.result;
  const sopResult = toolResults.find((item) => item.tool === "search_sop")?.result;
  const status = deriveStatus(toolResults);
  const panel = panelResult?.panel;
  const station = stationResult?.workstation;

  if (status === "PANEL_NOT_FOUND") {
    return { status, answer: "Panel Not Found. Do not process this panel until its code has been verified.", panel: null };
  }
  if (status === "ESCALATED") {
    return { status, answer: "Stop processing. The available system data cannot safely resolve this issue, so a supervisor review has been requested.", panel };
  }
  if (status === "DO_NOT_PROCESS") {
    const target = panel.nextWorkstationId;
    return { status, answer: `Do not process this panel at this workstation. ${panel.panelCode} requires ${panel.requiredOperation} and must move to ${target}.`, panel };
  }
  if (question) {
    const hasSopAnswer = sopResult?.found && !/spindle|speed|rpm|tooling|machine setting|setting/i.test(question);
    if (!hasSopAnswer) {
      return { status: "ESCALATED", answer: "The available SOP data does not provide that answer. Do not guess or change settings; supervisor review has been requested.", panel };
    }
    return { status, answer: `${sopResult.results[0].content} Source: ${sopResult.results[0].title}.`, panel };
  }
  return {
    status,
    answer: `${panel.panelCode} (${panel.panelName}) is confirmed for ${station.name}. ${station.operatorInstruction} ${sopResult?.results?.[0]?.content || ""}`.trim(),
    panel,
  };
}

function runLocalGuidedDemo({ workstationId, panelCode, question }) {
  const toolResults = [];
  const panelResult = executeTool("get_panel", { panel_code: panelCode }, toolResults);
  const stationResult = executeTool("get_workstation_requirements", { workstation_id: workstationId }, toolResults);
  const reasonForEscalation = escalationReason(question);

  if (panelResult.found && stationResult.found && stationResult.workstation.supportedOperations.includes(panelResult.panel.requiredOperation) && !reasonForEscalation) {
    executeTool("search_sop", { query: stationResult.workstation.sopTopic }, toolResults);
  }
  if (reasonForEscalation) {
    executeTool("escalate_to_supervisor", {
      reason: reasonForEscalation,
      panel_code: panelCode,
      workstation_id: workstationId,
    }, toolResults);
  }

  const response = localAnswer({ panelCode, workstationId, question, toolResults });
  executeTool("record_event", {
    type: question ? "QUESTION" : "SCAN",
    panel_code: panelCode,
    workstation_id: workstationId,
    question: question || undefined,
    outcome: response.status,
  }, toolResults);

  return {
    ...response,
    trace: publicTrace(toolResults),
    sources: sourcesFromTrace(toolResults),
    mode: "guided-demo",
  };
}

async function runLiveAgent({ workstationId, panelCode, question }) {
  const clientOptions = { apiKey: process.env.ANTHROPIC_API_KEY };
  if (process.env.ANTHROPIC_WORKSPACE_ID) {
    clientOptions.defaultHeaders = { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID };
  }
  const client = new Anthropic(clientOptions);
  const toolResults = [];
  const messages = [{ role: "user", content: initialContext({ workstationId, panelCode, question }) }];
  let response;

  for (let step = 0; step < 8; step += 1) {
    response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      tool_choice: { type: "auto" },
    });

    const calls = response.content.filter((item) => item.type === "tool_use");
    if (calls.length === 0) break;

    messages.push({ role: "assistant", content: response.content });
    const outputs = calls.map((call) => {
      const result = executeTool(call.name, call.input, toolResults);
      return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) };
    });
    messages.push({ role: "user", content: outputs });
  }

  if (!response) throw new Error("Claude did not return a response.");

  // These deterministic safety rails run only if the model missed a required
  // action. They never turn an uncertain result into a safe one.
  const reasonForEscalation = escalationReason(question);
  if (reasonForEscalation && !toolResults.some((item) => item.tool === "escalate_to_supervisor" && item.result?.escalated)) {
    executeTool("escalate_to_supervisor", {
      reason: reasonForEscalation,
      panel_code: panelCode,
      workstation_id: workstationId,
    }, toolResults);
  }

  const status = deriveStatus(toolResults);
  if (!toolResults.some((item) => item.tool === "record_event" && item.result?.recorded)) {
    executeTool("record_event", {
      type: question ? "QUESTION" : "SCAN",
      panel_code: panelCode,
      workstation_id: workstationId,
      question: question || undefined,
      outcome: status,
    }, toolResults);
  }
  const panel = toolResults.find((item) => item.tool === "get_panel")?.result?.panel || null;
  const modelAnswer = response.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim() || "The information could not be completed. Do not process the panel until verified.";

  return {
    status,
    answer: enforceSafetyFinalAnswer({ status, answer: modelAnswer, panel }),
    panel,
    trace: publicTrace(toolResults),
    sources: sourcesFromTrace(toolResults),
    mode: "live-claude",
  };
}

export async function runAgent(request) {
  if (!process.env.ANTHROPIC_API_KEY) return runLocalGuidedDemo(request);
  return runLiveAgent(request);
}
