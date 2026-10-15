package com.interviewshield.backend;

import com.interviewshield.backend.model.InterviewSession;
import com.interviewshield.backend.model.User;
import com.interviewshield.backend.service.FirebaseTokenService;
import com.interviewshield.backend.service.SessionAuthorizationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;
import java.security.KeyPairGenerator;
import java.util.Base64;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class Phase1BFirebaseTests {
    @TempDir Path temporaryDirectory;
    SessionAuthorizationService authorization;
    InterviewSession session;
    CapturingTokens tokens;

    static class CapturingTokens extends FirebaseTokenService {
        String uid;
        Map<String, Object> claims;
        CapturingTokens(SessionAuthorizationService authorization) { super(authorization, "demo-codelock", "unused-test-path"); }
        @Override protected String createToken(String uid, Map<String, Object> claims) {
            this.uid = uid; this.claims = claims; return "test-token";
        }
    }

    @BeforeEach void setUp() {
        authorization = mock(SessionAuthorizationService.class);
        session = new InterviewSession();
        session.setSessionCode("ABC123");
        session.setCreatedAt(LocalDateTime.now());
        tokens = new CapturingTokens(authorization);
    }

    void user(String email, long id, String role) {
        User user = new User(); user.setId(id); user.setRole(role);
        when(authorization.requireUser(email)).thenReturn(user);
    }

    @Test void candidateTokenUsesServerIdentityAndShortSessionScope() {
        user("candidate", 2, "CANDIDATE");
        when(authorization.requireCandidate("ABC123", "candidate")).thenReturn(session);
        long start = System.currentTimeMillis();
        Map<String, Object> response = tokens.issue("ABC123", "candidate");
        assertEquals("2", response.get("uid"));
        assertEquals("ABC123", tokens.claims.get("sessionCode"));
        assertEquals("candidate", tokens.claims.get("participantRole"));
        long expires = (Long) tokens.claims.get("accessUntil");
        assertTrue(expires >= start && expires <= System.currentTimeMillis() + 300000);
        assertEquals(expires, tokens.claims.get("writeUntil"));
    }

    @Test void leaseDoesNotExtendPastSessionExpiry() {
        user("candidate", 2, "CANDIDATE");
        session.setCreatedAt(LocalDateTime.now().minusHours(3).plusMinutes(1));
        when(authorization.requireCandidate("ABC123", "candidate")).thenReturn(session);
        long expires = (Long) tokens.issue("ABC123", "candidate").get("accessUntil");
        assertTrue(expires <= System.currentTimeMillis() + 61000);
    }

    @Test void ownerCanReadHistoricalSessionButReceivesNoWriteLease() {
        user("owner", 1, "INTERVIEWER");
        session.setStatus("ENDED");
        when(authorization.requireOwner("ABC123", "owner")).thenReturn(session);
        tokens.issue("ABC123", "owner");
        assertEquals("interviewer", tokens.claims.get("participantRole"));
        assertEquals(0L, tokens.claims.get("writeUntil"));
    }

    @Test void unauthorizedCandidateAndOwnerNeverReachSigner() {
        user("candidate", 2, "CANDIDATE");
        when(authorization.requireCandidate("ABC123", "candidate"))
            .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden"));
        assertThrows(ResponseStatusException.class, () -> tokens.issue("ABC123", "candidate"));
        assertNull(tokens.claims);
        user("otherOwner", 4, "INTERVIEWER");
        when(authorization.requireOwner("ABC123", "otherOwner"))
            .thenThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden"));
        assertThrows(ResponseStatusException.class, () -> tokens.issue("ABC123", "otherOwner"));
        assertNull(tokens.claims);
    }

    @Test void absentCredentialsFailClosedWithoutLeakingConfiguration() {
        user("candidate", 2, "CANDIDATE");
        when(authorization.requireCandidate("ABC123", "candidate")).thenReturn(session);
        FirebaseTokenService unconfigured = new FirebaseTokenService(authorization, "", "");
        ResponseStatusException error = assertThrows(ResponseStatusException.class, () -> unconfigured.issue("ABC123", "candidate"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
        assertEquals("Firebase authentication is not configured or unavailable", error.getReason());
    }

    @Test void adminSdkSignsVerifiableCustomTokenWithoutNetworkCalls() throws Exception {
        user("candidate", 2, "CANDIDATE");
        when(authorization.requireCandidate("ABC123", "candidate")).thenReturn(session);
        var generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        var pair = generator.generateKeyPair();
        String pem = "-----BEGIN PRIVATE KEY-----\n" + Base64.getMimeEncoder(64, new byte[] {'\n'})
            .encodeToString(pair.getPrivate().getEncoded()) + "\n-----END PRIVATE KEY-----\n";
        Path credentials = temporaryDirectory.resolve("test-service-account.json");
        new ObjectMapper().writeValue(credentials.toFile(), Map.of(
            "type", "service_account", "project_id", "demo-codelock", "private_key_id", "test-only",
            "private_key", pem, "client_email", "test@demo-codelock.iam.gserviceaccount.com",
            "client_id", "123", "token_uri", "https://oauth2.googleapis.com/token"));
        FirebaseTokenService realSigner = new FirebaseTokenService(authorization, "demo-codelock", credentials.toString());
        try {
            String token = (String) realSigner.issue("ABC123", "candidate").get("token");
            var claims = Jwts.parserBuilder().setSigningKey(pair.getPublic()).build().parseClaimsJws(token).getBody();
            assertEquals("2", claims.get("uid"));
            assertEquals("ABC123", ((Map<?, ?>) claims.get("claims")).get("sessionCode"));
            assertEquals("https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit", claims.getAudience());
        } finally { realSigner.close(); }
    }
}
