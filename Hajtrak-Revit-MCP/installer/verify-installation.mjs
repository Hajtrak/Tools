// Exercise the real release payload in disposable directories, never the user's profile.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { install, uninstall } from './engine/install.mjs';

const packageDir = path.resolve(process.argv[2]);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Hajtrak-Release-Verification-'));
const options = { packageDir, installDir: path.join(root, 'application with spaces'),
  addinDir: path.join(root, 'synthetic addins'), configPath: path.join(root, 'synthetic codex', 'config.toml'), configureCodex: true };
const installed = install(options);
const node = path.join(installed.versionDir, 'Node', 'node.exe');
const discovery = JSON.parse(execFileSync(node, [path.join(installed.versionDir, 'McpServer', 'scripts', 'verify-package.mjs')], { encoding: 'utf8' }));
assert.equal(discovery.toolCount, 98);
fs.appendFileSync(options.configPath, '\n[mcp_servers.unrelated]\ncommand = "retained"\n');
uninstall(options);
assert(!fs.existsSync(path.join(options.addinDir, 'RevitMCPAddin.addin')));
assert.match(fs.readFileSync(options.configPath, 'utf8'), /command = "retained"/);
assert(!fs.readFileSync(options.configPath, 'utf8').includes('[mcp_servers.hajtrak-revit-2026]'));

// Existing integration migration and restore, using synthetic files only.
fs.writeFileSync(path.join(options.addinDir, 'RevitMCPAddin.dll'), 'synthetic previous add-in');
fs.appendFileSync(options.configPath, '\n[mcp_servers.revit-2026]\ncommand = "previous"\n');
install(options);
assert(!fs.readFileSync(options.configPath, 'utf8').includes('[mcp_servers.revit-2026]'));
uninstall(options);
assert.equal(fs.readFileSync(path.join(options.addinDir, 'RevitMCPAddin.dll'), 'utf8'), 'synthetic previous add-in');
assert.match(fs.readFileSync(options.configPath, 'utf8'), /command = "previous"/);
console.log(JSON.stringify({ ok: true, freshInstallation: true, bundledToolCount: discovery.toolCount, migrationAndRollback: true }));
