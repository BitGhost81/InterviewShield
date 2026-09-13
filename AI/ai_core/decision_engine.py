from typing import Literal

from pydantic import BaseModel, Field

from .models import InterviewContext
from .llm_adapter import LLMAdapter
from .answer_analyzer import AnswerAnalysis


class InterviewDecision(BaseModel):
    """
    Structured decision for the next interview step.
    """

    strategy: Literal[
        "FOLLOW_UP",
        "DEEPER",
        "EASIER",
        "NEW_TOPIC",
        "CONTINUE"
    ]

    reason: str = Field(
        description="Why this interview strategy was selected."
    )

    focus: str = Field(
        description="What the next question should focus on."
    )


class DecisionEngine:
    """
    Decides how the interview should proceed after answer analysis.
    """

    def __init__(self, llm_adapter: LLMAdapter):
        # Store the shared LLM adapter.
        self.llm = llm_adapter

    def decide(
        self,
        context: InterviewContext,
        question: str,
        answer: str,
        analysis: AnswerAnalysis,
    ) -> InterviewDecision:
        """
        Decide the next interview strategy from structured analysis.
        """

        # Convert the analysis into structured JSON for the LLM.
        analysis_json = analysis.model_dump_json(indent=2)

        # Build the decision prompt.
        prompt = f"""
You are the adaptive decision engine of InterviewShield.

ROLE:
{context.role}

JOB DESCRIPTION:
{context.job_description}

CURRENT DIFFICULTY:
{context.difficulty}

CURRENT QUESTION:
{question}

CANDIDATE ANSWER:
{answer}

STRUCTURED ANSWER ANALYSIS:
{analysis_json}

Choose the best next interview strategy.

STRATEGIES:

FOLLOW_UP:
Use when the candidate made a claim, gave an incomplete answer,
or important evidence needs verification.

DEEPER:
Use when the candidate demonstrates strong understanding and
a more advanced question is appropriate.

EASIER:
Use when the candidate struggles and fundamentals should be tested.

NEW_TOPIC:
Use when the current area is sufficiently assessed or another
important competency should be evaluated.

CONTINUE:
Use when the same topic and difficulty should continue.

RULES:

1. Base the decision on the structured answer analysis.
2. Give priority to detected claims and gaps.
3. Do not invent candidate experience.
4. Do not force project-based questioning when no project exists.
5. Choose exactly one strategy.
6. Provide a concise reason.
7. Provide the focus for the next question.
"""

        # Ask Gemini for a structured decision.
        decision = self.llm.generate_structured(
            prompt=prompt,
            response_schema=InterviewDecision
        )

        # Return validated structured decision.
        return decision