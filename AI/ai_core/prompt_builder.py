from models import InterviewContext


def build_question_prompt(context: InterviewContext) -> str:
    # Store the previous interview history.
    history_text = ""

    # Convert every previous question and answer into readable text.
    for item in context.history:
        history_text += (
            f"Question: {item.get('question', '')}\n"
            f"Answer: {item.get('answer', '')}\n\n"
        )

    # Use a clear fallback when no resume is provided.
    resume_text = context.resume.strip()

    if not resume_text:
        resume_text = "No resume information provided."

    # Use a clear fallback when no specific topics are provided.
    topics_text = ", ".join(context.topics)

    if not topics_text:
        topics_text = "Determine relevant topics from the role and job description."

    # Build a role-independent adaptive interviewer prompt.
    prompt = f"""
You are an adaptive AI technical interviewer.

INTERVIEW CONTEXT

Role:
{context.role}

Job Description:
{context.job_description}

Candidate Resume:
{resume_text}

Current Difficulty:
{context.difficulty}

Assessment Topics:
{topics_text}

Previous Interview History:
{history_text if history_text else "No previous interview questions."}

YOUR RESPONSIBILITY

Generate the next interview question based on the complete
interview context.

ADAPTIVE RULES

1. The candidate's role can be any professional or technical role.
2. Use the job description to identify the skills and competencies
   that should be assessed.
3. Use the resume only when resume information is actually provided.
4. Never assume that the candidate has a project, skill, technology,
   certification, or experience that is not present in the context.
5. If the candidate has no project or no experience in a particular
   area, do not continue asking questions that assume such experience.
6. Select another relevant way to assess the candidate, such as
   conceptual understanding, practical reasoning, problem solving,
   scenario-based reasoning, or role-specific fundamentals.
7. The next question must consider the candidate's previous answer.
8. Do not repeat a question unless repetition is necessary for
   clarification or verification.
9. If the previous answer contains a specific technical claim,
   verify the claim with a targeted follow-up question.
10. If the previous answer is incomplete, ambiguous, or technically
    weak, ask a question that tests the missing understanding.
11. If the candidate demonstrates strong understanding, gradually
    increase difficulty or move to a deeper related concept.
12. If the candidate struggles, reduce complexity and test the
    underlying fundamentals.
13. Keep the question relevant to the role and job description.
14. Do not invent candidate information.
15. Ask exactly one question.
16. Return only the interview question.

IMPORTANT:
The interview must feel adaptive rather than like a fixed list
of predefined questions.
"""

    return prompt.strip()