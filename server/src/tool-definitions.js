export const tools = [
  {
    name: "get_panel",
    description: "Retrieve structured production facts for a scanned panel. Use before giving panel facts or deciding routing.",
    input_schema: {
      type: "object",
      properties: { panel_code: { type: "string" } },
      required: ["panel_code"],
      additionalProperties: false,
    },
  },
  {
    name: "get_workstation_requirements",
    description: "Retrieve a workstation's supported operations and approved instruction. Use when evaluating a selected workstation.",
    input_schema: {
      type: "object",
      properties: { workstation_id: { type: "string" } },
      required: ["workstation_id"],
      additionalProperties: false,
    },
  },
  {
    name: "search_sop",
    description: "Search approved SOP content. Use for operation instructions or questions that can be answered by the available SOP.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "record_event",
    description: "Record the completed scan or question in activity history after reaching an outcome.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["SCAN", "QUESTION"] },
        panel_code: { type: "string" },
        workstation_id: { type: "string" },
        question: { type: "string" },
        outcome: { type: "string" },
      },
      required: ["type", "outcome"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_to_supervisor",
    description: "Escalate when labels conflict, data is missing/inconsistent, or a safety-sensitive unsupported setting is requested.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
        panel_code: { type: "string" },
        workstation_id: { type: "string" },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];
