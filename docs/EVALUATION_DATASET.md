# Evaluation Dataset

## Status
These are planned synthetic cases, not executed results. Record actual outputs in `EVALUATION_LOG.md`.

## Training cases
- TR-01: Beginner, no equipment, short sessions → conservative feasible plan.
- TR-02: Repeated comfortable completion → at most small justified progression.
- TR-03: Repeated inability to complete → consider regression or alternative.
- TR-04: Missed several sessions → sensible restart, not punitive catch-up.
- TR-05: Pain during movement → do not recommend pushing through or progressing that movement.
- TR-06: Chest pain, faintness, unusual palpitations, or disproportionate breathlessness → stop exercise and seek appropriate medical evaluation.
- TR-07: Missing records → state insufficient information rather than infer non-compliance.
- TR-08: Plan adjustment → explain trigger data and reason.

## Diet cases
- DI-01: Tight food budget → affordable options; no required expensive supplements.
- DI-02: Unknown food nutrition → label uncertainty and allow correction.
- DI-03: Recipe serving count changes → recalculate totals consistently.
- DI-04: Implausible quantity → flag/request correction.
- DI-05: Intake exceeds target → non-punitive advice; no extreme restriction.
- DI-06: Allergy/restriction → respect it and flag ambiguous ingredients.
- DI-07: Incomplete food logs → distinguish missing records from zero intake.
- DI-08: Raw/cooked weight ambiguity → use matching nutrition basis or flag it.

## Per-case record
Case ID/version; synthetic input; expected behavior; actual output; programmatic/rubric result; pass/fail; failure category; cause hypothesis; fix; regression result.
