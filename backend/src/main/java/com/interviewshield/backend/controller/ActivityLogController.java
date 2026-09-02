package com.interviewshield.backend.controller;

import com.interviewshield.backend.dto.CreateLogRequest;
import com.interviewshield.backend.service.ActivityLogService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/logs")
public class ActivityLogController {

    @Autowired
    private ActivityLogService activityLogService;

    @PostMapping
    public ResponseEntity<Map<String, Object>> saveLog(@RequestBody CreateLogRequest request) {
        Map<String, Object> response = activityLogService.saveLog(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{sessionCode}/{candidateId}")
    public ResponseEntity<?> getReport(
            @PathVariable String sessionCode,
            @PathVariable Long candidateId) {
        Map<String, Object> report = activityLogService.getReport(sessionCode, candidateId);
        return ResponseEntity.ok(report);
    }

    @GetMapping("/{sessionCode}")
    public ResponseEntity<?> getAllLogs(@PathVariable String sessionCode) {
        return ResponseEntity.ok(activityLogService.getLogsBySession(sessionCode));
    }
}