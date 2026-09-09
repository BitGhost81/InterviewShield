package com.interviewshield.backend.controller;

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
    public ResponseEntity<Map<String, Object>> createSession(@RequestBody CreateSessionRequest request) {
        Map<String, Object> response = sessionService.createSession(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/mine")
    public ResponseEntity<List<Map<String, Object>>> getMySessions(Authentication authentication) {
        return ResponseEntity.ok(sessionService.getSessionsForInterviewer(authentication.getName()));
    }

    @GetMapping("/{code}")
    public ResponseEntity<Map<String, Object>> getSession(@PathVariable String code) {
        Map<String, Object> response = sessionService.getSessionByCode(code);
        if (response.containsKey("error")) {
            return ResponseEntity.status(404).body(response);
        }
        return ResponseEntity.ok(response);
    }

    @PutMapping("/{code}/end")
    public ResponseEntity<Map<String, Object>> endSession(@PathVariable String code) {
        Map<String, Object> response = sessionService.endSession(code);
        if (response.containsKey("error")) {
            return ResponseEntity.status(404).body(response);
        }
        return ResponseEntity.ok(response);
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
