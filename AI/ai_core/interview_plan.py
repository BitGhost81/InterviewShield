from typing import List

from pydantic import BaseModel, Field

from .models import InterviewContext
from .llm_adapter import LLMAdapter


class InterviewPlan(BaseModel):
    """
    Structured plan defining what the interview should assess.
    """

    competencies: List[str] = Field(
        description="Relevant competencies for the target role."
    )

    priority_competencies: List[str] = Field(
        description="Competencies that should receive the most attention."
    )

    coverage_order: List[str] = Field(
        description="Suggested order for assessing the competencies."
    )

    reasoning: List[str] = Field(
        description="Reasons behind the assessment plan."
    )


class InterviewPlanner:
    """
    Creates a focused interview assessment plan.
    """

    def __init__(self, llm_adapter: LLMAdapter):
        # Store the shared LLM adapter.
        self.llm = llm_adapter

    def create_plan(
        self,
        context: InterviewContext
    ) -> InterviewPlan:
        """
        Create a structured interview plan from role, JD, and resume.
        """

        # Use a safe fallback when no resume is available.
        resume_text = context.resume.strip()

        if not resume_text:
            resume_text = "No resume information provided."

        # Build the planning prompt.
        prompt = f"""
You are the interview planning engine of InterviewShield.

Create a focused assessment plan for this interview.

ROLE:
{context.role}

JOB DESCRIPTION:
{context.job_description}

CANDIDATE RESUME:
{resume_text}

Rules:
1. Identify competencies genuinely relevant to the role and job description.
2. Prioritize the most important competencies required by the job.
3. Use the resume only when information is actually provided.
4. Never invent candidate experience or skills.
5. Do not assume the candidate has a project.
6. Keep the competency list focused.
7. Decide which competencies deserve the most interview attention.
8. Create a logical order for assessing those competencies.
9. The plan must support adaptive technical interviewing.
10. Return only the structured interview plan.
"""

        # Request schema-constrained output from the LLM.
        return self.llm.generate_structured(
            prompt=prompt,
            response_schema=InterviewPlan
        )