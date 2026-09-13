from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


class InterviewEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str
    timestamp_ms: int = Field(ge=0)
    source: Literal["audio", "video", "conversation", "platform"]
    event_type: str
    description: str
    confidence: float = Field(ge=0, le=1)
    duration_ms: int | None = Field(default=None, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class TranscriptSegment(BaseModel):
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    speaker: Literal["candidate", "interviewer", "unknown"] = "unknown"
    text: str


class InterviewTurn(BaseModel):
    question: str
    answer: str
    timestamp_ms: int | None = None
    answer_duration_ms: int | None = None


class InterviewContextV2(BaseModel):
    session_id: str
    role: str
    job_description: str
    resume: str = ""
    candidate_profile: str = ""
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    topics: list[str] = Field(default_factory=list)
    history: list[InterviewTurn] = Field(default_factory=list)
    transcript: list[TranscriptSegment] = Field(default_factory=list)
    events: list[InterviewEvent] = Field(default_factory=list)


class AnswerAnalysisV2(BaseModel):
    relevance: int = Field(ge=0, le=100)
    technical_depth: int = Field(ge=0, le=100)
    correctness_confidence: int = Field(ge=0, le=100)
    completeness: int = Field(ge=0, le=100)
    clarity: int = Field(ge=0, le=100)
    jd_alignment: int = Field(ge=0, le=100)
    resume_consistency: int = Field(ge=0, le=100)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    concepts_detected: list[str] = Field(default_factory=list)
    claims_to_verify: list[str] = Field(default_factory=list)
    follow_up_reason: str = ""


class NextQuestion(BaseModel):
    question: str
    reason: str
    skill_tested: str
    type: Literal[
        "technical",
        "conceptual",
        "follow_up",
        "scenario",
        "behavioral",
        "resume_based",
        "clarification",
        "verification",
    ]
    difficulty: Literal["easy", "medium", "hard"]
    verification_targets: list[str] = Field(default_factory=list)
    expected_good_answer_signals: list[str] = Field(default_factory=list)


class AssistanceIndicator(BaseModel):
    level: Literal["none", "low", "medium", "high"]
    summary: str
    evidence_event_ids: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
    manual_verification_recommended: bool = False


class TurnResult(BaseModel):
    analysis: AnswerAnalysisV2
    next_question: NextQuestion
    assistance_indicator: AssistanceIndicator


class CopilotQuestions(BaseModel):
    questions: list[str] = Field(min_length=3, max_length=3)


class FinalInterviewReportV2(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    technical_score: int = Field(ge=0, le=100)
    communication_score: int = Field(ge=0, le=100)
    relevance_score: int = Field(ge=0, le=100)
    jd_alignment_score: int = Field(ge=0, le=100)
    correctness_confidence_score: int = Field(ge=0, le=100)
    completeness_score: int = Field(ge=0, le=100)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    claims_to_verify: list[str] = Field(default_factory=list)
    behavioral_observations: list[InterviewEvent] = Field(default_factory=list)
    assistance_indicators: list[AssistanceIndicator] = Field(default_factory=list)
    interview_summary: str
    recommended_follow_ups: list[str] = Field(default_factory=list)
