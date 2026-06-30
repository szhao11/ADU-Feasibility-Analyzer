# Build Agent — Plan Sync Instructions

You are the build steward for the ADU Feasibility web app. Your job is to implement the build described in `plan.md` and **automatically keep `plan.md` accurate whenever the build or the plan itself changes**.

Read `plan.md` at the start of any build-related session before writing code.

---

## Automatic Sync (always on)

Treat plan sync as a side effect of every build or plan edit — not a separate optional step.

| Trigger | Required action |
|---------|-----------------|
| You change source files, routes, deps, or architecture | Update `plan.md` before ending your turn |
| You complete or start a phase / checklist item | Mark checkboxes, advance **Current phase**, update status emoji |
| You edit any section of `plan.md` | Refresh **Last updated**, append **Changelog** if substantive, reconcile dependent sections (see below) |
| You observe the user changed the build manually | Sync `plan.md` in the same session |

**Every `plan.md` edit must also:**

1. Set **Last updated** to today's date (`YYYY-MM-DD`)
2. Append a **Changelog** row when the edit reflects real progress, decisions, or scope changes
3. Reconcile **Current phase** and **Overall status** with Implementation Phases checkboxes
4. Keep **Target Directory Structure** aligned with files that exist in the repo

If you touch the build or `plan.md` and skip these updates, the task is incomplete.

---

## When to Update `plan.md`

Update `plan.md` **in the same turn** (before finishing your response) whenever you:

- Add, remove, or rename source files, routes, or directories
- Change tech stack, dependencies, or architecture
- Complete or start an implementation phase or checklist item
- Encode new Burbank rules or change the rules schema
- Change product decisions (auth, storage, AI UX, audience)
- Resolve or add open decisions
- Discover blockers, risks, or scope changes
- Edit any part of `plan.md` (always reconcile metadata and dependent sections)

**Do not update `plan.md` for:**

- Typo fixes or refactors that don't change behavior or structure
- Test-only changes unless they reflect new success criteria
- Conversations that don't touch the codebase

---

## What to Update

| Build change | Sections to touch |
|--------------|-------------------|
| Phase progress | **Implementation Phases** checkboxes, **Current phase**, **Overall status** |
| New files/dirs | **Target Directory Structure** (mark existing paths, add new ones) |
| Stack change | **Tech Stack** table |
| Architecture change | **Architecture** diagram or description |
| Decision made | **Locked Product Decisions** or **Open Decisions** |
| Scope change | **Non-Goals**, **User Workflow**, or phase descriptions |
| Any change | **Last updated** date, **Changelog** row |

---

## Status Emoji Guide

Use in **Overall status** line:

- 🟡 Planning / early scaffold
- 🔵 Active development
- 🟢 Phase complete or MVP shipped
- 🔴 Blocked (note blocker in Changelog)

Phase headers: ⬜ Not started · 🔄 In progress · ✅ Complete

---

## Changelog Format

Append a row to the **Changelog** table (newest last):

```markdown
| YYYY-MM-DD | Brief description of what changed and why |
```

Be specific: "Added `src/plugins/burbank-ca/rules/eligibility.json` with 8 zone rules" not "Updated rules."

---

## Checklist Sync Rules

When you complete work:

1. Mark the relevant `[ ]` as `[x]` in **Implementation Phases**
2. If an entire phase is done, change its header emoji to ✅
3. Advance **Current phase** to the next incomplete phase
4. Update **v1 Success Criteria** checkboxes when criteria are met or tested

When you start a phase, change its header from ⬜ to 🔄.

---

## Directory Structure Sync

Keep **Target Directory Structure** aligned with the repo:

- Prefix existing paths with nothing (they exist)
- Comment `# planned` next to paths not yet created
- Remove `# planned` when the path is created
- Add new paths the build introduces

---

## Guardrails

- **Never delete** product decisions or phase descriptions without user approval
- **Never mark success criteria complete** without evidence (tests pass, feature works)
- Keep `plan.md` concise — move long design notes to separate docs only if the user asks
- If unsure whether a change warrants a plan update, update it (over-syncing is better than stale plans)
- When the user makes a build change manually (not via agent), still update `plan.md` if you observe it in the session

---

## Session Workflow

```
1. Read plan.md
2. Identify current phase and next unchecked item
3. Implement the change
4. Automatically update plan.md (Last updated, status, checkboxes, changelog, structure)
5. Summarize what changed in plan.md to the user
```

If you finish implementation work or edit `plan.md` without running the automatic sync checklist, that is incomplete work.
