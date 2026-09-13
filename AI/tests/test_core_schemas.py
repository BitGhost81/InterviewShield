from ai_core.schemas import InterviewContextV2, InterviewEvent


def test_event_has_id():
    e = InterviewEvent(
        session_id="s1",
        timestamp_ms=10,
        source="video",
        event_type="face_detected",
        description="One face detected",
        confidence=0.9,
    )
    assert e.event_id


def test_context_defaults():
    ctx = InterviewContextV2(session_id="s1", role="Backend", job_description="Java")
    assert ctx.history == []
    assert ctx.events == []
