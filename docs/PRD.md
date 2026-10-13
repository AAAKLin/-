# Product Requirements Document

## Status labels
- Confirmed: explicitly agreed direction.
- Default proposal: agent may refine using a simple solution.
- Pending validation: must be verified by implementation/tests/user feedback.
- Deferred: not in first release.

## 1. Vision
Build a genuinely usable personal fitness coach as a mobile-first responsive web app. Help a beginner follow a manageable training plan, make budget-aware food choices, record behavior quickly, and understand progress. Product outcome and learning AI-assisted full-stack development are both goals.

## 2. User context and constraints
- Primary user: one beginner, using the app personally.
- Planning context supplied by user: approximately 183 cm, 86 kg, little regular exercise, limited push-up capacity, at-home training and low budget. These are editable user-provided values, not verified medical data; do not hard-code them.
- Goal: reduce body fat while preserving/building muscle and improving cardio. Do not promise a specific outcome.
- Daily interaction should be brief and low-friction.
- Prefer free/low-cost tools and avoid paid services without approval.

## 3. Principles
1. Reliable business logic before visual polish.
2. Mobile-first, genuinely responsive desktop layout.
3. Minimize daily data entry.
4. Transparent calculations and adjustments.
5. Missing records must not be treated as proof of non-compliance.
6. Users can correct profile values, targets, and estimates.
7. Core features work without external AI.
8. Deliver a complete small product early, then iterate.

## 4. First release

### Home — Today Action Center
- Today's training plan and record status.
- Diet progress against targets, especially calories and protein.
- Fast actions for training, food, weight, and waist records.
- Recent weight trend and concise progress summary.
- Short coach recommendations, not a giant chatbot.
- Distinguish “not recorded” from “not done”.

### Training
- Generate a weekly beginner plan using editable goal, experience, available days/time, equipment, and constraints.
- Show exercises, sets/reps or duration, rest guidance, and concise safety/form notes.
- Quick states: completed, partially completed, not completed.
- Optional details: actual sets/reps/duration, perceived difficulty, discomfort.
- Prefill planned values; edit only when actual performance differs.
- Training history and basic performance trends.
- Explainable, rule-based adjustment suggestions. Exact thresholds are implementation defaults to be tested, not medical authority.
- Do not require punitive make-up sessions after missed days.

### Diet
- Editable daily energy/macronutrient targets; show assumptions and uncertainty.
- Budget-conscious menu suggestions that can be edited/replaced.
- Record actual intake separately from suggested meals.
- Saved common foods and recipes.
- Adjust portions; support recipe ingredient quantities, relevant oil/condiments, servings, and raw/cooked basis where practical.
- Calculate calories, protein, fat, and carbohydrates from food data.
- Flag unknown/estimated nutrition values and allow correction.
- Daily totals compared with targets.
- Food photo recognition is deferred; first version uses text, saved foods/recipes, and portion editing.

### Progress
- Dated weight and waist records.
- Trends rather than overreacting to single measurements.
- Training completion, diet adherence, and basic performance summaries.
- Body-fat estimates are optional and secondary because measurements can be noisy.
- Backup/export and restore/import where feasible. Confirm before destructive restore.

### Profile/settings
- Editable basic profile, goals, schedule, equipment, constraints, budget.
- No mandatory login for first personal-use version.

## 5. Deferred
- Multi-user accounts/permissions, cloud sync.
- Food photo recognition and portion estimation.
- Camera-based exercise/form recognition.
- Real-time voice coach.
- Complex autonomous AI optimization.
- Paid third-party AI dependency.
- Social features.

## 6. Key user journeys
1. First use: essential profile → conservative starter plan and food targets/menu.
2. Training: view task → train → quick/detailed log → updated status.
3. Diet: select/create food or recipe → adjust portion → see nutrition totals.
4. Progress: record weight/waist → see trends and summary.
5. Return after missed sessions without punitive catch-up.
6. Export backup; restore only after confirmation.

## 7. Acceptance criteria
- App starts using documented instructions.
- Core records persist across refresh/restart under chosen storage.
- Training logs can be created and shown in history and home status.
- Food entries/saved foods/recipes can be created and reused; totals recalculate after edits.
- Weight/waist records save and display trends.
- Mobile and desktop layouts are usable.
- Empty states and missing records are clear.
- Calculation/rule tests are implemented and actually run.
- Backup/restore is either implemented and tested or explicitly reported incomplete.
- Known limitations are documented honestly.

## 8. Success indicators
For personal use, prefer local indicators over third-party analytics: daily record time, recorded training sessions, food-log coverage, ease of understanding progress, and defects found in tests. No third-party tracking by default.

## 9. Open technical choices
Agent should inspect the workspace and recommend a simple, maintainable, low-cost stack. Consider local-first storage and backup before cloud services. Do not add paid dependencies without approval.
