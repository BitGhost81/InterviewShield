import os
from pathlib import Path

from ultralytics import YOLO


class PhoneDetector:
    """
    Phone detector for InterviewShield.

    Uses YOLO and does NOT access the webcam.

    Input:
        RGB/BGR numpy frame

    Output:
        Detection result dictionary
    """

    PHONE_CLASS_NAMES = {
        "cell phone",
        "cellphone",
        "mobile phone",
        "phone",
        "smartphone",
        "remote",
    }

    def __init__(
        self,
        model_path=None,
        confidence=0.30,
        iou=0.45,
        image_size=640,
    ):

        if model_path is None:
            model_path = (
                Path(__file__).resolve().parent.parent
                / "models"
                / "yolo11n.pt"
            )

        self.model_path = str(model_path)
        self.confidence = confidence
        self.iou = iou
        self.image_size = image_size

        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"YOLO model not found: {self.model_path}"
            )

        print(f"Loading YOLO model: {self.model_path}")

        self.model = YOLO(self.model_path)

        self.class_names = self.model.names

        print("YOLO model loaded successfully.")

    def _get_class_name(self, class_id):
        """
        Safely obtain the class name from YOLO.
        """

        try:
            class_id = int(class_id)

            if isinstance(self.class_names, dict):
                return str(
                    self.class_names.get(
                        class_id,
                        ""
                    )
                ).lower().strip()

            if 0 <= class_id < len(self.class_names):
                return str(
                    self.class_names[class_id]
                ).lower().strip()

        except Exception:
            pass

        return ""

    def _is_phone_class(self, class_name):
        """
        Check whether a detected class represents a phone.
        """

        if not class_name:
            return False

        class_name = class_name.lower().strip()

        if class_name in self.PHONE_CLASS_NAMES:
            return True

        # Flexible matching for different model label formats
        if "phone" in class_name:
            return True

        if "cell" in class_name and "phone" in class_name:
            return True

        if "mobile" in class_name and "phone" in class_name:
            return True

        return False

    def detect(self, frame):
        """
        Detect phones in one frame.

        Returns:

        {
            "phone_visible": bool,
            "phone_count": int,
            "detections": [
                {
                    "class": "cell phone",
                    "confidence": 0.81,
                    "bbox": [x1, y1, x2, y2]
                }
            ],
            "error": None
        }
        """

        result = {
            "phone_visible": False,
            "phone_count": 0,
            "detections": [],
            "error": None,
        }

        if frame is None:
            result["error"] = "Frame is None"
            return result

        try:

            predictions = self.model.predict(
                source=frame,
                conf=self.confidence,
                iou=self.iou,
                imgsz=self.image_size,
                verbose=False,
            )

            for prediction in predictions:

                if prediction.boxes is None:
                    continue

                boxes = prediction.boxes

                for i in range(len(boxes)):

                    class_id = int(
                        boxes.cls[i].item()
                    )

                    confidence = float(
                        boxes.conf[i].item()
                    )

                    class_name = self._get_class_name(
                        class_id
                    )

                    if not self._is_phone_class(
                        class_name
                    ):
                        continue

                    coordinates = boxes.xyxy[i].tolist()

                    detection = {
                        "class": class_name,
                        "confidence": round(
                            confidence,
                            4
                        ),
                        "bbox": [
                            round(float(value), 2)
                            for value in coordinates
                        ],
                    }

                    result["detections"].append(
                        detection
                    )

            result["phone_count"] = len(
                result["detections"]
            )

            result["phone_visible"] = (
                result["phone_count"] > 0
            )

        except Exception as e:

            result["error"] = (
                f"{type(e).__name__}: {str(e)}"
            )

        return result

    def detect_event(self, frame):
        """
        Run detection and convert it into the
        event format expected by InterviewShield.
        """

        result = self.detect(frame)

        events = []

        if result["phone_visible"]:
            events.append("PHONE_VISIBLE")

        result["events"] = events

        return result

    def get_model_classes(self):
        """
        Return the classes known by YOLO.
        """

        return self.class_names


def create_test_image(width=640, height=480):
    """
    Create a blank test image.

    This is only used to verify that YOLO can
    process a frame correctly.

    It will NOT contain a phone, so detection
    should normally be false.
    """

    try:
        import numpy as np

        return np.zeros(
            (height, width, 3),
            dtype=np.uint8
        )

    except ImportError:
        raise RuntimeError(
            "NumPy is required for the test."
        )


if __name__ == "__main__":

    print("=" * 70)
    print("InterviewShield - Phone Detector Test")
    print("=" * 70)

    try:

        detector = PhoneDetector()

        print("\nYOLO classes:")

        if isinstance(detector.class_names, dict):
            for class_id, name in detector.class_names.items():
                print(f"{class_id}: {name}")
        else:
            for class_id, name in enumerate(
                detector.class_names
            ):
                print(f"{class_id}: {name}")

        print("\n" + "-" * 70)

        # Blank-frame smoke test
        frame = create_test_image()

        result = detector.detect_event(frame)

        print("\nBlank frame test:")
        print(result)

        print("\n" + "=" * 70)

        if result["error"] is None:
            print("PHONE DETECTOR TEST PASSED")
        else:
            print("PHONE DETECTOR TEST FAILED")
            print("Error:", result["error"])

        print("=" * 70)

    except Exception as e:

        print("\n" + "=" * 70)
        print("PHONE DETECTOR TEST FAILED")
        print("=" * 70)

        print("\nError:")
        print(type(e).__name__)
        print(str(e))