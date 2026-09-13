import os

from dotenv import load_dotenv
import time

from google import genai
from google.genai import types

load_dotenv()


class LLMAdapter:
    """Central LLM interface for InterviewShield."""

    def __init__(self):
        # Read the API key from the environment.
        api_key = os.getenv("GEMINI_API_KEY")

        # Fail immediately when the key is missing.
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured.")

        # Create the Gemini client.
        self.client = genai.Client(api_key=api_key)

        # Primary model.
        self.primary_model = "gemini-3.8-flash"

        # Fallback model.
        self.fallback_model = "gemini-3.5-flash-lite"

        # Retry count only for temporary failures.
        self.max_retries = 2

    def generate(self, prompt: str) -> str:
        """Generate normal text."""

        try:
            return self._generate_with_retry(
                self.primary_model,
                prompt
            )

        except Exception as primary_error:
            # Do not waste quota on fallback for permanent quota errors.
            if "429" in str(primary_error):
                raise

            print(f"Primary model unavailable: {primary_error}")
            print(f"Trying fallback model: {self.fallback_model}")

            return self._generate_with_retry(
                self.fallback_model,
                prompt
            )

    def _generate_with_retry(
        self,
        model: str,
        prompt: str
    ) -> str:
        """Generate text with retry only for temporary failures."""

        last_error = None

        for attempt in range(self.max_retries + 1):

            try:
                # Send request to Gemini.
                response = self.client.models.generate_content(
                    model=model,
                    contents=prompt
                )

                # Extract generated text.
                content = response.text

                # Validate response.
                if not content or not content.strip():
                    raise RuntimeError(
                        "Gemini returned an empty response."
                    )

                return content.strip()

            except Exception as error:
                last_error = error
                error_text = str(error)

                # Daily/project quota exceeded.
                # Retrying will not help, so stop immediately.
                if "429" in error_text:
                    raise RuntimeError(
                        f"LLM quota exceeded: {error}"
                    )

                # Retry temporary failures such as 503.
                if attempt < self.max_retries:
                    wait_time = 2 ** attempt

                    print(
                        f"{model} temporary failure. "
                        f"Retrying in {wait_time} seconds..."
                    )

                    time.sleep(wait_time)

        raise RuntimeError(
            f"Model '{model}' failed after retries: {last_error}"
        )

    def generate_structured(
        self,
        prompt: str,
        response_schema
    ):
        """Generate schema-constrained structured output."""

        try:
            return self._generate_structured_with_retry(
                self.primary_model,
                prompt,
                response_schema
            )

        except Exception as primary_error:
            # Never burn additional quota after a 429.
            if "429" in str(primary_error):
                raise

            print(
                f"Primary structured model unavailable: "
                f"{primary_error}"
            )

            print(
                f"Trying fallback model: {self.fallback_model}"
            )

            return self._generate_structured_with_retry(
                self.fallback_model,
                prompt,
                response_schema
            )

    def _generate_structured_with_retry(
        self,
        model: str,
        prompt: str,
        response_schema
    ):
        """Generate JSON and validate it against the schema."""

        last_error = None

        for attempt in range(self.max_retries + 1):

            try:
                # Request structured JSON from Gemini.
                response = self.client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=response_schema,
                    ),
                )

                # Validate model response.
                if not response.text:
                    raise RuntimeError(
                        "Gemini returned an empty structured response."
                    )

                return response_schema.model_validate_json(
                    response.text
                )

            except Exception as error:
                last_error = error
                error_text = str(error)

                # Do not retry daily quota exhaustion.
                if "429" in error_text:
                    raise RuntimeError(
                        f"LLM quota exceeded: {error}"
                    )

                # Retry temporary failures.
                if attempt < self.max_retries:
                    wait_time = 2 ** attempt

                    print(
                        f"{model} structured request temporarily failed. "
                        f"Retrying in {wait_time} seconds..."
                    )

                    time.sleep(wait_time)

        raise RuntimeError(
            f"Structured model '{model}' failed after retries: "
            f"{last_error}"
        )