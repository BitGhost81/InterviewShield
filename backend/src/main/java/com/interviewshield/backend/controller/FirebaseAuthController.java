package com.interviewshield.backend.controller;

import com.interviewshield.backend.service.FirebaseTokenService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/sessions")
public class FirebaseAuthController {
    private final FirebaseTokenService tokens;

    public FirebaseAuthController(FirebaseTokenService tokens) { this.tokens = tokens; }

    @PostMapping("/{code}/firebase-token")
    public ResponseEntity<Map<String, Object>> token(@PathVariable String code, Authentication authentication) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(tokens.issue(code, authentication == null ? null : authentication.getName()));
    }
}
