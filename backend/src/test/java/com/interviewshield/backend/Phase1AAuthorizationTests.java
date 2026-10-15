package com.interviewshield.backend;

import com.interviewshield.backend.controller.*;
import com.interviewshield.backend.dto.*;
import com.interviewshield.backend.model.*;
import com.interviewshield.backend.repository.*;
import com.interviewshield.backend.security.JwtUtil;
import com.interviewshield.backend.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class Phase1AAuthorizationTests {
    SessionRepository sessions;
    UserRepository users;
    ActivityLogRepository logs;
    SessionAuthorizationService authorization;
    SessionService sessionService;
    InterviewSession session;

    @BeforeEach
    void setUp() {
        sessions = mock(SessionRepository.class);
        users = mock(UserRepository.class);
        logs = mock(ActivityLogRepository.class);
        authorization = new SessionAuthorizationService(sessions, users);
        sessionService = new SessionService();
        ReflectionTestUtils.setField(sessionService, "sessionRepository", sessions);
        ReflectionTestUtils.setField(sessionService, "userRepository", users);
        ReflectionTestUtils.setField(sessionService, "activityLogRepository", logs);
        ReflectionTestUtils.setField(sessionService, "authorization", authorization);
        session = new InterviewSession();
        session.setSessionCode("ABC123");
        session.setCreatedBy(1L);
        session.setStatus("ACTIVE");
        session.setTitle("Interview");
        session.setCreatedAt(LocalDateTime.now());
        when(sessions.findBySessionCode("ABC123")).thenReturn(Optional.of(session));
        when(sessions.findBySessionCodeForUpdate("ABC123")).thenReturn(Optional.of(session));
        when(sessions.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        addUser("owner", 1, "INTERVIEWER");
        addUser("candidate", 2, "CANDIDATE");
        addUser("otherCandidate", 3, "CANDIDATE");
        addUser("otherInterviewer", 4, "INTERVIEWER");
    }

    private void addUser(String email, long id, String role) {
        User user = new User();
        user.setId(id);
        user.setEmail(email);
        user.setRole(role);
        when(users.findByEmail(email)).thenReturn(Optional.of(user));
    }

    private void rejected(HttpStatus status, Runnable action) {
        assertEquals(status, assertThrows(ResponseStatusException.class, action::run).getStatusCode());
    }

    @Test
    void admissionBindsIdentityAndAllowsSameCandidateReconnect() {
        assertEquals(2L, authorization.join("ABC123", "candidate").get("id"));
        assertEquals(2L, session.getCandidateId());
        assertEquals(2L, authorization.join("ABC123", "candidate").get("id"));
        rejected(HttpStatus.CONFLICT, () -> authorization.join("ABC123", "otherCandidate"));
        assertEquals(2L, session.getCandidateId());
    }

    @Test
    void unrelatedInterviewerAndMissingIdentityCannotJoin() {
        rejected(HttpStatus.FORBIDDEN, () -> authorization.join("ABC123", "otherInterviewer"));
        rejected(HttpStatus.UNAUTHORIZED, () -> authorization.join("ABC123", null));
        assertEquals(1L, authorization.join("ABC123", "owner").get("id"));
    }

    @Test
    void endedAndExpiredSessionsCannotAdmitCandidates() {
        session.setStatus("ENDED");
        rejected(HttpStatus.CONFLICT, () -> authorization.join("ABC123", "candidate"));
        session.setStatus("ACTIVE");
        session.setCreatedAt(LocalDateTime.now().minusHours(4));
        rejected(HttpStatus.CONFLICT, () -> authorization.join("ABC123", "candidate"));
    }

    @Test
    void readinessRequiresAdmittedCandidateAndMatchingRole() {
        rejected(HttpStatus.FORBIDDEN, () -> sessionService.markParticipantReady("ABC123", "candidate", "photo", "candidate"));
        authorization.join("ABC123", "candidate");
        rejected(HttpStatus.FORBIDDEN, () -> sessionService.markParticipantReady("ABC123", "candidate", "photo", "owner"));
        rejected(HttpStatus.FORBIDDEN, () -> sessionService.markParticipantReady("ABC123", "candidate", "photo", "otherCandidate"));
        rejected(HttpStatus.FORBIDDEN, () -> sessionService.markParticipantReady("ABC123", "interviewer", "photo", "candidate"));
        rejected(HttpStatus.FORBIDDEN, () -> sessionService.getReadiness("ABC123", "otherInterviewer"));
        sessionService.markParticipantReady("ABC123", "candidate", "candidatePhoto", "candidate");
        sessionService.markParticipantReady("ABC123", "interviewer", "ownerPhoto", "owner");
        assertTrue(session.isCandidateReady());
        assertEquals("candidatePhoto", sessionService.getReadiness("ABC123", "owner").get("candidatePhoto"));
        assertFalse(sessionService.getReadiness("ABC123", "candidate").containsKey("candidatePhoto"));
        assertEquals("ownerPhoto", session.getInterviewerPhoto());
        session.setStatus("ENDED");
        rejected(HttpStatus.CONFLICT, () -> sessionService.markParticipantReady("ABC123", "candidate", "photo", "candidate"));
    }

    @Test
    void firstAdmissionDoesNotInheritUnboundLegacyReadinessButReconnectKeepsPhotos() {
        session.setCandidateReady(true);
        session.setCandidatePhoto("unbound");
        authorization.join("ABC123", "candidate");
        assertFalse(session.isCandidateReady());
        assertNull(session.getCandidatePhoto());
        sessionService.markParticipantReady("ABC123", "candidate", "verified", "candidate");
        authorization.join("ABC123", "candidate");
        assertTrue(session.isCandidateReady());
        assertEquals("verified", session.getCandidatePhoto());
    }

    @Test
    void logsIgnoreForgedCandidateIdAndRejectOtherParticipants() {
        authorization.join("ABC123", "candidate");
        ActivityLogService service = new ActivityLogService();
        ReflectionTestUtils.setField(service, "authorization", authorization);
        ReflectionTestUtils.setField(service, "activityLogRepository", logs);
        when(logs.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        CreateLogRequest request = new CreateLogRequest();
        request.setSessionCode("ABC123");
        request.setCandidateId(999L);
        request.setEventType("CODE_SUBMIT");
        assertEquals(2L, service.saveLog(request, "candidate").get("candidateId"));
        rejected(HttpStatus.FORBIDDEN, () -> service.saveLog(request, "otherCandidate"));
        rejected(HttpStatus.FORBIDDEN, () -> service.saveLog(request, "owner"));
        session.setStatus("ENDED");
        rejected(HttpStatus.CONFLICT, () -> service.saveLog(request, "candidate"));
    }

    @Test
    void sessionMutationsAndAiReportsRequireOwner() {
        rejected(HttpStatus.FORBIDDEN, () -> sessionService.endSession("ABC123", "candidate"));
        rejected(HttpStatus.FORBIDDEN, () -> sessionService.deleteSession("ABC123", "otherInterviewer"));
        rejected(HttpStatus.FORBIDDEN, () -> sessionService.getAiReport("ABC123", "candidate"));
        assertEquals("ENDED", sessionService.endSession("ABC123", "owner").get("status"));
        assertEquals("PENDING", sessionService.getAiReport("ABC123", "owner").get("aiStatus"));
    }

    @Test
    void audioRequiresOwnerButAuthorizationAllowsEndedSession() {
        SessionController controller = new SessionController();
        ReflectionTestUtils.setField(controller, "authorization", authorization);
        ReflectionTestUtils.setField(controller, "sessionService", sessionService);
        MockMultipartFile audio = new MockMultipartFile("audio", "recording.webm", "audio/webm", new byte[0]);
        session.setStatus("ENDED");
        rejected(HttpStatus.FORBIDDEN, () -> controller.processAudio("ABC123", audio, new UsernamePasswordAuthenticationToken("candidate", null)));
        rejected(HttpStatus.FORBIDDEN, () -> controller.processAudio("ABC123", audio, new UsernamePasswordAuthenticationToken("otherInterviewer", null)));
        // An empty upload reaches validation after ownership, without calling Python.
        assertEquals(HttpStatus.BAD_REQUEST, controller.processAudio("ABC123", audio, new UsernamePasswordAuthenticationToken("owner", null)).getStatusCode());
        assertEquals("FAILED", session.getAiStatus());
    }

    @Test
    void copilotRejectsMissingContextAndUnrelatedOwnerWithoutCallingPython() {
        AiCopilotController controller = new AiCopilotController(new ObjectMapper());
        ReflectionTestUtils.setField(controller, "authorization", authorization);
        var auth = new UsernamePasswordAuthenticationToken("otherInterviewer", null);
        assertEquals(HttpStatus.BAD_REQUEST, controller.copilotChat(java.util.Map.of(), auth).getStatusCode());
        rejected(HttpStatus.FORBIDDEN, () -> controller.copilotChat(java.util.Map.of("context", java.util.Map.of("session_id", "ABC123")), auth));
    }

    @Test
    void reportCannotBeUsedToLookUpUnrelatedUserIdentity() {
        ActivityLogController controller = new ActivityLogController();
        ActivityLogService service = mock(ActivityLogService.class);
        ReflectionTestUtils.setField(controller, "activityLogService", service);
        ReflectionTestUtils.setField(controller, "userRepository", users);
        ReflectionTestUtils.setField(controller, "sessionRepository", sessions);
        when(service.getLogsBySessionAndCandidate("ABC123", 999L)).thenReturn(List.of());
        assertEquals(HttpStatus.FORBIDDEN, controller.getReport("ABC123", 999L, new UsernamePasswordAuthenticationToken("owner", null)).getStatusCode());
        verify(service, never()).getReport(any(), any());
    }

    @Test
    void jwtRequiresConfiguredSecretAndPreservesClaims() {
        assertThrows(IllegalArgumentException.class, () -> new JwtUtil("short"));
        assertThrows(IllegalArgumentException.class, () -> new JwtUtil(null));
        JwtUtil jwt = new JwtUtil("test-only-secret-with-at-least-32-bytes");
        String token = jwt.generateToken("candidate", "CANDIDATE");
        assertTrue(jwt.validateToken(token));
        assertEquals("candidate", jwt.extractEmail(token));
        assertEquals("CANDIDATE", jwt.extractRole(token));
        assertFalse(new JwtUtil("different-test-secret-with-32-bytes").validateToken(token));
        assertFalse(jwt.validateToken(""));
    }

    @Test
    void registrationRejectsUnsupportedRolesWithoutPersistingUser() {
        AuthService service = new AuthService();
        ReflectionTestUtils.setField(service, "userRepository", users);
        RegisterRequest request = new RegisterRequest();
        request.setRole("ADMIN");
        assertEquals("Invalid role", service.register(request).get("Error"));
        verify(users, never()).save(any());
    }
}
