package com.interviewshield.backend.service;

import com.interviewshield.backend.model.InterviewSession;
import com.interviewshield.backend.model.User;
import com.interviewshield.backend.repository.SessionRepository;
import com.interviewshield.backend.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Map;

@Service
public class SessionAuthorizationService {
    private final SessionRepository sessions;
    private final UserRepository users;

    public SessionAuthorizationService(SessionRepository sessions, UserRepository users) {
        this.sessions = sessions;
        this.users = users;
    }

    public User requireUser(String email) {
        if (email == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized");
        return users.findByEmail(email)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized"));
    }

    public InterviewSession requireOwner(String code, String email) {
        User user = requireUser(email);
        InterviewSession session = findSession(code);
        if (!"INTERVIEWER".equalsIgnoreCase(user.getRole()) || !user.getId().equals(session.getCreatedBy())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden");
        }
        return session;
    }

    public InterviewSession requireParticipant(String code, String email) {
        User user = requireUser(email);
        InterviewSession session = findSession(code);
        boolean owner = "INTERVIEWER".equalsIgnoreCase(user.getRole()) && user.getId().equals(session.getCreatedBy());
        boolean candidate = "CANDIDATE".equalsIgnoreCase(user.getRole()) && user.getId().equals(session.getCandidateId());
        if (!owner && !candidate) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden");
        return session;
    }

    public InterviewSession requireCandidate(String code, String email) {
        User user = requireUser(email);
        InterviewSession session = requireParticipant(code, email);
        if (!"CANDIDATE".equalsIgnoreCase(user.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden");
        }
        requireActive(session);
        return session;
    }

    public void requireActiveParticipant(String code, String email) {
        requireActive(requireParticipant(code, email));
    }

    @Transactional
    public Map<String, Object> join(String code, String email) {
        User user = requireUser(email);
        // Serialize admission across concurrent requests, including different relay processes.
        InterviewSession session = sessions.findBySessionCodeForUpdate(code)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
        requireActive(session);
        if ("INTERVIEWER".equalsIgnoreCase(user.getRole())) {
            if (!user.getId().equals(session.getCreatedBy())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden");
            }
        } else if ("CANDIDATE".equalsIgnoreCase(user.getRole())) {
            if (session.getCandidateId() != null && !user.getId().equals(session.getCandidateId())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Session already has a candidate");
            }
            if (session.getCandidateId() == null) {
                session.setCandidateId(user.getId());
                // Legacy readiness/photos were not bound to an authenticated candidate.
                session.setCandidateReady(false);
                session.setCandidatePhoto(null);
                sessions.save(session);
            }
        } else {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden");
        }
        return Map.of("id", user.getId(), "role", user.getRole(), "status", session.getStatus());
    }

    private InterviewSession findSession(String code) {
        return sessions.findBySessionCode(code)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Session not found"));
    }

    private void requireActive(InterviewSession session) {
        if (!"ACTIVE".equals(session.getStatus()) || (session.getCreatedAt() != null
                && session.getCreatedAt().plusHours(3).isBefore(LocalDateTime.now()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Session is no longer active");
        }
    }
}
