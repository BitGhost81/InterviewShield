package com.interviewshield.backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.dao.OptimisticLockingFailureException;
import java.util.Map;

@RestControllerAdvice
public class AuthorizationExceptionHandler {
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> uploadTooLarge() {
        return ResponseEntity.status(413).body(Map.of("error", "Recording exceeds the 18 MiB audio limit"));
    }
    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, Object>> concurrentUpdate() {
        return ResponseEntity.status(409).body(Map.of("error", "Session changed; please retry"));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handle(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode())
            .body(Map.of("error", exception.getReason() == null ? "Request rejected" : exception.getReason()));
    }
}
