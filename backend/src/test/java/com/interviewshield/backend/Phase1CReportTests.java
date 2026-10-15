package com.interviewshield.backend;

import com.interviewshield.backend.model.ActivityLog;
import com.interviewshield.backend.repository.*;
import com.interviewshield.backend.service.ActivityLogService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class Phase1CReportTests {
    @Test void orderedActivityUsesFinalSubmissionAndKeepsHistoricalRiskAndActivitySpan() {
        ActivityLogRepository repository = mock(ActivityLogRepository.class);
        UserRepository users = mock(UserRepository.class);
        SessionRepository sessions = mock(SessionRepository.class);
        ActivityLogService service = new ActivityLogService();
        ReflectionTestUtils.setField(service, "activityLogRepository", repository);
        ReflectionTestUtils.setField(service, "userRepository", users);
        ReflectionTestUtils.setField(service, "sessionRepository", sessions);
        LocalDateTime start = LocalDateTime.of(2026, 10, 15, 10, 0);
        List<ActivityLog> logs = new ArrayList<>();
        String[] events = {"TAB_SWITCH", "CODE_SUBMIT", "CODE_SUBMIT", "FOCUS_LOST", "FULLSCREEN_EXIT"};
        for (int index = 0; index < events.length; index++) {
            ActivityLog log = new ActivityLog(); log.setId((long) index + 1); log.setEventType(events[index]);
            log.setCreatedAt(index == 0 ? start : start.plusMinutes(5)); log.setEventData("submission-" + index); logs.add(log);
        }
        when(repository.findBySessionCodeAndCandidateIdOrderByCreatedAtAscIdAsc("ABC123", 2L)).thenReturn(logs);
        Map<String, Object> report = service.getReport("ABC123", 2L);
        assertEquals("submission-2", report.get("submittedCode"));
        assertEquals(50, report.get("riskScore")); // historical TAB_SWITCH + FOCUS_LOST + FULLSCREEN_EXIT
        assertEquals(5L, report.get("durationMinutes"));
        assertEquals(2L, report.get("focusLosses"));
        verify(repository).findBySessionCodeAndCandidateIdOrderByCreatedAtAscIdAsc("ABC123", 2L);
    }
}
