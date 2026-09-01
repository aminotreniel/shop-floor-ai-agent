import assert from "node:assert/strict";
import test from "node:test";
import { getPanel, getWorkstationRequirements, searchSop } from "../src/tools.js";

test("finds a known panel from structured mock data", () => {
  const result = getPanel({ panel_code: "p-1001" });
  assert.equal(result.found, true);
  assert.equal(result.panel.requiredOperation, "EDGE_BANDING");
  assert.equal(result.source, "Panel P-1001");
});

test("returns a safe result for an unknown panel", () => {
  const result = getPanel({ panel_code: "P-9999" });
  assert.deepEqual(result, { found: false, error: "PANEL_NOT_FOUND", source: "Panel data" });
});

test("defines the Edge Banding station's supported operation", () => {
  const result = getWorkstationRequirements({ workstation_id: "EDGE-01" });
  assert.deepEqual(result.workstation.supportedOperations, ["EDGE_BANDING"]);
});

test("retrieves the approved Edge Banding SOP", () => {
  const result = searchSop({ query: "edge banding" });
  assert.equal(result.found, true);
  assert.equal(result.results[0].id, "SOP-EDGE-01");
});
