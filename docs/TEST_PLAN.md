# Software Test Plan

## Purpose
Verify app behavior, data integrity, and responsive usability. Software testing is separate from AI Evaluation.

## Categories
1. Unit tests: nutrition calculations, target comparisons, training rules, input validation.
2. Integration: create/update records and verify summaries recalculate.
3. Persistence: records survive refresh/restart according to selected storage.
4. User flows: first use, log workout, log food, add weight/waist, inspect progress.
5. Responsive: phone and desktop viewports.
6. Errors: invalid quantities, missing nutrition, empty states, malformed imports.
7. Backup/restore: valid export/restore, invalid file handling, confirmation before destructive replacement.

## Minimum scenarios
- A workout log updates daily status and history.
- Editing actual sets/reps updates saved data.
- A food entry updates daily calorie and macro totals.
- Portion edits recalculate totals.
- Unknown nutrition is flagged as unknown/estimated.
- Weight/waist entries retain dates and show trends.
- Missing records are not interpreted as negative behavior.
- Invalid values get clear feedback.
- Data persists according to chosen design.
- App starts with documented commands.

## Reporting
Record date/version, exact command/procedure, pass/fail/skipped, observed result, fix, and regression result. Never mark a planned scenario as passed without running it.
