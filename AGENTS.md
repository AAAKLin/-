# Agent Development Rules

## Source of truth
- Treat project files as the durable source of truth, not chat history.
- Read this file and relevant docs before coding.
- Inspect existing files before creating, replacing, or restructuring anything. Preserve existing work.
- If a detail is unspecified, choose the simplest reasonable default and record the assumption.

## Autonomy and approval
- Do not repeatedly ask the user about routine implementation details.
- Make reasonable, low-cost, reversible decisions autonomously.
- Ask before destructive data operations, risky migrations, adding paid services, exposing secrets, public deployment, changing security boundaries, or major architecture rewrites.
- Never claim a command, test, implementation, or deployment succeeded unless it was actually run and verified.

## Workflow
1. Read docs and inspect repository.
2. Briefly summarize current state and assumptions.
3. Make a short plan with acceptance criteria.
4. Build a working end-to-end vertical slice; avoid static-only mockups.
5. Run the app and relevant tests.
6. Diagnose failures, fix them, and rerun affected tests.
7. Check mobile and desktop layouts where possible.
8. Update `docs/PROJECT_STATUS.md`, `docs/DEVELOPMENT_LOG.md`, and `docs/CHAT_HANDOFF.md`.
9. Report changed files, commands actually run, real test results, known issues, and next steps.

## Engineering priorities
- Reliable business logic and persistent data before decorative polish.
- Mobile-first responsive design with a genuinely adapted desktop layout.
- Minimize repeated data entry; use sensible defaults and saved foods/recipes.
- Distinguish “not recorded” from “not completed” or “not eaten”.
- Core calculations/rules must not depend on an LLM.
- Prefer transparent deterministic code for calculations and basic training adjustments.
- Keep implementation maintainable for a beginner; avoid overengineering and unnecessary paid infrastructure.

## Privacy and safety
- Use synthetic test data; do not commit real health/personal data.
- Never commit API keys, passwords, tokens, or secrets.
- Do not send real health data to third-party AI without an informed decision.
- Treat pain, chest pain, faintness, unusual palpitations, or disproportionate breathlessness conservatively.
- Label estimated nutrition/body-composition values as estimates and allow correction.

## Testing and Evaluation
- Software testing and AI Evaluation are different.
- Use programmatic checks for calculations and deterministic rules.
- Do not fabricate test cases, scores, results, or improvements.
- Mark cases planned until actually executed.
- Record failures, cause hypotheses, changes, regression results, and limitations.

## Definition of done
A task is not done merely because code was generated. Where feasible, the app starts, the core flow works end-to-end, relevant tests run, run instructions are clear, docs match reality, and limitations are stated honestly.
