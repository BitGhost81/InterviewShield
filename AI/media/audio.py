from __future__ import annotations
from pathlib import Path
from ai_core.schemas import TranscriptSegment

class WhisperTranscriber:
    """Optional local ASR adapter. Install faster-whisper separately when needed."""
    def __init__(self, model_size='small'):
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError('Install faster-whisper to enable local ASR.') from exc
        self.model = WhisperModel(model_size, device='auto', compute_type='int8')

    def transcribe(self, audio_path: str, speaker='unknown') -> list[TranscriptSegment]:
        segments, _ = self.model.transcribe(audio_path, vad_filter=True)
        return [TranscriptSegment(start_ms=int(s.start*1000), end_ms=int(s.end*1000), speaker=speaker if speaker in ('candidate','interviewer') else 'unknown', text=s.text.strip()) for s in segments if s.text.strip()]
