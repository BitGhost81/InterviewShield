import base64
import io
import json
import unittest
import urllib.error
from unittest.mock import patch
import interview_ai


class AIProcessingTests(unittest.TestCase):
    def invoke(self, responses):
        payload = {"audio_base64": base64.b64encode(b"test audio").decode(), "mime_type": "audio/webm"}
        def response(value):
            if isinstance(value, Exception):
                raise value
            return io.BytesIO(json.dumps(value).encode())
        with patch.object(interview_ai, "load_dotenv"), patch.object(interview_ai.os, "getenv", side_effect=lambda key, default=None: "test-only" if key == "GEMINI_API_KEY" else default), patch.object(interview_ai.urllib.request, "urlopen", side_effect=lambda *args, **kwargs: response(responses.pop(0))) as request, patch.object(interview_ai.time, "sleep") as sleep:
            result = interview_ai.process_audio_payload(payload)
            return result, request.call_count, sleep.call_count

    def test_transient_failures_stay_bounded_and_do_not_expose_upstream_body(self):
        failures = [urllib.error.HTTPError("https://unused", 503, "failure", {}, io.BytesIO(b"private upstream details")) for _ in range(3)]
        result, calls, sleeps = self.invoke(failures)
        self.assertEqual(result[0], 502)
        self.assertEqual((calls, sleeps), (3, 2))
        self.assertNotIn("private", str(result))

    def test_transient_failure_then_success_preserves_models_and_pipeline(self):
        failure = urllib.error.HTTPError("https://unused", 503, "failure", {}, io.BytesIO(b"private"))
        transcript = {"candidates": [{"content": {"parts": [{"text": "Speaker 1: question\nSpeaker 2: answer"}]}}]}
        report = {"candidates": [{"content": {"parts": [{"text": json.dumps({"transcript": "Interviewer: question", "summary": "Assessment"})}]}}]}
        result, calls, sleeps = self.invoke([failure, transcript, report])
        self.assertEqual(result[0], 200)
        self.assertEqual((calls, sleeps), (3, 1))

    def test_audio_size_limit_rejects_without_any_api_call(self):
        with patch.object(interview_ai, "load_dotenv"), patch.object(interview_ai.os, "getenv", return_value="test-only"), patch.object(interview_ai.urllib.request, "urlopen") as request:
            result = interview_ai.process_audio_payload({"audio_base64": "x" * (24 * 1024 * 1024 + 1)})
            self.assertEqual(result[0], 413)
            request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
