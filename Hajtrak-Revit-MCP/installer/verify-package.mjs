import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const baseline = JSON.parse(readFileSync(new URL('../baseline-tools.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
const client = new Client({ name: 'hajtrak-installer-verification', version: '0.9.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../dist/index.js', import.meta.url))],
    env: { ...process.env, REVIT_MCP_PROFILE: '' }, stderr: 'pipe' }));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 98);
  for (const name of baseline.tools) assert(tools.some(t => t.name === name), `Missing original tool: ${name}`);
  console.log(JSON.stringify({ toolCount: tools.length, originalToolsRetained: baseline.tools.length }));
} finally { await client.close(); }
