package com.interviewshield.backend.controller;
import java.util.HashMap;

import com.interviewshield.backend.dto.CreateSessionRequest;
import com.interviewshield.backend.service.SessionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;

import java.util.Map;
import java.util.List;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    @Autowired
    private SessionService sessionService;

    @PostMapping
    public ResponseEntity<Map<String, Object>> createSession(@RequestBody CreateSessionRequest request, Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }
        Map<String, Object> response = sessionService.createSession(request, authentication.getName());
        if (response.containsKey("error")) {
            String err = (String) response.get("error");
            if ("Unauthorized".equals(err)) {
                return ResponseEntity.status(401).body(response);
            }
            if ("Forbidden".equals(err)) {
                return ResponseEntity.status(403).body(response);
            }
            return ResponseEntity.status(400).body(response);
        }
        return ResponseEntity.ok(response);
    }

    @GetMapping("/mine")
    public ResponseEntity<List<Map<String, Object>>> getMySessions(Authentication authentication) {
        return ResponseEntity.ok(sessionService.getSessionsForInterviewer(authentication.getName()));
    }

    @GetMapping("/{code}")
    public ResponseEntity<Map<String, Object>> getSession(@PathVariable String code, Authentication authentication) {
        String email = authentication != null ? authentication.getName() : null;
        Map<String, Object> response = sessionService.getSessionByCode(code, email);
        if (response.containsKey("error")) {
            String err = (String) response.get("error");
            if ("Forbidden".equals(err)) {
                return ResponseEntity.status(403).body(response);
            }
            return ResponseEntity.status(404).body(response);
        }
        return ResponseEntity.ok(response);
    }

    @RequestMapping(value = "/{code}/end", method = {RequestMethod.POST, RequestMethod.PUT})
    public ResponseEntity<Map<String, Object>> endSession(@PathVariable String code, Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }
        Map<String, Object> response = sessionService.endSession(code, authentication.getName());
        if (response.containsKey("error")) {
            String err = (String) response.get("error");
            if ("Session not found".equals(err)) {
                return ResponseEntity.status(404).body(response);
            }
            if ("Forbidden".equals(err)) {
                return ResponseEntity.status(403).body(response);
            }
            if ("Unauthorized".equals(err)) {
                return ResponseEntity.status(401).body(response);
            }
            return ResponseEntity.status(400).body(response);
        }
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{code}/ai-report")
    public ResponseEntity<Map<String, Object>> getAiReport(@PathVariable String code, Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }
        Map<String, Object> response = sessionService.getAiReport(code, authentication.getName());
        if (response.containsKey("error")) {
            String err = (String) response.get("error");
            if ("Forbidden".equals(err)) return ResponseEntity.status(403).body(response);
            if ("Session not found".equals(err)) return ResponseEntity.status(404).body(response);
            return ResponseEntity.status(400).body(response);
        }
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{code}/process-audio")
    public ResponseEntity<Map<String, Object>> processAudio(
            @PathVariable String code,
            @RequestParam("audio") org.springframework.web.multipart.MultipartFile audioFile,
            Authentication authentication
    ) {
        System.out.println("[AI] POST /process-audio received for session: " + code);

        if (authentication == null || authentication.getName() == null) {
            System.out.println("[AI] process-audio REJECTED: Unauthorized");
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }
        Map<String, Object> session = sessionService.getSessionByCode(code, authentication.getName());
        if (session.containsKey("error")) {
            String err = (String) session.get("error");
            System.out.println("[AI] process-audio REJECTED: session lookup error: " + err);
            if ("Forbidden".equals(err)) return ResponseEntity.status(403).body(session);
            return ResponseEntity.status(404).body(session);
        }

        if (audioFile == null || audioFile.isEmpty()) {
            System.out.println("[AI] process-audio REJECTED: empty audio file");
            sessionService.updateAiProcessing(code, "FAILED", null, null);
            return ResponseEntity.status(400).body(Map.of("error", "Empty audio recording"));
        }

        System.out.println("[AI] Audio file received: size=" + audioFile.getSize() + " bytes, contentType=" + audioFile.getContentType());

        // Read bytes eagerly here, BEFORE starting the thread.
        // MultipartFile content may be cleaned up after the HTTP response is sent.
        final byte[] audioBytes;
        try {
            audioBytes = audioFile.getBytes();
            System.out.println("[AI] Audio bytes read successfully: " + audioBytes.length + " bytes");
        } catch (Exception ex) {
            System.err.println("[AI] Failed to read audio file bytes: " + ex.getMessage());
            sessionService.updateAiProcessing(code, "FAILED", null, null);
            return ResponseEntity.status(500).body(Map.of("error", "Failed to read audio file"));
        }

        // Mark PROCESSING before spawning thread so status is never stuck at PENDING
        sessionService.updateAiProcessing(code, "PROCESSING", null, null);
        System.out.println("[AI] aiStatus set to PROCESSING for session: " + code);

        final String sessionTitle = (String) session.getOrDefault("title", "");
        final String candidateName = (String) session.getOrDefault("candidateName", "");
        final String mimeType = audioFile.getContentType() != null ? audioFile.getContentType() : "audio/webm";

        new Thread(() -> {
            System.out.println("[AI] Background thread started for session: " + code);
            try {
                String base64Audio = java.util.Base64.getEncoder().encodeToString(audioBytes);
                System.out.println("[AI] Base64 encoded: " + base64Audio.length() + " chars");

                Map<String, Object> pyPayload = new HashMap<>();
                pyPayload.put("audio_base64", base64Audio);
                pyPayload.put("mime_type", mimeType);
                pyPayload.put("context", Map.of(
                    "title", sessionTitle,
                    "candidate_name", candidateName
                ));

                com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                String jsonBody = mapper.writeValueAsString(pyPayload);

                System.out.println("[AI] Sending request to Python http://127.0.0.1:8000/process-audio (payload size: " + jsonBody.length() + " chars)");

                java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
                java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create("http://127.0.0.1:8000/process-audio"))
                    .header("Content-Type", "application/json")
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(jsonBody))
                    .build();

                java.net.http.HttpResponse<String> pyResponse = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
                System.out.println("[AI] Python response status: " + pyResponse.statusCode());

                if (pyResponse.statusCode() == 200) {
                    com.fasterxml.jackson.databind.JsonNode root = mapper.readTree(pyResponse.body());
                    String transcript = root.has("transcript") ? root.get("transcript").asText() : "";
                    String reportJson = root.has("report") ? root.get("report").toString() : "";
                    System.out.println("[AI] Transcript length: " + transcript.length() + ", Report length: " + reportJson.length());
                    sessionService.updateAiProcessing(code, "COMPLETED", transcript, reportJson);
                    System.out.println("[AI] aiStatus set to COMPLETED for session: " + code);
                } else {
                    System.err.println("[AI] Python returned non-200: " + pyResponse.statusCode() + " body: " + pyResponse.body());
                    sessionService.updateAiProcessing(code, "FAILED", null, null);
                    System.out.println("[AI] aiStatus set to FAILED for session: " + code);
                }
            } catch (Exception ex) {
                System.err.println("[AI] process-audio background thread EXCEPTION for session " + code + ": " + ex.getMessage());
                ex.printStackTrace();
                sessionService.updateAiProcessing(code, "FAILED", null, null);
                System.out.println("[AI] aiStatus set to FAILED (exception) for session: " + code);
            }
        }).start();

        System.out.println("[AI] Returning 202 Accepted for session: " + code);
        return ResponseEntity.status(202).body(Map.of("accepted", true, "aiStatus", "PROCESSING"));
    }

    @DeleteMapping("/{code}")
    public ResponseEntity<Map<String, Object>> deleteSession(@PathVariable String code, Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }
        Map<String, Object> response = sessionService.deleteSession(code, authentication.getName());
        if (response.containsKey("error")) {
            String err = (String) response.get("error");
            if ("Session not found".equals(err)) {
                return ResponseEntity.status(404).body(response);
            }
            if ("Forbidden".equals(err)) {
                return ResponseEntity.status(403).body(response);
            }
            return ResponseEntity.status(400).body(response);
        }
        return ResponseEntity.ok(response);
    }
}
