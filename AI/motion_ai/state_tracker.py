from dataclasses import dataclass
from typing import Dict, List, Optional
import time


# ============================================================
# EPISODE
# ============================================================

@dataclass
class Episode:
    event_type: str
    start_time: float
    end_time: float
    frame_count: int
    max_severity: float
    active: bool = True

    @property
    def duration(self) -> float:
        return max(
            0.0,
            self.end_time - self.start_time
        )

    def update(
        self,
        timestamp: float,
        severity: float
    ):
        self.end_time = max(
            self.end_time,
            timestamp
        )

        self.frame_count += 1

        self.max_severity = max(
            self.max_severity,
            severity
        )

    def finish(self, timestamp: float):
        self.end_time = max(
            self.end_time,
            timestamp
        )

        self.active = False


# ============================================================
# STATE TRACKER
# ============================================================

class StateTracker:
    """
    Tracks cheating-related events over time.

    IMPORTANT:
    The tracker uses the video/frame timeline instead of
    wall-clock execution time.

    If timestamps are supplied:
        those timestamps are used.

    If timestamps are NOT supplied:
        a deterministic timeline based on default_fps
        is generated automatically.
    """

    # Events expected by the trained ML model
    SUPPORTED_EVENTS = [
        "FACE_MISSING",
        "MULTIPLE_PERSON",
        "PHONE_VISIBLE",
        "LOOKING_AWAY",
    ]

    # Severity values used by the tracker
    SEVERITY = {
        "FACE_MISSING": 1.0,
        "MULTIPLE_PERSON": 1.0,
        "PHONE_VISIBLE": 1.0,
        "LOOKING_AWAY": 0.6,
    }

    def __init__(
        self,
        min_episode_duration: float = 0.30,
        cooldown: float = 0.50,
        default_fps: float = 30.0,
    ):
        if default_fps <= 0:
            raise ValueError(
                "default_fps must be greater than 0"
            )

        if min_episode_duration < 0:
            raise ValueError(
                "min_episode_duration cannot be negative"
            )

        if cooldown < 0:
            raise ValueError(
                "cooldown cannot be negative"
            )

        self.min_episode_duration = float(
            min_episode_duration
        )

        self.cooldown = float(cooldown)

        self.default_fps = float(default_fps)

        self.frame_interval = 1.0 / self.default_fps

        self.active_episodes: Dict[
            str, Episode
        ] = {}

        self.completed_episodes: List[
            Episode
        ] = []

        self.last_timestamp: Optional[float] = None

        self.frame_count = 0

        self.last_seen: Dict[
            str, float
        ] = {}

    # ========================================================
    # TIMESTAMP HANDLING
    # ========================================================

    def _get_timestamp(
        self,
        timestamp: Optional[float]
    ) -> float:
        """
        Get a safe monotonic frame timestamp.

        Supplied timestamps are preferred.

        If timestamp is None:
            generate a deterministic timestamp using FPS.

        This prevents real processing time from becoming
        fake event duration.
        """

        if timestamp is None:

            if self.last_timestamp is None:
                current_timestamp = 0.0

            else:
                current_timestamp = (
                    self.last_timestamp
                    + self.frame_interval
                )

        else:
            try:
                current_timestamp = float(
                    timestamp
                )

            except (TypeError, ValueError):
                raise ValueError(
                    "timestamp must be a number or None"
                )

            # Prevent timestamps from moving backwards
            if self.last_timestamp is not None:
                current_timestamp = max(
                    current_timestamp,
                    self.last_timestamp
                )

        self.last_timestamp = current_timestamp

        return current_timestamp

    # ========================================================
    # EVENT VALIDATION
    # ========================================================

    def _normalize_events(
        self,
        events: Optional[List[str]]
    ) -> List[str]:

        if events is None:
            return []

        normalized = []

        for event in events:

            if not isinstance(event, str):
                continue

            event = event.strip().upper()

            if event in self.SUPPORTED_EVENTS:

                if event not in normalized:
                    normalized.append(event)

        return normalized

    # ========================================================
    # START EPISODE
    # ========================================================

    def _start_episode(
        self,
        event_type: str,
        timestamp: float
    ):

        severity = self.SEVERITY.get(
            event_type,
            0.0
        )

        episode = Episode(
            event_type=event_type,
            start_time=timestamp,
            end_time=timestamp,
            frame_count=1,
            max_severity=severity,
            active=True,
        )

        self.active_episodes[
            event_type
        ] = episode

        self.last_seen[
            event_type
        ] = timestamp

    # ========================================================
    # CONTINUE EPISODE
    # ========================================================

    def _continue_episode(
        self,
        event_type: str,
        timestamp: float
    ):

        episode = self.active_episodes.get(
            event_type
        )

        severity = self.SEVERITY.get(
            event_type,
            0.0
        )

        if episode is None:

            self._start_episode(
                event_type,
                timestamp
            )

            return

        episode.update(
            timestamp=timestamp,
            severity=severity
        )

        self.last_seen[
            event_type
        ] = timestamp

    # ========================================================
    # FINISH EXPIRED EPISODES
    # ========================================================

    def _finish_expired_episodes(
        self,
        current_timestamp: float,
        current_events: List[str]
    ):
        """
        Finish an event when it has disappeared for longer
        than the configured cooldown.
        """

        to_finish = []

        for event_type, episode in (
            self.active_episodes.items()
        ):

            if event_type in current_events:
                continue

            last_seen = self.last_seen.get(
                event_type,
                episode.end_time
            )

            elapsed = (
                current_timestamp - last_seen
            )

            if elapsed >= self.cooldown:

                finish_time = last_seen

                episode.finish(
                    finish_time
                )

                to_finish.append(
                    event_type
                )

        for event_type in to_finish:

            episode = self.active_episodes.pop(
                event_type
            )

            self.completed_episodes.append(
                episode
            )

    # ========================================================
    # UPDATE
    # ========================================================

    def update(
        self,
        events: Optional[List[str]],
        timestamp: Optional[float] = None
    ):
        """
        Update tracker with events detected in one frame.

        Parameters
        ----------
        events:
            List of normalized event names.

        timestamp:
            Timestamp of current frame in seconds.

            Example at 30 FPS:
                0.00
                0.033
                0.067
                0.100
                ...

            If omitted, the tracker generates the timeline.
        """

        current_timestamp = self._get_timestamp(
            timestamp
        )

        current_events = self._normalize_events(
            events
        )

        self.frame_count += 1

        # ----------------------------------------------------
        # Start / continue current events
        # ----------------------------------------------------

        for event_type in current_events:

            if event_type in self.active_episodes:

                self._continue_episode(
                    event_type,
                    current_timestamp
                )

            else:

                self._start_episode(
                    event_type,
                    current_timestamp
                )

        # ----------------------------------------------------
        # Finish events that have disappeared
        # ----------------------------------------------------

        self._finish_expired_episodes(
            current_timestamp=current_timestamp,
            current_events=current_events
        )

        return self.get_current_state()

    # ========================================================
    # FLUSH
    # ========================================================

    def flush(
        self,
        timestamp: Optional[float] = None
    ):
        """
        Finish all active episodes.

        IMPORTANT:
        If no timestamp is supplied, the LAST FRAME timestamp
        is used.

        Therefore flush() cannot accidentally turn processing
        delay into event duration.
        """

        if not self.active_episodes:
            return

        if timestamp is None:

            if self.last_timestamp is None:
                flush_timestamp = 0.0

            else:
                flush_timestamp = self.last_timestamp

        else:

            try:
                flush_timestamp = float(
                    timestamp
                )

            except (TypeError, ValueError):
                raise ValueError(
                    "timestamp must be a number or None"
                )

            if self.last_timestamp is not None:
                flush_timestamp = max(
                    flush_timestamp,
                    self.last_timestamp
                )

        self.last_timestamp = flush_timestamp

        to_finish = list(
            self.active_episodes.keys()
        )

        for event_type in to_finish:

            episode = self.active_episodes.pop(
                event_type
            )

            last_seen = self.last_seen.get(
                event_type,
                episode.end_time
            )

            # Do NOT extend episode duration to flush time.
            #
            # The last frame on which the event was actually
            # observed is the correct endpoint.

            episode.finish(
                last_seen
            )

            self.completed_episodes.append(
                episode
            )

    # ========================================================
    # SESSION FEATURES
    # ========================================================

    def get_session_features(self) -> Dict[str, float]:
        """
        Return exactly the 16 features expected by the
        trained cheating model.

        4 event types × 4 features = 16 features.
        """

        features = {}

        # ----------------------------------------------------
        # Initialize all 16 features with zero
        # ----------------------------------------------------

        for event_type in self.SUPPORTED_EVENTS:

            features[
                f"{event_type}_episodes"
            ] = 0

            features[
                f"{event_type}_total_duration"
            ] = 0.0

            features[
                f"{event_type}_max_duration"
            ] = 0.0

            features[
                f"{event_type}_max_severity"
            ] = 0.0

        # ----------------------------------------------------
        # Include completed episodes
        # ----------------------------------------------------

        for episode in self.completed_episodes:

            event_type = episode.event_type

            if event_type not in self.SUPPORTED_EVENTS:
                continue

            duration = max(
                0.0,
                episode.duration
            )

            features[
                f"{event_type}_episodes"
            ] += 1

            features[
                f"{event_type}_total_duration"
            ] += duration

            features[
                f"{event_type}_max_duration"
            ] = max(
                features[
                    f"{event_type}_max_duration"
                ],
                duration
            )

            features[
                f"{event_type}_max_severity"
            ] = max(
                features[
                    f"{event_type}_max_severity"
                ],
                episode.max_severity
            )

        # ----------------------------------------------------
        # Include active episodes too
        # ----------------------------------------------------

        for episode in self.active_episodes.values():

            event_type = episode.event_type

            if event_type not in self.SUPPORTED_EVENTS:
                continue

            duration = max(
                0.0,
                episode.duration
            )

            features[
                f"{event_type}_episodes"
            ] += 1

            features[
                f"{event_type}_total_duration"
            ] += duration

            features[
                f"{event_type}_max_duration"
            ] = max(
                features[
                    f"{event_type}_max_duration"
                ],
                duration
            )

            features[
                f"{event_type}_max_severity"
            ] = max(
                features[
                    f"{event_type}_max_severity"
                ],
                episode.max_severity
            )

        return features

    # ========================================================
    # CURRENT STATE
    # ========================================================

    def get_current_state(self):

        active = {}

        for event_type, episode in (
            self.active_episodes.items()
        ):

            active[event_type] = {
                "start_time": episode.start_time,
                "end_time": episode.end_time,
                "duration": episode.duration,
                "frame_count": episode.frame_count,
                "max_severity": episode.max_severity,
                "active": episode.active,
            }

        return {
            "frame_count": self.frame_count,
            "last_timestamp": self.last_timestamp,
            "active_events": list(
                self.active_episodes.keys()
            ),
            "active_episodes": active,
            "completed_episodes": len(
                self.completed_episodes
            ),
        }

    # ========================================================
    # SUMMARY
    # ========================================================

    def get_summary(self):

        features = self.get_session_features()

        return {
            "frame_count": self.frame_count,
            "duration": (
                self.last_timestamp
                if self.last_timestamp is not None
                else 0.0
            ),
            "active_events": list(
                self.active_episodes.keys()
            ),
            "completed_episodes": len(
                self.completed_episodes
            ),
            "features": features,
        }

    # ========================================================
    # RESET
    # ========================================================

    def reset(self):

        self.active_episodes.clear()

        self.completed_episodes.clear()

        self.last_timestamp = None

        self.frame_count = 0

        self.last_seen.clear()


# ============================================================
# SELF TEST
# ============================================================

if __name__ == "__main__":

    print("=" * 70)
    print("STATE TRACKER TEST")
    print("=" * 70)

    tracker = StateTracker(
        default_fps=30.0
    )

    # --------------------------------------------------------
    # TEST 1
    # One frame must NOT create fake seconds
    # --------------------------------------------------------

    print("\nTEST 1: Single frame")

    tracker.update(
        ["FACE_MISSING"],
        timestamp=0.0
    )

    tracker.flush()

    features = tracker.get_session_features()

    print(
        "FACE_MISSING episodes:",
        features[
            "FACE_MISSING_episodes"
        ]
    )

    print(
        "FACE_MISSING duration:",
        features[
            "FACE_MISSING_total_duration"
        ]
    )

    assert (
        features[
            "FACE_MISSING_total_duration"
        ] == 0.0
    )

    print("PASS")

    # --------------------------------------------------------
    # TEST 2
    # Reset and simulate ~1 second
    # --------------------------------------------------------

    print("\nTEST 2: 1 second continuous event")

    tracker.reset()

    timestamps = [
        i / 30.0
        for i in range(31)
    ]

    for timestamp in timestamps:

        tracker.update(
            ["FACE_MISSING"],
            timestamp=timestamp
        )

    tracker.flush()

    features = tracker.get_session_features()

    duration = features[
        "FACE_MISSING_total_duration"
    ]

    print(
        "Duration:",
        duration
    )

    assert 0.99 <= duration <= 1.01

    print("PASS")

    # --------------------------------------------------------
    # TEST 3
    # Automatic timestamps
    # --------------------------------------------------------

    print("\nTEST 3: Automatic FPS timeline")

    tracker.reset()

    for _ in range(31):

        tracker.update(
            ["FACE_MISSING"]
        )

    tracker.flush()

    features = tracker.get_session_features()

    duration = features[
        "FACE_MISSING_total_duration"
    ]

    print(
        "Duration:",
        duration
    )

    assert 0.99 <= duration <= 1.01

    print("PASS")

    # --------------------------------------------------------
    # TEST 4
    # No wall-clock inflation
    # --------------------------------------------------------

    print("\nTEST 4: Flush timing protection")

    tracker.reset()

    tracker.update(
        ["FACE_MISSING"],
        timestamp=0.0
    )

    # Deliberately wait using wall-clock time.
    time.sleep(0.5)

    tracker.flush()

    features = tracker.get_session_features()

    duration = features[
        "FACE_MISSING_total_duration"
    ]

    print(
        "Duration after 0.5 sec processing delay:",
        duration
    )

    assert duration == 0.0

    print("PASS")

    # --------------------------------------------------------
    # TEST 5
    # Feature schema
    # --------------------------------------------------------

    print("\nTEST 5: Feature schema")

    expected_features = [
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

    actual_features = list(
        tracker.get_session_features().keys()
    )

    assert actual_features == expected_features

    print(
        "Feature count:",
        len(actual_features)
    )

    print("PASS")

    # --------------------------------------------------------
    # FINAL
    # --------------------------------------------------------

    print("\n" + "=" * 70)
    print("STATE TRACKER TEST PASSED")
    print("=" * 70)