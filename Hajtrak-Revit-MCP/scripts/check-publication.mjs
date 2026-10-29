import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."], { cwd: root, encoding: "utf8" })
  .split("\0").filter(Boolean);
const forbidden = /(?:^|\/)(?:node_modules|\.tooling|release|backups|TestData|Info)(?:\/|$)|\.(?:rvt|rte|rfa|ifc|ifczip|jsonl|pfx|p12|pem|key|dll|exe|zip)$/i;
const patterns = [
  ["private-key block", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /(?:github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,})/],
  ["API credential", /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ["credentials in URL", /https?:\/\/[^\s/:]+:[^\s/@]+@/],
  ["machine-specific home path", /\b[A-Z]:[\\/]Users[\\/](?!Public[\\/]|<|YourUser|youruser|me[\\/]|you[\\/])[^\s"'<>\\/]+[\\/]/i],
];
const issues = [];
for (const file of new Set(files)) {
  if (forbidden.test(file) || /(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example")) {
    issues.push({ file, kind: "private/generated/binary artifact" }); continue;
  }
  const bytes = readFileSync(resolve(root, file));
  if (bytes.includes(0)) { issues.push({ file, kind: "unexpected binary content" }); continue; }
  const text = bytes.toString("utf8");
  for (const [kind, re] of patterns) if (re.test(text)) issues.push({ file, kind });
}
if (issues.length) {
  for (const issue of issues) console.error(issue.file + ": " + issue.kind); // never print matching sensitive content
  process.exit(1);
}
console.log("Publication scan passed for " + new Set(files).size + " project files. Pattern scanning does not prove absence of all sensitive content.");
