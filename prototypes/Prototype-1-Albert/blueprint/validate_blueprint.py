"""Validate specification artifacts only; this is not an application/clinical test suite.

Requires the jsonschema Python package. Run with a runtime that provides it.
"""
from copy import deepcopy
import json
from pathlib import Path
import re

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent


def read_json(path):
    return json.loads(path.read_text())


documents = list(ROOT.rglob("*.json"))
for path in documents:
    read_json(path)

ai_schema = read_json(ROOT / "schemas/ai-response.schema.json")
record_schema = read_json(ROOT / "schemas/symptom-record.schema.json")
for schema in (ai_schema, record_schema):
    Draft202012Validator.check_schema(schema)
ai = Draft202012Validator(ai_schema, format_checker=FormatChecker())
record = Draft202012Validator(record_schema, format_checker=FormatChecker())

policy = read_json(ROOT / "release-policy.json")
suite = read_json(ROOT / "evaluation/cases.json")
assert [case["id"] for case in suite["cases"]] == [f"C{i:02}" for i in range(1, 41)]
operations = set(policy["allowedAiOperations"])
assert operations == set(ai_schema["properties"]["operation"]["enum"])
assert set(policy["minimumDemoOperations"]) <= operations
assert {case["operation"] for case in suite["cases"]} == operations
assert all(case["input"] and case["expected"] and case["controls"] for case in suite["cases"])
assert policy["realPatientUseEnabled"] is False
assert policy["aiControls"]["automaticSourceWrites"] is False
assert policy["aiControls"]["modelToolsEnabled"] is False
assert policy["network"]["backgroundThirdPartyRequestsAllowed"] is False
for role in policy["roles"].values():
    assert set(role["aiOperations"]) <= operations


def envelope(operation, payload, status="ok"):
    return {
        "schemaVersion": "1.0", "requestId": "request-example",
        "operation": operation, "sourceRevision": 1,
        "evidenceHash": "a" * 64, "status": status, "payload": payload,
    }


item = {"text": "Your entries mention dizziness.", "evidenceIds": ["fact:example"]}
capture_story = "My energy was 2 out of 5"
capture = envelope("capture", {
    "proposals": [{"field": "energy", "value": 2, "certainty": "explicit",
                   "sourceSpans": [{"start": 0, "end": len(capture_story), "quote": capture_story}]}],
    "unmappedNotes": [], "clarificationQuestionIds": ["sleep_rating"],
})
examples = [
    capture,
    envelope("clarify", {"questionIds": ["dizziness_severity"]}),
    envelope("record_summary", {"items": [item], "limitationCodes": ["documentation_only"]}),
    envelope("record_qa", {"items": [item], "limitationCodes": []}),
    envelope("education", {"items": [{"text": "This excerpt describes keeping a list.", "evidenceIds": ["source:example"]}], "limitationCodes": ["source_scope_limited"]}),
    envelope("visit_brief", {"observations": [item], "questions": [{"text": "What else would be useful to record?", "evidenceIds": ["fact:example"]}], "limitationCodes": []}),
    envelope("record_qa", {"reasonCode": "clinical_advice_request"}, "outside_scope"),
    envelope("record_qa", {"reasonCode": "no_matching_records"}, "insufficient_evidence"),
]
for example in examples:
    ai.validate(example)
for span in capture["payload"]["proposals"][0]["sourceSpans"]:
    assert capture_story[span["start"]:span["end"]] == span["quote"]

negative = []
bad = deepcopy(capture)
bad["payload"]["proposals"][0]["value"] = 6
negative.append(bad)
bad = deepcopy(capture)
bad["payload"]["proposals"][0]["value"] = "2"
negative.append(bad)
bad = deepcopy(capture)
bad["payload"]["proposals"][0]["certainty"] = "ambiguous"
negative.append(bad)
bad = deepcopy(capture)
bad["toolCall"] = "write_record"
negative.append(bad)
bad = deepcopy(capture)
bad["operation"] = "diagnosis"
negative.append(bad)
negative.append(envelope("clarify", {"questionIds": ["diagnose_stroke"]}))
negative.append(envelope("clarify", {"questionIds": ["sleep_rating", "sleep_rating"]}))
negative.append(envelope("record_qa", {"reasonCode": "no_matching_records"}, "outside_scope"))
negative.append(envelope("record_summary", {"items": [{"text": "Example", "evidenceIds": []}], "limitationCodes": []}))
for example in negative:
    assert not ai.is_valid(example), example

# Deliberately demonstrate that schema validity does not imply semantic safety.
unsafe_but_structured = envelope("record_summary", {
    "items": [{"text": "You are safe to wait.", "evidenceIds": ["fact:example"]}],
    "limitationCodes": [],
})
assert ai.is_valid(unsafe_but_structured)

fields = ["energy", "dizziness", "dizzinessSeverity", "confusion", "appetite", "sleep", "fallsOrNearFalls"]
sample_record = {
    "schemaVersion": "1.0", "id": "day-example", "datasetId": "demo-example",
    "dateLocal": "2026-09-25", "timezone": "America/New_York", "reporterRole": "patient",
    "isDemoData": True, "rawStory": "", "answers": dict.fromkeys(fields),
    "answerProvenance": {field: {"origin": "user_skipped", "sourceSpans": []} for field in fields},
    "confirmationMethod": "manual_form", "confirmedAt": "2026-09-25T16:00:00Z",
    "createdAt": "2026-09-25T16:00:00Z", "updatedAt": "2026-09-25T16:00:00Z", "recordRevision": 1,
}
record.validate(sample_record)
record_negative = []
for key, value in (("isDemoData", False), ("reporterRole", "caregiver"), ("dateLocal", "2026-02-30")):
    bad = deepcopy(sample_record)
    bad[key] = value
    record_negative.append(bad)
bad = deepcopy(sample_record)
bad["answers"].update({"dizziness": False, "dizzinessSeverity": 2})
record_negative.append(bad)
bad = deepcopy(sample_record)
bad["answerProvenance"]["energy"]["origin"] = "ai_suggested"
record_negative.append(bad)
for example in record_negative:
    assert not record.is_valid(example), example

source_register = read_json(ROOT / "content/source-register.json")
source_ids = [source["id"] for source in source_register["sources"]]
assert len(source_ids) == len(set(source_ids))
assert read_json(ROOT / "evaluation/results-template.json")["status"] == "not_run"

markdowns = list(ROOT.rglob("*.md")) + [WORKSPACE / "competition-build-plan.md", WORKSPACE / "medwatch-data-flow.md"]
diagram_count = 0
for path in markdowns:
    text = path.read_text()
    assert text.count("```") % 2 == 0, f"Unbalanced fences: {path}"
    for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", text):
        if target.startswith(("http://", "https://", "#")):
            continue
        resolved = (path.parent / target.split("#", 1)[0]).resolve()
        assert resolved.exists(), f"Broken local link in {path}: {target}"
    for block in re.findall(r"```mermaid\n(.*?)\n```", text, flags=re.S):
        assert block.startswith(("flowchart ", "stateDiagram-v2")), path
        assert all(line.count('"') % 2 == 0 for line in block.splitlines()), path
        assert block.count("subgraph ") == len(re.findall(r"^\s*end\s*$", block, flags=re.M)), path
        diagram_count += 1

print(f"Parsed {len(documents)} JSON artifacts and validated 2 JSON Schemas.")
print(f"Checked {len(examples) + 1} positive and {len(negative) + len(record_negative)} negative structural examples.")
print("Confirmed all 40 case IDs, six operations, release-policy consistency, source IDs and unrun result status.")
print(f"Checked local links/fences in {len(markdowns)} Markdown files and basic structure of {diagram_count} Mermaid blocks (including history).")
print("Confirmed an unsafe narrative can pass the schema; semantic safety requires separate checks.")
print("No app, model, clinical, legal, rendering or performance evaluation was performed.")
