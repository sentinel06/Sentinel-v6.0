---
name: Composite lib stale declarations after schema edits
description: Why leaf artifacts can't see new lib/db columns until you rebuild the composite lib's .d.ts.
---

# Rebuild lib declarations after editing lib/* schema

After adding/changing a column (or any export) in a `lib/*` package, a leaf
artifact typecheck can fail with "Property X does not exist" even though the
source is correct — e.g. adding `hash_version` to `lib/db` and `api-server` not
seeing `log.hashVersion`.

**Why:** `lib/db` is `composite: true` and emits `.d.ts` into `lib/db/dist/`.
Artifacts list `lib/db` in their tsconfig `references`, so tsc reads the BUILT
declaration files, not the source — even though `@workspace/db`'s package.json
`exports` map points at `./src/index.ts`. Stale `dist/*.d.ts` win.

**How to apply:** Rebuild the lib's declarations before the leaf typecheck:
`pnpm exec tsc -b lib/db/tsconfig.json` (then the artifact typecheck passes).
NOTE: the `pnpm run typecheck:libs` / `pnpm run typecheck` root scripts mentioned
in the pnpm-workspace skill / replit.md do NOT exist in this repo — the root
package.json is an attestation stub. Use `pnpm exec tsc -b <lib>/tsconfig.json`
directly, then `pnpm --filter @workspace/<artifact> run typecheck`.

DB schema push is separate and reads TS source directly:
`pnpm --filter @workspace/db run push` (or `push-force` for non-interactive;
safe for purely additive nullable columns).
