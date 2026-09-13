from __future__ import annotations

import json
import re

from .schemas import (
    AssistanceIndicator,
    AnswerAnalysisV2,
    CopilotQuestions,
    InterviewContextV2,
    NextQuestion,
    TurnResult,
)


ANALYSIS_SYSTEM = """
You are InterviewShield Interview Intelligence, an interviewer-side AI copilot.
You assist a human interviewer; you do not make hiring decisions and you do not accuse candidates of cheating.
Ground every conclusion in supplied evidence. Never invent resume facts, skills, events, behavior, projects, or experience.
Distinguish mentioning a concept from demonstrating it. Distinguish claiming implementation from demonstrating implementation.
Use a 0-100 score supported by evidence; never use 50 as a default.
Return only the requested structured JSON object.
"""

QUESTION_SYSTEM = """
You are the adaptive question engine for InterviewShield.
Generate exactly one next question for a human interviewer.
The question must be derived from the CURRENT answer analysis and interview context.
Priority:
1) verify an important unsupported implementation/experience claim;
2) probe a concrete technical gap or missing concept;
3) clarify ambiguity;
4) deepen a strong demonstrated area;
5) test an important JD skill that remains insufficiently assessed.
If gaps or claims_to_verify contain a concrete issue, normally target that issue rather than changing topic.
Do not ask generic questions when a specific follow-up exists.
Do not repeat an earlier question unnecessarily.
Return only structured JSON.
"""

COPILOT_SYSTEM = """
You are InterviewShield's AI interview copilot for a human interviewer.
You do not conduct the interview. You do not score the candidate. You do not make hiring decisions.

The frontend/integration layer calls this endpoint once per completed candidate response,
not on every partial transcript update.

The candidate answer may be a raw speech transcript. Internally interpret the candidate's
actual technical meaning while ignoring filler words, stutters, repetitions, pauses,
false starts, and conversational phrasing.

Do not improve the answer and then treat the improved answer as what the candidate said.
Do not invent technical claims, projects, experience, tools, or facts the candidate did not provide.

Generate exactly three strong follow-up questions for the human interviewer.
The three questions should probe different useful angles when possible, such as depth of
understanding, practical application, edge cases, trade-offs, reasoning, or implementation details.
Avoid repeating the current question. Avoid three near-duplicates.
Return only structured JSON with this shape: {"questions": ["...", "...", "..."]}.
"""


class IntelligenceEngine:
    def __init__(self, llm):
        self.llm = llm

    @staticmethod
    def _payload(ctx: InterviewContextV2, question: str, answer: str) -> dict:
        return {
            "session_id": ctx.session_id,
            "role": ctx.role,
            "job_description": ctx.job_description,
            "resume": ctx.resume,
            "candidate_profile": ctx.candidate_profile,
            "difficulty": ctx.difficulty,
            "topics": ctx.topics,
            "previous_turns": [x.model_dump() for x in ctx.history[-12:]],
            "recent_transcript": [x.model_dump() for x in ctx.transcript[-30:]],
            "recent_events": [x.model_dump() for x in ctx.events[-40:]],
            "current_question": question,
            "current_answer": answer,
        }

    def analyze_answer(self, ctx: InterviewContextV2, question: str, answer: str) -> AnswerAnalysisV2:
        prompt = (
            ANALYSIS_SYSTEM
            + """
SCORING:
90-100 exceptional evidence
75-89 strong evidence
60-74 adequate evidence with meaningful gaps
40-59 weak/moderate evidence
20-39 poor evidence
0-19 almost no useful evidence

Never use 50 as a default.
"""
            + "\nCONTEXT:\n"
            + json.dumps(self._payload(ctx, question, answer), ensure_ascii=False, indent=2)
            + """

TASK
Analyze ONLY the current candidate answer.

Evaluate:
- relevance
- technical_depth
- correctness_confidence
- completeness
- clarity
- jd_alignment
- resume_consistency
- concrete strengths
- concrete gaps
- concepts actually demonstrated or mentioned
- claims that deserve verification
- exact reason a follow-up is useful

Be specific. A statement like 'good answer' is not useful evidence.
"""
        )
        try:
            return self.llm.generate_structured(prompt, AnswerAnalysisV2)
        except Exception:
            return self._fallback_analysis(ctx, question, answer)

    def generate_next_question(
        self,
        ctx: InterviewContextV2,
        question: str,
        answer: str,
        analysis: AnswerAnalysisV2,
    ) -> NextQuestion:
        prompt = (
            QUESTION_SYSTEM
            + "\nCONTEXT:\n"
            + json.dumps(self._payload(ctx, question, answer), ensure_ascii=False, indent=2)
            + "\nCURRENT ANSWER ANALYSIS:\n"
            + json.dumps(analysis.model_dump(), ensure_ascii=False, indent=2)
            + """

TASK
Generate exactly one immediately-usable interviewer question.

If the analysis contains claims_to_verify, gaps, or missing concepts,
target the highest-value one directly.
The reason must refer to current-answer evidence.
verification_targets must list concrete implementation/details to listen for.
expected_good_answer_signals must list concrete signs of genuine understanding.
Do not switch to an unrelated generic question while an actionable gap exists.
"""
        )
        try:
            return self.llm.generate_structured(prompt, NextQuestion)
        except Exception:
            return self._fallback_question(ctx, question, analysis)

    def generate_copilot_questions(self, ctx: InterviewContextV2, question: str, answer: str) -> CopilotQuestions:
        if not question.strip():
            raise ValueError("Question cannot be empty.")
        if not answer.strip():
            raise ValueError("Answer cannot be empty.")

        prompt = (
            COPILOT_SYSTEM
            + "\nCONTEXT:\n"
            + json.dumps(self._payload(ctx, question, answer), ensure_ascii=False, indent=2)
            + """

TASK
Understand the completed candidate response and return the three best follow-up questions.
Use the job role, job description, candidate profile/resume, interview topic list,
previous Q&A, recent transcript, current question, and current answer when available.

The final response must contain only the three questions.
"""
        )
        try:
            result = self.llm.generate_structured(prompt, CopilotQuestions)
            return self._normalize_copilot_questions(result, ctx, question, answer)
        except Exception:
            return self._fallback_copilot_questions(ctx, question, answer)

    def review_assistance(self, ctx: InterviewContextV2) -> AssistanceIndicator:
        """Deterministic evidence aggregation for low latency and explainability."""
        events = ctx.events[-60:]
        if not events:
            return AssistanceIndicator(
                level="none",
                summary="No assistance-related platform, video, or audio events were supplied.",
            )

        high_signal = {"tab_switch", "screen_share_stopped", "fullscreen_exit", "external_device_detected", "multiple_faces_detected"}
        medium_signal = {"face_missing", "face_not_detected", "off_screen_gaze", "face_off_center"}
        signals = [e for e in events if e.event_type in high_signal or e.event_type in medium_signal]

        if not signals:
            return AssistanceIndicator(
                level="none",
                summary="No assistance-related events were supplied in the available evidence.",
            )

        ids = [e.event_id for e in signals]
        reasons: list[str] = []
        high_count = sum(1 for e in signals if e.event_type in high_signal)
        medium_count = sum(1 for e in signals if e.event_type in medium_signal)

        for event in signals:
            reasons.append(f"{event.event_type} at {event.timestamp_ms} ms: {event.description}")

        # Correlation rule: several distinct signals near one another are more meaningful
        # than one isolated event, but this remains a verification cue, not proof.
        correlated = False
        for i, first in enumerate(signals):
            for second in signals[i + 1 :]:
                if abs(first.timestamp_ms - second.timestamp_ms) <= 15000:
                    correlated = True
                    break
            if correlated:
                break

        if high_count >= 2 or (high_count >= 1 and correlated and medium_count >= 1):
            level = "medium"
        elif high_count >= 1 or medium_count >= 2:
            level = "low"
        else:
            level = "low"

        return AssistanceIndicator(
            level=level,
            summary=(
                "Potential external-assistance indicator based on observable interview events. "
                "These events require human verification and do not establish cheating."
            ),
            evidence_event_ids=ids,
            reasons=reasons,
            manual_verification_recommended=True,
        )

    def analyze_turn(self, ctx: InterviewContextV2, question: str, answer: str) -> TurnResult:
        if not question.strip():
            raise ValueError("Question cannot be empty.")
        if not answer.strip():
            raise ValueError("Answer cannot be empty.")

        analysis = self.analyze_answer(ctx, question, answer)
        next_question = self.generate_next_question(ctx, question, answer, analysis)
        assistance = self.review_assistance(ctx)
        return TurnResult(
            analysis=analysis,
            next_question=next_question,
            assistance_indicator=assistance,
        )

    @staticmethod
    def _normalize_copilot_questions(
        result: CopilotQuestions,
        ctx: InterviewContextV2,
        question: str,
        answer: str,
    ) -> CopilotQuestions:
        unique = []
        for item in result.questions:
            cleaned = " ".join(str(item).split())
            if cleaned and cleaned not in unique:
                unique.append(cleaned)

        fallback = IntelligenceEngine._fallback_copilot_questions(ctx, question, answer).questions
        for item in fallback:
            if len(unique) >= 3:
                break
            if item not in unique:
                unique.append(item)

        return CopilotQuestions(questions=unique[:3])

    @staticmethod
    def _fallback_analysis(ctx: InterviewContextV2, question: str, answer: str) -> AnswerAnalysisV2:
        text = answer.strip()
        lowered = text.lower()
        words = re.findall(r"\b\w+\b", lowered)
        word_count = len(words)

        technical_terms = {
            "api", "rest", "spring", "spring boot", "jwt", "security", "sql",
            "database", "microservice", "docker", "kubernetes", "cache", "redis",
            "exception", "thread", "async", "authentication", "authorization",
            "testing", "unit test", "deployment", "architecture", "algorithm",
        }
        detected = [term for term in technical_terms if term in lowered]

        direct_relevance = 82 if any(token in lowered for token in re.findall(r"\w+", question.lower())[:5]) else 68
        technical = min(90, 35 + len(detected) * 8 + min(word_count, 90) // 8)
        clarity = min(92, 45 + min(word_count, 120) // 3)
        completeness = min(88, 35 + min(word_count, 120) // 4)
        jd_alignment = min(90, 55 + sum(1 for t in detected if t in ctx.job_description.lower()) * 7)
        resume_consistency = 78 if not ctx.resume else min(92, 65 + sum(1 for t in detected if t in ctx.resume.lower()) * 6)

        gaps: list[str] = []
        claims: list[str] = []
        strengths: list[str] = []

        if word_count < 20:
            gaps.append("The answer is too brief to demonstrate implementation-level understanding.")
        if detected:
            strengths.append("The candidate explicitly referenced relevant technical concepts: " + ", ".join(detected[:6]) + ".")
        if word_count >= 40:
            strengths.append("The candidate provided enough detail to establish a substantive response rather than a one-line assertion.")
        if "i implemented" in lowered or "i built" in lowered or "i designed" in lowered or "i worked on" in lowered:
            claims.append("The candidate made a personal implementation/experience claim that should be verified with concrete details.")
        if technical < 65:
            gaps.append("The answer does not yet provide enough concrete implementation or trade-off detail to establish strong technical depth.")

        return AnswerAnalysisV2(
            relevance=direct_relevance,
            technical_depth=technical,
            correctness_confidence=65,
            completeness=completeness,
            clarity=clarity,
            jd_alignment=jd_alignment,
            resume_consistency=resume_consistency,
            strengths=strengths or ["The candidate addressed the interview question with usable information."],
            gaps=gaps or ["Probe the candidate for deeper implementation details and trade-offs."],
            concepts_detected=detected[:10],
            claims_to_verify=claims,
            follow_up_reason="A targeted follow-up should probe the most important missing implementation detail or verification point from this answer.",
        )

    @staticmethod
    def _fallback_question(
        ctx: InterviewContextV2,
        question: str,
        analysis: AnswerAnalysisV2,
    ) -> NextQuestion:
        target = analysis.claims_to_verify[0] if analysis.claims_to_verify else (analysis.gaps[0] if analysis.gaps else "the implementation details")
        lower = (question + " " + " ".join(analysis.gaps)).lower()

        if "jwt" in lower or "token" in lower:
            q = "Can you walk me through how your application validates the JWT, handles its claims, and responds to an invalid or expired token?"
            skill = "Authentication and API Security"
            targets = ["token extraction", "signature/claim validation", "expired or invalid token handling"]
        elif "sql" in lower or "database" in lower:
            q = "What approach did you use for database queries and how did you handle performance, indexing, and transaction boundaries?"
            skill = "Database Engineering"
            targets = ["query design", "indexing", "transactions", "performance"]
        elif "rest" in lower or "api" in lower:
            q = "How did you design this API for validation, error handling, and backward compatibility, and why did you choose that approach?"
            skill = "REST API Design"
            targets = ["validation", "error handling", "API design trade-offs"]
        else:
            q = f"Can you explain the concrete implementation details behind this point and the main trade-off you made? ({target})"
            skill = ctx.topics[0] if ctx.topics else "Technical Implementation"
            targets = [target]

        return NextQuestion(
            question=q,
            reason=f"The current answer needs deeper evidence around: {target}",
            skill_tested=skill,
            type="verification" if analysis.claims_to_verify else "follow_up",
            difficulty=ctx.difficulty,
            verification_targets=targets,
            expected_good_answer_signals=["Specific implementation steps", "Clear reasoning and trade-offs", "Concrete edge-case or failure handling"],
        )

    @staticmethod
    def _fallback_copilot_questions(ctx: InterviewContextV2, question: str, answer: str) -> CopilotQuestions:
        combined = f"{ctx.role} {ctx.job_description} {' '.join(ctx.topics)} {question} {answer}".lower()

        if "arraylist" in combined or "linkedlist" in combined or "list" in combined:
            questions = [
                "What are the time complexity differences between random access and insertion for ArrayList and LinkedList?",
                "When might ArrayList still be the better choice even if insertions are part of the workload?",
                "What memory overhead trade-offs would you consider when choosing between these two structures?",
            ]
        elif "jwt" in combined or "token" in combined or "authentication" in combined:
            questions = [
                "How would your API validate the JWT signature, expiry, issuer, and role claims before accepting a request?",
                "What should happen when a token is expired, malformed, or signed with the wrong key?",
                "How would you test that protected endpoints reject unauthorized users without leaking sensitive details?",
            ]
        elif "sql" in combined or "database" in combined or "query" in combined:
            questions = [
                "How would you decide which columns need indexes for this query pattern?",
                "What trade-offs would you consider between query simplicity, performance, and transaction safety?",
                "How would you test that the database logic behaves correctly under edge cases or concurrent requests?",
            ]
        else:
            topic = ctx.topics[0] if ctx.topics else ctx.role or "this topic"
            questions = [
                f"Can you walk me through the concrete implementation details behind your answer about {topic}?",
                "What edge cases or failure modes would you watch for in that approach?",
                "What trade-off did you make there, and what alternative approach would you compare it against?",
            ]

        return CopilotQuestions(questions=questions)
