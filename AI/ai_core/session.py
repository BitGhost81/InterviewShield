from typing import Optional

from .models import InterviewContext
from .llm_adapter import LLMAdapter
from .interview_engine import InterviewEngine
from .answer_analyzer import AnswerAnalyzer, AnswerAnalysis
from .decision_engine import DecisionEngine, InterviewDecision
from .final_report import FinalInterviewReport, build_final_report
from .topic_planner import TopicPlanner


class InterviewSession:
    """
    Controls one complete adaptive interview session.
    """

    def __init__(self, context: InterviewContext):
        # Store the interview context.
        self.context = context

        # Create one shared LLM adapter.
        self.llm = LLMAdapter()

        # Create the question generation engine.
        self.interview_engine = InterviewEngine(self.llm)

        # Create the answer analysis engine.
        self.answer_analyzer = AnswerAnalyzer(self.llm)

        # Create the adaptive decision engine.
        self.decision_engine = DecisionEngine(self.llm)

        # Create the topic planning engine.
        self.topic_planner = TopicPlanner(self.llm)

        # Store the current question.
        self.current_question: Optional[str] = None

        # Store the latest answer analysis.
        self.last_analysis: Optional[AnswerAnalysis] = None

        # Store the latest interview decision.
        self.last_decision: Optional[InterviewDecision] = None

        # Store analysis from every completed turn.
        self.analyses: list[AnswerAnalysis] = []

        # Store the generated topic plan.
        self.topic_plan = None

    def start(self) -> str:
        """
        Start the interview.

        If topics are not already provided, generate an assessment
        topic plan from the role, job description, and resume.
        """

        # Generate topics only when the caller did not provide them.
        if not self.context.topics:

            self.topic_plan = self.topic_planner.plan(
                self.context
            )

            # Save the generated topics into the interview context.
            self.context.topics = self.topic_plan.topics

        # Generate the first interview question using the context.
        self.current_question = (
            self.interview_engine.generate_next_question(
                self.context
            )
        )

        # Return the first question.
        return self.current_question

    def submit_answer(self, answer: str) -> dict:
        """
        Analyze one answer, decide the next strategy,
        update history, and generate the next question.
        """

        # Make sure the interview has started.
        if not self.current_question:
            raise RuntimeError(
                "Interview has not been started."
            )

        # Remove unnecessary whitespace.
        answer = answer.strip()

        # Reject empty answers.
        if not answer:
            raise ValueError(
                "Candidate answer cannot be empty."
            )

        # Save the current question before moving to the next one.
        current_question = self.current_question

        # Analyze the candidate answer.
        analysis = self.answer_analyzer.analyze(
            context=self.context,
            question=current_question,
            answer=answer,
        )

        # Decide how the interview should continue.
        decision = self.decision_engine.decide(
            context=self.context,
            question=current_question,
            answer=answer,
            analysis=analysis,
        )

        # Save the question-answer interaction.
        self.context.history.append(
            {
                "question": current_question,
                "answer": answer,
            }
        )

        # Save this turn's analysis.
        self.analyses.append(analysis)

        # Store the latest analysis and decision.
        self.last_analysis = analysis
        self.last_decision = decision

        # Generate the next adaptive interview question.
        next_question = (
            self.interview_engine.generate_next_question(
                self.context
            )
        )

        # Update the current question.
        self.current_question = next_question

        # Return the complete turn result.
        return {
            "question": current_question,
            "answer": answer,
            "analysis": analysis.model_dump(),
            "decision": decision.model_dump(),
            "next_question": next_question,
        }

    def generate_final_report(self) -> FinalInterviewReport:
        """
        Generate the final evaluation report from all completed turns.
        """

        # At least one analyzed answer is required.
        if not self.analyses:
            raise RuntimeError(
                "No completed interview answers are available."
            )

        # Build the final report.
        return build_final_report(self.analyses)