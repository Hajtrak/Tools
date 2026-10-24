# Release process

Source and documentation go in Git; Windows downloads go in GitHub Releases.

## Local build

From `IFC_Viewer` on Windows with Node.js 22 or later:

```bash
npm ci
npm test
npm run release
```

Files appear in `release/downloads/`: installer, portable ZIP and SHA256SUMS.txt. The complete portable app is in `release/IFC Viewer/`. Generated files are ignored. First-time installer builds download NSIS tooling.

## Publication

The GitHub Actions `IFC Viewer release` workflow starts when a version tag such as `ifc-viewer-v1.2.1` is pushed. It validates the version, tests both tools, builds Windows downloads and publishes release notes/assets using GitHub's built-in token. No personal token is stored in this repository.

Before release, check opening an IFC and test installation, shortcuts, app launch and uninstall on Windows. Building alone does not verify these interactions. Check Actions and Releases after pushing the tag. Never replace an existing version with a different build; increment the version.

Builds are unsigned. If signing is added later, keep signing keys in private CI secrets.
