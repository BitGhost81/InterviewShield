import os
import time
import numpy as np

from .motion_detector import MotionDetector
from .phone_detector import PhoneDetector
from .phone_tracker import PhoneTracker
from .event_normalizer import EventNormalizer
from .state_tracker import StateTracker
from .ml_predictor import MLPredictor


# ================================================================
# PROJECT PATH
# ================================================================

# ai_service.py is inside:
# C:\InterviewShield_Motion\ai\
#
# Project root is:
# C:\InterviewShield_Motion\

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)

MODELS_DIR = os.path.join(
    PROJECT_ROOT,
    "models"
)


def model_path(filename):
    """
    Build an absolute path to a model inside:
    C:\\InterviewShield_Motion\\models\\
    """

    return os.path.join(
        MODELS_DIR,
        filename
    )


class AIService:
    """
    Main InterviewShield AI pipeline.

    Camera is NOT opened here.

    Input:
        RGB NumPy frame

    Pipeline:
        RGB Frame
            |
            +--> MotionDetector
            |
            +--> RGB -> BGR -> PhoneDetector
                          |
                      PhoneTracker
            |
        EventNormalizer
            |
        StateTracker
            |
        16 Session Features
            |
        ML Predictor
    """

    def __init__(
        self,
        motion_model_path=None,
        phone_model_path=None,
        ml_model_path=None,
        default_fps=30.0,
    ):

        self.default_fps = float(default_fps)

        # --------------------------------------------------------
        # Resolve model paths
        # --------------------------------------------------------

        if motion_model_path is None:
            motion_model_path = model_path(
                "face_landmarker.task"
            )

        if phone_model_path is None:
            phone_model_path = model_path(
                "yolo11n.pt"
            )

        if ml_model_path is None:
            ml_model_path = model_path(
                "cheating_model_v2.pkl"
            )

        # --------------------------------------------------------
        # Verify model files
        # --------------------------------------------------------

        missing_models = []

        if not os.path.isfile(motion_model_path):
            missing_models.append(
                motion_model_path
            )

        if not os.path.isfile(phone_model_path):
            missing_models.append(
                phone_model_path
            )

        if not os.path.isfile(ml_model_path):
            missing_models.append(
                ml_model_path
            )

        if missing_models:
            raise FileNotFoundError(
                "Required model file(s) not found:\n"
                + "\n".join(missing_models)
            )

        # --------------------------------------------------------
        # Initialize detectors
        # --------------------------------------------------------

        self.motion_detector = MotionDetector(
            model_path=motion_model_path
        )

        self.phone_detector = PhoneDetector(
            model_path=phone_model_path
        )

        self.phone_tracker = PhoneTracker()

        self.event_normalizer = EventNormalizer()

        self.state_tracker = StateTracker(
            default_fps=self.default_fps
        )

        self.ml_predictor = MLPredictor(
            model_path=ml_model_path
        )

        # --------------------------------------------------------
        # Runtime state
        # --------------------------------------------------------

        self.frame_count = 0
        self.last_timestamp = None
        self.last_result = None

        self.errors = {
            "motion": None,
            "phone": None,
            "prediction": None,
        }

    # ============================================================
    # PROCESS FRAME
    # ============================================================

    def process_frame(
        self,
        frame,
        timestamp=None
    ):
        """
        Process one RGB frame.

        IMPORTANT:
        API receives RGB frames.

        MotionDetector:
            RGB

        PhoneDetector / YOLO:
            BGR
        """

        self.frame_count += 1

        # --------------------------------------------------------
        # Timestamp
        # --------------------------------------------------------

        if timestamp is None:
            timestamp = time.time()
        else:
            timestamp = float(timestamp)

        self.last_timestamp = timestamp

        # Reset frame errors
        self.errors = {
            "motion": None,
            "phone": None,
            "prediction": None,
        }

        # ========================================================
        # 1. MOTION DETECTION
        # ========================================================

        try:

            motion_result = (
                self.motion_detector.process_frame(
                    frame
                )
            )

        except Exception as exc:

            motion_result = {
                "events": [],
                "error": str(exc),
            }

            self.errors["motion"] = str(exc)

        if motion_result is None:
            motion_result = {
                "events": []
            }

        # ========================================================
        # 2. PHONE DETECTION
        # ========================================================

        try:

            # ----------------------------------------------------
            # API frame = RGB
            #
            # YOLO/OpenCV path = BGR
            #
            # Convert:
            #
            # RGB -> BGR
            #
            # np.ascontiguousarray() is important because
            # frame[:, :, ::-1] creates a negative-stride view.
            # ----------------------------------------------------

            phone_frame = np.ascontiguousarray(
                frame[:, :, ::-1]
            )

            phone_result = (
                self.phone_detector.detect(
                    phone_frame
                )
            )

        except Exception as exc:

            phone_result = {
                "phone_visible": False,
                "phone_count": 0,
                "detections": [],
                "error": str(exc),
            }

            self.errors["phone"] = str(exc)

        if phone_result is None:
            phone_result = {
                "phone_visible": False,
                "phone_count": 0,
                "detections": [],
                "error": None,
            }

        if phone_result.get("error"):
            self.errors["phone"] = (
                phone_result.get("error")
            )

        # ========================================================
        # 3. PHONE TRACKER
        # ========================================================

        try:

            self.phone_tracker.update_from_detection(
                phone_result
            )

            phone_state = (
                self.phone_tracker.get_state()
            )

            tracked_phone_visible = bool(
                phone_state.get(
                    "phone_visible",
                    False
                )
            )

        except Exception as exc:

            tracked_phone_visible = bool(
                phone_result.get(
                    "phone_visible",
                    False
                )
            )

            phone_state = {
                "phone_visible":
                    tracked_phone_visible
            }

            if self.errors["phone"] is None:
                self.errors["phone"] = str(exc)

        # ========================================================
        # 4. EVENTS
        # ========================================================

        motion_events = motion_result.get(
            "events",
            []
        )

        if motion_events is None:
            motion_events = []

        raw_events = list(
            motion_events
        )

        # Add phone event only after temporal
        # confirmation from PhoneTracker.

        if tracked_phone_visible:
            raw_events.append(
                "PHONE_VISIBLE"
            )

        # ========================================================
        # 5. EVENT NORMALIZATION
        # ========================================================

        try:

            normalized_events = (
                self.event_normalizer.normalize_events(
                    raw_events
                )
            )

        except Exception as exc:

            normalized_events = raw_events

            if self.errors["motion"] is None:
                self.errors["motion"] = str(exc)

        if normalized_events is None:
            normalized_events = []

        # ========================================================
        # 6. STATE TRACKER
        # ========================================================

        try:

            self.state_tracker.update(
                normalized_events,
                timestamp
            )

        except TypeError:

            # Compatibility fallback
            try:

                self.state_tracker.update(
                    timestamp,
                    normalized_events
                )

            except Exception as exc:

                if self.errors["motion"] is None:
                    self.errors["motion"] = str(exc)

        except Exception as exc:

            if self.errors["motion"] is None:
                self.errors["motion"] = str(exc)

        # ========================================================
        # 7. SESSION FEATURES
        # ========================================================

        try:

            session_features = (
                self.state_tracker
                .get_session_features()
            )

        except Exception as exc:

            session_features = {}

            if self.errors["prediction"] is None:
                self.errors["prediction"] = str(exc)

        # ========================================================
        # 8. ML PREDICTION
        # ========================================================

        prediction = None

        try:

            prediction = (
                self.ml_predictor.predict(
                    session_features
                )
            )

        except Exception as exc:

            self.errors["prediction"] = str(exc)

        # ========================================================
        # 9. MOTION INFORMATION
        # ========================================================

        face_detected = bool(
            motion_result.get(
                "face_detected",
                False
            )
        )

        face_missing = bool(
            motion_result.get(
                "face_missing",
                False
            )
        )

        multiple_person = bool(
            motion_result.get(
                "multiple_person",
                False
            )
        )

        face_count = int(
            motion_result.get(
                "face_count",
                0
            )
        )

        head_result = motion_result.get(
            "head",
            {}
        )

        # ========================================================
        # 10. FINAL FRAME RESULT
        # ========================================================

        result = {

            "frame": self.frame_count,

            "timestamp": timestamp,

            "events": normalized_events,

            "detection": {

                "face_detected":
                    face_detected,

                "face_missing":
                    face_missing,

                "multiple_person":
                    multiple_person,

                "face_count":
                    face_count,

                "head":
                    head_result,

                "phone": {

                    # Temporally confirmed phone
                    "visible":
                        tracked_phone_visible,

                    # Raw YOLO result
                    "raw_visible":
                        bool(
                            phone_result.get(
                                "phone_visible",
                                False
                            )
                        ),

                    # Number of phones
                    "count":
                        int(
                            phone_result.get(
                                "phone_count",
                                0
                            )
                        ),

                    # YOLO detections
                    "detections":
                        phone_result.get(
                            "detections",
                            []
                        ),
                },
            },

            "prediction":
                prediction,

            "session_features":
                session_features,

            "errors": {

                "motion":
                    self.errors.get(
                        "motion"
                    ),

                "phone":
                    self.errors.get(
                        "phone"
                    ),

                "prediction":
                    self.errors.get(
                        "prediction"
                    ),
            },
        }

        self.last_result = result

        return result

    # ============================================================
    # FINAL SESSION RESULT
    # ============================================================

    def get_session_result(self):
        """
        Finalize and return the session result.
        """

        # --------------------------------------------------------
        # Flush active events
        # --------------------------------------------------------

        try:

            if self.last_timestamp is not None:

                try:

                    self.state_tracker.flush(
                        self.last_timestamp
                    )

                except TypeError:

                    self.state_tracker.flush()

        except Exception:
            pass

        # --------------------------------------------------------
        # Get final features
        # --------------------------------------------------------

        try:

            session_features = (
                self.state_tracker
                .get_session_features()
            )

        except Exception:

            session_features = {}

        # --------------------------------------------------------
        # Final ML prediction
        # --------------------------------------------------------

        prediction = None
        prediction_error = None

        try:

            prediction = (
                self.ml_predictor.predict(
                    session_features
                )
            )

        except Exception as exc:

            prediction_error = str(exc)

        # --------------------------------------------------------
        # Final result
        # --------------------------------------------------------

        return {

            "frames_processed":
                self.frame_count,

            "last_timestamp":
                self.last_timestamp,

            "prediction":
                prediction,

            "session_features":
                session_features,

            "errors": {

                "prediction":
                    prediction_error
            },
        }

    # ============================================================
    # CURRENT STATE
    # ============================================================

    def get_current_state(self):

        try:

            return (
                self.state_tracker
                .get_current_state()
            )

        except Exception:

            return {}

    # ============================================================
    # STATUS
    # ============================================================

    def get_status(self):

        phone_state = {}

        try:

            phone_state = (
                self.phone_tracker
                .get_state()
            )

        except Exception:

            phone_state = {}

        return {

            "frames_processed":
                self.frame_count,

            "last_timestamp":
                self.last_timestamp,

            "phone":
                phone_state,

            "last_result":
                self.last_result,

            "errors":
                self.errors,
        }

    # ============================================================
    # RESET
    # ============================================================

    def reset(self):

        self.frame_count = 0
        self.last_timestamp = None
        self.last_result = None

        self.errors = {
            "motion": None,
            "phone": None,
            "prediction": None,
        }

        try:
            self.phone_tracker.reset()
        except Exception:
            pass

        try:
            self.state_tracker.reset()
        except Exception:
            pass


# ================================================================
# SELF TEST
# ================================================================

if __name__ == "__main__":

    print("=" * 70)
    print("InterviewShield AIService Self-Test")
    print("=" * 70)

    print("\nProject root:")
    print(PROJECT_ROOT)

    print("\nModels directory:")
    print(MODELS_DIR)

    print("\nChecking models...")

    required_models = [
        "face_landmarker.task",
        "yolo11n.pt",
        "cheating_model_v2.pkl",
    ]

    for filename in required_models:

        path = model_path(filename)

        print(
            f"  {filename}: "
            f"{'FOUND' if os.path.isfile(path) else 'MISSING'}"
        )

    try:

        service = AIService()

        print("\nAIService initialized successfully.")

        # Blank RGB test frame
        frame = np.zeros(
            (480, 640, 3),
            dtype=np.uint8
        )

        print("\nProcessing test RGB frame...")

        result = service.process_frame(
            frame,
            timestamp=time.time()
        )

        print("\nFrame processed successfully.")

        print("\nPhone result:")

        print(
            result[
                "detection"
            ][
                "phone"
            ]
        )

        print("\nPrediction:")

        print(
            result[
                "prediction"
            ]
        )

        print("\nSession result:")

        final_result = (
            service.get_session_result()
        )

        print(final_result)

        print("\n" + "=" * 70)
        print("SELF-TEST COMPLETED")
        print("=" * 70)

    except Exception as exc:

        print("\n" + "=" * 70)
        print("SELF-TEST FAILED")
        print("=" * 70)

        print("\nError:")
        print(str(exc))
