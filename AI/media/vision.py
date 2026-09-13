from __future__ import annotations

import time
from pathlib import Path

from ai_core.schemas import InterviewEvent


class VisionEventDetector:
    """OpenCV-based conservative frame/event detector for demo and integration use."""

    def __init__(self) -> None:
        try:
            import cv2
        except ImportError as exc:
            raise RuntimeError("opencv-python is required for frame analysis.") from exc
        self.cv2 = cv2
        self.cascade = cv2.CascadeClassifier(
            str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml")
        )

    def analyze_frame(self, session_id: str, image_bytes: bytes, timestamp_ms: int | None = None) -> list[InterviewEvent]:
        import numpy as np

        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        frame = self.cv2.imdecode(arr, self.cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Invalid image bytes.")

        gray = self.cv2.cvtColor(frame, self.cv2.COLOR_BGR2GRAY)
        faces = self.cascade.detectMultiScale(gray, 1.1, 5)
        ts = timestamp_ms if timestamp_ms is not None else int(time.time() * 1000)
        width = max(frame.shape[1], 1)
        events: list[InterviewEvent] = []

        if len(faces) == 0:
            events.append(
                InterviewEvent(
                    session_id=session_id,
                    timestamp_ms=ts,
                    source="video",
                    event_type="face_not_detected",
                    description="No face was detected in this sampled frame.",
                    confidence=0.85,
                )
            )
            return events

        if len(faces) > 1:
            events.append(
                InterviewEvent(
                    session_id=session_id,
                    timestamp_ms=ts,
                    source="video",
                    event_type="multiple_faces_detected",
                    description=f"{len(faces)} faces were detected in this sampled frame.",
                    confidence=0.90,
                    metadata={"face_count": int(len(faces))},
                )
            )
            return events

        x, y, w, h = [int(v) for v in faces[0]]
        center_x = x + (w / 2)
        normalized_offset = abs((center_x / width) - 0.5) * 2

        events.append(
            InterviewEvent(
                session_id=session_id,
                timestamp_ms=ts,
                source="video",
                event_type="face_detected",
                description="One face was detected in this sampled frame.",
                confidence=0.90,
                metadata={"face_box": [x, y, w, h]},
            )
        )

        # This is a face-position heuristic, NOT true eye-gaze detection.
        if normalized_offset > 0.45:
            events.append(
                InterviewEvent(
                    session_id=session_id,
                    timestamp_ms=ts,
                    source="video",
                    event_type="face_off_center",
                    description="Detected face is substantially off-center in the camera frame.",
                    confidence=min(0.95, 0.60 + normalized_offset / 2),
                    metadata={"normalized_horizontal_offset": round(float(normalized_offset), 3)},
                )
            )

        return events
