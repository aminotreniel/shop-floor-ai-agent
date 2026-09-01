# Shop-Floor AI Agent

Demo URL: Local demo (`http://localhost:5173`)

Repository: https://github.com/aminotreniel/shop-floor-ai-agent

LLM provider: Anthropic Claude (`claude-haiku-4-5`)

Agent approach: Claude tool-calling loop with deterministic safety guardrails

Data storage: Local JSON mock data and in-memory activity history

Approximate time spent: [Update before submission]

## Overview

An operator selects a workstation and scans a cabinet panel code. The agent retrieves trusted panel data, validates the selected workstation, retrieves a relevant SOP, records the activity, and safely escalates uncertain or unsupported situations.

Production facts come from structured JSON data—not the LLM.

## Architecture

```text
React + Vite UI → Express API → Claude tool-calling agent → JSON panel/workstation/SOP data
```

Available tools: `get_panel`, `get_workstation_requirements`, `search_sop`, `record_event`, and `escalate_to_supervisor`.

## Setup

Requires Node.js 20+.

```bash
npm run install:all
cp server/.env.example server/.env
```

Set the required Claude configuration in `server/.env`:

```env
ANTHROPIC_API_KEY=your_key
ANTHROPIC_WORKSPACE_ID=wrkspc_your_workspace_id_if_required
ANTHROPIC_MODEL=claude-haiku-4-5
PORT=3001
```

Run in separate terminals:

```bash
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173`.

## Required Test Results

- [x] Correct Workstation — `EDGE-01` + `P-1001`
- [x] Wrong Workstation — `EDGE-01` + `P-1002`
- [x] Unsupported Question / No Hallucination — asks for spindle speed
- [x] Unknown Panel — `P-9999`
- [x] Supervisor Escalation — panel-label mismatch

Run automated checks:

```bash
npm test
npm run build
```

## Technical Questions

**How does the agent decide which tool to call?** Claude receives the operator context, tool descriptions, and safety rules; it selects tools, reads their results, and can call more tools before responding.

**What tools are available?** Panel lookup, workstation lookup, SOP search, event recording, and supervisor escalation.

**What comes from structured data?** Panel facts, workstation capabilities, routing, and SOP content.

**How are invented answers prevented?** The prompt prohibits invented production data and settings; missing, conflicting, or safety-sensitive information results in safe guidance and escalation. The server also prevents unknown or mismatched panels from being displayed as safe.

**What happens if a tool or LLM fails?** The app returns a safe “do not process until verified” message and records available trace information.

**What would be improved with one more day?** Persist activity history in SQLite and add integration tests using mocked Claude responses.

## Security

`server/.env` is ignored by Git. Never commit API keys or expose them in the browser.
