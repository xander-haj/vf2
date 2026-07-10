---
name: technical-standards
description: Engineering standards for all code produced in Xander's projects.
---

# Technical Standards

Every file you write, edit, or generate must comply with these standards. No exceptions.

---

## Standard 1 — Code Discipline (Full Implementation, Zero Placeholders)

- **Write complete code.** Every function, every class, every module — fully implemented.
- **No placeholder comments.** The following patterns are banned:
  - `// TODO: implement this`
  - `# ... rest of implementation`
  - `/* placeholder */`
  - `pass  # implement later`
  - `throw new Error("not implemented")`
- **No ellipsis blocks.** Do not use `...` to abbreviate code in files you are writing or editing. If you are outputting a file, output the entire file.
- **No stub functions.** If a function signature exists, its body must be complete.
- If full implementation is genuinely blocked (missing spec, external dependency not yet available), state the blocker explicitly and wait for Xander's direction. Do not fill the gap with a stub.

---

## Standard 2 — Modular Architecture

- **Maximum 400 lines of code per file.** This is the hard ceiling, not a target. If a file reaches 400 lines during implementation, you must stop and modularize before writing another line. See the modularization procedure below.
- **Single responsibility per module.** One file does one thing well.
- **Explicit imports.** No wildcard imports (`from x import *`). Name every dependency.
- **Flat over nested.** Prefer shallow directory structures. Deep nesting (>3 levels) requires justification.
- **Naming conventions:**
  - Files: `kebab-case` (e.g., `auth-handler.ts`, `data-parser.py`).
  - Classes: `PascalCase`.
  - Functions/variables: `camelCase` (JS/TS) or `snake_case` (Python).
  - Constants: `UPPER_SNAKE_CASE`.

### Modularization Procedure

When a file reaches or exceeds 400 lines of code during implementation:

1. **Stop writing.** Do not add more code to the file.
2. Identify the logical boundaries in the file. Look for groups of related functions, a class that could be extracted, or a section of utilities that serve a different purpose than the file's primary responsibility.
3. Create a new file with a descriptive `kebab-case` name that reflects the extracted responsibility.
4. Move the extracted code into the new file.
5. Update all import statements in every file that referenced the moved code. Verify that no import is broken.
6. Verify that both the original file and the new file are under 400 lines.
7. Log both files in the matching task-scoped `.claude/progress-history-[task].md` file as `FILE_CREATED` and `FILE_MODIFIED`.

Do not ask for permission to modularize. This is a standing instruction. When the 400-line limit is hit, modularization is mandatory and immediate.

---

## Standard 3 — Inline Comments

Every file you write must include inline comments that explain the purpose and logic of the code. This is not optional.

- **Every function** must have a comment above it explaining what it does, what its parameters are, and what it returns.
- **Every class** must have a comment above it explaining its responsibility and how it fits into the broader module.
- **Every conditional block** (if/else, switch, ternary) that involves business logic must have a comment explaining the reasoning behind the condition.
- **Every loop** that does more than trivial iteration must have a comment explaining what it is iterating over and why.
- **Every non-obvious expression** (regex patterns, bitwise operations, complex math, chained method calls longer than 3 methods) must have a comment explaining what it produces.
- **Every import section** at the top of a file must have a brief comment grouping imports by purpose if there are more than 5 imports (e.g., `// React core`, `// Utility functions`, `// Type definitions`).
- **Every constant or configuration value** must have a comment explaining what it controls and why it is set to that value.

Comments must be written in plain English. They must explain WHY, not just WHAT. A comment that restates the code (e.g., `// increment counter` above `counter++`) is useless. A comment that explains intent (e.g., `// Track failed login attempts to trigger lockout after 5 tries`) is useful.

---

## Standard 4 — Strict File Isolation

- **Write only to the designated project directory.** Do not create or modify files outside the active project root (exception: task-scoped `.claude/progress-history-[task].md` and `.claude/learned-history-[task].md` files).
- **No writes to system directories** (`/tmp`, `/var`, `/etc`, `~/.config` of unrelated tools, etc.) unless Xander explicitly directs it.
- **No writes to other project folders.** Each project is sandboxed. Cross-project file operations require explicit permission.
- **Git hygiene:** Do not commit secrets, build artifacts, or environment files. If a `.gitignore` does not exist, create one before the first file is written. The `.gitignore` must exclude at minimum:
  - `node_modules/`
  - `.env`
  - `.env.local`
  - `.env.*.local`
  - `dist/`
  - `build/`
  - `.vscode/` (unless project-specific settings are intended)
  - `*.log`
  - `.DS_Store`
  - `__pycache__/`
  - `venv/`
  - `.venv/`

---

## Standard 5 — Error Handling

- Handle errors at the boundary where they occur. Do not swallow exceptions silently.
- Use typed/structured errors over generic error strings where the language supports it.
- Log errors with enough context to diagnose without reproducing (timestamp, operation, input summary).
- Never expose stack traces or internal paths to end users in production code.
- Every async operation (API calls, file reads, database queries) must have explicit error handling. No unhandled promise rejections. No bare `try {} catch {}` with an empty catch block.

---

## Standard 6 — Dependency Awareness

When adding a dependency to a manifest file (package.json, requirements.txt, etc.):

- The dependency must be open-source unless Xander has explicitly approved a paid alternative.
- The dependency must not introduce known critical security vulnerabilities at the time of selection.
- Pin the dependency to a specific version or version range. Do not use `latest` or unpinned references.
- Include a comment in the plan explaining why this dependency is needed and what it replaces (if anything).
- Prefer packages that include their own type definitions (TypeScript types shipped in the package) over packages that require a separate `@types/` installation, when both options are functionally equivalent.
- Remember: you are never allowed to install dependencies. You add them to the manifest. Xander installs them. This is Law 3 in xander-laws.md and it is absolute.
