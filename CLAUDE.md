# CLAUDE.md — Xander's Claude Code Entry Point

## Mandatory Boot Sequence

Before executing ANY task, you MUST read the following files in exact order:

1. **READ** `.claude/skills/xander-laws.md` — Core behavioral laws. Non-negotiable.
2. **READ** `.claude/skills/technical-standards.md` — Engineering standards for all code output.
3. **READ** `.claude/skills/project-context.md` — Active project goals and constraints.
4. **IDENTIFY** task-relevant `.claude/progress-history-[task].md` files if the current task scope is already clear. Read only the matching task progress files. If no task scope is clear yet, skip progress loading until Xander defines the task.
5. **IDENTIFY** task-relevant `.claude/learned-history-[task].md` files if the current task scope is already clear. Read only the matching learned-history files. If no task scope is clear yet, skip learned-history loading until Xander defines the task.
6. **IDENTIFY** task-relevant `.claude/bugfix-[task].md` files if the current task scope is already clear. Read only the matching bugfix files. If no task scope is clear yet, skip bugfix loading until Xander defines the task.

Do not skip any mandatory skill file. For task-scoped files, load only the files that match the active task. Do not summarize them. Internalize every rule before proceeding.

---

## Boot Confirmation

After reading all files, you MUST produce a structured acknowledgment before doing any work. The acknowledgment must follow this exact format:

```
--- Boot Confirmation ---
Laws loaded: [number of laws found in xander-laws.md]
Standards loaded: [number of standards found in technical-standards.md]
Active project: [project name from project-context.md, or "NONE" if file is missing]
Progress file: [number of entries in loaded task progress-history files, or "NOT LOADED — AWAITING TASK SCOPE" if no task scope is known]
Learned file: [number of entries in loaded task learned-history files, or "NOT LOADED — AWAITING TASK SCOPE" if no task scope is known]
Bugfix file: [number of entries in loaded task bugfix files, or "NOT LOADED — AWAITING TASK SCOPE" if no task scope is known]
Detected constraints: [comma-separated list of key constraints from project-context.md]
Ready for instructions.
--- End Boot ---
```

Do not begin any task until Xander has reviewed this confirmation.

---

## Missing File Handling

- If `xander-laws.md` is missing: **STOP.** Tell Xander the laws file is missing. Do not proceed without it under any circumstance.
- If `technical-standards.md` is missing: **STOP.** Tell Xander the standards file is missing. Do not proceed without it under any circumstance.
- If `project-context.md` is missing: Report that no project context is loaded. Ask Xander whether to proceed with laws and standards only, or wait for a project context file to be provided. Do not assume a default project scope.
- If no matching `progress-history-[task].md` file exists for the active task: This is normal for a new task area. Proceed without it. You will create the task-specific progress file when work begins.
- If no matching `learned-history-[task].md` file exists for the active task: This is normal for a task area without saved taught context. Proceed without it.
- If no matching `bugfix-[task].md` file exists for the active task: This is normal for a task area without saved fixes. Proceed without it. You will create the task-specific bugfix file when the first bug is fixed.

---

## Session Persistence via Task-Scoped progress-history Files

Claude Code has no memory between sessions. To maintain continuity without creating giant logs, you MUST write to a task-scoped progress history file throughout every session.

### Rules for progress-history-[task].md

- Location: `.claude/progress-history-[task].md` (created automatically on first write if it does not exist).
- The `[task]` slug must be short, lowercase, hyphen-separated, and based on the active work area (examples: `hud`, `overworld-music`, `instructions-housekeeping`).
- If Xander names a task area, use that name for the slug. If not, infer the narrowest useful slug from the request.
- Use one progress file per task area. Do not append unrelated task work to another task's progress file.
- This file is append-only. Never delete or overwrite existing entries. Only add new entries at the bottom.
- Write an entry every time a Runbook phase completes successfully.
- Write an entry every time a verification checkpoint fails.
- Write an entry every time you create, modify, or delete a file.
- Each entry must follow this format:

```
## [YYYY-MM-DD HH:MM] — [SUCCESS | FAILURE | FILE_CREATED | FILE_MODIFIED | FILE_DELETED]

**Phase/Action:** [Runbook phase number and name, or description of the action]
**Details:** [What was done, or what failed and the exact error output]
**Files affected:** [Comma-separated list of file paths]
```
---

### Session Resume Protocol

At the start of every new session, after completing the Boot Sequence:

1. Determine the active task area from Xander's request.
2. Read only the matching `.claude/progress-history-[task].md` file if it exists.
3. Read any clearly related `.claude/progress-history-[other-task].md` files only when the current task could be affected by prior work in that area.
4. Read only the matching `.claude/learned-history-[task].md` file if it exists.
5. Read any clearly related `.claude/learned-history-[other-task].md` files only when the current task could be affected by learned context in that area.
6. Read only the matching `.claude/bugfix-[task].md` file if it exists.
7. Read any clearly related `.claude/bugfix-[other-task].md` files only when the current task could be affected by prior fixes in that area.
8. Identify the last successfully completed Runbook phase for the active task.
9. Check the filesystem to verify that the files listed in the loaded task-scoped files actually exist and are not empty.
10. Report to Xander: which phases are complete, which phase is next, any relevant prior fixes found, and any discrepancies between the task-scoped files and the actual filesystem.
11. Wait for Xander's instruction before continuing.

---

## Durable Knowledge via Task-Scoped learned-history Files

`.claude/learned-history-[task].md` files store durable project-specific knowledge taught by Xander or discovered during focused tracing. Use them for feature behavior, implementation patterns, patch summaries, architectural notes, and gotchas that future sessions should remember before making related code changes.

These files are not chronological work logs. Use `.claude/progress-history-[task].md` for session actions and verification history. Use `.claude/learned-history-[task].md` for reusable context that should survive across sessions.

### Rules for learned-history-[task].md

- Location: `.claude/learned-history-[task].md`.
- Read the matching task file when the active task is known, and read related task files only as needed.
- Do not overwrite or delete existing entries.
- Add or update entries when Xander explicitly asks to preserve learned context, or when Xander asks you to trace and master a feature before making a related change.
- Keep entries feature-focused, concise, and implementation-oriented.
- When a new learned-history entry is created or updated, also log that file action in the matching `.claude/progress-history-[task].md`.

---

## Durable Bugfix Tracking via Task-Scoped bugfix Files

`.claude/bugfix-[task].md` files store bugs that were actually fixed during focused work. Use them for confirmed defects, root causes, exact fixes applied, files changed, and verification results.

These files are not chronological progress logs and they are not learned-history files. Use `.claude/progress-history-[task].md` for what was done. Use `.claude/learned-history-[task].md` for reusable project knowledge. Use `.claude/bugfix-[task].md` for what was broken and how it was fixed.

### Rules for bugfix-[task].md

- Location: `.claude/bugfix-[task].md`.
- The `[task]` slug must match the active task slug used by the related progress-history and learned-history files.
- Read the matching task file when the active task is known, and read related bugfix files only when prior fixes could affect the current work.
- Do not overwrite or delete existing entries.
- Create or update the matching bugfix file whenever a bug is confirmed and fixed.
- Do not write speculative bugs, suspected issues, wishlist items, or unresolved failures to the bugfix file.
- If a verification checkpoint fails but no fix has been completed yet, log that failure only in the matching progress-history file.
- When a new bugfix entry is created or updated, also log that file action in the matching `.claude/progress-history-[task].md`.
- Each bugfix entry must follow this format:
```
## [YYYY-MM-DD HH:MM] — [BUG_FIXED]

**Bug:** [Clear description of the broken behavior]  
**Root cause:** [Confirmed cause of the bug]  
**Fix applied:** [Exact fix that was made]  
**Files changed:** [Comma-separated list of file paths]  
**Verification:** [Command, test, manual check, or inspection that proved the fix worked]
```

---

## Trace-Then-Edit Workflow

When Xander asks you to trace logic before implementing a change:

1. Determine the focused task area and matching task slug.
2. Read the relevant task-scoped progress-history, learned-history, and bugfix files if they exist.
3. Trace the requested logic across the full codebase until the behavior, dependencies, and risks are understood.
4. Update the matching progress-history file with the tracing work and any verification checkpoints.
5. Update the matching learned-history file with durable findings, gotchas, and implementation constraints when reusable knowledge is discovered.
6. If the traced work confirms and fixes a bug, update the matching bugfix file with the confirmed bug, root cause, fix applied, files changed, and verification result.
7. When Xander explains the desired addition or edit, complete the code change using the fresh trace, relevant progress history, relevant learned history, and relevant prior bugfixes.

Commenting remains supported, but the project is no longer comment-only. Code edits, new files, bug fixes, and targeted refactors are permitted when Xander requests them and they comply with the laws, standards, project constraints, task progress, learned history, and bugfix records.

---

## Enforcement

## Enforcement

- If a rule in `xander-laws.md` conflicts with your default behavior, the law wins.
- If a rule in `technical-standards.md` conflicts with convenience, the standard wins.
- If `project-context.md` defines a constraint, it applies to every file you touch in this session.
- If a task-scoped progress-history file shows a phase was already completed successfully, do not redo it unless Xander explicitly asks.
- If a task-scoped bugfix file shows a bug was already fixed and verified, do not reintroduce the broken behavior.

---

## Operating Principle

You are a precision tool. You do not improvise policy. You execute the combined ruleset defined in the skill files above, then you do the work Xander asks for. Nothing more, nothing less.
