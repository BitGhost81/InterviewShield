package com.interviewshield.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interviewshield.backend.model.InterviewSession;
import com.interviewshield.backend.repository.SessionRepository;
import com.interviewshield.backend.repository.UserRepository;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Function;

@Service
public class AudioProcessingService {
    public static final long MAX_AUDIO_BYTES = 18L * 1024 * 1024;
    private final SessionRepository sessions;
    private final UserRepository users;
    private final SessionAuthorizationService authorization;
    private final TransactionTemplate transactions;
    private final ObjectMapper mapper;
    private final Path directory;
    private final String aiBaseUrl;
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
        new SynchronousQueue<>(), runnable -> { Thread thread = new Thread(runnable, "interview-audio"); thread.setDaemon(true); return thread; });
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public AudioProcessingService(SessionRepository sessions, UserRepository users, SessionAuthorizationService authorization,
            PlatformTransactionManager transactionManager, ObjectMapper mapper,
            @Value("${audio.storage-dir:./data/recordings}") String storageDirectory,
            @Value("${ai.base-url:http://127.0.0.1:8000}") String aiBaseUrl) {
        this.sessions = sessions; this.users = users; this.authorization = authorization; this.mapper = mapper;
        this.transactions = new TransactionTemplate(transactionManager);
        this.directory = Path.of(storageDirectory).toAbsolutePath().normalize();
        this.aiBaseUrl = aiBaseUrl.replaceAll("/+$", "");
    }

    public Map<String, Object> upload(String code, String email, MultipartFile audio) {
        authorization.requireOwner(code, email); // Ended sessions are intentionally allowed.
        if (audio == null || audio.isEmpty()) throw reject(HttpStatus.BAD_REQUEST, "Empty audio recording");
        if (audio.getSize() > MAX_AUDIO_BYTES) throw reject(HttpStatus.PAYLOAD_TOO_LARGE, "Recording exceeds the 18 MiB audio limit");
        String mime = audio.getContentType() == null ? "audio/webm" : audio.getContentType();
        if (!Set.of("audio/webm", "audio/ogg", "audio/mp4", "audio/wav", "audio/mpeg").contains(mime.split(";")[0])) {
            throw reject(HttpStatus.BAD_REQUEST, "Unsupported audio format");
        }
        String filename = UUID.randomUUID() + ".audio";
        String attempt;
        try {
            attempt = locked(code, session -> {
                ensureIdle(session);
                if ("COMPLETED".equals(session.getAiStatus()) && session.getAiTranscript() != null && !session.getAiTranscript().isBlank()) throw reject(HttpStatus.CONFLICT, "AI report already completed");
                if (available(session)) throw reject(HttpStatus.CONFLICT, "Recording already saved; use Retry AI report");
                try {
                    Files.createDirectories(directory);
                    if (Files.getFileStore(directory).getUsableSpace() < MAX_AUDIO_BYTES * 2) throw reject(HttpStatus.SERVICE_UNAVAILABLE, "Recording storage is full; try later");
                    Path temporary = Files.createTempFile(directory, "upload-", ".tmp");
                    try {
                        audio.transferTo(temporary);
                        if (Files.size(temporary) > MAX_AUDIO_BYTES) throw reject(HttpStatus.PAYLOAD_TOO_LARGE, "Recording exceeds the 18 MiB audio limit");
                        Files.move(temporary, file(filename), StandardCopyOption.ATOMIC_MOVE);
                    } finally { Files.deleteIfExists(temporary); }
                } catch (ResponseStatusException exception) { throw exception; }
                  catch (Exception exception) { throw reject(HttpStatus.SERVICE_UNAVAILABLE, "Recording could not be saved; please retry upload"); }
                session.setRecordingFile(filename); session.setRecordingMime(mime);
                session.setRecordingExpiresAt(LocalDateTime.now().plusDays(7));
                return claim(session);
            });
        } catch (RuntimeException exception) { deleteFile(filename); throw exception; }
        return start(code, filename, attempt);
    }

    public Map<String, Object> retry(String code, String email) {
        authorization.requireOwner(code, email);
        String[] filename = new String[1];
        String attempt = locked(code, session -> {
            ensureIdle(session);
            if (!available(session)) throw reject(HttpStatus.CONFLICT, "No retained recording is available for retry");
            if ("COMPLETED".equals(session.getAiStatus()) && session.getAiTranscript() != null && !session.getAiTranscript().isBlank()) {
                throw reject(HttpStatus.CONFLICT, "AI report already completed");
            }
            filename[0] = session.getRecordingFile();
            return claim(session);
        });
        return start(code, filename[0], attempt);
    }

    public Map<String, Object> availability(String code, String email) {
        InterviewSession session = authorization.requireOwner(code, email);
        boolean available = available(session);
        boolean processing = "PROCESSING".equals(session.getAiStatus()) && session.getProcessingStartedAt() != null
            && session.getProcessingStartedAt().plusMinutes(15).isAfter(LocalDateTime.now());
        boolean completed = "COMPLETED".equals(session.getAiStatus()) && session.getAiTranscript() != null && !session.getAiTranscript().isBlank();
        return Map.of("audioAvailable", available, "retryAvailable", available && !processing && !completed,
            "audioExpiresAt", session.getRecordingExpiresAt() == null ? "" : session.getRecordingExpiresAt().toString(),
            "aiStatus", "PROCESSING".equals(session.getAiStatus()) && !processing ? "FAILED" : session.getAiStatus() == null ? "PENDING" : session.getAiStatus(),
            "processingState", processing ? "PROCESSING" : completed ? "COMPLETED" : available ? "RETRYABLE" : "UNAVAILABLE");
    }

    private String claim(InterviewSession session) {
        String attempt = UUID.randomUUID().toString();
        session.setProcessingStartedAt(LocalDateTime.now().withNano(0)); session.setProcessingToken(attempt);
        session.setAiStatus("PROCESSING"); return attempt;
    }

    private void ensureIdle(InterviewSession session) {
        if ("PROCESSING".equals(session.getAiStatus()) && session.getProcessingStartedAt() != null
                && session.getProcessingStartedAt().plusMinutes(15).isAfter(LocalDateTime.now())) {
            throw reject(HttpStatus.CONFLICT, "Audio processing is already in progress");
        }
    }

    private Map<String, Object> start(String code, String filename, String attempt) {
        try { enqueue(() -> process(code, filename, attempt)); }
        catch (RejectedExecutionException exception) {
            finish(code, filename, attempt, null);
            throw reject(HttpStatus.SERVICE_UNAVAILABLE, "Audio saved; processing is busy. Retry later");
        }
        return Map.of("accepted", true, "aiStatus", "PROCESSING");
    }

    protected void enqueue(Runnable task) { workers.execute(task); }

    private void process(String code, String filename, String attempt) {
        JsonNode result = null;
        try {
            InterviewSession session = sessions.findBySessionCode(code).orElseThrow();
            if (!filename.equals(session.getRecordingFile()) || !attempt.equals(session.getProcessingToken()) || !"PROCESSING".equals(session.getAiStatus())) return;
            result = requestAi(session, Files.readAllBytes(file(filename)));
            if (!result.path("transcript").isTextual() || result.path("transcript").asText().isBlank() || !result.path("report").isObject()) result = null;
        } catch (Exception exception) {
            if (exception instanceof InterruptedException) Thread.currentThread().interrupt();
            // No audio, transcript, upstream bodies, keys, or internal errors in logs/responses.
        }
        try { finish(code, filename, attempt, result); }
        catch (RuntimeException ignored) { /* Lease cleanup recovers a failed DB completion. */ }
    }

    protected JsonNode requestAi(InterviewSession session, byte[] audio) throws Exception {
        String candidateName = session.getCandidateId() == null ? "" : users.findById(session.getCandidateId())
            .map(user -> user.getName() == null ? "" : user.getName()).orElse("");
        String payload = mapper.writeValueAsString(Map.of("audio_base64", Base64.getEncoder().encodeToString(audio),
            "mime_type", session.getRecordingMime(), "context", Map.of("title", session.getTitle() == null ? "" : session.getTitle(),
                "candidate_name", candidateName)));
        HttpRequest request = HttpRequest.newBuilder(URI.create(aiBaseUrl + "/process-audio"))
            .timeout(Duration.ofMinutes(12)).header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(payload)).build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("AI processing unavailable");
        return mapper.readTree(response.body());
    }

    private void finish(String code, String filename, String attempt, JsonNode result) {
        boolean completed = Boolean.TRUE.equals(locked(code, session -> {
            if (!filename.equals(session.getRecordingFile()) || !attempt.equals(session.getProcessingToken()) || !"PROCESSING".equals(session.getAiStatus())) return false;
            session.setAiStatus(result == null ? "FAILED" : "COMPLETED"); session.setProcessingStartedAt(null); session.setProcessingToken(null);
            if (result != null) {
                session.setAiTranscript(result.get("transcript").asText()); session.setAiReportJson(result.get("report").toString());
                session.setRecordingFile(null); session.setRecordingMime(null);
            }
            return result != null;
        }));
        if (completed) deleteFile(filename); // Delete only after successful DB commit.
    }

    private <T> T locked(String code, Function<InterviewSession, T> action) {
        return transactions.execute(status -> {
            InterviewSession session = sessions.findBySessionCodeForUpdate(code)
                .orElseThrow(() -> reject(HttpStatus.NOT_FOUND, "Session not found"));
            T result = action.apply(session); sessions.saveAndFlush(session); return result;
        });
    }

    private boolean available(InterviewSession session) {
        return session.getRecordingFile() != null && session.getRecordingExpiresAt() != null
            && session.getRecordingExpiresAt().isAfter(LocalDateTime.now()) && Files.isRegularFile(file(session.getRecordingFile()));
    }

    private Path file(String filename) {
        if (filename == null || !filename.matches("[0-9a-f-]{36}\\.audio")) throw new IllegalArgumentException("Invalid recording reference");
        return directory.resolve(filename);
    }

    private void deleteFile(String filename) {
        try { Files.deleteIfExists(file(filename)); } catch (Exception ignored) { /* Maintenance retries orphan deletion. */ }
    }

    @Scheduled(initialDelay = 60000, fixedDelay = 60000)
    public void cleanup() {
        for (InterviewSession item : sessions.findAll()) {
            if (item.getRecordingFile() == null) continue;
            try {
                String expired = locked(item.getSessionCode(), session -> {
                    if ("PROCESSING".equals(session.getAiStatus()) && session.getProcessingStartedAt() != null) {
                        if (session.getProcessingStartedAt().plusMinutes(15).isAfter(LocalDateTime.now())) return null;
                        session.setAiStatus("FAILED"); session.setProcessingStartedAt(null); session.setProcessingToken(null);
                    }
                    if (session.getRecordingExpiresAt() != null && session.getRecordingExpiresAt().isBefore(LocalDateTime.now())) {
                        String name = session.getRecordingFile(); session.setRecordingFile(null); session.setRecordingMime(null); return name;
                    }
                    return null;
                });
                if (expired != null) deleteFile(expired);
            } catch (RuntimeException ignored) { /* Retry on next bounded maintenance pass. */ }
        }
        Set<String> referenced = new HashSet<>();
        sessions.findAll().forEach(session -> { if (session.getRecordingFile() != null) referenced.add(session.getRecordingFile()); });
        if (Files.isDirectory(directory)) {
            try (var files = Files.list(directory)) {
                files.filter(path -> path.getFileName().toString().matches("([0-9a-f-]{36}\\.audio|upload-.*\\.tmp)"))
                    .filter(path -> !referenced.contains(path.getFileName().toString())).forEach(path -> {
                        try { if (Files.getLastModifiedTime(path).toInstant().isBefore(Instant.now().minus(Duration.ofHours(1)))) Files.deleteIfExists(path); }
                        catch (Exception ignored) { }
                    });
            } catch (Exception ignored) { }
        }
    }

    private ResponseStatusException reject(HttpStatus status, String message) { return new ResponseStatusException(status, message); }
    @PreDestroy public void close() { workers.shutdownNow(); }
}
