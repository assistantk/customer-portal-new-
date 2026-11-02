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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(originPatterns = {
        "http://localhost:[*]",
        "http://127.0.0.1:[*]",
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
}, allowCredentials = "true")
public class AuthController {

    private static final Logger LOGGER = LoggerFactory.getLogger(AuthController.class);
    public static final String AUTH_SESSION_KEY = "AUTHENTICATED_USER";
    public static final String RMS_SESSION_CONTEXT_KEY = "RMS_AUTH_CONTEXT";

    private final AuthService authService;
    private final CaptchaService captchaService;
    private final RmsAuthOrchestrator rmsAuthOrchestrator;
    private final boolean requireHttps;

    public AuthController(AuthService authService, CaptchaService captchaService) {
        this(authService, captchaService, null, false);
    }

    public AuthController(
            AuthService authService,
            CaptchaService captchaService,
            RmsAuthOrchestrator rmsAuthOrchestrator) {
        this(authService, captchaService, rmsAuthOrchestrator, false);
    }

    @Autowired
    public AuthController(
            AuthService authService,
            CaptchaService captchaService,
            @Autowired(required = false) RmsAuthOrchestrator rmsAuthOrchestrator,
            @Value("${app.security.require-https:true}") boolean requireHttps) {
        this.authService = authService;
        this.captchaService = captchaService;
        this.rmsAuthOrchestrator = rmsAuthOrchestrator;
        this.requireHttps = requireHttps;
    }

    // ─────────────────────────────────────────────────────────────
    // RMS Step 1: User ID + Password + Division Code validation
    // ─────────────────────────────────────────────────────────────
    @PostMapping("/validate-user")
    public ResponseEntity<?> validateUser(
            @RequestBody RmsValidateUserRequest requestDto,
            HttpServletRequest request) {

        ResponseEntity<?> transportError = requireHttps(request);
        if (transportError != null) {
            return transportError;
        }

        String userId = requestDto != null ? requestDto.getUserId() : null;
        String password = requestDto != null ? requestDto.getPassword() : null;
        String divisionCode = requestDto != null ? requestDto.getDivisionCode() : null;
        String captchaInput = requestDto != null ? requestDto.getCaptchaInput() : null;

        String safeUserId = sanitizeForLog(userId);
        String safeDiv = sanitizeForLog(divisionCode);
        String authMode = (rmsAuthOrchestrator != null && rmsAuthOrchestrator.isMockMode()) ? "MOCK" : "LIVE";

        LOGGER.info("RMS validate-user request received: userId={} divisionCode={}", safeUserId, safeDiv);
        LOGGER.info("RMS authentication mode: {}", authMode);

        if (rmsAuthOrchestrator == null) {
            LOGGER.warn("RMS authentication result: FAILED (service not configured). Status: {}. Designation step can proceed: false",
                    HttpStatus.SERVICE_UNAVAILABLE.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "RMS authentication service is not configured.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }

        if (userId == null || userId.trim().isEmpty()
                || password == null || password.trim().isEmpty()
                || divisionCode == null || divisionCode.trim().isEmpty()
                || captchaInput == null || captchaInput.trim().isEmpty()) {
            LOGGER.info("RMS authentication result: FAILED (missing required fields). Status: {}. Designation step can proceed: false",
                    HttpStatus.BAD_REQUEST.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "User ID, Password, Division Code, and CAPTCHA are required.");
            return ResponseEntity.badRequest().body(body);
        }

        HttpSession captchaSession = request.getSession(false);
        if (captchaSession == null || !captchaService.consumeChallenge(captchaSession, captchaInput.trim())) {
            LOGGER.info("RMS authentication result: FAILED (CAPTCHA validation failed). Status: {}. Designation step can proceed: false",
                    HttpStatus.BAD_REQUEST.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "CAPTCHA validation failed. Please refresh and try again.");
            return ResponseEntity.badRequest().body(body);
        }

        try {
            RmsAuthSessionContext ctx = rmsAuthOrchestrator.validateCredentials(
                    userId.trim(), password, divisionCode.trim());

            // Bind context to intermediate session
            HttpSession session = request.getSession(true);
            session.setAttribute(RMS_SESSION_CONTEXT_KEY, ctx);
            session.setMaxInactiveInterval(1800); // 30 min during auth flow

            boolean canProceed = ctx != null && ctx.getDesignations() != null && !ctx.getDesignations().isEmpty();

            LOGGER.info("RMS authentication result: SUCCESS (userId={}). Status: {}. Designation step can proceed: {}",
                    safeUserId, HttpStatus.OK.value(), canProceed);

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
            LOGGER.info("RMS authentication result: FAILED (invalid credentials, userId={}). Status: {}. Designation step can proceed: false",
                    safeUserId, HttpStatus.UNAUTHORIZED.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Invalid User ID, Email, or Password.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);

        } catch (RmsApiException ex) {
            LOGGER.error("RMS validation service error. Status: {}. Designation step can proceed: false",
                    HttpStatus.SERVICE_UNAVAILABLE.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Authentication service is temporarily unavailable. Please try again later.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);

        } catch (Exception ex) {
            LOGGER.error("Unexpected error in validate-user for userId={}. Status: {}. Designation step can proceed: false",
                    safeUserId, HttpStatus.INTERNAL_SERVER_ERROR.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Authentication service error. Please try again.");
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RMS Step 2: Designation Selection & OTP Generation
    // ─────────────────────────────────────────────────────────────
    @PostMapping({"/select-designation", "/generate-otp"})
    public ResponseEntity<?> selectDesignation(
            @RequestBody(required = false) RmsSelectDesignationRequest requestDto,
            HttpServletRequest request) {

        String designation = requestDto != null ? requestDto.getDesignation() : null;
        String safeDesig = sanitizeForLog(designation);
        LOGGER.info("RMS select-designation request received: designation={}", safeDesig);

        if (rmsAuthOrchestrator == null) {
            LOGGER.warn("RMS select-designation result: FAILED (service not configured). Status: {}", HttpStatus.SERVICE_UNAVAILABLE.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "RMS authentication service is not configured.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }

        HttpSession session = request.getSession(false);
        if (session == null || session.getAttribute(RMS_SESSION_CONTEXT_KEY) == null) {
            LOGGER.info("RMS select-designation result: FAILED (session expired/missing). Status: {}", HttpStatus.BAD_REQUEST.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Session expired or invalid flow. Please start over.");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
        }

        RmsAuthSessionContext ctx = (RmsAuthSessionContext) session.getAttribute(RMS_SESSION_CONTEXT_KEY);

        if (designation == null || designation.trim().isEmpty()) {
            if (ctx.getSelectedDesignation() != null && !ctx.getSelectedDesignation().trim().isEmpty()) {
                designation = ctx.getSelectedDesignation();
            }
        }

        if (designation == null || designation.trim().isEmpty()) {
            LOGGER.info("RMS select-designation result: FAILED (empty designation). Status: {}", HttpStatus.BAD_REQUEST.value());
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

            LOGGER.info("RMS select-designation result: SUCCESS. Status: {}. Proceeding to OTP step.", HttpStatus.OK.value());

            Map<String, Object> data = new HashMap<>();
            data.put("destinationMasked", rmsAuthOrchestrator.getMaskedContact(ctx));
            data.put("selectedDesignation", ctx.getSelectedDesignation());
            data.put("resendCooldownSeconds", rmsAuthOrchestrator.getResendCooldownSeconds(ctx.getUserId()));

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "OTP generated and sent to your registered contact.");
            body.put("data", data);
            return ResponseEntity.ok(body);

        } catch (RmsAuthOrchestrator.OtpResendCooldownException ex) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            body.put("retryAfterSeconds", ex.getRetryAfterSeconds());
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                    .body(body);

        } catch (RmsAuthOrchestrator.AccessDeniedException ex) {
            LOGGER.warn("Access denied for user {}: {}. Status: {}", ctx.getUserId(), ex.getMessage(), HttpStatus.FORBIDDEN.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("accessDenied", true);
            body.put("message", "Access Restricted: This website is available only to authorized Senior DCM / Senior DFM users. Your selected designation does not have permission to access this application.");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);

        } catch (RmsAuthOrchestrator.InvalidRmsCredentialsException ex) {
            LOGGER.info("RMS select-designation result: FAILED (invalid credentials/designation): {}. Status: {}",
                    ex.getMessage(), HttpStatus.BAD_REQUEST.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.badRequest().body(body);

        } catch (RmsApiException ex) {
            LOGGER.error("OTP generation service error: {}. Status: {}", ex.getMessage(), HttpStatus.SERVICE_UNAVAILABLE.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // RMS OTP Resend
    // ─────────────────────────────────────────────────────────────
    public ResponseEntity<?> resendOtp(HttpServletRequest request) {
        return resendOtp(null, request);
    }

    @PostMapping({"/resend-otp", "/regenerate-otp"})
    public ResponseEntity<?> resendOtp(
            @RequestBody(required = false) RmsSelectDesignationRequest requestDto,
            HttpServletRequest request) {
        LOGGER.info("RMS resend-otp request received");
        if (rmsAuthOrchestrator == null) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(errorBody("RMS authentication service is not configured."));
        }

        HttpSession session = request.getSession(false);
        if (session == null || session.getAttribute(RMS_SESSION_CONTEXT_KEY) == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(errorBody("Session expired. Please restart login."));
        }

        RmsAuthSessionContext ctx = (RmsAuthSessionContext) session.getAttribute(RMS_SESSION_CONTEXT_KEY);
        if (requestDto != null && requestDto.getDesignation() != null && !requestDto.getDesignation().trim().isEmpty()) {
            ctx.setSelectedDesignation(requestDto.getDesignation().trim());
        }
        try {
            String clientIp = extractClientIp(request);
            rmsAuthOrchestrator.resendOtp(ctx, clientIp);

            Map<String, Object> data = new HashMap<>();
            data.put("destinationMasked", rmsAuthOrchestrator.getMaskedContact(ctx));
            data.put("resendCooldownSeconds", rmsAuthOrchestrator.getResendCooldownSeconds(ctx.getUserId()));

            LOGGER.info("RMS resend-otp result: SUCCESS for user {}. Status: {}", ctx.getUserId(), HttpStatus.OK.value());

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "A new OTP has been dispatched to your registered contact.");
            body.put("data", data);
            return ResponseEntity.ok(body);

        } catch (RmsAuthOrchestrator.OtpResendCooldownException ex) {
            LOGGER.info("RMS resend-otp rate limited for user {}. Retry after {} seconds.",
                    ctx.getUserId(), ex.getRetryAfterSeconds());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            body.put("retryAfterSeconds", ex.getRetryAfterSeconds());
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                    .body(body);

        } catch (RmsAuthOrchestrator.AccessDeniedException ex) {
            LOGGER.warn("RMS resend-otp denied for user {}: {}", ctx.getUserId(), ex.getMessage());
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(errorBody(ex.getMessage()));

        } catch (RmsAuthOrchestrator.InvalidRmsCredentialsException ex) {
            LOGGER.info("RMS resend-otp rejected for user {}: {}", ctx.getUserId(), ex.getMessage());
            return ResponseEntity.badRequest()
                    .body(errorBody(ex.getMessage()));

        } catch (RmsApiException ex) {
            LOGGER.error("OTP resend failed for user {}: {}. Status: {}",
                    ctx.getUserId(), ex.getMessage(), HttpStatus.SERVICE_UNAVAILABLE.value());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(errorBody(ex.getMessage()));
        }
    }

    @GetMapping("/otp-status")
    public ResponseEntity<?> getOtpStatus(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null || session.getAttribute(RMS_SESSION_CONTEXT_KEY) == null) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "No active authentication flow.");
            return ResponseEntity.ok(body);
        }

        RmsAuthSessionContext ctx = (RmsAuthSessionContext) session.getAttribute(RMS_SESSION_CONTEXT_KEY);
        Map<String, Object> data = new HashMap<>();
        data.put("step", ctx.getStep() != null ? ctx.getStep().name() : null);
        data.put("userId", ctx.getUserId());
        data.put("userName", ctx.getUserName());
        data.put("divisionCode", ctx.getDivisionCode());
        data.put("selectedDesignation", ctx.getSelectedDesignation());
        data.put("destinationMasked", rmsAuthOrchestrator != null ? rmsAuthOrchestrator.getMaskedContact(ctx) : null);
        int remainingSeconds = (rmsAuthOrchestrator != null && ctx.getUserId() != null)
                ? rmsAuthOrchestrator.getResendCooldownSeconds(ctx.getUserId()) : 0;
        data.put("resendCooldownSeconds", remainingSeconds);

        Map<String, Object> body = new HashMap<>();
        body.put("success", true);
        body.put("data", data);
        return ResponseEntity.ok(body);
    }

    // ─────────────────────────────────────────────────────────────
    // RMS Step 3: OTP Verification & Final Authenticated Session
    // ─────────────────────────────────────────────────────────────
    @PostMapping("/verify-otp")
    public ResponseEntity<?> verifyOtp(
            @RequestBody RmsVerifyOtpRequest requestDto,
            HttpServletRequest request) {

        HttpSession session = request.getSession(false);
        RmsAuthSessionContext ctx = (session != null) ? (RmsAuthSessionContext) session.getAttribute(RMS_SESSION_CONTEXT_KEY) : null;
        String safeUserId = ctx != null ? sanitizeForLog(ctx.getUserId()) : "UNKNOWN";

        LOGGER.info("RMS verify-otp request received for userId={}", safeUserId);

        if (rmsAuthOrchestrator == null) {
            LOGGER.warn("RMS verify-otp result: FAILED (service not configured). Status: {}", HttpStatus.SERVICE_UNAVAILABLE.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "RMS authentication service is not configured.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }

        if (session == null || ctx == null) {
            LOGGER.info("RMS verify-otp result: FAILED (session expired/missing). Status: {}", HttpStatus.BAD_REQUEST.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Session expired or invalid flow. Please start over.");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
        }

        String otp = requestDto != null ? requestDto.getOtp() : null;

        if (otp == null || otp.trim().isEmpty()) {
            LOGGER.info("RMS verify-otp result: FAILED (missing OTP). Status: {}", HttpStatus.BAD_REQUEST.value());
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

            LOGGER.info("User {} successfully verified OTP. Status: {}. Authenticated session established.",
                    authenticatedUser.getUserId(), HttpStatus.OK.value());

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Authentication successful.");
            body.put("data", authenticatedUser);
            return ResponseEntity.ok(body);

        } catch (RmsAuthOrchestrator.InvalidRmsCredentialsException ex) {
            LOGGER.info("RMS verify-otp result: FAILED for user {}: {}. Status: {}", safeUserId, ex.getMessage(), HttpStatus.UNAUTHORIZED.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);

        } catch (RmsApiException ex) {
            LOGGER.error("RMS verify-otp error: {}. Status: {}", ex.getMessage(), HttpStatus.SERVICE_UNAVAILABLE.value());
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
        ResponseEntity<?> transportError = requireHttps(request);
        if (transportError != null) {
            return transportError;
        }

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
        try {
            body.put("image", captchaService.createChallengeImage(request.getSession(true)));
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
        } catch (CaptchaService.CaptchaGenerationException exception) {
            body.put("success", false);
            body.put("message", "CAPTCHA is temporarily unavailable. Please try again later.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .cacheControl(CacheControl.noStore())
                    .body(body);
        }
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

    private static Map<String, Object> errorBody(String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("message", message);
        return body;
    }

    private ResponseEntity<?> requireHttps(HttpServletRequest request) {
        if (requireHttps && (request == null || !request.isSecure())) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "HTTPS is required for credential submission.");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
        }
        return null;
    }

    private String sanitizeForLog(String input) {
        if (input == null) {
            return "null";
        }
        return input.replaceAll("[\r\n]", "_").trim();
    }
}
