# Step 19 — provisional safety and applicability rule-imitation labels

The separate offline experiment is implemented in
[rule_forest](../prescription_research/rule_forest/README.md). Its dataset builder
reuses the existing pure rule engine, selected four exact product profiles,
source references and condition-purpose mappings. The original 200 cases stay
unverified in a separate audit; no proposed doses, clinical reviews or
best-medicine judgments were added to them.

New controlled fictional fixtures: 1,078 candidate scenarios, 54 grouped
families, train/validation/test 714/112/252 rows. Five RF classifiers imitate
allergy, duplicate-ingredient, selected-interaction, proposed-dose comparison
and provisional-purpose applicability labels. All labels are rule-derived and
not clinically reviewed. Models are saved with their fitted preprocessing.

Actual errors and limited variation are reported, including eight unsupported
novel allergy inputs that abstain and one distinct falsely permissive interaction
prediction. Deterministic unknown/block outcomes prevail. Proposed-dose novel
agreement is 137/155 (88.39%); these are synthetic rule-agreement metrics, never
clinical accuracy. No numeric dose model or optimal-medicine ranking was trained.

See [evaluation](../../docs/research/selected_rule_rf_v1/evaluation.md),
[error records](../../docs/research/selected_rule_rf_v1/test_errors.json) and
[audit](../../docs/research/selected_rule_rf_v1/audit.json). The README contains
exact commands, primary sources, all coverage limits and the next integration.

Twenty isolated tests and both earlier model-preservation checks passed. The
application model, UI, safety checks, accounts, clinical records, review states
and database configuration are unchanged. The new models are accessible only
through an explicitly enabled frozen fictional CLI comparison.
