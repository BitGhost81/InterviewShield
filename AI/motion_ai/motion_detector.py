"""
InterviewShield - Motion Detection Engine

IMPORTANT:
- This module does NOT open the webcam.
- This module does NOT use cv2.VideoCapture().
- The frontend/backend owns the camera.
- The backend passes image frames to this detector.

Current responsibilities:
    1. Detect face presence
    2. Detect multiple people/faces
    3. Estimate head orientation
    4. Detect significant head movement
    5. Return a clean detection dictionary

MediaPipe is used for face landmarks.
"""

from __future__ import annotations

import os
import math
from typing import Any, Dict, Optional

import mediapipe as mp


class MotionDetector:
    """
    Real-time face/head behavior detector.

    Input:
        RGB image/frame as a numpy array.

    Output:
        Dictionary containing detection results.

    This class intentionally does not control the webcam.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ):
        if model_path is None:
            model_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "models",
                "face_landmarker.task",
            )

        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Face landmark model not found:\n{model_path}"
            )

        self.model_path = model_path

        self.min_detection_confidence = min_detection_confidence
        self.min_tracking_confidence = min_tracking_confidence

        # MediaPipe Tasks API
        self.mp_face_landmarker = mp.tasks.vision.FaceLandmarker
        self.mp_face_landmarker_options = (
            mp.tasks.vision.FaceLandmarkerOptions
        )
        self.mp_base_options = mp.tasks.BaseOptions
        self.running_mode = mp.tasks.vision.RunningMode

        options = self.mp_face_landmarker_options(
            base_options=self.mp_base_options(
                model_asset_path=self.model_path
            ),
            running_mode=self.running_mode.IMAGE,
            num_faces=5,
            min_face_detection_confidence=self.min_detection_confidence,
            min_face_presence_confidence=self.min_detection_confidence,
            min_tracking_confidence=self.min_tracking_confidence,
            output_face_blendshapes=True,
            output_facial_transformation_matrixes=True,
        )

        self.detector = self.mp_face_landmarker.create_from_options(options)

        self.previous_head = None

    # ------------------------------------------------------------------
    # PUBLIC API
    # ------------------------------------------------------------------

    def process_frame(self, frame) -> Dict[str, Any]:
        """
        Process one RGB frame.

        Parameters
        ----------
        frame:
            RGB numpy array.

        Returns
        -------
        dict
            Detection result.
        """

        if frame is None:
            return self._empty_result("invalid_frame")

        try:
            mp_image = mp.Image(
                image_format=mp.ImageFormat.SRGB,
                data=frame,
            )

            result = self.detector.detect(mp_image)

            return self._build_result(result)

        except Exception as exc:
            return self._empty_result(
                error=str(exc)
            )

    # ------------------------------------------------------------------
    # RESULT PROCESSING
    # ------------------------------------------------------------------

    def _build_result(self, result) -> Dict[str, Any]:

        faces = result.face_landmarks or []

        face_count = len(faces)

        output = {
            "face_detected": face_count >= 1,
            "face_missing": face_count == 0,
            "multiple_person": face_count > 1,
            "face_count": face_count,

            "head": {
                "direction": "unknown",
                "yaw": 0.0,
                "pitch": 0.0,
                "roll": 0.0,
                "movement": False,
            },

            "events": [],

            "error": None,
        }

        # --------------------------------------------------------------
        # No face
        # --------------------------------------------------------------

        if face_count == 0:
            output["events"].append("FACE_MISSING")
            self.previous_head = None
            return output

        # --------------------------------------------------------------
        # Multiple faces
        # --------------------------------------------------------------

        if face_count > 1:
            output["events"].append("MULTIPLE_PERSON")

        # --------------------------------------------------------------
        # Primary face
        # --------------------------------------------------------------

        primary_face = faces[0]

        head = self._estimate_head_pose(primary_face)

        output["head"] = head

        # --------------------------------------------------------------
        # Head direction
        # --------------------------------------------------------------

        direction = head["direction"]

        if direction == "LEFT":
            output["events"].append("LOOKING_LEFT")

        elif direction == "RIGHT":
            output["events"].append("LOOKING_RIGHT")

        elif direction == "UP":
            output["events"].append("LOOKING_UP")

        elif direction == "DOWN":
            output["events"].append("LOOKING_DOWN")

        # --------------------------------------------------------------
        # Significant movement
        # --------------------------------------------------------------

        if head["movement"]:
            output["events"].append("HEAD_MOVEMENT")

        return output

    # ------------------------------------------------------------------
    # HEAD POSE
    # ------------------------------------------------------------------

    def _estimate_head_pose(self, landmarks) -> Dict[str, Any]:
        """
        Estimate approximate head orientation from facial landmarks.

        This is intentionally lightweight and designed for real-time
        behavioral detection rather than biometric measurement.
        """

        points = self._landmark_points(landmarks)

        if not points:
            return {
                "direction": "unknown",
                "yaw": 0.0,
                "pitch": 0.0,
                "roll": 0.0,
                "movement": False,
            }

        # Key MediaPipe landmarks
        nose = self._get_point(points, 1)
        left_eye = self._get_point(points, 33)
        right_eye = self._get_point(points, 263)
        left_mouth = self._get_point(points, 61)
        right_mouth = self._get_point(points, 291)
        chin = self._get_point(points, 152)

        if not all(
            [
                nose,
                left_eye,
                right_eye,
                left_mouth,
                right_mouth,
                chin,
            ]
        ):
            return {
                "direction": "unknown",
                "yaw": 0.0,
                "pitch": 0.0,
                "roll": 0.0,
                "movement": False,
            }

        # --------------------------------------------------------------
        # Horizontal orientation
        # --------------------------------------------------------------

        eye_center_x = (
            left_eye["x"] + right_eye["x"]
        ) / 2.0

        eye_width = abs(
            right_eye["x"] - left_eye["x"]
        )

        if eye_width < 1e-6:
            return {
                "direction": "unknown",
                "yaw": 0.0,
                "pitch": 0.0,
                "roll": 0.0,
                "movement": False,
            }

        horizontal_offset = (
            nose["x"] - eye_center_x
        ) / eye_width

        # --------------------------------------------------------------
        # Vertical orientation
        # --------------------------------------------------------------

        eye_center_y = (
            left_eye["y"] + right_eye["y"]
        ) / 2.0

        face_height = abs(
            chin["y"] - eye_center_y
        )

        if face_height < 1e-6:
            face_height = 1e-6

        vertical_offset = (
            nose["y"] - eye_center_y
        ) / face_height

        # --------------------------------------------------------------
        # Roll
        # --------------------------------------------------------------

        roll_radians = math.atan2(
            right_eye["y"] - left_eye["y"],
            right_eye["x"] - left_eye["x"],
        )

        roll_degrees = math.degrees(roll_radians)

        # --------------------------------------------------------------
        # Convert offsets into approximate degrees
        # --------------------------------------------------------------

        yaw = horizontal_offset * 45.0
        pitch = vertical_offset * 45.0
        roll = roll_degrees

        # --------------------------------------------------------------
        # Direction thresholds
        # --------------------------------------------------------------

        direction = "CENTER"

        if yaw <= -0.25 * 45:
            direction = "LEFT"

        elif yaw >= 0.25 * 45:
            direction = "RIGHT"

        elif pitch <= -0.18 * 45:
            direction = "UP"

        elif pitch >= 0.28 * 45:
            direction = "DOWN"

        # --------------------------------------------------------------
        # Movement detection
        # --------------------------------------------------------------

        current_head = {
            "yaw": yaw,
            "pitch": pitch,
            "roll": roll,
        }

        movement = self._detect_movement(current_head)

        return {
            "direction": direction,
            "yaw": round(yaw, 2),
            "pitch": round(pitch, 2),
            "roll": round(roll, 2),
            "movement": movement,
        }

    # ------------------------------------------------------------------
    # TEMPORAL MOVEMENT
    # ------------------------------------------------------------------

    def _detect_movement(self, current: Dict[str, float]) -> bool:
        """
        Compare current head orientation against the previous frame.

        This detects significant change rather than tiny frame-to-frame
        landmark noise.
        """

        if self.previous_head is None:
            self.previous_head = current
            return False

        yaw_change = abs(
            current["yaw"] - self.previous_head["yaw"]
        )

        pitch_change = abs(
            current["pitch"] - self.previous_head["pitch"]
        )

        roll_change = abs(
            current["roll"] - self.previous_head["roll"]
        )

        self.previous_head = current

        return (
            yaw_change >= 8.0
            or pitch_change >= 8.0
            or roll_change >= 10.0
        )

    # ------------------------------------------------------------------
    # LANDMARK HELPERS
    # ------------------------------------------------------------------

    @staticmethod
    def _landmark_points(landmarks):

        points = {}

        for index, landmark in enumerate(landmarks):
            points[index] = {
                "x": float(landmark.x),
                "y": float(landmark.y),
                "z": float(landmark.z),
            }

        return points

    @staticmethod
    def _get_point(points, index):

        return points.get(index)

    # ------------------------------------------------------------------
    # EMPTY / ERROR RESULT
    # ------------------------------------------------------------------

    @staticmethod
    def _empty_result(reason: str):

        return {
            "face_detected": False,
            "face_missing": True,
            "multiple_person": False,
            "face_count": 0,

            "head": {
                "direction": "unknown",
                "yaw": 0.0,
                "pitch": 0.0,
                "roll": 0.0,
                "movement": False,
            },

            "events": [
                "FACE_MISSING"
            ],

            "error": reason,
        }

    # ------------------------------------------------------------------
    # CLEANUP
    # ------------------------------------------------------------------

    def close(self):
        """
        Release MediaPipe resources.
        """

        if self.detector is not None:
            self.detector.close()
            self.detector = None