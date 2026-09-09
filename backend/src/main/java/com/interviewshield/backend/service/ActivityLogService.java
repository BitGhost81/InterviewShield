package com.interviewshield.backend.service;

import com.interviewshield.backend.dto.CreateLogRequest;
import com.interviewshield.backend.model.ActivityLog;
import com.interviewshield.backend.repository.ActivityLogRepository;
import com.interviewshield.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ActivityLogService {

    @Autowired
    private ActivityLogRepository activityLogRepository;

    @Autowired
    private UserRepository userRepository;

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
        report.put("totalEvents", logs.size());
        report.put("tabSwitches", tabSwitches);
        report.put("snapshots", snapshots);
        report.put("riskScore", riskScore);
        report.put("logs", logs);
        return report;
    }
}