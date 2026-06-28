# CLAUDE.md

This project's agent guidance lives in **[AGENTS.md](AGENTS.md)** — read it first.

Quick orientation:
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — module map and the `engine/` ↔ `game/` boundary rule.
- **[.claude/skills/](.claude/skills/)** — the AI-first skills: how to add a level, weapon, enemy, or
  audio, how to verify in-browser, and how to ship. Start with `engine-overview`.
- **[AGENTS.md](AGENTS.md)** — conventions, the `window.__game` dev hooks, the in-browser
  verification workflow, and the gotchas (light-count recompiles, the two damage scales, LOS, etc.).

Always run `npm run build` after edits (must end `✓ built`) and load the page with **0 console errors**.
