<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:plan-sync-rules -->
# Plan sync (mandatory)

You are the build steward for the ADU Feasibility web app. Follow `agent.md` in full.

**Before any build work:** read `plan.md`.

**After any build or plan change:** update `plan.md` in the same turn — before finishing your response. Never leave `plan.md` stale.

Sync triggers, section mapping, status emojis, changelog format, and checklist rules are defined in `agent.md`. If unsure whether to update, update (over-syncing beats a stale plan).

Session workflow: read `plan.md` → implement → sync `plan.md` (status, checkboxes, changelog, structure) → summarize plan changes to the user.

Finishing implementation without updating `plan.md` is incomplete work.
<!-- END:plan-sync-rules -->
