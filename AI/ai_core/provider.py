from __future__ import annotations

import os

from dotenv import load_dotenv
import time

from google import genai
from google.genai import types

load_dotenv()


class GeminiProvider:
    """Gemini provider with a fast, bounded retry policy for live interviews."""

    def __init__(self) -> None:
        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")

        self.client = genai.Client(api_key=key)
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        self.retries = max(0, min(1, int(os.getenv("LLM_MAX_RETRIES", "1"))))

    def generate_structured(self, prompt: str, schema):
        last_error: Exception | None = None

        for attempt in range(self.retries + 1):
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=schema,
                    ),
                )

                if not response.text:
                    raise RuntimeError("Gemini returned an empty response.")

                return schema.model_validate_json(response.text)

            except Exception as exc:
                last_error = exc
                message = str(exc)

                if any(code in message for code in ("400", "401", "403")):
                    raise RuntimeError(f"Gemini request failed ({self.model}): {exc}") from exc

                retryable = any(code in message for code in ("408", "429", "500", "502", "503", "504"))
                if not retryable or attempt >= self.retries:
                    raise RuntimeError(f"Gemini request failed ({self.model}): {exc}") from exc

                time.sleep(1.5)

        raise RuntimeError(f"Gemini model '{self.model}' failed: {last_error}")
