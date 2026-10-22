package com.cris.customerportal.controller;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.dto.LoginRequest;
import com.cris.customerportal.service.AuthService;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = {"http://localhost:5173", "http://127.0.0.1:5173"}, allowCredentials = "true")
public class AuthController {

    public static final String AUTH_SESSION_KEY = "AUTHENTICATED_USER";

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest loginRequest, HttpServletRequest request) {
        String userId = loginRequest.getEffectiveUserId();
        String password = loginRequest.getPassword();

        if (userId == null || userId.isEmpty() || password == null || password.isEmpty()) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "User ID/Email and Password are required.");
            return ResponseEntity.badRequest().body(body);
        }

        // Authenticate against TMS3T.AEM_USER.
        AuthUserDto user = authService.authenticate(userId, password);

        // Invalidate any existing session to prevent session fixation, then create fresh session
        HttpSession oldSession = request.getSession(false);
        if (oldSession != null) {
            oldSession.invalidate();
        }
        HttpSession newSession = request.getSession(true);
        newSession.setAttribute(AUTH_SESSION_KEY, user);
        newSession.setMaxInactiveInterval(3600); // 1 hour session

        Map<String, Object> body = new HashMap<>();
        body.put("success", true);
        body.put("message", "Login successful.");
        body.put("data", user);
        return ResponseEntity.ok(body);
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        Map<String, Object> body = new HashMap<>();
        body.put("success", true);
        body.put("message", "Logged out successfully.");
        return ResponseEntity.ok(body);
    }

    @GetMapping({"/session", "/me"})
    public ResponseEntity<?> checkSession(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            AuthUserDto user = (AuthUserDto) session.getAttribute(AUTH_SESSION_KEY);
            if (user != null) {
                Map<String, Object> body = new HashMap<>();
                body.put("success", true);
                body.put("authenticated", true);
                body.put("data", user);
                return ResponseEntity.ok(body);
            }
        }
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("authenticated", false);
        body.put("message", "Authentication required. Please log in.");
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);
    }
}
