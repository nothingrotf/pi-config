# Global agent instructions

- Never use an em dash. Use a plain dash instead.
- Never add an agent name as a commit coauthor.
- Never manually modify CHANGELOG.md files or files marked as auto-generated.
- Prefer quality, simplicity, reliability, scalability, and long-term maintainability over development cost.
- Before a bug fix, reproduce the failure on the smallest surface that represents the user's experience.
- Use end-to-end reproduction when the failure crosses integrations or depends on the actual interface.
- If the actual surface is unavailable, record that limitation and use the closest executable reproduction.
- Inspect the affected interface carefully. Correct visual defects within the authorized scope.
- Fix adjacent defects and failed checks when they block the requested outcome. Report unrelated defects separately.
- Run focused checks for changed behavior and all checks required by the repository.
- After those checks pass, repeat or broaden them only for new changes, failures, or unresolved evidence.
- Add tests for meaningful behavior and regression risks. Do not add tests that only mirror trivial, reversible edits.
- Before a feature immediately starts a large swarm of subagents, explain its tradeoffs and obtain explicit approval.
- Never write code comments unless the user explicitly includes the exact phrase "add comments".
