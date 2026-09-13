"""
InterviewShield - Feature Extractor

Converts StateTracker episode information into a stable
session-level feature dictionary.

This module:
    - does NOT access the camera
    - does NOT use OpenCV
    - does NOT load the ML model
    - does NOT make the final cheating decision

It only prepares behavioral features.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable


class FeatureExtractor:
    """
    Converts tracker/session data into model-ready features.

    The extractor is deliberately separated from the tracker so that
    feature engineering can be changed without modifying detection logic.
    """

    # Events currently produced by motion_detector.py / state_tracker.py
    SUPPORTED_EVENTS = (
        "FACE_MISSING",
        "MULTIPLE_PERSON",
        "LOOKING_LEFT",
        "LOOKING_RIGHT",
        "LOOKING_UP",
        "LOOKING_DOWN",
        "HEAD_MOVEMENT",
    )

    def __init__(self):
        self.feature_names = self._build_feature_names()

    # ------------------------------------------------------------------
    # PUBLIC API
    # ------------------------------------------------------------------

    def extract(
        self,
        session_features: Dict[str, Any],
    ) -> Dict[str, float]:
        """
        Convert tracker session features into a clean numeric dictionary.

        Missing features are filled with 0.0.

        Parameters
        ----------
        session_features:
            Output from StateTracker.get_session_features()

        Returns
        -------
        dict
            Numeric feature dictionary.
        """

        session_features = session_features or {}

        features: Dict[str, float] = {}

        for name in self.feature_names:

            value = session_features.get(
                name,
                0.0,
            )

            features[name] = self._numeric(value)

        return features

    # ------------------------------------------------------------------
    # BUILD FEATURE NAMES
    # ------------------------------------------------------------------

    def _build_feature_names(self) -> list[str]:
        """
        Build the standard feature schema.

        Every event gets:
            episodes
            total_duration
            max_duration
            max_severity
        """

        names: list[str] = []

        for event in self.SUPPORTED_EVENTS:

            names.extend(
                [
                    f"{event}_episodes",
                    f"{event}_total_duration",
                    f"{event}_max_duration",
                    f"{event}_max_severity",
                ]
            )

        return names

    # ------------------------------------------------------------------
    # NUMERIC CONVERSION
    # ------------------------------------------------------------------

    @staticmethod
    def _numeric(value: Any) -> float:
        """
        Safely convert a value to float.
        """

        if value is None:
            return 0.0

        if isinstance(value, bool):
            return float(value)

        try:
            return float(value)

        except (TypeError, ValueError):
            return 0.0

    # ------------------------------------------------------------------
    # ZERO FEATURE SET
    # ------------------------------------------------------------------

    def empty_features(self) -> Dict[str, float]:
        """
        Return a complete zero-filled feature vector.

        Useful when a session has no suspicious events.
        """

        return {
            name: 0.0
            for name in self.feature_names
        }

    # ------------------------------------------------------------------
    # FEATURE NAMES
    # ------------------------------------------------------------------

    def get_feature_names(self) -> list[str]:
        """
        Return feature names in deterministic order.
        """

        return list(self.feature_names)

    # ------------------------------------------------------------------
    # FEATURE COUNT
    # ------------------------------------------------------------------

    def feature_count(self) -> int:
        """
        Return number of generated features.
        """

        return len(self.feature_names)

    # ------------------------------------------------------------------
    # FILTERING
    # ------------------------------------------------------------------

    def filter_features(
        self,
        features: Dict[str, Any],
        required_names: Iterable[str],
    ) -> Dict[str, float]:
        """
        Create a feature dictionary using an externally supplied schema.

        This is important for compatibility with the trained ML model.

        Parameters
        ----------
        features:
            Existing feature dictionary.

        required_names:
            Exact feature names required by the trained model.

        Returns
        -------
        dict
            Features in the requested schema.
        """

        features = features or {}

        result: Dict[str, float] = {}

        for name in required_names:

            result[name] = self._numeric(
                features.get(name, 0.0)
            )

        return result

    # ------------------------------------------------------------------
    # VALIDATION
    # ------------------------------------------------------------------

    def validate(
        self,
        features: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Validate a feature dictionary against this extractor's schema.
        """

        features = features or {}

        expected = set(self.feature_names)
        actual = set(features.keys())

        missing = sorted(
            expected - actual
        )

        extra = sorted(
            actual - expected
        )

        return {
            "valid": len(missing) == 0,
            "missing": missing,
            "extra": extra,
            "expected_count": len(expected),
            "actual_count": len(actual),
        }

    # ------------------------------------------------------------------
    # SUMMARY
    # ------------------------------------------------------------------

    def summarize(
        self,
        features: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Return useful information about a feature vector.
        """

        numeric_features = {
            key: self._numeric(value)
            for key, value in (features or {}).items()
        }

        non_zero = {
            key: value
            for key, value in numeric_features.items()
            if value != 0.0
        }

        return {
            "total_features": len(
                numeric_features
            ),
            "non_zero_features": len(
                non_zero
            ),
            "features": numeric_features,
        }