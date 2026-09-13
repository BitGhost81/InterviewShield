package com.interviewshield.backend.controller;

import com.interviewshield.backend.dto.CreateLogRequest;
import com.interviewshield.backend.service.ActivityLogService;
import com.interviewshield.backend.model.InterviewSession;
import com.interviewshield.backend.model.User;
import com.interviewshield.backend.repository.SessionRepository;
import com.interviewshield.backend.repository.UserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/logs")
public class ActivityLogController {

    @Autowired
    private ActivityLogService activityLogService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @PostMapping
    public ResponseEntity<Map<String, Object>> saveLog(@RequestBody CreateLogRequest request) {
        Map<String, Object> response = activityLogService.saveLog(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{sessionCode}/{candidateId}")
    public ResponseEntity<?> getReport(
            @PathVariable String sessionCode,
            @PathVariable Long candidateId,
            Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        User user = userRepository.findByEmail(authentication.getName()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        if (!"INTERVIEWER".equalsIgnoreCase(user.getRole())) {
            return ResponseEntity.status(403).body(Map.of("error", "Forbidden"));
        }

        InterviewSession session = sessionRepository.findBySessionCode(sessionCode).orElse(null);
        if (session == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Session not found"));
        }

        if (session.getCreatedBy() == null || !session.getCreatedBy().equals(user.getId())) {
            return ResponseEntity.status(403).body(Map.of("error", "Forbidden"));
        }

        Map<String, Object> report = activityLogService.getReport(sessionCode, candidateId);
        return ResponseEntity.ok(report);
    }

    @GetMapping("/{sessionCode}")
    public ResponseEntity<?> getAllLogs(@PathVariable String sessionCode, Authentication authentication) {
        if (authentication == null || authentication.getName() == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        User user = userRepository.findByEmail(authentication.getName()).orElse(null);
        if (user == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        }

        if (!"INTERVIEWER".equalsIgnoreCase(user.getRole())) {
            return ResponseEntity.status(403).body(Map.of("error", "Forbidden"));
        }

        InterviewSession session = sessionRepository.findBySessionCode(sessionCode).orElse(null);
        if (session == null) {
            return ResponseEntity.status(404).body(Map.of("error", "Session not found"));
        }

        if (session.getCreatedBy() == null || !session.getCreatedBy().equals(user.getId())) {
            return ResponseEntity.status(403).body(Map.of("error", "Forbidden"));
        }

        return ResponseEntity.ok(activityLogService.getLogsBySession(sessionCode));
    }
}