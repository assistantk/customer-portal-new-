package com.cris.customerportal.controller;

import com.cris.customerportal.config.DataMaskingUtil;
import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.dto.RmsLoginRequest;
import com.cris.customerportal.dto.RmsSelectDesignationRequest;
import com.cris.customerportal.dto.RmsValidateUserRequest;
import com.cris.customerportal.dto.RmsVerifyOtpRequest;
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
    public static final String RMS_LOGOUT_CONTEXT_KEY = "RMS_LOGOUT_CONTEXT";
    private static final int AUTHENTICATED_SESSION_TIMEOUT_SECONDS = 4 * 60 * 60;

    private final CaptchaService captchaService;
    private final RmsAuthOrchestrator rmsAuthOrchestrator;
    private final boolean requireHttps;

    public AuthController(CaptchaService captchaService) {
        this(captchaService, null, false);
    }

    public AuthController(
            CaptchaService captchaService,
            RmsAuthOrchestrator rmsAuthOrchestrator) {
        this(captchaService, rmsAuthOrchestrator, false);
    }

    @Autowired
    public AuthController(
            CaptchaService captchaService,
            @Autowired(required = false) RmsAuthOrchestrator rmsAuthOrchestrator,
            @Value("${app.security.require-https:true}") boolean requireHttps) {
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

        HttpSession existingSession = request.getSession(false);
        if (existingSession != null) {
            existingSession.removeAttribute(RMS_SESSION_CONTEXT_KEY);
            existingSession.removeAttribute(AUTH_SESSION_KEY);
        }

        String userId = requestDto != null ? requestDto.getUserId() : null;
        String password = requestDto != null ? requestDto.getPassword() : null;
        String divisionCode = requestDto != null ? requestDto.getDivisionCode() : null;
        String captchaInput = requestDto != null ? requestDto.getCaptchaInput() : null;

        LOGGER.info("RMS validate-user request received");
        LOGGER.info("RMS authentication mode: LIVE");

        if (rmsAuthOrchestrator == null) {
            LOGGER.warn("RMS authentication result: FAILED (service not configured). Status: {}. Designation step can proceed: false",
                    HttpStatus.SERVICE_UNAVAILABLE.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Authentication service is not configured.");
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

            request.changeSessionId();
            HttpSession session = request.getSession(true);
            session.setAttribute(RMS_SESSION_CONTEXT_KEY, ctx);
            session.setMaxInactiveInterval(1800); // 30 min during auth flow

            boolean canProceed = ctx != null && ctx.getDesignations() != null && !ctx.getDesignations().isEmpty();

            LOGGER.info("RMS authentication result: SUCCESS. Status: {}. Designation step can proceed: {}",
                    HttpStatus.OK.value(), canProceed);

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
            LOGGER.info("RMS authentication result: FAILED (invalid credentials). Status: {}. Designation step can proceed: false",
                    HttpStatus.UNAUTHORIZED.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);

        } catch (RmsApiException ex) {
            LOGGER.error("RMS validation service error. Status: {}. Designation step can proceed: false",
                    HttpStatus.SERVICE_UNAVAILABLE.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Authentication service is temporarily unavailable. Please try again later.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);

        } catch (Exception ex) {
            LOGGER.error("Unexpected error in validate-user. Status: {}. Designation step can proceed: false stackTrace={}",
                    HttpStatus.INTERNAL_SERVER_ERROR.value(), DataMaskingUtil.formatThrowable(ex));
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
            body.put("message", "Authentication service is not configured.");
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
            body.put("message", "OTP request accepted. Check your registered contact.");
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

        } catch (RmsAuthOrchestrator.InvalidRmsCredentialsException ex) {
            LOGGER.info("RMS select-designation result: FAILED (invalid credentials/designation): {}. Status: {}",
                    DataMaskingUtil.maskSensitive(ex.getMessage()), HttpStatus.BAD_REQUEST.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.badRequest().body(body);

        } catch (RmsApiException ex) {
            LOGGER.error("OTP generation service error. Status: {}", HttpStatus.SERVICE_UNAVAILABLE.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Unable to process the OTP request. Please try again later.");
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
                    .body(errorBody("Authentication service is not configured."));
        }

        HttpSession session = request.getSession(false);
        if (session == null || session.getAttribute(RMS_SESSION_CONTEXT_KEY) == null) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(errorBody("Session expired. Please restart login."));
        }

        RmsAuthSessionContext ctx = (RmsAuthSessionContext) session.getAttribute(RMS_SESSION_CONTEXT_KEY);
        if (requestDto != null && requestDto.getDesignation() != null
                && !requestDto.getDesignation().trim().equalsIgnoreCase(ctx.getSelectedDesignation())) {
            return ResponseEntity.badRequest().body(errorBody("Selected designation does not match the authenticated session."));
        }
        try {
            String clientIp = extractClientIp(request);
            rmsAuthOrchestrator.resendOtp(ctx, clientIp);

            Map<String, Object> data = new HashMap<>();
            data.put("destinationMasked", rmsAuthOrchestrator.getMaskedContact(ctx));
            data.put("resendCooldownSeconds", rmsAuthOrchestrator.getResendCooldownSeconds(ctx.getUserId()));

            LOGGER.info("RMS resend-otp result: SUCCESS. Status: {}", HttpStatus.OK.value());

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "A new OTP request was accepted. Check your registered contact.");
            body.put("data", data);
            return ResponseEntity.ok(body);

        } catch (RmsAuthOrchestrator.OtpResendCooldownException ex) {
            LOGGER.info("RMS resend-otp rate limited. Retry after {} seconds.",
                    ex.getRetryAfterSeconds());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            body.put("retryAfterSeconds", ex.getRetryAfterSeconds());
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .header("Retry-After", String.valueOf(ex.getRetryAfterSeconds()))
                    .body(body);

        } catch (RmsAuthOrchestrator.InvalidRmsCredentialsException ex) {
            LOGGER.info("RMS resend-otp rejected: {}", DataMaskingUtil.maskSensitive(ex.getMessage()));
            return ResponseEntity.badRequest()
                    .body(errorBody(ex.getMessage()));

        } catch (RmsApiException ex) {
            LOGGER.error("OTP resend failed. Status: {}",
                    HttpStatus.SERVICE_UNAVAILABLE.value());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(errorBody("Unable to process the OTP resend request. Please try again later."));
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
        LOGGER.info("RMS verify-otp request received");

        if (rmsAuthOrchestrator == null) {
            LOGGER.warn("RMS verify-otp result: FAILED (service not configured). Status: {}", HttpStatus.SERVICE_UNAVAILABLE.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Authentication service is not configured.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }

        if (session == null || ctx == null) {
            LOGGER.info("RMS verify-otp result: FAILED (session expired/missing). Status: {}", HttpStatus.BAD_REQUEST.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Session expired or invalid flow. Please start over.");
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
        }

        if (ctx.getStep() != RmsAuthSessionContext.Step.OTP_PENDING
                || ctx.getDesignations() == null
                || ctx.getDesignations().stream().noneMatch(
                        designation -> designation != null
                                && ctx.getSelectedDesignation() != null
                                && designation.equalsIgnoreCase(ctx.getSelectedDesignation()))) {
            LOGGER.info("RMS verify-otp result: FAILED (invalid authentication flow state). Status: {}",
                    HttpStatus.BAD_REQUEST.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "Session expired or invalid flow. Please start over.");
            return ResponseEntity.badRequest().body(body);
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

            // Rotate the session ID while retaining this browser's session and load-balancer affinity.
            session.removeAttribute(RMS_SESSION_CONTEXT_KEY);
            request.changeSessionId();
            session.setAttribute(AUTH_SESSION_KEY, authenticatedUser);
            if (ctx.getLoginRequest() != null) {
                session.setAttribute(RMS_LOGOUT_CONTEXT_KEY, ctx.getLoginRequest());
            }
            session.setMaxInactiveInterval(AUTHENTICATED_SESSION_TIMEOUT_SECONDS);

            LOGGER.info("User successfully verified OTP. Status: {}. Authenticated session established.",
                    HttpStatus.OK.value());

            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Verification Successful.");
            body.put("data", authenticatedUser);
            return ResponseEntity.ok(body);

        } catch (RmsAuthOrchestrator.InvalidRmsCredentialsException ex) {
            LOGGER.info("RMS verify-otp result: FAILED: {}. Status: {}",
                    DataMaskingUtil.maskSensitive(ex.getMessage()), HttpStatus.UNAUTHORIZED.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", ex.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(body);

        } catch (RmsApiException ex) {
            LOGGER.error("RMS verify-otp error. Status: {}", HttpStatus.SERVICE_UNAVAILABLE.value());
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", "OTP verification is unavailable. Please try again later.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Legacy local authentication is disabled; credentials must use the RMS validation flow.
    // ─────────────────────────────────────────────────────────────
    @PostMapping("/login")
    public ResponseEntity<?> legacyLogin(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("message", "Use the credential validation flow to log in.");
        return ResponseEntity.status(HttpStatus.GONE).body(body);
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
        LOGGER.info("Logout request received");
        HttpSession session = request.getSession(false);
        if (session == null) {
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Logged out successfully.");
            return ResponseEntity.ok(body);
        }

        RmsLoginRequest logoutReq = (RmsLoginRequest) session.getAttribute(RMS_LOGOUT_CONTEXT_KEY);
        session.invalidate();

        if (logoutReq != null && rmsAuthOrchestrator != null) {
            try {
                String clientIp = extractClientIp(request);
                rmsAuthOrchestrator.logout(logoutReq, clientIp);
            } catch (RmsApiException ex) {
                LOGGER.error("RMS logout failed: {}", ex.getMessage());
                Map<String, Object> body = new HashMap<>();
                body.put("success", false);
                body.put("message", "Failed to terminate session on RMS: " + ex.getMessage());
                return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(body);
            } catch (Exception ex) {
                LOGGER.error("Unexpected error during RMS logout: {}", ex.getMessage(), ex);
                Map<String, Object> body = new HashMap<>();
                body.put("success", false);
                body.put("message", "An unexpected error occurred during logout.");
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
            }
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
