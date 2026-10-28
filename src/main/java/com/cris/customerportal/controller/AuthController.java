package com.cris.customerportal.controller;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.dto.LoginRequest;
import com.cris.customerportal.service.AuthService;
import com.cris.customerportal.service.CaptchaService;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = {"http://localhost:5173", "http://127.0.0.1:5173"}, allowCredentials = "true")
public class AuthController {

    private static final Logger LOGGER = LoggerFactory.getLogger(AuthController.class);
    public static final String AUTH_SESSION_KEY = "AUTHENTICATED_USER";

    private final AuthService authService;
    private final CaptchaService captchaService;

    public AuthController(AuthService authService, CaptchaService captchaService) {
        this.authService = authService;
        this.captchaService = captchaService;
    }

    @GetMapping("/captcha")
    public ResponseEntity<?> captcha(HttpServletRequest request) {
        LOGGER.debug("CAPTCHA challenge requested");
        Map<String, Object> body = new HashMap<>();
        body.put("image", captchaService.createChallengeImage(request.getSession(true)));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest loginRequest, HttpServletRequest request) {
        String userId = loginRequest.getEffectiveUserId();
        String password = loginRequest.getPassword();

        String captchaInput = loginRequest.getCaptchaInput();
        if (userId == null || userId.isEmpty() || password == null || password.isEmpty()
                || captchaInput == null || captchaInput.trim().isEmpty()) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "User ID/Email, Password, and CAPTCHA are required.");
            return ResponseEntity.badRequest().body(body);
        }

        HttpSession captchaSession = request.getSession(false);
        if (captchaSession == null) {
            LOGGER.info("Login rejected at CAPTCHA stage: no CAPTCHA session");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "CAPTCHA validation failed. Please refresh and try again.");
            return ResponseEntity.badRequest().body(body);
        }
        if (!captchaService.consumeChallenge(captchaSession, captchaInput.trim())) {
            LOGGER.info("Login rejected at CAPTCHA stage: answer mismatch or challenge expired");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "CAPTCHA validation failed. Please refresh and try again.");
            return ResponseEntity.badRequest().body(body);
        }

        LOGGER.info("CAPTCHA accepted; starting AEM credential authentication");
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
        LOGGER.info("Login completed successfully; authenticated session created");

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
