package com.interviewshield.backend.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/ai/copilot")
public class AiCopilotController {
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper;

    @Value("${ai.base-url:http://127.0.0.1:8000}")
    private String aiBaseUrl;

    public AiCopilotController(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> copilotChat(
            @RequestBody Map<String, Object> request,
            Authentication authentication
    ) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        try {
            String body = objectMapper.writeValueAsString(request);
            HttpRequest aiRequest = HttpRequest.newBuilder()
                .uri(URI.create(aiBaseUrl.replaceAll("/+$", "") + "/chat"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

            HttpResponse<String> aiResponse = httpClient.send(aiRequest, HttpResponse.BodyHandlers.ofString());
            if (aiResponse.statusCode() < 200 || aiResponse.statusCode() >= 300) {
                return ResponseEntity.status(502).body(Map.of("error", "AI copilot unavailable"));
            }

            JsonNode json = objectMapper.readTree(aiResponse.body());
            String reply = json.has("reply") ? json.get("reply").asText("") : (json.has("message") ? json.get("message").asText("") : "");
            Map<String, Object> response = new HashMap<>();
            response.put("reply", reply);
            return ResponseEntity.ok(response);
        } catch (Exception ex) {
            return ResponseEntity.status(502).body(Map.of("error", "AI copilot unavailable"));
        }
    }
}
