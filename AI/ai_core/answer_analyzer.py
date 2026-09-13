from typing import List

from pydantic import BaseModel, Field

from .models import InterviewContext
from .llm_adapter import LLMAdapter


class AnswerAnalysis(BaseModel):
    """
    Structured representation of a candidate's answer evaluation.
    """

    # How directly the candidate answered the question.
    relevance: int = Field(
        ge=0,
        le=100,
        description="How relevant the answer is to the question."
    )

    # Depth of role-relevant technical understanding.
    technical_depth: int = Field(
        ge=0,
        le=100,
        description="Depth of technical understanding demonstrated."
    )

    # Quality and clarity of explanation.
    clarity: int = Field(
        ge=0,
        le=100,
        description="Clarity of the candidate's explanation."
    )

    # Concepts explicitly demonstrated by the candidate.
    concepts_detected: List[str] = Field(
        description="Technical concepts actually demonstrated."
    )

    # Claims made by the candidate that may require verification.
    claims: List[str] = Field(
        description="Specific technical or factual claims made."
    )

    # Areas where understanding appears incomplete or weak.
    gaps: List[str] = Field(
        description="Missing, weak, or unclear areas."
    )

    # Important strengths demonstrated in the answer.
    strengths: List[str] = Field(
        description="Important strengths demonstrated."
    )

    # Whether the answer deserves a targeted follow-up question.
    recommended_follow_up: bool = Field(
        description="Whether targeted follow-up is recommended."
    )


class AnswerAnalyzer:
    """
    Uses the LLM to evaluate candidate answers.
    """

    def __init__(self, llm_adapter: LLMAdapter):
        # Store the shared LLM adapter.
        self.llm = llm_adapter

    def analyze(
        self,
        context: InterviewContext,
        question: str,
        answer: str,
    ) -> AnswerAnalysis:
        """
        Analyze one candidate answer.
        """

        # Use a fallback when resume information is unavailable.
        resume_text = context.resume.strip()

        if not resume_text:
            resume_text = "No resume information provided."

        # Build the structured evaluation prompt.
        prompt = f"""
You are the answer evaluation engine of InterviewShield.

Your job is to evaluate the candidate's actual answer,
not to invent information.

INTERVIEW ROLE:
{context.role}

JOB DESCRIPTION:
{context.job_description}

CANDIDATE RESUME:
{resume_text}

QUESTION ASKED:
{question}

CANDIDATE ANSWER:
{answer}

Evaluate the answer using the following rules:

1. Score relevance from 0 to 100.
2. Score technical depth from 0 to 100.
3. Score clarity from 0 to 100.
4. Detect only technical concepts actually demonstrated.
5. Extract concrete claims actually made by the candidate.
6. Identify missing or weak understanding.
7. Identify important strengths.
8. Recommend a follow-up when:
   - a technical claim needs verification,
   - important reasoning is missing,
   - the answer is ambiguous,
   - or the candidate's understanding appears incomplete.
9. Do not treat an unsupported assumption as candidate knowledge.
10. Do not invent projects, skills, technologies, or experience.
11. Base every field only on the candidate's answer and the
    supplied interview context.

Return only the structured evaluation.
"""

        # Ask the LLM for validated structured output.
        analysis = self.llm.generate_structured(
            prompt=prompt,
            response_schema=AnswerAnalysis
        )

        # Return the validated Pydantic object.
        return analysis