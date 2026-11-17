"""Pydantic mirrors of the contracts (INGESTION_PIPELINE section 3) and repo/job records."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

BucketName = Literal["SOURCE_DOCS", "PUBLIC_ASSETS", "USER_UPLOADS"]
JobKind = Literal["PROCESS_DOCUMENT", "PARSE_ANSWER_KEY", "AI_CLASSIFY", "AI_SOLVE", "AI_VERIFY", "AI_SEO"]
JobStatus = Literal["QUEUED", "RUNNING", "SUCCEEDED", "DEAD", "CANCELLED"]
SectionHint = Literal["PHYSICS", "CHEMISTRY", "MATHEMATICS"]
QuestionTypeGuess = Literal["SINGLE_MCQ", "MULTI_MCQ", "NUMERICAL"]


class Warning(StrEnum):
    """Extraction warnings. Any warning blocks auto-promotion."""

    NEEDS_MATH_REVIEW = "NEEDS_MATH_REVIEW"
    OPTION_COUNT_UNUSUAL = "OPTION_COUNT_UNUSUAL"
    OCR_LOW_CONFIDENCE = "OCR_LOW_CONFIDENCE"
    OCR_UNAVAILABLE = "OCR_UNAVAILABLE"
    FIGURE_NOT_CAPTURED = "FIGURE_NOT_CAPTURED"
    EMPTY_QUESTION_TEXT = "EMPTY_QUESTION_TEXT"
    EMPTY_OPTION = "EMPTY_OPTION"
    DUPLICATE_EXTERNAL_ID = "DUPLICATE_EXTERNAL_ID"
    POSSIBLE_DUPLICATE_IN_BATCH = "POSSIBLE_DUPLICATE_IN_BATCH"
    POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE"
    QUESTION_TYPE_UNKNOWN = "QUESTION_TYPE_UNKNOWN"  # section instructions not read; type is a guess
    LANGUAGE_NOT_CONFIRMED = "LANGUAGE_NOT_CONFIRMED"  # bilingual paper; English version not confirmed by OCR
    SUBJECT_UNKNOWN = "SUBJECT_UNKNOWN"  # no heading and no clear subject from the wording
    POSSIBLE_MERGED_QUESTIONS = "POSSIBLE_MERGED_QUESTIONS"  # next question's marker was not read; crop may hold two


# --- NormalizedQuestion -------------------------------------------------------------------------


class NormalizedAsset(BaseModel):
    asset_ref: str
    asset_id: str | None = None
    kind: Literal["IMAGE", "DIAGRAM", "TABLE_IMAGE", "ORIGINAL_CROP"] = "DIAGRAM"
    page: int
    bbox: list[float]
    sha256: str
    mime_type: str = "image/png"
    width: int
    height: int
    r2_key: str


class NormalizedOption(BaseModel):
    label: str
    external_option_id: str | None = None
    content: list[dict[str, Any]]


class Extraction(BaseModel):
    method: Literal["TEXT", "OCR", "MIXED"]
    ocr_engine: str | None = None
    mean_confidence: float | None = None
    warnings: list[str] = Field(default_factory=list)


class NormalizedQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = 1
    question_number: str
    external_question_id: str | None = None
    section_hint: SectionHint | None = None
    question_type_guess: QuestionTypeGuess | None = None
    content: list[dict[str, Any]]
    options: list[NormalizedOption] = Field(default_factory=list)
    assets: list[NormalizedAsset] = Field(default_factory=list)
    page_start: int
    page_end: int
    question_text: str
    normalized_text: str
    content_hash: str
    extraction: Extraction


# --- Answer keys ----------------------------------------------------------------------------------

OfficialAnswer = dict[str, Any]  # {"kind": "OPTION_LABELS"|"EXTERNAL_OPTION_IDS"|"NUMERIC"|"DROPPED", ...}


class OfficialKeyIn(BaseModel):
    paper_id: str
    source_document_id: str
    question_number: str | None = None
    external_question_id: str | None = None
    raw_answer: str
    normalized_answer: OfficialAnswer
    is_dropped: bool = False


# --- Repo records ---------------------------------------------------------------------------------


class Source(BaseModel):
    id: str
    code: str
    name: str = ""
    kind: str = "EDITORIAL_TEAM"
    reuse_permitted: bool = False
    approved_at: datetime | str | None = None


class PaperIn(BaseModel):
    slug: str
    title: str
    year: int
    exam_slug: str = "jee-main"
    session_label: str | None = None
    exam_date: str | None = None
    shift: int | None = None
    paper_code: str | None = None
    language: str = "en"


class SourceDocumentIn(BaseModel):
    source_code: str
    paper_id: str | None = None
    kind: Literal["QUESTION_PAPER", "ANSWER_KEY", "OTHER"] = "QUESTION_PAPER"
    r2_key: str
    original_filename: str
    mime_type: str = "application/pdf"
    bytes: int
    sha256: str
    page_count: int | None = None


class SourceDocumentRec(BaseModel):
    id: str
    source_code: str
    paper_id: str | None = None
    kind: str
    bucket: str = "SOURCE_DOCS"
    r2_key: str
    original_filename: str
    mime_type: str
    bytes: int
    sha256: str
    page_count: int | None = None


class SourceQuestionIn(BaseModel):
    source_document_id: str
    job_id: str | None = None
    question_number: str
    external_question_id: str | None = None
    page_start: int
    page_end: int
    status: Literal["EXTRACTED", "NORMALIZED", "DUPLICATE", "PROMOTED", "REJECTED"] = "NORMALIZED"
    normalized: dict[str, Any]
    normalized_text: str
    content_hash: str
    extraction_method: Literal["TEXT", "OCR", "MIXED"]
    ocr_mean_confidence: float | None = None
    warnings: list[str] = Field(default_factory=list)
    duplicate_of_question_id: str | None = None
    possible_duplicate_of: str | None = None
    duplicate_similarity: float | None = None


class SourceQuestionRec(BaseModel):
    id: str
    source_document_id: str
    question_number: str
    status: str
    warnings: list[str] = Field(default_factory=list)
    possible_duplicate_of: str | None = None
    duplicate_of_question_id: str | None = None
    promoted_question_id: str | None = None
    section_hint: str | None = None


class AssetIn(BaseModel):
    source_question_id: str
    kind: Literal["IMAGE", "DIAGRAM", "TABLE_IMAGE", "ORIGINAL_CROP"] = "DIAGRAM"
    bucket: Literal["SOURCE_DOCS", "PUBLIC_ASSETS"] = "SOURCE_DOCS"
    r2_key: str
    mime_type: str = "image/png"
    width: int | None = None
    height: int | None = None
    bytes: int | None = None
    sha256: str
    alt_text: str | None = None


# --- Jobs -----------------------------------------------------------------------------------------


class Job(BaseModel):
    id: str
    kind: str
    idempotency_key: str
    status: str = "QUEUED"
    priority: int = 100
    payload: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None
    attempts: int = 0
    max_attempts: int = 5
    source_document_id: str | None = None
    locked_by: str | None = None
    last_error: str | None = None
