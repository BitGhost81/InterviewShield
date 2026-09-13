from dataclasses import dataclass, field
from typing import List


@dataclass
class InterviewContext:
    # Job role being assessed.
    role: str

    # Job description provided for the interview.
    job_description: str

    # Candidate resume/profile information.
    resume: str

    # Current interview difficulty.
    difficulty: str = "medium"

    # Skills/topics that should be assessed.
    topics: List[str] = field(default_factory=list)

    # Previous interview questions and candidate answers.
    history: List[dict] = field(default_factory=list)