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

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

@Service
public class SessionService {

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

    public Map<String, Object> createSession(CreateSessionRequest request) {
        InterviewSession session = new InterviewSession();
        session.setTitle(request.getTitle());
        session.setProblemStatement(request.getProblemStatement());
        session.setCreatedBy(request.getCreatedBy());
        session.setSessionCode(generateSessionCode());

        InterviewSession saved = sessionRepository.save(session);

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

    public List<Map<String, Object>> getSessionsForInterviewer(String email) {
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            return new ArrayList<>();
        }

        List<InterviewSession> sessions = sessionRepository.findByCreatedByOrderByCreatedAtDesc(user.getId());
        List<Map<String, Object>> response = new ArrayList<>();

        for (InterviewSession session : sessions) {
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
            item.put("candidateId", latestCandidateLog != null ? latestCandidateLog.getCandidateId() : null);

            response.add(item);
        }

        return response;
    }

    public Map<String, Object> getSessionByCode(String code) {
        Map<String, Object> response = new HashMap<>();
        InterviewSession session = sessionRepository.findBySessionCode(code).orElse(null);

        if (session == null) {
            response.put("error", "Session not found");
            return response;
        }

        response.put("id", session.getId());
        response.put("sessionCode", session.getSessionCode());
        response.put("title", session.getTitle());
        response.put("problemStatement", session.getProblemStatement());
        response.put("status", session.getStatus());
        response.put("createdBy", session.getCreatedBy());
        return response;
    }

    public Map<String, Object> endSession(String code) {
        Map<String, Object> response = new HashMap<>();
        InterviewSession session = sessionRepository.findBySessionCode(code).orElse(null);

        if (session == null) {
            response.put("error", "Session not found");
            return response;
        }

        session.setStatus("ENDED");
        sessionRepository.save(session);
        response.put("message", "Session ended");
        response.put("sessionCode", code);
        return response;
    }
}
