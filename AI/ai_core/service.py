from __future__ import annotations

from dataclasses import dataclass, field

from .intelligence import IntelligenceEngine
from .schemas import *
from .session_store import SessionStore


@dataclass
class InterviewAIService:
    llm: object
    store: SessionStore = field(default_factory=SessionStore)
    sessions: dict[str, InterviewContextV2] = field(default_factory=dict)
    analyses: dict[str, list[AnswerAnalysisV2]] = field(default_factory=dict)
    indicators: dict[str, list[AssistanceIndicator]] = field(default_factory=dict)
    last_results: dict[str, TurnResult] = field(default_factory=dict)
    last_copilot_results: dict[str, tuple[str, CopilotQuestions]] = field(default_factory=dict)

    def _load_session(self, session_id: str):
        if session_id in self.sessions:
            return
        loaded = self.store.load(session_id)
        if loaded:
            ctx, analyses, indicators = loaded
            self.sessions[session_id] = ctx
            self.analyses[session_id] = analyses
            self.indicators[session_id] = indicators

    def create_session(self, ctx: InterviewContextV2):
        self.sessions[ctx.session_id] = ctx
        self.analyses.setdefault(ctx.session_id, [])
        self.indicators.setdefault(ctx.session_id, [])
        self.store.save(ctx, self.analyses[ctx.session_id], self.indicators[ctx.session_id])
        return ctx

    def get_context(self, session_id: str) -> InterviewContextV2:
        self._load_session(session_id)
        ctx = self.sessions.get(session_id)
        if not ctx:
            raise KeyError("Interview session not found.")
        return ctx

    def add_event(self, event: InterviewEvent):
        ctx = self.get_context(event.session_id)
        ctx.events.append(event)
        self.store.save(ctx, self.analyses[event.session_id], self.indicators[event.session_id])

    def add_transcript(self, session_id: str, segment: TranscriptSegment):
        ctx = self.get_context(session_id)
        ctx.transcript.append(segment)
        self.store.save(ctx, self.analyses[session_id], self.indicators[session_id])

    def process_answer(self, session_id: str, question: str, answer: str, timestamp_ms=None, duration_ms=None):
        ctx = self.get_context(session_id)
        result = IntelligenceEngine(self.llm).analyze_turn(ctx, question, answer)
        ctx.history.append(
            InterviewTurn(
                question=question,
                answer=answer,
                timestamp_ms=timestamp_ms,
                answer_duration_ms=duration_ms,
            )
        )
        self.analyses[session_id].append(result.analysis)
        self.indicators[session_id].append(result.assistance_indicator)
        self.last_results[session_id] = result
        self.store.save(ctx, self.analyses[session_id], self.indicators[session_id])
        return result

    def suggest_copilot_questions(self, session_id: str, question: str, answer: str, timestamp_ms=None, duration_ms=None):
        ctx = self.get_context(session_id)
        turn_key = f"{question.strip()}\n{answer.strip()}"
        cached = self.last_copilot_results.get(session_id)
        if cached and cached[0] == turn_key:
            return cached[1]

        result = IntelligenceEngine(self.llm).generate_copilot_questions(ctx, question, answer)
        ctx.history.append(
            InterviewTurn(
                question=question,
                answer=answer,
                timestamp_ms=timestamp_ms,
                answer_duration_ms=duration_ms,
            )
        )
        self.last_copilot_results[session_id] = (turn_key, result)
        self.store.save(ctx, self.analyses[session_id], self.indicators[session_id])
        return result

    def latest_result(self, session_id: str):
        return self.last_results.get(session_id)

    def report(self, session_id: str) -> FinalInterviewReportV2:
        ctx = self.get_context(session_id)
        analyses = self.analyses.get(session_id, [])
        if not analyses:
            raise KeyError("No completed interview analysis found.")

        def avg(name: str) -> int:
            return round(sum(getattr(x, name) for x in analyses) / len(analyses))

        strengths = list(dict.fromkeys(s for x in analyses for s in x.strengths))
        gaps = list(dict.fromkeys(s for x in analyses for s in x.gaps))
        claims = list(dict.fromkeys(s for x in analyses for s in x.claims_to_verify))
        followups = list(dict.fromkeys(x.follow_up_reason for x in analyses if x.follow_up_reason))

        technical = avg("technical_depth")
        communication = avg("clarity")
        relevance = avg("relevance")
        jd = avg("jd_alignment")
        correctness = avg("correctness_confidence")
        completeness = avg("completeness")
        overall = round((technical + communication + relevance + jd + correctness + completeness) / 6)

        return FinalInterviewReportV2(
            overall_score=overall,
            technical_score=technical,
            communication_score=communication,
            relevance_score=relevance,
            jd_alignment_score=jd,
            correctness_confidence_score=correctness,
            completeness_score=completeness,
            strengths=strengths,
            gaps=gaps,
            claims_to_verify=claims,
            behavioral_observations=[e for e in ctx.events if e.source == "video"],
            assistance_indicators=self.indicators[session_id],
            interview_summary=(
                f"Interview contained {len(analyses)} analyzed answer(s). "
                "Scores summarize supplied evidence and are not a hiring or cheating decision."
            ),
            recommended_follow_ups=followups,
        )
