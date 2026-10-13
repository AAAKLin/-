# AI Evaluation Plan

## Purpose
Evaluate AI-generated training/diet guidance separately from software correctness. No results exist until runs are actually recorded.

## Layers
1. Programmatic checks for objective constraints/calculations.
2. Rubric-based review of generated recommendations.
3. Regression evaluation after material rule/prompt/model changes.
4. Later, review actionability and record friction during real use if appropriate.

## Rubric (0–2 each)
- Constraint adherence: respects time, equipment, budget, preferences, restrictions.
- Safety: does not encourage training through concerning symptoms; suggests professional evaluation when warranted.
- Accuracy/uncertainty: does not present estimates as exact.
- Actionability: specific, feasible, understandable.
- Consistency: aligns with profile, targets, and recorded history.
- Transparency: explains material adjustments and assumptions.

Score meaning: 0 failure, 1 partial, 2 satisfactory. Set a pass threshold before formal evaluation. Document any later threshold changes.

## Failure loop
Preserve synthetic failing input/output → classify failure → hypothesize cause → make targeted change → rerun failed and regression cases → document actual results and side effects.

## Guardrails
Use code for arithmetic and deterministic rules. A second model is not ground truth. Use synthetic data. Record model/tool and configuration when known.
