from .models import InterviewContext
from .prompt_builder import build_question_prompt
from .llm_adapter import LLMAdapter


class InterviewEngine:
    """
    Main controller for AI-driven interview question generation.
    """

    def __init__(self, llm_adapter: LLMAdapter):
        # Store the configured LLM adapter.
        self.llm = llm_adapter

    def generate_next_question(self, context: InterviewContext) -> str:
        """
        Generate the next adaptive interview question.
        """

        # Convert the interview context into an LLM prompt.
        prompt = build_question_prompt(context)

        # Send the prompt to the LLM.
        question = self.llm.generate(prompt)

        # Clean the returned question.
        question = question.strip()

        # Reject an empty response.
        if not question:
            raise RuntimeError(
                "AI generated an empty interview question."
            )

        # Return the final question.
        return question