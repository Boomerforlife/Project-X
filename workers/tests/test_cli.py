"""CLI end-to-end on the file backends (offline)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from schema_check import SchemaError, validate

from pxw.cli import main
from pxw.devtools.synthetic import make_answer_key_pdf, make_question_pdf

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "packages" / "contracts" / "json-schema" / "normalized-question.json"


def lines(capsys) -> list[dict]:
    out = capsys.readouterr().out
    return [json.loads(x) for x in out.splitlines() if x.strip().startswith("{")]


def test_process_document_cli_outputs_valid_normalized_questions(tmp_path, capsys):
    pdf = tmp_path / "synthetic.pdf"
    pdf.write_bytes(make_question_pdf("nta_cbt_v1", 7).pdf)
    out = tmp_path / "out"
    code = main(["--work-dir", str(tmp_path / "work"), "process-document", "--file", str(pdf), "--out", str(out),
                 "--ocr-engines", "mock"])
    assert code == 0
    events = lines(capsys)
    assert [e["stage"] for e in events if e["event"] == "stage"] == [
        "fetch", "extract", "ocr", "segment", "figures", "normalize", "dedupe"]
    assert events[-1]["event"] == "done" and events[-1]["questions"] == 7
    questions = json.loads((out / "normalized_questions.json").read_text(encoding="utf-8"))
    assert len(questions) == 7 and (out / "crops" / "q3-1.png").is_file()


def test_output_matches_contract_json_schema(tmp_path, capsys):
    if not SCHEMA_PATH.is_file():
        pytest.skip(f"{SCHEMA_PATH} not generated yet (W2): JSON Schema comparison skipped")
    pdf = tmp_path / "synthetic.pdf"
    pdf.write_bytes(make_question_pdf("nta_cbt_v1", 7).pdf)
    out = tmp_path / "out"
    assert main(["--work-dir", str(tmp_path / "work"), "process-document", "--file", str(pdf), "--out", str(out),
                 "--ocr-engines", "mock"]) == 0
    capsys.readouterr()
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    for q in json.loads((out / "normalized_questions.json").read_text(encoding="utf-8")):
        try:
            validate(q, schema, schema)
        except SchemaError as exc:
            pytest.fail(f"NormalizedQuestion does not match {SCHEMA_PATH.name}: {exc}")


def test_parse_answer_key_cli(tmp_path, capsys):
    pdf = tmp_path / "key.pdf"
    pdf.write_bytes(make_answer_key_pdf(["1 A", "2 4054558901", "3 7.5", "4 Bonus", "5 ?!"]))
    assert main(["parse-answer-key", "--file", str(pdf), "--out", str(tmp_path / "o")]) == 0
    done = lines(capsys)[-1]
    assert done["rows"] == 4 and done["unparsed_rows"] == ["5 ?!"]
    rows = json.loads((tmp_path / "o" / "official_keys.json").read_text(encoding="utf-8"))
    assert rows[3]["is_dropped"] is True


def test_official_keys_match_contract_json_schema(tmp_path, capsys):
    path = SCHEMA_PATH.with_name("official-key.json")
    if not path.is_file():
        pytest.skip(f"{path} not generated yet (W2): JSON Schema comparison skipped")
    pdf = tmp_path / "key.pdf"
    pdf.write_bytes(make_answer_key_pdf(["1 A", "2 4054558901", "3 2.4 to 2.6", "4 Drop", "5 4054551234 4054558901"]))
    assert main(["parse-answer-key", "--file", str(pdf), "--out", str(tmp_path / "o")]) == 0
    capsys.readouterr()
    schema = json.loads(path.read_text(encoding="utf-8"))
    for row in json.loads((tmp_path / "o" / "official_keys.json").read_text(encoding="utf-8")):
        try:
            validate(row, schema, schema)
        except SchemaError as exc:
            pytest.fail(f"OfficialKeyIn does not match {path.name}: {exc}")


def test_register_refuses_unapproved_source_exit_3(tmp_path, capsys, monkeypatch):
    monkeypatch.setenv("LOCAL_STORAGE_DIR", str(tmp_path / "storage"))
    pdf = tmp_path / "p.pdf"
    pdf.write_bytes(make_question_pdf("nta_cbt_v1", 3).pdf)
    code = main(["--work-dir", str(tmp_path / "w"), "ingest", "register", "--source", "NTA", "--file", str(pdf),
                 "--paper-slug", "synthetic-1", "--year", "2024"])
    assert code == 3
    assert lines(capsys)[-1]["code"] == "SOURCE_NOT_APPROVED"
    assert not (tmp_path / "storage").exists()  # nothing uploaded


def test_usage_errors_exit_2(tmp_path, capsys):
    assert main(["process-document"]) == 2
    assert main(["--work-dir", str(tmp_path), "process-document", "--file", "x", "--out", "y", "--ocr-engines", "bogus"]) == 2
    capsys.readouterr()


def test_register_then_jobs_run_end_to_end(tmp_path, capsys, monkeypatch):
    monkeypatch.setenv("LOCAL_STORAGE_DIR", str(tmp_path / "storage"))
    work = str(tmp_path / "w")
    pdf = tmp_path / "paper.pdf"
    pdf.write_bytes(make_question_pdf("nta_cbt_v1", 7).pdf)
    key = tmp_path / "key.pdf"
    key.write_bytes(make_answer_key_pdf(["1 A", "2 B", "6 12"]))
    base = ["--work-dir", work]
    common = ["--source", "PROJECTX_EDITORIAL", "--paper-slug", "synthetic-paper-2024", "--year", "2024",
              "--paper-title", "Synthetic Paper"]
    assert main(base + ["ingest", "register", "--file", str(pdf), *common, "--auto-promote"]) == 0
    reg = lines(capsys)[-1]
    assert reg["created"] is True
    assert main(base + ["ingest", "register", "--file", str(pdf), *common, "--auto-promote"]) == 0
    reg2 = lines(capsys)[-1]
    assert reg2["document_id"] == reg["document_id"] and reg2["job_id"] == reg["job_id"] and reg2["created"] is False
    assert main(base + ["ingest", "register", "--file", str(key), "--kind", "ANSWER_KEY", *common]) == 0
    capsys.readouterr()
    assert main(base + ["jobs", "run", "--once", "--ocr-engines", "mock"]) == 0
    events = lines(capsys)
    jobs = [e for e in events if e["event"] == "job"]
    assert sorted(j["kind"] for j in jobs) == ["PARSE_ANSWER_KEY", "PROCESS_DOCUMENT"]
    assert all(j["status"] == "SUCCEEDED" for j in jobs)
    process = next(j for j in jobs if j["kind"] == "PROCESS_DOCUMENT")
    assert process["result"]["questions"] == 7 and process["result"]["promoted"] == 7
    state = json.loads((tmp_path / "w" / "db" / "state.json").read_text(encoding="utf-8"))
    assert len(state["source_questions"]) == 7 and len(state["questions"]) == 7 and len(state["keys"]) == 3
    # original preserved byte-for-byte in SOURCE_DOCS
    stored = next((tmp_path / "storage" / "SOURCE_DOCS" / "sources" / "PROJECTX_EDITORIAL" / "2024").glob("*.pdf"))
    assert stored.read_bytes() in (pdf.read_bytes(), key.read_bytes())
    # second run: nothing left to do
    assert main(base + ["jobs", "run", "--once", "--ocr-engines", "mock"]) == 0
    assert lines(capsys)[-1]["processed"] == 0
    # promote command is a no-op once everything is promoted
    assert main(base + ["promote", "--document-id", reg["document_id"], "--exam", "jee-main"]) == 0
    assert lines(capsys)[-1]["promoted"] == 0


def test_ocr_cli_with_mock(tmp_path, capsys):
    png = tmp_path / "x.png"
    import pymupdf

    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 10, 10), False)
    pix.clear_with(255)
    png.write_bytes(pix.tobytes("png"))
    assert main(["ocr", "--image", str(png), "--engines", "mock"]) == 0
    res = lines(capsys)[-1]
    assert res["engine"] == "mock" and res["lines"] == [] and res["warnings"] == ["OCR_LOW_CONFIDENCE"]
