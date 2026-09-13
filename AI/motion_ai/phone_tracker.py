"""
InterviewShield - Phone Tracker

Adds temporal stability to YOLO phone detection.

A phone must be detected for several consecutive frames before
PHONE_VISIBLE is emitted.

No webcam access.
No OpenCV.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class PhoneState:
    phone_visible: bool = False
    consecutive_detected: int = 0
    consecutive_missing: int = 0
    max_confidence: float = 0.0


class PhoneTracker:
    """
    Temporal tracker for phone detections.

    Detection flow:

        YOLO detects phone
                ↓
        consecutive frames
                ↓
        confirmation threshold
                ↓
        PHONE_VISIBLE event
    """

    def __init__(
        self,
        confirmation_frames=3,
        disappearance_frames=3,
        minimum_confidence=0.30,
    ):
        self.confirmation_frames = max(
            1,
            int(confirmation_frames)
        )

        self.disappearance_frames = max(
            1,
            int(disappearance_frames)
        )

        self.minimum_confidence = float(
            minimum_confidence
        )

        self.state = PhoneState()

    def update(
        self,
        phone_visible: bool,
        confidence: float = 0.0,
    ):
        """
        Update tracker using the latest YOLO result.

        Returns:

        {
            "phone_visible": bool,
            "confirmed": bool,
            "event": "PHONE_VISIBLE" or None,
            "consecutive_detected": int,
            "consecutive_missing": int,
            "confidence": float
        }
        """

        confidence = float(confidence)

        valid_detection = (
            bool(phone_visible)
            and confidence >= self.minimum_confidence
        )

        # --------------------------------------------------
        # PHONE DETECTED
        # --------------------------------------------------

        if valid_detection:

            self.state.consecutive_detected += 1
            self.state.consecutive_missing = 0

            self.state.max_confidence = max(
                self.state.max_confidence,
                confidence
            )

            # Confirm phone only after required frames
            if (
                self.state.consecutive_detected
                >= self.confirmation_frames
            ):
                self.state.phone_visible = True

        # --------------------------------------------------
        # PHONE NOT DETECTED
        # --------------------------------------------------

        else:

            self.state.consecutive_missing += 1
            self.state.consecutive_detected = 0

            # Don't immediately remove the phone state.
            # Allow a few missed frames.
            if (
                self.state.consecutive_missing
                >= self.disappearance_frames
            ):
                self.state.phone_visible = False
                self.state.max_confidence = 0.0

        event = None

        if self.state.phone_visible:
            event = "PHONE_VISIBLE"

        return {
            "phone_visible": self.state.phone_visible,
            "confirmed": self.state.phone_visible,
            "event": event,
            "consecutive_detected": (
                self.state.consecutive_detected
            ),
            "consecutive_missing": (
                self.state.consecutive_missing
            ),
            "confidence": round(
                self.state.max_confidence,
                4
            ),
        }

    def update_from_detection(self, detection_result):
        """
        Directly consume the output of PhoneDetector.detect().

        Expected:

        {
            "phone_visible": True,
            "detections": [
                {
                    "confidence": 0.81,
                    ...
                }
            ]
        }
        """

        if not isinstance(detection_result, dict):
            return self.update(False, 0.0)

        phone_visible = bool(
            detection_result.get(
                "phone_visible",
                False
            )
        )

        detections = detection_result.get(
            "detections",
            []
        )

        confidence = 0.0

        if detections:

            confidence = max(
                float(
                    detection.get(
                        "confidence",
                        0.0
                    )
                )
                for detection in detections
            )

        return self.update(
            phone_visible=phone_visible,
            confidence=confidence,
        )

    def get_event_list(self):
        """
        Return model-compatible events for the
        current tracker state.
        """

        if self.state.phone_visible:
            return ["PHONE_VISIBLE"]

        return []

    def reset(self):
        """Reset tracker state."""

        self.state = PhoneState()

    def get_state(self):
        """Return current state."""

        return {
            "phone_visible": self.state.phone_visible,
            "consecutive_detected": (
                self.state.consecutive_detected
            ),
            "consecutive_missing": (
                self.state.consecutive_missing
            ),
            "max_confidence": round(
                self.state.max_confidence,
                4
            ),
        }


def run_self_test():

    print("=" * 70)
    print("InterviewShield - Phone Tracker Test")
    print("=" * 70)

    tracker = PhoneTracker(
        confirmation_frames=3,
        disappearance_frames=3,
        minimum_confidence=0.30,
    )

    # --------------------------------------------------
    # TEST 1: One false detection
    # --------------------------------------------------

    print("\nTEST 1: Single-frame detection")

    result = tracker.update(
        phone_visible=True,
        confidence=0.80
    )

    print(result)

    assert result["phone_visible"] is False

    print("PASS")

    # --------------------------------------------------
    # TEST 2: Three consecutive detections
    # --------------------------------------------------

    print("\nTEST 2: Three consecutive detections")

    for i in range(3):

        result = tracker.update(
            phone_visible=True,
            confidence=0.80
        )

        print(
            f"Frame {i + 1}: "
            f"phone_visible="
            f"{result['phone_visible']}"
        )

    assert result["phone_visible"] is True

    print("PASS")

    # --------------------------------------------------
    # TEST 3: One missed frame
    # --------------------------------------------------

    print("\nTEST 3: One missed frame")

    result = tracker.update(
        phone_visible=False,
        confidence=0.0
    )

    print(result)

    assert result["phone_visible"] is True

    print("PASS")

    # --------------------------------------------------
    # TEST 4: Three consecutive missing frames
    # --------------------------------------------------

    print("\nTEST 4: Three missing frames")

    for i in range(3):

        result = tracker.update(
            phone_visible=False,
            confidence=0.0
        )

        print(
            f"Missing frame {i + 1}: "
            f"phone_visible="
            f"{result['phone_visible']}"
        )

    assert result["phone_visible"] is False

    print("PASS")

    # --------------------------------------------------
    # TEST 5: Low confidence detection
    # --------------------------------------------------

    print("\nTEST 5: Low-confidence detection")

    tracker.reset()

    result = tracker.update(
        phone_visible=True,
        confidence=0.20
    )

    print(result)

    assert result["phone_visible"] is False

    print("PASS")

    # --------------------------------------------------

    print("\n" + "=" * 70)
    print("PHONE TRACKER TEST PASSED")
    print("=" * 70)


if __name__ == "__main__":
    try:
        run_self_test()

    except AssertionError:

        print("\n" + "=" * 70)
        print("PHONE TRACKER TEST FAILED")
        print("=" * 70)

        raise

    except Exception as e:

        print("\n" + "=" * 70)
        print("PHONE TRACKER TEST FAILED")
        print("=" * 70)

        print(
            type(e).__name__,
            ":",
            str(e)
        )