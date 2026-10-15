package com.interviewshield.backend;

import com.fasterxml.jackson.databind.*;
import com.interviewshield.backend.model.InterviewSession;
import com.interviewshield.backend.repository.SessionRepository;
import com.interviewshield.backend.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.RejectedExecutionException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class Phase1CAudioTests {
    @TempDir Path directory;
    SessionRepository sessions;
    SessionAuthorizationService authorization;
    InterviewSession session;
    TestAudio audio;
    byte[] recorded = new byte[] {1, 2, 3};

    class TestAudio extends AudioProcessingService {
        List<Runnable> tasks = new ArrayList<>();
        boolean fail = true;
        boolean busy;
        int calls;
        TestAudio(PlatformTransactionManager manager) { super(sessions, mock(com.interviewshield.backend.repository.UserRepository.class), authorization, manager, new ObjectMapper(), directory.toString(), "http://unused.local:8000"); }
        @Override protected void enqueue(Runnable task) { if (busy) throw new RejectedExecutionException(); tasks.add(task); }
        @Override protected JsonNode requestAi(InterviewSession ignored, byte[] bytes) throws Exception {
            calls++; assertArrayEquals(recorded, bytes);
            if (fail) throw new java.io.IOException("simulated 503 containing private upstream details");
            return new ObjectMapper().readTree("{\"transcript\":\"Interview transcript\",\"report\":{\"summary\":\"Assessment\"}}");
        }
    }
    @BeforeEach void setup() {
        sessions = mock(SessionRepository.class); authorization = mock(SessionAuthorizationService.class);
        PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(invocation -> new SimpleTransactionStatus());
        session = new InterviewSession(); session.setSessionCode("ABC123"); session.setStatus("ENDED"); session.setTitle("Interview");
        when(sessions.findBySessionCodeForUpdate("ABC123")).thenReturn(Optional.of(session));
        when(sessions.findBySessionCode("ABC123")).thenReturn(Optional.of(session));
        when(sessions.findAll()).thenReturn(List.of(session));
        when(authorization.requireOwner("ABC123", "owner")).thenReturn(session);
        when(authorization.requireOwner("ABC123", "other"))
            .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden"));
        audio = new TestAudio(manager);
    }
    @AfterEach void close() { audio.close(); }
    void upload() { audio.upload("ABC123", "owner", new MockMultipartFile("audio", "recording.webm", "audio/webm;codecs=opus", recorded)); }

    @Test void failedAudioSurvivesAndOwnerRetriesWithoutReuploadThenSuccessDeletesIt() {
        upload(); String filename = session.getRecordingFile();
        assertTrue(Files.exists(directory.resolve(filename)));
        audio.tasks.remove(0).run();
        assertEquals("FAILED", session.getAiStatus());
        assertEquals(true, audio.availability("ABC123", "owner").get("retryAvailable"));
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> audio.retry("ABC123", "other")).getStatusCode().value());
        audio.fail = false; audio.retry("ABC123", "owner"); audio.tasks.remove(0).run();
        assertEquals("COMPLETED", session.getAiStatus()); assertEquals("Interview transcript", session.getAiTranscript());
        assertFalse(Files.exists(directory.resolve(filename))); assertNull(session.getRecordingFile()); assertEquals(2, audio.calls);
    }

    @Test void duplicateProcessingAndUploadsAreRejectedWhileWorkIsInFlight() {
        upload();
        assertEquals(409, assertThrows(ResponseStatusException.class, () -> audio.retry("ABC123", "owner")).getStatusCode().value());
        assertEquals(409, assertThrows(ResponseStatusException.class, this::upload).getStatusCode().value());
        assertEquals(1, audio.tasks.size());
    }

    @Test void processingCapacityFailureKeepsAudioForExplicitRetry() {
        audio.busy = true;
        assertEquals(503, assertThrows(ResponseStatusException.class, this::upload).getStatusCode().value());
        assertEquals("FAILED", session.getAiStatus());
        assertEquals(true, audio.availability("ABC123", "owner").get("retryAvailable"));
    }

    @Test void restartLeaseRecoveryIgnoresOldAttempts() {
        upload(); Runnable old = audio.tasks.remove(0);
        session.setProcessingStartedAt(LocalDateTime.now().minusMinutes(16));
        audio.cleanup(); assertEquals("FAILED", session.getAiStatus());
        audio.retry("ABC123", "owner");
        old.run(); assertEquals(0, audio.calls); // Stale task must not call AI or overwrite a retry.
        audio.tasks.remove(0).run(); assertEquals(1, audio.calls);
    }

    @Test void retainedFilesExpireAndMissingFilesArePermanentlyUnavailable() {
        upload(); audio.tasks.remove(0).run(); String filename = session.getRecordingFile();
        session.setRecordingExpiresAt(LocalDateTime.now().minusSeconds(1)); audio.cleanup();
        assertFalse(Files.exists(directory.resolve(filename)));
        assertEquals("UNAVAILABLE", audio.availability("ABC123", "owner").get("processingState"));
        assertThrows(ResponseStatusException.class, () -> audio.retry("ABC123", "owner"));
    }

    @Test void ownerAndSizeValidationHappenBeforeStorageOrProcessing() {
        assertThrows(ResponseStatusException.class, () -> audio.upload("ABC123", "other", new MockMultipartFile("audio", recorded)));
        MockMultipartFile oversized = new MockMultipartFile("audio", recorded) { @Override public long getSize() { return AudioProcessingService.MAX_AUDIO_BYTES + 1; } };
        assertEquals(413, assertThrows(ResponseStatusException.class, () -> audio.upload("ABC123", "owner", oversized)).getStatusCode().value());
        assertEquals(0, audio.tasks.size()); assertNull(session.getRecordingFile());
    }
}
