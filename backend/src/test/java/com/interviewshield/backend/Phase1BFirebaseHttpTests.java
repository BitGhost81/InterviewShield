package com.interviewshield.backend;

import com.interviewshield.backend.controller.FirebaseAuthController;
import com.interviewshield.backend.security.*;
import com.interviewshield.backend.service.FirebaseTokenService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = FirebaseAuthController.class, properties = "JWT_SECRET=test-only-secret-with-at-least-32-bytes")
@Import({SecurityConfig.class, JwtFilter.class, JwtUtil.class})
class Phase1BFirebaseHttpTests {
    @Autowired MockMvc mvc;
    @Autowired JwtUtil jwt;
    @MockBean FirebaseTokenService tokens;

    @Test void jwtPrincipalIsUsedAndTokenResponseCannotBeCached() throws Exception {
        when(tokens.issue("ABC123", "candidate")).thenReturn(Map.of("token", "test-only", "uid", "2"));
        mvc.perform(post("/api/sessions/ABC123/firebase-token")
            .header("Authorization", "Bearer " + jwt.generateToken("candidate", "CANDIDATE")))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.uid").value("2"));
    }

    @Test void unauthenticatedRequestsCannotMintFirebaseTokens() throws Exception {
        mvc.perform(post("/api/sessions/ABC123/firebase-token")).andExpect(status().is4xxClientError());
        verifyNoInteractions(tokens);
    }
}
