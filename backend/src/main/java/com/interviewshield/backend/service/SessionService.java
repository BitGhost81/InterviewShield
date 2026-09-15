package com.interviewshield.backend.service;

import com.interviewshield.backend.dto.CreateSessionRequest;
import com.interviewshield.backend.model.ActivityLog;
import com.interviewshield.backend.model.InterviewSession;
import com.interviewshield.backend.model.User;
import com.interviewshield.backend.repository.ActivityLogRepository;
import com.interviewshield.backend.repository.SessionRepository;
import com.interviewshield.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

@Service
public class SessionService {
    private static final int TITLE_MAX_LENGTH = 150;
    private static final int SESSION_EXPIRATION_HOURS = 3;
    private static final String STATUS_ACTIVE = "ACTIVE";
    private static final String STATUS_ENDED = "ENDED";
    private static final String STATUS_EXPIRED = "EXPIRED";

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ActivityLogRepository activityLogRepository;

    private String generateSessionCode() {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        Random random = new Random();
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            code.append(chars.charAt(random.nextInt(chars.length())));
        }
        // Make sure it's unique
        if (sessionRepository.existsBySessionCode(code.toString())) {
            return generateSessionCode(); // try again
        }
        return code.toString();
    }

    public Map<String, Object> createSession(CreateSessionRequest request, String email) {
        Map<String, Object> error = validateTitle(request.getTitle());
        if (error != null) {
            return error;
        }

        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            return Map.of("error", "Unauthorized");
        }

        if (!"INTERVIEWER".equalsIgnoreCase(user.getRole())) {
            return Map.of("error", "Forbidden");
        }

        InterviewSession session = new InterviewSession();
        session.setTitle(request.getTitle().trim());
        session.setProblemStatement(request.getProblemStatement() == null ? "" : request.getProblemStatement());
        session.setCreatedBy(user.getId());
        session.setSessionCode(generateSessionCode());

        InterviewSession saved = sessionRepository.save(session);

        return toSessionResponse(saved);
    }

    private Map<String, Object> validateTitle(String title) {
        if (title == null || title.trim().isEmpty()) {
            return Map.of("error", "Session title is required");
        }
        if (title.trim().length() > TITLE_MAX_LENGTH) {
            return Map.of("error", "Session title must be 150 characters or fewer");
        }
        return null;
    }

    private Map<String, Object> toSessionResponse(InterviewSession saved) {
        Map<String, Object> response = new HashMap<>();
        response.put("id", saved.getId());
        response.put("sessionCode", saved.getSessionCode());
        response.put("title", saved.getTitle());
        response.put("problemStatement", saved.getProblemStatement());
        response.put("status", saved.getStatus());
        response.put("createdBy", saved.getCreatedBy());
        response.put("createdAt", saved.getCreatedAt());
        return response;
    }

    private InterviewSession applyExpiration(InterviewSession session) {
        if (session == null || !STATUS_ACTIVE.equals(session.getStatus()) || session.getCreatedAt() == null) {
            return session;
        }

        if (session.getCreatedAt().plusHours(SESSION_EXPIRATION_HOURS).isBefore(LocalDateTime.now())) {
            session.setStatus(STATUS_EXPIRED);
            return sessionRepository.save(session);
        }

        return session;
    }

    public List<Map<String, Object>> getSessionsForInterviewer(String email) {
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            return new ArrayList<>();
        }

        List<InterviewSession> sessions = sessionRepository.findByCreatedByOrderByCreatedAtDesc(user.getId());
        List<Map<String, Object>> response = new ArrayList<>();

        for (InterviewSession session : sessions) {
            session = applyExpiration(session);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", session.getId());
            item.put("sessionCode", session.getSessionCode());
            item.put("title", session.getTitle());
            item.put("status", session.getStatus());
            item.put("createdBy", session.getCreatedBy());
            item.put("createdAt", session.getCreatedAt());

            ActivityLog latestCandidateLog = activityLogRepository
                .findTopBySessionCodeAndCandidateIdIsNotNullOrderByCreatedAtDesc(session.getSessionCode())
                .orElse(null);
            if (latestCandidateLog != null) {
                Long candidateId = latestCandidateLog.getCandidateId();
                item.put("candidateId", candidateId);
                userRepository.findById(candidateId).ifPresent(candidateUser -> {
                    item.put("candidateName", candidateUser.getName());
                });
            } else {
                item.put("candidateId", null);
            }

            response.add(item);
        }

        return response;
    }

    public Map<String, Object> getSessionByCode(String code) {
        return getSessionByCode(code, null);
    }

    public Map<String, Object> getSessionByCode(String code, String email) {
        Map<String, Object> response = new HashMap<>();
        InterviewSession session = applyExpiration(sessionRepository.findBySessionCode(code).orElse(null));

        if (session == null) {
            response.put("error", "Session not found");
            return response;
        }

        User user = (email != null && !email.isBlank()) ? userRepository.findByEmail(email).orElse(null) : null;
        if (user != null && "INTERVIEWER".equalsIgnoreCase(user.getRole())) {
            // An interviewer requesting session details must own the session
            if (session.getCreatedBy() == null || !session.getCreatedBy().equals(user.getId())) {
                response.put("error", "Forbidden");
                return response;
            }
        }

        response.put("id", session.getId());
        response.put("sessionCode", session.getSessionCode());
        response.put("title", session.getTitle());
        response.put("problemStatement", session.getProblemStatement());
        response.put("status", session.getStatus());
        response.put("aiStatus", session.getAiStatus() != null ? session.getAiStatus() : "PENDING");
        response.put("createdBy", session.getCreatedBy());
        response.put("createdAt", session.getCreatedAt());

        if (user != null && "INTERVIEWER".equalsIgnoreCase(user.getRole())) {
            ActivityLog latestCandidateLog = activityLogRepository
                .findTopBySessionCodeAndCandidateIdIsNotNullOrderByCreatedAtDesc(code)
                .orElse(null);
            if (latestCandidateLog != null) {
                Long candidateId = latestCandidateLog.getCandidateId();
                response.put("candidateId", candidateId);
                userRepository.findById(candidateId).ifPresent(candidateUser -> {
                    response.put("candidateName", candidateUser.getName());
                });
            }
        }
        return response;
    }

    public Map<String, Object> getAiReport(String code, String email) {
        Map<String, Object> response = new HashMap<>();
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            response.put("error", "Unauthorized");
            return response;
        }

        InterviewSession session = applyExpiration(sessionRepository.findBySessionCode(code).orElse(null));
        if (session == null) {
            response.put("error", "Session not found");
            return response;
        }

        if (session.getCreatedBy() == null || !session.getCreatedBy().equals(user.getId())) {
            response.put("error", "Forbidden");
            return response;
        }

        response.put("sessionCode", code);
        response.put("aiStatus", session.getAiStatus() != null ? session.getAiStatus() : "PENDING");
        response.put("aiTranscript", session.getAiTranscript() != null ? session.getAiTranscript() : "");
        response.put("aiReportJson", session.getAiReportJson() != null ? session.getAiReportJson() : "");
        return response;
    }

    @Transactional
    public Map<String, Object> updateAiProcessing(String code, String status, String transcript, String reportJson) {
        InterviewSession session = sessionRepository.findBySessionCode(code).orElse(null);
        if (session == null) {
            return Map.of("error", "Session not found");
        }
        session.setAiStatus(status);
        if (transcript != null) session.setAiTranscript(transcript);
        if (reportJson != null) session.setAiReportJson(reportJson);
        sessionRepository.save(session);
        return Map.of("message", "AI status updated", "aiStatus", status);
    }

    public Map<String, Object> endSession(String code, String email) {
        Map<String, Object> response = new HashMap<>();
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            response.put("error", "Unauthorized");
            return response;
        }

        InterviewSession session = applyExpiration(sessionRepository.findBySessionCode(code).orElse(null));

        if (session == null) {
            response.put("error", "Session not found");
            return response;
        }

        if (session.getCreatedBy() == null || !session.getCreatedBy().equals(user.getId())) {
            response.put("error", "Forbidden");
            return response;
        }

        if (STATUS_EXPIRED.equals(session.getStatus())) {
            response.put("error", "Session already expired");
            response.put("sessionCode", code);
            response.put("status", STATUS_EXPIRED);
            return response;
        }

        session.setStatus(STATUS_ENDED);
        sessionRepository.save(session);
        response.put("message", "Session ended");
        response.put("sessionCode", code);
        response.put("status", session.getStatus());
        return response;
    }

    @Transactional
    public Map<String, Object> deleteSession(String code, String email) {
        Map<String, Object> response = new HashMap<>();

        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            response.put("error", "Unauthorized");
            return response;
        }

        InterviewSession session = applyExpiration(sessionRepository.findBySessionCode(code).orElse(null));
        if (session == null) {
            response.put("error", "Session not found");
            return response;
        }

        // Only the authenticated interviewer who created the session may delete it
        if (session.getCreatedBy() == null || !session.getCreatedBy().equals(user.getId())) {
            response.put("error", "Forbidden");
            return response;
        }

        // Safely delete dependent activity logs first
        activityLogRepository.deleteBySessionCode(code);

        // Delete the session entity
        sessionRepository.delete(session);

        response.put("message", "Session deleted successfully");
        response.put("sessionCode", code);
        return response;
    }
}
