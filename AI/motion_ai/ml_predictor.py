import os
import joblib
import pandas as pd


class MLPredictor:
    """
    Loads the trained InterviewShield cheating detection model
    and performs prediction using the exact 16 features expected
    by the trained model.
    """

    FEATURE_COLUMNS = [
        "FACE_MISSING_episodes",
        "FACE_MISSING_total_duration",
        "FACE_MISSING_max_duration",
        "FACE_MISSING_max_severity",

        "MULTIPLE_PERSON_episodes",
        "MULTIPLE_PERSON_total_duration",
        "MULTIPLE_PERSON_max_duration",
        "MULTIPLE_PERSON_max_severity",

        "PHONE_VISIBLE_episodes",
        "PHONE_VISIBLE_total_duration",
        "PHONE_VISIBLE_max_duration",
        "PHONE_VISIBLE_max_severity",

        "LOOKING_AWAY_episodes",
        "LOOKING_AWAY_total_duration",
        "LOOKING_AWAY_max_duration",
        "LOOKING_AWAY_max_severity",
    ]

    def __init__(self, model_path=None):

        if model_path is None:
            model_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "models",
                "cheating_model_v2.pkl"
            )

        self.model_path = model_path

        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"Model not found: {self.model_path}"
            )

        self.model = joblib.load(self.model_path)

        self._validate_model()

    def _validate_model(self):
        """
        Make sure the loaded model matches the feature schema
        used during training.
        """

        if not hasattr(self.model, "n_features_in_"):
            raise ValueError(
                "Loaded model does not expose n_features_in_."
            )

        if self.model.n_features_in_ != len(self.FEATURE_COLUMNS):
            raise ValueError(
                f"Feature count mismatch. "
                f"Model expects {self.model.n_features_in_}, "
                f"but predictor provides {len(self.FEATURE_COLUMNS)}."
            )

        if hasattr(self.model, "feature_names_in_"):

            model_features = list(self.model.feature_names_in_)
            predictor_features = list(self.FEATURE_COLUMNS)

            if model_features != predictor_features:
                raise ValueError(
                    "Feature order/name mismatch.\n\n"
                    f"Model:\n{model_features}\n\n"
                    f"Predictor:\n{predictor_features}"
                )

    def prepare_features(self, session_features):
        """
        Convert session features into the exact DataFrame
        expected by the trained model.

        Missing features are automatically filled with 0.
        """

        data = {}

        for feature in self.FEATURE_COLUMNS:
            value = session_features.get(feature, 0)

            # Protect against None
            if value is None:
                value = 0

            data[feature] = value

        return pd.DataFrame(
            [data],
            columns=self.FEATURE_COLUMNS
        )

    def predict(self, session_features):
        """
        Return model prediction and probability.
        """

        X = self.prepare_features(session_features)

        prediction = self.model.predict(X)[0]

        result = {
            "prediction": int(prediction),
            "cheating": bool(prediction),
            "probability": None,
            "class_probabilities": None,
        }

        # LogisticRegression inside Pipeline supports predict_proba
        if hasattr(self.model, "predict_proba"):

            probabilities = self.model.predict_proba(X)[0]

            result["class_probabilities"] = [
                float(probability)
                for probability in probabilities
            ]

            # Usually class 1 = cheating
            if hasattr(self.model, "classes_"):

                classes = list(self.model.classes_)

                if 1 in classes:
                    cheating_index = classes.index(1)
                    result["probability"] = float(
                        probabilities[cheating_index]
                    )
                else:
                    # Fallback: probability of predicted class
                    predicted_index = classes.index(prediction)
                    result["probability"] = float(
                        probabilities[predicted_index]
                    )

            else:
                result["probability"] = float(
                    probabilities[-1]
                )

        return result

    def predict_from_tracker(self, state_tracker):
        """
        Convenience method:
        directly obtain session features from StateTracker
        and run prediction.
        """

        session_features = state_tracker.get_session_features()

        return self.predict(session_features)

    def get_feature_names(self):
        """
        Return the exact feature order expected by the model.
        """

        return list(self.FEATURE_COLUMNS)

    def get_model_info(self):
        """
        Return useful model information.
        """

        return {
            "model_path": self.model_path,
            "model_type": type(self.model).__name__,
            "expected_features": len(self.FEATURE_COLUMNS),
            "feature_columns": self.get_feature_names(),
        }


if __name__ == "__main__":

    print("=" * 70)
    print("InterviewShield - ML Predictor Test")
    print("=" * 70)

    try:
        predictor = MLPredictor()

        print("\nModel loaded successfully.")
        print("Model type:", type(predictor.model).__name__)
        print("Expected features:", len(predictor.FEATURE_COLUMNS))

        print("\nFeature order:")
        for i, feature in enumerate(
            predictor.FEATURE_COLUMNS,
            start=1
        ):
            print(f"{i:02d}. {feature}")

        # Test with an empty session
        test_features = {
            feature: 0
            for feature in predictor.FEATURE_COLUMNS
        }

        result = predictor.predict(test_features)

        print("\nTest prediction:")
        print(result)

        print("\n" + "=" * 70)
        print("ML PREDICTOR TEST PASSED")
        print("=" * 70)

    except Exception as e:

        print("\n" + "=" * 70)
        print("ML PREDICTOR TEST FAILED")
        print("=" * 70)

        print("\nError:")
        print(type(e).__name__)
        print(str(e))