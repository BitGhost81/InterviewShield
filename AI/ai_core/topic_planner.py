from typing import List

from pydantic import BaseModel, Field

from .models import InterviewContext
from .llm_adapter import LLMAdapter


class TopicPlan(BaseModel):
    """
    Structured interview topic plan.
    """

    topics: List[str] = Field(
        description="Important skills or competencies to assess."
    )

    priority_topics: List[str] = Field(
        description="Highest-priority topics for the interview."
    )

    reasoning: List[str] = Field(
        description="Why these topics are relevant to the role."
    )


class TopicPlanner:
    """
    Builds an interview assessment plan from role, JD, and resume.
    """

    def __init__(self, llm_adapter: LLMAdapter):
        # Store the shared LLM adapter.
        self.llm = llm_adapter

    def plan(
        self,
        context: InterviewContext
    ) -> TopicPlan:
        """
        Generate a structured topic plan.
        """

        # Use a fallback when resume information is unavailable.
        resume_text = context.resume.strip()

        if not resume_text:
            resume_text = "No resume information provided."

        # Build the topic-planning prompt.
        prompt = f"""
You are the interview planning engine of InterviewShield.

Create an assessment plan for this candidate.

ROLE:
{context.role}

JOB DESCRIPTION:
{context.job_description}

CANDIDATE RESUME:
{resume_text}

Rules:
1. Identify the most relevant technical and professional competencies
   required for this role.
2. Prioritize competencies clearly supported by the job description.
3. Use resume information only when it is actually provided.
4. Never invent candidate experience.
5. Do not assume the candidate has projects or technologies
   that are not present.
6. Topics should be useful for generating interview questions.
7. Keep the topic list focused rather than unnecessarily large.
8. Select the most important topics as priority_topics.
9. Explain briefly why the selected topics matter.

Return only the structured interview topic plan.
"""

        # Ask the LLM for schema-constrained output.
        return self.llm.generate_structured(
            prompt=prompt,
            response_schema=TopicPlan
        )