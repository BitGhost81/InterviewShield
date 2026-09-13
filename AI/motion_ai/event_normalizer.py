"""
InterviewShield - Event Normalizer

Converts low-level detection events into the exact event types
expected by the trained cheating detection model.

Model events:
    FACE_MISSING
    MULTIPLE_PERSON
    PHONE_VISIBLE
    LOOKING_AWAY
"""


class EventNormalizer:

    MODEL_EVENTS = {
        "FACE_MISSING",
        "MULTIPLE_PERSON",
        "PHONE_VISIBLE",
        "LOOKING_AWAY",
    }

    # Raw head-direction events that represent looking away
    LOOKING_AWAY_EVENTS = {
        "LOOKING_LEFT",
        "LOOKING_RIGHT",
        "LOOKING_UP",
        "LOOKING_DOWN",
    }

    # Events that represent phone detection
    PHONE_EVENTS = {
        "PHONE_VISIBLE",
        "PHONE_DETECTED",
        "CELL_PHONE",
        "MOBILE_PHONE",
    }

    def __init__(self):
        pass

    def normalize_event(self, event):
        """
        Convert one raw event into a model-compatible event.

        Returns:
            str or None
        """

        if not event:
            return None

        event = str(event).strip().upper()

        # Already a model event
        if event in self.MODEL_EVENTS:
            return event

        # Face missing
        if event == "FACE_MISSING":
            return "FACE_MISSING"

        # Multiple people
        if event in {
            "MULTIPLE_PERSON",
            "MULTIPLE_PEOPLE",
            "MULTIPLE_FACES",
        }:
            return "MULTIPLE_PERSON"

        # Phone
        if event in self.PHONE_EVENTS:
            return "PHONE_VISIBLE"

        # Looking away
        if event in self.LOOKING_AWAY_EVENTS:
            return "LOOKING_AWAY"

        # Ignore events that the ML model does not use
        return None

    def normalize_events(self, events):
        """
        Normalize a list of raw events.

        Duplicate normalized events are removed.
        """

        if not events:
            return []

        normalized = []

        for event in events:

            model_event = self.normalize_event(event)

            if model_event is not None:
                if model_event not in normalized:
                    normalized.append(model_event)

        return normalized

    def normalize_detection_result(self, detection_result):
        """
        Normalize events directly from motion_detector output.

        Expected structure:

        {
            "events": [
                "FACE_MISSING",
                "LOOKING_LEFT"
            ]
        }

        Returns:

        {
            "events": [
                "FACE_MISSING",
                "LOOKING_AWAY"
            ]
        }
        """

        if not isinstance(detection_result, dict):
            return {
                "events": []
            }

        raw_events = detection_result.get("events", [])

        normalized_events = self.normalize_events(raw_events)

        result = dict(detection_result)

        result["events"] = normalized_events

        return result

    def add_phone_detection(self, detection_result, phone_visible):
        """
        Add PHONE_VISIBLE when the object detector confirms
        a phone is visible.

        phone_visible:
            True  -> add PHONE_VISIBLE
            False -> do not add it
        """

        if not isinstance(detection_result, dict):
            detection_result = {
                "events": []
            }

        events = list(detection_result.get("events", []))

        if phone_visible:
            if "PHONE_VISIBLE" not in events:
                events.append("PHONE_VISIBLE")

        detection_result["events"] = self.normalize_events(events)

        return detection_result

    def get_model_events(self):
        """
        Return the four event types used by the trained model.
        """

        return [
            "FACE_MISSING",
            "MULTIPLE_PERSON",
            "PHONE_VISIBLE",
            "LOOKING_AWAY",
        ]

    def is_model_event(self, event):
        """
        Check whether an event is directly supported by the ML model.
        """

        if not event:
            return False

        return str(event).strip().upper() in self.MODEL_EVENTS


if __name__ == "__main__":

    print("=" * 70)
    print("InterviewShield - Event Normalizer Test")
    print("=" * 70)

    normalizer = EventNormalizer()

    test_events = [
        "FACE_MISSING",
        "MULTIPLE_PERSON",
        "LOOKING_LEFT",
        "LOOKING_RIGHT",
        "LOOKING_UP",
        "LOOKING_DOWN",
        "PHONE_VISIBLE",
        "PHONE_DETECTED",
        "HEAD_MOVEMENT",
        "UNKNOWN_EVENT",
    ]

    print("\nNormalization test:\n")

    for event in test_events:

        result = normalizer.normalize_event(event)

        print(f"{event:25} -> {result}")

    print("\n" + "-" * 70)

    raw_events = [
        "FACE_MISSING",
        "LOOKING_LEFT",
        "LOOKING_RIGHT",
        "PHONE_DETECTED",
        "HEAD_MOVEMENT",
        "UNKNOWN_EVENT",
    ]

    print("\nInput events:")
    print(raw_events)

    normalized = normalizer.normalize_events(raw_events)

    print("\nNormalized events:")
    print(normalized)

    print("\nExpected model event types:")
    print(normalizer.get_model_events())

    print("\n" + "=" * 70)
    print("EVENT NORMALIZER TEST PASSED")
    print("=" * 70)