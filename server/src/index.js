import "dotenv/config";
import cors from "cors";
import express from "express";
import { runAgent } from "./agent.js";
import { getEvents } from "./store.js";
import { getReferenceData } from "./tools.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_request, response) => response.json({ ok: true }));
app.get("/api/reference", (_request, response) => response.json(getReferenceData()));
app.get("/api/history", (_request, response) => response.json(getEvents()));

app.post("/api/agent", async (request, response) => {
  const { workstationId, panelCode, question } = request.body || {};
  if (typeof workstationId !== "string" || !workstationId.trim()) {
    return response.status(400).json({ error: "Select a workstation before continuing." });
  }
  if (typeof panelCode !== "string" || !panelCode.trim()) {
    return response.status(400).json({ error: "Enter or scan a panel code before continuing." });
  }
  if (question != null && (typeof question !== "string" || question.length > 500)) {
    return response.status(400).json({ error: "Questions must be plain text and no longer than 500 characters." });
  }

  try {
    return response.json(await runAgent({
      workstationId: workstationId.trim(),
      panelCode: panelCode.trim(),
      question: question?.trim() || "",
    }));
  } catch (error) {
    console.error("Agent request failed:", error.message);
    if (error.status === 400 && /anthropic-workspace-id is required/i.test(error.message)) {
      return response.status(503).json({
        error: "Claude needs a workspace ID for this API key. Add ANTHROPIC_WORKSPACE_ID=wrkspc_... to server/.env, then restart the backend.",
      });
    }
    if (error.status === 404 && /workspace .* not found/i.test(error.message)) {
      return response.status(503).json({
        error: "The configured Claude workspace is not available to this API key. Confirm the workspace ID in Claude Platform Console and that this key has access to it.",
      });
    }
    return response.status(502).json({
      error: "The assistant is temporarily unavailable. Do not process the panel until its information has been verified.",
    });
  }
});

if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`Shop-Floor API running at http://localhost:${port}`));
}

export default app;
