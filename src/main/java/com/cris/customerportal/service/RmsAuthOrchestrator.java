package com.cris.customerportal.service;

import com.cris.customerportal.dto.RmsApiResponse;
import com.cris.customerportal.dto.RmsLoginRequest;
import com.cris.customerportal.dto.RmsOtpGenerateRequest;
import com.cris.customerportal.dto.RmsOtpVerifyRequest;
import com.cris.customerportal.dto.AuthUserDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/**
 * Orchestrates the three-step RMS authentication flow:
 *
 *   1. validateCredentials()      – calls ATVLDTUSER; returns list of user designations.
 *   2. selectDesignation()        – checks SR.DCM authorization; generates OTP via RTGNRTOTP.
 *   3. verifyOtp()                – calls RTVRFYOTP; on success returns a ready-to-store AuthUserDto.
 *
 * In mock mode (rms.auth.mode=mock) all three steps are simulated locally without
 * reaching the office network.
 */
@Service
public class RmsAuthOrchestrator {

    private static final Logger LOGGER = LoggerFactory.getLogger(RmsAuthOrchestrator.class);

    /** Required designation for Senior DCM portal access. */
    public static final String REQUIRED_DESIGNATION = "SR.DCM";

    private static final DateTimeFormatter APPLY_DATE_FMT =
            DateTimeFormatter.ofPattern("dd-MM-yyyy");

    private final RmsApiClient rmsApiClient;
    private final boolean mockMode;
    private final String projectName;

    public RmsAuthOrchestrator(
            RmsApiClient rmsApiClient,
            @Value("${rms.auth.mode:mock}") String authMode,
            @Value("${rms.api.project-name:FREIGHTCOD}") String projectName) {
        this.rmsApiClient = rmsApiClient;
        this.mockMode = "mock".equalsIgnoreCase(authMode.trim());
        this.projectName = projectName;
        LOGGER.info("RmsAuthOrchestrator started in {} mode", this.mockMode ? "MOCK" : "LIVE");
    }

    // ─────────────────────────────────────────────────
    // Step 1: Validate user credentials + division code
    // ─────────────────────────────────────────────────

    /**
     * Validates the user's credentials via ATVLDTUSER (or mock).
     *
     * @param userId       User-entered User ID (will be uppercased)
     * @param password     Plain-text password
     * @param divisionCode Location / division code (F_LOCN), e.g. "TKD", "NGP"
     * @return populated {@link RmsAuthSessionContext} with {@code step=CREDENTIALS_VALIDATED}
     * @throws RmsApiException           on HTTP failure (live mode)
     * @throws InvalidRmsCredentialsException on bad credentials / API error response
     */
    public RmsAuthSessionContext validateCredentials(String userId, String password, String divisionCode) {
        LOGGER.info("RMS validateCredentials – userId={} divisionCode={} mode={}",
                userId, divisionCode, mockMode ? "MOCK" : "LIVE");

        if (userId == null || userId.trim().isEmpty() || password == null || password.trim().isEmpty()) {
            throw new InvalidRmsCredentialsException("User ID and Password are required.");
        }
        if (!DivisionCodeValidator.isValid(divisionCode)) {
            LOGGER.info("validateCredentials rejected: invalid division code '{}'", divisionCode);
            throw new InvalidRmsCredentialsException("Invalid Division Code. Please enter a valid Indian Railways division code (e.g., TKD, NGP, CSTM, DLI).");
        }

        if (mockMode) {
            return mockValidateCredentials(userId, password, divisionCode);
        }

        RmsLoginRequest req = new RmsLoginRequest();
        req.setF_USERID(userId.toUpperCase(Locale.ROOT));
        req.setF_PSWD(password);
        req.setF_LOCN(divisionCode.toUpperCase(Locale.ROOT));
        req.setF_APLYDATE(LocalDate.now().format(APPLY_DATE_FMT));

        RmsApiResponse response = rmsApiClient.validateUser(req);

        if (!response.isSuccess()) {
            String msg = response.getMessage() != null ? response.getMessage()
                    : "Invalid User ID, Password, or Division Code.";
            LOGGER.info("ATVLDTUSER returned non-success for userId={}: {}", userId, msg);
            throw new InvalidRmsCredentialsException(msg);
        }

        List<String> designations = parseDesignations(response.getDesignations());
        if (designations.isEmpty()) {
            LOGGER.info("ATVLDTUSER returned no designations for userId={}", userId);
            throw new InvalidRmsCredentialsException("No designations found for your account.");
        }

        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);
        ctx.setUserId(response.getUserName() != null ? userId.toUpperCase(Locale.ROOT) : userId.toUpperCase(Locale.ROOT));
        ctx.setUserName(response.getUserName() != null ? response.getUserName() : userId.toUpperCase(Locale.ROOT));
        ctx.setEmail(response.getEmail());
        ctx.setMobileNo(response.getMobileNo());
        ctx.setDivisionCode(divisionCode.toUpperCase(Locale.ROOT));
        ctx.setDesignations(designations);
        return ctx;
    }

    // ─────────────────────────────────────────────────
    // Step 2: Designation selection → OTP generation
    // ─────────────────────────────────────────────────

    /**
     * Validates the selected designation and, if authorized (SR.DCM), triggers OTP generation.
     *
     * @param ctx              Session context from step 1
     * @param selectedDesig    Designation chosen by the user
     * @param clientIp         HTTP client IP (sent as F_CLNTID to the RMS OTP API)
     * @throws AccessDeniedException             if the designation is not SR.DCM
     * @throws InvalidRmsCredentialsException    if the designation is not in the allowed list
     * @throws RmsApiException                   on HTTP failure (live mode)
     */
    public void selectDesignationAndGenerateOtp(
            RmsAuthSessionContext ctx, String selectedDesig, String clientIp) {

        String normalized = selectedDesig == null ? "" : selectedDesig.trim().toUpperCase(Locale.ROOT);
        LOGGER.info("RMS selectDesignation – userId={} designation={}", ctx.getUserId(), normalized);

        // Confirm selection is in the list returned by ATVLDTUSER
        boolean inList = ctx.getDesignations().stream()
                .anyMatch(d -> d.equalsIgnoreCase(normalized));
        if (!inList) {
            LOGGER.warn("Designation {} not in allowed list for userId={}", normalized, ctx.getUserId());
            throw new InvalidRmsCredentialsException("Selected designation is not valid for your account.");
        }

        // SR.DCM authorization gate
        if (!REQUIRED_DESIGNATION.equalsIgnoreCase(normalized)) {
            LOGGER.info("Access denied – userId={} selected non-SR.DCM designation {}", ctx.getUserId(), normalized);
            throw new AccessDeniedException(
                    "Access denied. Only Senior DCM (SR.DCM) users may access this portal.");
        }

        ctx.setSelectedDesignation(REQUIRED_DESIGNATION);

        // Generate OTP
        if (mockMode) {
            LOGGER.info("MOCK mode – OTP generation skipped for userId={}", ctx.getUserId());
        } else {
            RmsOtpGenerateRequest req = new RmsOtpGenerateRequest();
            req.setF_USERID(ctx.getUserId());
            req.setF_CLNTID(clientIp != null ? clientIp : "0.0.0.0");
            req.setF_CNSR(projectName);
            req.setF_NEWRRNUMB(ctx.getMobileNo() != null ? ctx.getMobileNo() : "");
            req.setF_NEWRRTYPE(ctx.getEmail() != null ? ctx.getEmail() : "");

            RmsApiResponse response = rmsApiClient.generateOtp(req);
            if (!response.isSuccess()) {
                String msg = response.getMessage() != null ? response.getMessage()
                        : "OTP generation failed. Please try again.";
                LOGGER.warn("RTGNRTOTP non-success for userId={}: {}", ctx.getUserId(), msg);
                throw new RmsApiException(msg);
            }
        }

        ctx.setStep(RmsAuthSessionContext.Step.OTP_PENDING);
    }

    // ─────────────────────────────────────────────────
    // Step 3: OTP verification → create auth session
    // ─────────────────────────────────────────────────

    /**
     * Verifies the OTP and returns a fully-populated {@link AuthUserDto} on success.
     *
     * @param ctx      Session context from step 2 (step must be OTP_PENDING)
     * @param otp      OTP entered by the user
     * @param clientIp HTTP client IP
     * @return fully-populated {@link AuthUserDto}
     * @throws InvalidRmsCredentialsException on wrong OTP
     * @throws RmsApiException                on HTTP failure (live mode)
     */
    public AuthUserDto verifyOtp(RmsAuthSessionContext ctx, String otp, String clientIp) {
        LOGGER.info("RMS verifyOtp – userId={}", ctx.getUserId());

        if (ctx.getStep() != RmsAuthSessionContext.Step.OTP_PENDING) {
            throw new InvalidRmsCredentialsException("Invalid authentication state. Please start over.");
        }

        if (mockMode) {
            // In mock mode, "123456" is the valid test OTP; all others are rejected for Test 6
            String cleanOtp = otp != null ? otp.trim() : "";
            if (!"123456".equals(cleanOtp)) {
                LOGGER.info("MOCK mode – incorrect OTP entered: {} (expected 123456)", cleanOtp);
                throw new InvalidRmsCredentialsException("Invalid OTP. Please enter the valid 6-digit OTP.");
            }
            LOGGER.info("MOCK mode – valid OTP 123456 accepted for userId={}", ctx.getUserId());
        } else {
            RmsOtpVerifyRequest req = new RmsOtpVerifyRequest();
            req.setF_USERID(ctx.getUserId());
            req.setF_CLNTID(clientIp != null ? clientIp : "0.0.0.0");
            req.setF_DOMN(otp);
            req.setF_SRVC(otp);  // same OTP for both mobile and email per API spec placeholder

            RmsApiResponse response = rmsApiClient.verifyOtp(req);
            if (!response.isSuccess()) {
                String msg = response.getMessage() != null ? response.getMessage()
                        : "Invalid OTP. Please try again.";
                LOGGER.info("RTVRFYOTP non-success for userId={}: {}", ctx.getUserId(), msg);
                throw new InvalidRmsCredentialsException(msg);
            }
        }

        return new AuthUserDto(
                ctx.getUserId(),
                ctx.getUserName() != null ? ctx.getUserName() : ctx.getUserId(),
                REQUIRED_DESIGNATION,   // SR.DCM is the only allowed role
                "Y",
                ctx.getEmail(),
                ctx.getMobileNo());
    }

    // ─────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────

    /**
     * Parses the designations string returned by ATVLDTUSER.
     * Tries pipe-delimited, comma-delimited, and JSON array formats.
     */
    private List<String> parseDesignations(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return new ArrayList<>();
        }
        String trimmed = raw.trim();
        // Strip JSON array brackets if present
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        String[] parts = trimmed.contains("|") ? trimmed.split("\\|")
                : trimmed.contains(",") ? trimmed.split(",")
                : new String[]{trimmed};
        return Arrays.stream(parts)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> s.replace("\"", "").replace("'", ""))
                .collect(Collectors.toList());
    }

    // ─────────────────────────────────────────────────
    // Mock helpers
    // ─────────────────────────────────────────────────

    private RmsAuthSessionContext mockValidateCredentials(String userId, String password, String divisionCode) {
        if (password == null || password.trim().isEmpty() || "wrong".equalsIgnoreCase(password.trim()) || "invalid".equalsIgnoreCase(password.trim())) {
            LOGGER.info("MOCK mode – invalid password entered for userId={}", userId);
            throw new InvalidRmsCredentialsException("Invalid User ID or Password.");
        }

        String cleanId = userId != null ? userId.trim().toUpperCase(Locale.ROOT) : "";
        if ("UNKNOWN".equalsIgnoreCase(cleanId) || "INVALID".equalsIgnoreCase(cleanId) || "NOTFOUND".equalsIgnoreCase(cleanId)) {
            LOGGER.info("MOCK mode – unknown user ID simulation for userId={}", userId);
            throw new InvalidRmsCredentialsException("Invalid User ID or credentials not found.");
        }
        if ("TIMEOUT".equalsIgnoreCase(cleanId)) {
            LOGGER.info("MOCK mode – simulating API timeout for userId={}", userId);
            throw new RmsApiException("Connection timed out while reaching RMS validation service.");
        }

        LOGGER.info("MOCK mode – credentials accepted for userId={}", userId);

        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);
        ctx.setUserId(cleanId);
        if ("SREEJU".equalsIgnoreCase(cleanId)) {
            ctx.setUserName("SREEJU KRISHNAN");
            ctx.setEmail("krishnan.sreeju@gmail.com");
            ctx.setMobileNo("9910303868");
        } else {
            ctx.setUserName(cleanId + " (Mock)");
            ctx.setEmail("user." + cleanId.toLowerCase(Locale.ROOT) + "@cris.org.in");
            ctx.setMobileNo("9876543210");
        }
        ctx.setDivisionCode(divisionCode != null ? divisionCode.toUpperCase(Locale.ROOT) : "TKD");
        ctx.setDesignations(Arrays.asList("SR.DCM", "DCM", "JDCM"));
        return ctx;
    }

    /**
     * Produces a masked string for display, e.g. '******3868 / k******@gmail.com'
     */
    public String getMaskedContact(RmsAuthSessionContext ctx) {
        StringBuilder sb = new StringBuilder();
        if (ctx.getMobileNo() != null && ctx.getMobileNo().length() >= 4) {
            String m = ctx.getMobileNo();
            sb.append("******").append(m.substring(m.length() - 4));
        }
        if (ctx.getEmail() != null && ctx.getEmail().contains("@")) {
            if (sb.length() > 0) sb.append(" / ");
            String e = ctx.getEmail();
            int at = e.indexOf('@');
            if (at > 1) {
                sb.append(e.charAt(0)).append("******").append(e.substring(at));
            } else {
                sb.append("******").append(e.substring(at));
            }
        }
        return sb.toString();
    }

    // ─────────────────────────────────────────────────
    // Nested exception classes (package-private)
    // ─────────────────────────────────────────────────

    public static class InvalidRmsCredentialsException extends RuntimeException {
        public InvalidRmsCredentialsException(String message) { super(message); }
    }

    public static class AccessDeniedException extends RuntimeException {
        public AccessDeniedException(String message) { super(message); }
    }
}
