# Blueprint validation record

Date: 25 September 2026. Scope: specification artifacts only.

Executed `validate_blueprint.py` with Python and `jsonschema[format]==4.23.0` in an isolated temporary virtual environment. The environment dependencies were not added to the future application.

Results:

- Six JSON artifacts parse successfully.
- Both response/record schemas pass Draft 2020-12 schema validation.
- Nine structurally valid examples are accepted; 14 invalid examples are rejected as expected.
- All 40 acceptance-case IDs are present, and the suite covers all six allowed operations.
- Operation sets and key release-policy restrictions are consistent.
- Source IDs are unique; the evaluation-results template correctly remains `not_run`.
- Local Markdown links and fenced blocks pass the structural checks.
- Mermaid blocks pass basic quote/group/declaration checks; they were not rendered or tested with a Mermaid parser.
- A deliberately unsafe narrative passes structural schema validation, demonstrating why schema validity is not evidence of semantic or medical safety.

Not performed: application implementation, model loading/inference, execution of the 40 app/model scenarios, clinical content review, usability testing, network auditing of an app, legal/regulatory determination, performance measurement, diagram rendering or submission-artifact generation.

To reproduce, create a Python virtual environment, install `blueprint/requirements-validation.txt`, then run `blueprint/validate_blueprint.py` from the workspace. All sample values used by the validator are fictional structural fixtures.
