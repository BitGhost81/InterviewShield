package com.interviewshield.backend.service;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.ServiceAccountCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.interviewshield.backend.model.InterviewSession;
import com.interviewshield.backend.model.User;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneId;
import java.util.Map;

@Service
public class FirebaseTokenService {
    private final SessionAuthorizationService authorization;
    private final String projectId;
    private final String credentialsPath;
    private FirebaseApp app;

    public FirebaseTokenService(SessionAuthorizationService authorization,
            @Value("${FIREBASE_PROJECT_ID:}") String projectId,
            @Value("${FIREBASE_SERVICE_ACCOUNT_PATH:}") String credentialsPath) {
        this.authorization = authorization;
        this.projectId = projectId;
        this.credentialsPath = credentialsPath;
    }

    public Map<String, Object> issue(String code, String email) {
        User user = authorization.requireUser(email);
        boolean candidate = "CANDIDATE".equalsIgnoreCase(user.getRole());
        InterviewSession session = candidate ? authorization.requireCandidate(code, email) : authorization.requireOwner(code, email);
        long now = System.currentTimeMillis();
        long accessUntil = now + 5 * 60_000;
        long writeUntil = 0;
        if (candidate) {
            // Match the existing backend's local-time three-hour session expiry.
            long sessionExpiry = session.getCreatedAt().plusHours(3).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
            accessUntil = Math.min(accessUntil, sessionExpiry);
            writeUntil = accessUntil;
        }
        Map<String, Object> claims = Map.of("sessionCode", session.getSessionCode(),
            "participantRole", candidate ? "candidate" : "interviewer",
            "accessUntil", accessUntil, "writeUntil", writeUntil);
        try {
            String uid = user.getId().toString();
            return Map.of("token", createToken(uid, claims), "uid", uid,
                "projectId", projectId, "accessUntil", accessUntil);
        } catch (Exception exception) {
            // Do not return credentials, signing errors, tokens, or file paths to the browser/logs.
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Firebase authentication is not configured or unavailable");
        }
    }

    protected synchronized String createToken(String uid, Map<String, Object> claims) throws Exception {
        if (projectId.isBlank() || credentialsPath.isBlank()) throw new IllegalStateException("Firebase configuration required");
        if (app == null) {
            try (InputStream input = Files.newInputStream(Path.of(credentialsPath))) {
                GoogleCredentials credentials = GoogleCredentials.fromStream(input);
                if (!(credentials instanceof ServiceAccountCredentials account) || !projectId.equals(account.getProjectId())) {
                    throw new IllegalStateException("Firebase project mismatch");
                }
                app = FirebaseApp.initializeApp(FirebaseOptions.builder().setCredentials(credentials)
                    .setProjectId(projectId).build(), "codelock-custom-auth");
            }
        }
        return FirebaseAuth.getInstance(app).createCustomToken(uid, claims);
    }

    @PreDestroy
    public synchronized void close() {
        if (app != null) app.delete();
        app = null;
    }
}
