import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const baseline = JSON.parse(readFileSync(new URL("../baseline-tools.json", import.meta.url), "utf8").replace(/^\uFEFF/, ""));
const client = new Client({ name: "custom-contract-check", version: "1.0" });
const transport = new StdioClientTransport({
  command: process.execPath, args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
  env: { ...Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)), REVIT_MCP_PROFILE: "" },
  stderr: "pipe", cwd: root,
});
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const actual = new Map(tools.map(t => [t.name, t]));
  for (const name of baseline.tools) assert(actual.has(name), "Missing original tool: " + name);
  assert.equal(tools.length, 98);
  for (const name of ["revit_create_beam", "revit_create_column", "revit_duplicate_family_type", "revit_load_family", "revit_batch"]) {
    const properties = actual.get(name).inputSchema.properties;
    for (const field of ["dryRun", "approvalToken", "operationId", "expectedDocumentKey"])
      assert(field in properties, name + " lacks " + field);
  }
  for (const name of ["revit_inspect_elements", "revit_structural_snapshot", "revit_operation_status", "revit_save_document"])
    assert(actual.has(name), "Missing custom tool: " + name);
  assert("typeId" in actual.get("revit_create_beam").inputSchema.properties);
  assert("offset" in actual.get("revit_get_linked_elements").inputSchema.properties);
  writeFileSync(new URL("../custom-tool-manifest.json", import.meta.url), JSON.stringify({ version: "0.9.0", tools }, null, 2));
  console.log("MCP handshake passed: all 94 original tools retained; 4 additions; 98 tool schemas discovered.");
} finally {
  await client.close();
}
