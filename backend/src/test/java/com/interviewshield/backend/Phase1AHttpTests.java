package com.interviewshield.backend;

import com.interviewshield.backend.controller.*;
import com.interviewshield.backend.repository.*;
import com.interviewshield.backend.security.*;
import com.interviewshield.backend.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = {SessionController.class, ActivityLogController.class, AiCopilotController.class},
    properties = "JWT_SECRET=test-only-secret-with-at-least-32-bytes")
@Import({SecurityConfig.class, JwtFilter.class, JwtUtil.class})
class Phase1AHttpTests {
    @Autowired MockMvc mvc;
    @Autowired JwtUtil jwt;
    @MockBean SessionService sessions;
    @MockBean SessionAuthorizationService authorization;
    @MockBean ActivityLogService logs;
    @MockBean UserRepository users;
    @MockBean SessionRepository repository;

    private String bearer(String email, String role) {
        return "Bearer " + jwt.generateToken(email, role);
    }

    @Test
    void candidateLogUsesJwtPrincipalAndKeepsResponseShape() throws Exception {
        when(logs.saveLog(any(), eq("candidate"))).thenReturn(Map.of("id", 7, "candidateId", 2, "eventType", "FOCUS_LOST"));
        mvc.perform(post("/api/logs").header("Authorization", bearer("candidate", "CANDIDATE"))
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"sessionCode\":\"ABC123\",\"candidateId\":999,\"eventType\":\"FOCUS_LOST\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.candidateId").value(2));
        verify(logs).saveLog(any(), eq("candidate"));
    }

    @Test
    void interviewerCannotWriteCandidateLogsAndAnonymousCannotJoin() throws Exception {
        mvc.perform(post("/api/logs").header("Authorization", bearer("owner", "INTERVIEWER"))
            .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/sessions/ABC123/participation")).andExpect(status().is4xxClientError());
        verifyNoInteractions(logs, authorization);
    }

    @Test
    void joinUsesJwtPrincipalAndReturnsValidatedIdentity() throws Exception {
        when(authorization.join("ABC123", "candidate")).thenReturn(Map.of("id", 2, "role", "CANDIDATE", "status", "ACTIVE"));
        mvc.perform(post("/api/sessions/ABC123/participation")
            .header("Authorization", bearer("candidate", "CANDIDATE")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(2));
    }

    @Test
    void authorizationErrorsKeepErrorMapShape() throws Exception {
        when(sessions.getReadiness("ABC123", "otherCandidate"))
            .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden"));
        mvc.perform(get("/api/sessions/ABC123/readiness")
            .header("Authorization", bearer("otherCandidate", "CANDIDATE")))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.error").value("Forbidden"));
    }

    @Test
    void candidateCannotUploadAudioOrUseCopilot() throws Exception {
        String auth = bearer("candidate", "CANDIDATE");
        mvc.perform(multipart("/api/sessions/ABC123/process-audio").file("audio", new byte[] {1})
            .header("Authorization", auth)).andExpect(status().isForbidden());
        mvc.perform(post("/api/ai/copilot/chat").header("Authorization", auth)
            .contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isForbidden());
        verifyNoInteractions(sessions, authorization);
    }
}
