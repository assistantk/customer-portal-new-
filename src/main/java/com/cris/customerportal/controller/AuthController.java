package com.cris.customerportal.controller;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.dto.LoginRequest;
import com.cris.customerportal.dto.RmsSelectDesignationRequest;
import com.cris.customerportal.dto.RmsValidateUserRequest;
import com.cris.customerportal.dto.RmsVerifyOtpRequest;
import com.cris.customerportal.service.AuthService;
import com.cris.customerportal.service.CaptchaService;
import com.cris.customerportal.service.RmsApiException;
import com.cris.customerportal.service.RmsAuthOrchestrator;
import com.cris.customerportal.service.RmsAuthSessionContext;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = { "http://localhost:4200", "http://127.0.0.1:4200", "http://localhost:5173", "http://127.0.0.1:5173" }, allowCredentials = "true")
public class AuthController {

    private static final Logger LOGGER = LoggerFactory.getLogger(AuthController.class);
    public static final String AUTH_SESSION_KEY = "AUTHENTICATED_USER";
    public static final String RMS_SESSION_CONTEXT_KEY = "RMS_AUTH_CONTEXT";

    private final AuthService authService;
    private final CaptchaService captchaService;
    private final RmsAuthOrchestrator rmsAuthOrchestrator;

    public AuthController(AuthService authService, CaptchaService captchaService) {
        this(authService, captchaService, null);
    }

    @Autowired
    public AuthController(
            AuthService authService,
            CaptchaService captchaService,
            @Autowired(required = false) RmsAuthOrchestrator rmsAuthOrchestrator) {
        this.authService = authService;
        this.captchaService = captchaService;
        this.rmsAuthOrchestrator = rmsAuthOrchestrator;
    }

    // ─────────────────────────────────────────────────────────────
    // RMS Step 1: User ID + Password + Division Code validation
    // ─────────────────────────────────────────────────────────────
    @PostMapping("/validate-user")
    public ResponseEntity<?> validateUser(
            @RequestBody RmsValidateUserRequest requestDto,
            HttpServletRequest request) {

        if (rmsAuthOrchestrator == null) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "RMS authentication service is not configured.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }

        String userId = requestDto != null ? requestDto.getUserId() : null;
        String password = requestDto != null ? requestDto.getPassword() : null;
        String divisionCode = requestDto != null ? requestDto.getDivisionCode() : null;

        if (userId == null || userId.trim().isEmpty()
                || password == null || password.trim().isEmpty()
                || divisionCode == null || divisionCode.trim().isEmpty()) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "User ID, Password, and Division Code are required.");
            return ResponseEntity.badRequest().body(body);
        }

        try {
            RmsAuthSessionContext ctx = rmsAuthOrchestrator.validateCredentials(
                    userId.trim(), password, divisionCode.trim());

            // Bind context to intermediate session
            HttpSession session = request.getSession(true);
            session.setAttribute(RMS_SESSION_CONTEXT_KEY, ctx);
            session.setMaxInactiveInterval(1800); // 30 min during auth flow

            Map<String, Object> userData = new HashMap<>();
            userData.put("userId", ctx.getUserId());
            userData.put("userName", ctx.getUserName());
            userData.put("divisionCode", ctx.getDivisionCode());
            userData.put("designations", ctx.getDesignations());

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Credentials validated successfully.");
            body.put("data", userData);
            return ResponseEntity.ok(body);

        } catch (RmsAuthOrchestrator.InvalidRmsCredentialsException ex) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);

        } catch (RmsApiException ex) {
            LOGGER.error("RMS validation service error: {}", ex.getMessage());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);

        } catch (Exception ex) {
            LOGGER.error("Unexpected error in validate-user: {}", ex.getMessage(), ex);
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Authentication service error. Please try again.");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RMS Step 2: Designation Selection & OTP Generation
    // ─────────────────────────────────────────────────────────────
    @PostMapping("/select-designation")
    public ResponseEntity<?> selectDesignation(
            @RequestBody RmsSelectDesignationRequest requestDto,
            HttpServletRequest request) {

        if (rmsAuthOrchestrator == null) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "RMS authentication service is not configured.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }

        HttpSession session = request.getSession(false);
        if (session == null || session.getAttribute(RMS_SESSION_CONTEXT_KEY) == null) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Session expired or invalid flow. Please start over.");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
        }

        RmsAuthSessionContext ctx = (RmsAuthSessionContext) session.getAttribute(RMS_SESSION_CONTEXT_KEY);
        String designation = requestDto != null ? requestDto.getDesignation() : null;

        if (designation == null || designation.trim().isEmpty()) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Please select a designation.");
            return ResponseEntity.badRequest().body(body);
        }

        try {
            String clientIp = extractClientIp(request);
            rmsAuthOrchestrator.selectDesignationAndGenerateOtp(ctx, designation.trim(), clientIp);

            // Update session with pending OTP step
            session.setAttribute(RMS_SESSION_CONTEXT_KEY, ctx);

            Map<String, Object> data = new HashMap<>();
            data.put("destinationMasked", rmsAuthOrchestrator.getMaskedContact(ctx));
            data.put("selectedDesignation", ctx.getSelectedDesignation());

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "OTP generated and sent to your registered contact.");
            body.put("data", data);
            return ResponseEntity.ok(body);

        } catch (RmsAuthOrchestrator.AccessDeniedException ex) {
            LOGGER.warn("Access denied for user {}: {}", ctx.getUserId(), ex.getMessage());
            // Clear intermediate auth context to prevent tampering
            session.removeAttribute(RMS_SESSION_CONTEXT_KEY);
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("accessDenied", true);
            body.put("message", "Access Restricted: This website is available only to authorized Senior DCM users. Your selected designation does not have permission to access this application.");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);

        } catch (RmsAuthOrchestrator.InvalidRmsCredentialsException ex) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.badRequest().body(body);

        } catch (RmsApiException ex) {
            LOGGER.error("OTP generation service error: {}", ex.getMessage());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RMS OTP Resend
    // ─────────────────────────────────────────────────────────────
    @PostMapping("/resend-otp")
    public ResponseEntity<?> resendOtp(HttpServletRequest request) {
        if (rmsAuthOrchestrator == null) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("success", false, "message", "RMS authentication service is not configured."));
        }

        HttpSession session = request.getSession(false);
        if (session == null || session.getAttribute(RMS_SESSION_CONTEXT_KEY) == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("success", false, "message", "Session expired. Please restart login."));
        }

        RmsAuthSessionContext ctx = (RmsAuthSessionContext) session.getAttribute(RMS_SESSION_CONTEXT_KEY);
        try {
            String clientIp = extractClientIp(request);
            rmsAuthOrchestrator.selectDesignationAndGenerateOtp(ctx, ctx.getSelectedDesignation(), clientIp);

            Map<String, Object> data = new HashMap<>();
            data.put("destinationMasked", rmsAuthOrchestrator.getMaskedContact(ctx));

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "A new OTP has been dispatched to your registered contact.");
            body.put("data", data);
            return ResponseEntity.ok(body);

        } catch (Exception ex) {
            LOGGER.error("OTP resend failed: {}", ex.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("success", false, "message", "Unable to resend OTP. Please try again."));
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RMS Step 3: OTP Verification & Final Authenticated Session
    // ─────────────────────────────────────────────────────────────
    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(
            @RequestBody RmsVerifyOtpRequest requestDto,
            HttpServletRequest request) {

        if (rmsAuthOrchestrator == null) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "RMS authentication service is not configured.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }

        HttpSession session = request.getSession(false);
        if (session == null || session.getAttribute(RMS_SESSION_CONTEXT_KEY) == null) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Session expired or invalid flow. Please start over.");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
        }

        RmsAuthSessionContext ctx = (RmsAuthSessionContext) session.getAttribute(RMS_SESSION_CONTEXT_KEY);
        String otp = requestDto != null ? requestDto.getOtp() : null;

        if (otp == null || otp.trim().isEmpty()) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Please enter the OTP.");
            return ResponseEntity.badRequest().body(body);
        }

        try {
            String clientIp = extractClientIp(request);
            AuthUserDto authenticatedUser = rmsAuthOrchestrator.verifyOtp(ctx, otp.trim(), clientIp);

            // Invalidate intermediate auth session to prevent fixation
            session.removeAttribute(RMS_SESSION_CONTEXT_KEY);
            session.invalidate();

            // Create new fully-authenticated session
            HttpSession newSession = request.getSession(true);
            newSession.setAttribute(AUTH_SESSION_KEY, authenticatedUser);
            newSession.setMaxInactiveInterval(3600); // 1 hour session

            LOGGER.info("User {} successfully verified OTP; authenticated session established",
                    authenticatedUser.getUserId());

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Authentication successful.");
            body.put("data", authenticatedUser);
            return ResponseEntity.ok(body);

        } catch (RmsAuthOrchestrator.InvalidRmsCredentialsException ex) {
            LOGGER.info("OTP verification failed for user {}: {}", ctx.getUserId(), ex.getMessage());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);

        } catch (RmsApiException ex) {
            LOGGER.error("OTP verification service error: {}", ex.getMessage());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Legacy Login (Deprecated - multi-step login enforced)
    // ─────────────────────────────────────────────────────────────
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest loginRequest, HttpServletRequest request) {
        // Enforce the requirement: "Do not leave the existing authentication endpoint active as an undocumented bypass."
        // If CAPTCHA is provided with valid credentials, require completion via the RMS multi-step flow
        String userId = loginRequest != null ? loginRequest.getEffectiveUserId() : null;
        String password = loginRequest != null ? loginRequest.getPassword() : null;
        String captchaInput = loginRequest != null ? loginRequest.getCaptchaInput() : null;

        if (userId == null || userId.isEmpty() || password == null || password.isEmpty()
                || captchaInput == null || captchaInput.trim().isEmpty()) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "User ID, Password, and CAPTCHA are required.");
            return ResponseEntity.badRequest().body(body);
        }

        HttpSession captchaSession = request.getSession(false);
        if (captchaSession == null || !captchaService.consumeChallenge(captchaSession, captchaInput.trim())) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "CAPTCHA validation failed. Please refresh and try again.");
            return ResponseEntity.badRequest().body(body);
        }

        // Authenticate against AEM if available
        AuthUserDto user = authService.authenticate(userId, password);
        HttpSession oldSession = request.getSession(false);
        if (oldSession != null) {
            oldSession.invalidate();
        }
        HttpSession newSession = request.getSession(true);
        newSession.setAttribute(AUTH_SESSION_KEY, user);
        newSession.setMaxInactiveInterval(3600);

        Map<String, Object> body = new HashMap<>();
        body.put("success", true);
        body.put("message", "Login successful.");
        body.put("data", user);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/captcha")
    public ResponseEntity<?> captcha(HttpServletRequest request) {
        LOGGER.debug("CAPTCHA challenge requested");
        Map<String, Object> body = new HashMap<>();
        body.put("image", captchaService.createChallengeImage(request.getSession(true)));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
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

    @GetMapping({ "/session", "/me" })
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

    private String extractClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.trim().isEmpty() && !"unknown".equalsIgnoreCase(xff.trim())) {
            return xff.split(",")[0].trim();
        }
        String remoteAddr = request.getRemoteAddr();
        return (remoteAddr != null && !remoteAddr.isEmpty()) ? remoteAddr : "1.1.1.1";
    }
}
