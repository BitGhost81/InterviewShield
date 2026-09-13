from typing import List

from pydantic import BaseModel, Field

from .answer_analyzer import AnswerAnalysis


class FinalInterviewReport(BaseModel):
    """Final evaluation of the complete interview."""

    overall_score: int = Field(ge=0, le=100)

    technical_score: int = Field(ge=0, le=100)

    communication_score: int = Field(ge=0, le=100)

    relevance_score: int = Field(ge=0, le=100)

    strengths: List[str]

    gaps: List[str]

    verified_claims: List[str]

    follow_up_count: int = Field(ge=0)


def build_final_report(
    analyses: List[AnswerAnalysis]
) -> FinalInterviewReport:
    """Build a final report from completed answer analyses."""

    if not analyses:
        raise ValueError(
            "At least one answer analysis is required."
        )

    # Calculate average relevance.
    relevance_score = round(
        sum(item.relevance for item in analyses) / len(analyses)
    )

    # Calculate average technical depth.
    technical_score = round(
        sum(item.technical_depth for item in analyses) / len(analyses)
    )

    # Calculate average communication/clarity.
    communication_score = round(
        sum(item.clarity for item in analyses) / len(analyses)
    )

    # Calculate overall score.
    overall_score = round(
        (
            technical_score
            + communication_score
            + relevance_score
        ) / 3
    )

    # Collect unique strengths.
    strengths = []
    for analysis in analyses:
        for strength in analysis.strengths:
            if strength not in strengths:
                strengths.append(strength)

    # Collect unique gaps.
    gaps = []
    for analysis in analyses:
        for gap in analysis.gaps:
            if gap not in gaps:
                gaps.append(gap)

    # Collect unique candidate claims.
    verified_claims = []
    for analysis in analyses:
        for claim in analysis.claims:
            if claim not in verified_claims:
                verified_claims.append(claim)

    # Count answers requiring follow-up.
    follow_up_count = sum(
        1
        for analysis in analyses
        if analysis.recommended_follow_up
    )

    return FinalInterviewReport(
        overall_score=overall_score,
        technical_score=technical_score,
        communication_score=communication_score,
        relevance_score=relevance_score,
        strengths=strengths,
        gaps=gaps,
        verified_claims=verified_claims,
        follow_up_count=follow_up_count,
    )