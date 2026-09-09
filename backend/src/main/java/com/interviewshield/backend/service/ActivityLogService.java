package com.interviewshield.backend.service;

import com.interviewshield.backend.dto.CreateLogRequest;
import com.interviewshield.backend.model.ActivityLog;
import com.interviewshield.backend.repository.ActivityLogRepository;
import com.interviewshield.backend.repository.SessionRepository;
import com.interviewshield.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ActivityLogService {

    @Autowired
    private ActivityLogRepository activityLogRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SessionRepository sessionRepository;

    public Map<String, Object> saveLog(CreateLogRequest request) {
        ActivityLog log = new ActivityLog();
        log.setSessionCode(request.getSessionCode());
        log.setCandidateId(request.getCandidateId());
        log.setEventType(request.getEventType());
        log.setEventData(request.getEventData());

        ActivityLog saved = activityLogRepository.save(log);

        Map<String, Object> response = new HashMap<>();
        response.put("id", saved.getId());
        response.put("sessionCode", saved.getSessionCode());
        response.put("candidateId", saved.getCandidateId());
        response.put("eventType", saved.getEventType());
        response.put("createdAt", saved.getCreatedAt());
        return response;
    }

    public List<ActivityLog> getLogsBySession(String sessionCode) {
        return activityLogRepository.findBySessionCode(sessionCode);
    }

    public List<ActivityLog> getLogsBySessionAndCandidate(String sessionCode, Long candidateId) {
        return activityLogRepository.findBySessionCodeAndCandidateId(sessionCode, candidateId);
    }

    public Map<String, Object> getReport(String sessionCode, Long candidateId) {
        List<ActivityLog> logs = activityLogRepository
            .findBySessionCodeAndCandidateId(sessionCode, candidateId);

        long tabSwitches = logs.stream()
            .filter(l -> l.getEventType().equals("TAB_SWITCH"))
            .count();

        long snapshots = logs.stream()
            .filter(l -> l.getEventType().equals("WEBCAM_SNAPSHOT"))
            .count();

        // Risk score formula — remember this for viva
        int riskScore = (int) Math.min(100, (tabSwitches * 15) + (snapshots * 2));

        Map<String, Object> report = new HashMap<>();
        report.put("sessionCode", sessionCode);
        report.put("candidateId", candidateId);
        userRepository.findById(candidateId).ifPresent(user -> {
            report.put("candidateName", user.getName());
        });

        sessionRepository.findBySessionCode(sessionCode).ifPresent(session -> {
            report.put("sessionTitle", session.getTitle());
            report.put("sessionProblem", session.getProblemStatement());
            report.put("sessionStatus", session.getStatus());
            report.put("sessionCreatedAt", session.getCreatedAt());
        });

        if (!logs.isEmpty()) {
            LocalDateTime firstActivity = logs.get(0).getCreatedAt();
            LocalDateTime lastActivity = logs.get(logs.size() - 1).getCreatedAt();
            report.put("firstActivityAt", firstActivity);
            report.put("lastActivityAt", lastActivity);
            if (firstActivity != null && lastActivity != null) {
                long durationMinutes = Duration.between(firstActivity, lastActivity).toMinutes();
                report.put("durationMinutes", durationMinutes);
            } else {
                report.put("durationMinutes", 0L);
            }
        } else {
            report.put("firstActivityAt", null);
            report.put("lastActivityAt", null);
            report.put("durationMinutes", 0L);
        }

        String submittedCode = logs.stream()
            .filter(l -> "CODE_SUBMIT".equals(l.getEventType()))
            .reduce((first, second) -> second)
            .map(ActivityLog::getEventData)
            .orElse(null);
        report.put("submittedCode", submittedCode);

        String riskLevel = riskScore >= 60 ? "HIGH RISK" : (riskScore >= 30 ? "MEDIUM RISK" : "LOW RISK");
        report.put("riskLevel", riskLevel);

        report.put("totalEvents", logs.size());
        report.put("tabSwitches", tabSwitches);
        report.put("snapshots", snapshots);
        report.put("riskScore", riskScore);
        report.put("logs", logs);
        return report;
    }
}