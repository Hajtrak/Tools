# Privacy and publication boundary

The public source tree contains implementation, synthetic tests, build scripts, documentation and licences.

It excludes:
- RVT/RTE/RFA/IFC project and test files;
- model snapshots, screenshots, exports and coverage registers;
- local conversation history, standing-authorisation notes and personal workflows;
- user configuration, backup files, credentials, session tokens and operation journals;
- installed runtimes, SDK caches, node_modules and build outputs.

The add-in's loopback transport is authenticated. A local transport does not mean information returned to an AI client stays offline.

Relevant queries make usernames, authors, addresses, workset owners or linked paths opt-in. Some necessary operations still return document names, file paths, model parameters and element identities. Review the fields sent to any external client.

Operation journals contain results and can contain model-related data and short-lived preview approval tokens. Keep them local, outside source control, with appropriate file access. Never upload them as public bug reports without redaction.

Examples in source tests use synthetic values. Real credentials, customer data and machine-specific absolute user paths must not be added. Build/release artifacts should be reviewed separately before publication; generated archives can contain information not present in source.
