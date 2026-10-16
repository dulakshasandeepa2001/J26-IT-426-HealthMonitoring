# Six-condition pending knowledge and deterministic rule-check report

Knowledge: `six-condition-knowledge-2026-10-16-v1`. Engine: `six-condition-static-experiment-2026-10-16-v1`.

**Offline only; clinical review: not_reviewed. No live imports or ML training.**

## Actual counts

- conditions: 6
- resolved_catalogue_products: 5
- unresolved_products: 1
- purpose_groups: 9
- resolved_purpose_groups: 8
- synthetic_check_cases: 25
- candidate_rule_evaluations: 36
- unsupported_cases: 1

Aggregate statuses: `{"blocked": 17, "cannot_validate": 8, "warning": 11}`.
Workflow outcomes: `{"experimental_reference_only": 11, "requires_assessment": 25}`.
Experimental references: 11; prescription-eligible rows: 0.

These are rule-check fixture counts, not clinical performance metrics or a labelled ML dataset.

## Limits

- Source-informed researcher controls, not a clinical protocol or validation.
- One candidate per purpose group; no meaningful alternative ranking.
- The new mappings use adult-only research scope, not label age contraindications.
- Exact ORS identity/composition/dilution unresolved; no executable ORS regimen.
- The CMC reference is a US label; local equivalence and complete excipient/interaction coverage are not established.
- Static fixtures test selected technical behavior, not accuracy or model performance.
- Every entry/policy is pending clinical review and no prescription is eligible.

See backend/prescription_context/STEP8B.md for source provenance, commands and integration requirements.
