package com.cris.customerportal.service;

import com.cris.customerportal.dto.RmsApiResponse;
import com.cris.customerportal.dto.RmsLoginRequest;
import com.cris.customerportal.dto.RmsOtpGenerateRequest;
import com.cris.customerportal.dto.RmsOtpVerifyRequest;
import com.cris.customerportal.dto.AuthUserDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;

/**
 * Orchestrates the RMS authentication flow:
 *
 *   1. validateCredentials()      – calls ATVLDTUSER; validates credentials and retrieves designations.
 *   2. selectDesignation()        – enforces Senior DCM / Senior DFM authorization; requests OTP via RTGNRTOTP.
 *   3. verifyOtp()                – calls RTVRFYOTP; on verification success returns a ready-to-store AuthUserDto.
 *
 * Defaults to LIVE mode in production (rms.auth.mode=live).
 * Offline mock mode (rms.auth.mode=mock) mocks credential validation only; OTP generation and verification still use RMS.
 */
@Service
public class RmsAuthOrchestrator {

    private static final Logger LOGGER = LoggerFactory.getLogger(RmsAuthOrchestrator.class);

    /** Required canonical designation code for Senior DCM portal access. */
    public static final String REQUIRED_DESIGNATION = "SR-DCM";
    public static final int OTP_RESEND_COOLDOWN_SECONDS = 300;
    private static final long OTP_RESEND_COOLDOWN_MILLIS = OTP_RESEND_COOLDOWN_SECONDS * 1000L;

    private static final DateTimeFormatter APPLY_DATE_FMT =
            DateTimeFormatter.ofPattern("dd-MM-yyyy");

    private final RmsApiClient rmsApiClient;
    private final boolean mockMode;
    private final String projectName;
    private final String configuredClientId;

    private final ConcurrentMap<String, Long> otpResendAllowedAt = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Object> otpUserLocks = new ConcurrentHashMap<>();

    public RmsAuthOrchestrator(
            RmsApiClient rmsApiClient,
            @Value("${rms.auth.mode:live}") String authMode,
            @Value("${rms.api.project-name:FreightCodeGenerator}") String projectName) {
        this(rmsApiClient, authMode, projectName, "1.1.1.1");
    }

    @Autowired
    public RmsAuthOrchestrator(
            RmsApiClient rmsApiClient,
            @Value("${rms.auth.mode:live}") String authMode,
            @Value("${rms.api.project-name:FreightCodeGenerator}") String projectName,
            @Value("${rms.api.client-id:1.1.1.1}") String configuredClientId) {
        this.rmsApiClient = rmsApiClient;
        this.mockMode = "mock".equalsIgnoreCase(authMode != null ? authMode.trim() : "");
        this.projectName = (projectName != null && !projectName.trim().isEmpty())
                ? projectName.trim() : "FreightCodeGenerator";
        this.configuredClientId = (configuredClientId != null && !configuredClientId.trim().isEmpty())
                ? configuredClientId.trim() : "1.1.1.1";

        if (this.mockMode) {
            LOGGER.warn("RmsAuthOrchestrator started in DEVELOPMENT MOCK mode (AUTH_MODE=mock). Credentials are mocked; OTP generation and verification still use RMS.");
        } else {
            LOGGER.info("RmsAuthOrchestrator started in LIVE mode. Real RMS APIs will be called at configured endpoint with projectName={} clientId={}",
                    this.projectName, this.configuredClientId);
        }
    }

    public boolean isMockMode() {
        return mockMode;
    }

    // ─────────────────────────────────────────────────
    // Step 1: Validate user credentials + division code
    // ─────────────────────────────────────────────────

    /**
     * Validates the user's credentials via ATVLDTUSER (or development mock if explicitly configured).
     *
     * @param userId       User-entered User ID
     * @param password     Plain-text password
     * @param divisionCode Location / division code (F_LOCN), e.g. "TKD", "NGP"
     * @return populated {@link RmsAuthSessionContext} with {@code step=CREDENTIALS_VALIDATED}
     * @throws RmsApiException                on HTTP or network failure (live mode, no fallback)
     * @throws InvalidRmsCredentialsException on wrong password, unknown user, etc.
     */
    public RmsAuthSessionContext validateCredentials(String userId, String password, String divisionCode) {
        LOGGER.info("RMS validateCredentials – userId={} divisionCode={} mode={}",
                userId, divisionCode, mockMode ? "MOCK" : "LIVE");

        if (mockMode) {
            return mockValidateCredentials(userId, password, divisionCode);
        }

        String applyDate = LocalDate.now().format(APPLY_DATE_FMT);

        RmsLoginRequest req = new RmsLoginRequest();
        req.setF_USERID(userId.trim().toUpperCase(Locale.ROOT));
        req.setF_PSWD(password);
        req.setF_LOCN(divisionCode.trim().toUpperCase(Locale.ROOT));
        req.setF_APLYDATE(applyDate);

        RmsApiResponse response = rmsApiClient.validateUser(req);

        if (!response.isSuccess()) {
            String msg = response.getMessage() != null ? response.getMessage() : "Invalid credentials.";
            LOGGER.warn("ATVLDTUSER authentication rejected for userId={}: srvcName={} errorNo={} status={} message={}",
                    userId, response.getSrvcName(), response.getErrorNo(), response.getStatus(), msg);
            throw new InvalidRmsCredentialsException(msg);
        }

        List<String> rawDesignations = parseDesignations(response.getDesignations());
        if (rawDesignations.isEmpty()) {
            LOGGER.warn("ATVLDTUSER returned no designations for userId={}", userId);
            throw new InvalidRmsCredentialsException("No designations found for your account. Please contact your administrator.");
        }

        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId(userId.trim().toUpperCase(Locale.ROOT));
        ctx.setUserName(response.getUserName() != null ? response.getUserName() : userId);
        ctx.setDivisionCode(divisionCode.trim().toUpperCase(Locale.ROOT));
        ctx.setEmail(response.getEmail());
        ctx.setMobileNo(response.getMobileNo());
        ctx.setDesignations(rawDesignations);
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);

        LOGGER.info("ATVLDTUSER accepted for userId={} name={} designations={}",
                userId, ctx.getUserName(), rawDesignations);
        return ctx;
    }

    // ─────────────────────────────────────────────────
    // Step 2: Select designation & trigger OTP
    // ─────────────────────────────────────────────────

    /**
     * Checks if a designation is authorized for portal access (Senior DCM or Senior DFM).
     */
    public static boolean isAuthorizedDesignation(String designation) {
        if (designation == null || designation.trim().isEmpty()) {
            return false;
        }
        String clean = designation.trim().toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9]", "");
        return "SRDCM".equals(clean)
                || "SENIORDCM".equals(clean)
                || "SENIORSRDCM".equals(clean)
                || clean.startsWith("SRDCM")
                || clean.startsWith("SENIORDCM")
                || "SRDFM".equals(clean)
                || "SENIORDFM".equals(clean)
                || "SENIORSRDFM".equals(clean)
                || clean.startsWith("SRDFM")
                || clean.startsWith("SENIORDFM");
    }

    public static boolean isSeniorDcm(String designation) {
        return isAuthorizedDesignation(designation);
    }

    /**
     * Validates the selected designation and requests an OTP from RMS.
     *
     * @param ctx              Session context
     * @param selectedDesig    Designation chosen by the user (e.g. Senior DFM, Senior DCM)
     * @param clientIp         HTTP client IP
     * @throws AccessDeniedException             if the designation is not Senior DCM / Senior DFM
     * @throws InvalidRmsCredentialsException    if the designation is empty or invalid
     * @throws OtpResendCooldownException        if cooldown is active
     * @throws RmsApiException                   on HTTP failure (live mode, no fallback)
     */
    public void selectDesignationAndGenerateOtp(
            RmsAuthSessionContext ctx, String selectedDesig, String clientIp) {
        String userKey = normalizeUserId(ctx.getUserId());
        synchronized (lockForUser(userKey)) {
            if (ctx.getStep() != RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED) {
                throw new InvalidRmsCredentialsException(
                        "OTP has already been generated. Use Resend OTP when the countdown ends.");
            }
            validateSeniorDcmDesignation(ctx, selectedDesig);

            int remainingSeconds = getResendCooldownSeconds(userKey);
            if (remainingSeconds > 0) {
                throw new OtpResendCooldownException(remainingSeconds);
            }

            dispatchOtp(ctx, clientIp, "GNRTOTP");
            startOtpResendCooldown(userKey);
        }
    }

    /**
     * Requests a replacement OTP from RMS using the REGNRTOTP service.
     *
     * @param ctx      Session context (must be in OTP_PENDING)
     * @param clientIp HTTP client IP
     * @throws InvalidRmsCredentialsException if no OTP is pending
     * @throws OtpResendCooldownException     if cooldown is active
     */
    public void resendOtp(RmsAuthSessionContext ctx, String clientIp) {
        String userKey = normalizeUserId(ctx.getUserId());
        synchronized (lockForUser(userKey)) {
            if (ctx.getStep() != RmsAuthSessionContext.Step.OTP_PENDING) {
                throw new InvalidRmsCredentialsException("No OTP is pending. Please restart login.");
            }
            int remainingSeconds = getResendCooldownSeconds(userKey);
            if (remainingSeconds > 0) {
                throw new OtpResendCooldownException(remainingSeconds);
            }

            dispatchOtp(ctx, clientIp, "REGNRTOTP");
            startOtpResendCooldown(userKey);
        }
    }

    public int getResendCooldownSeconds(String userId) {
        String userKey = normalizeUserId(userId);
        Long allowedAt = otpResendAllowedAt.get(userKey);
        if (allowedAt == null) {
            return 0;
        }
        long remainingMillis = allowedAt - System.currentTimeMillis();
        if (remainingMillis <= 0) {
            otpResendAllowedAt.remove(userKey, allowedAt);
            return 0;
        }
        return (int) ((remainingMillis + 999) / 1000);
    }

    private Object lockForUser(String userKey) {
        return otpUserLocks.computeIfAbsent(userKey, key -> new Object());
    }

    private String normalizeUserId(String userId) {
        if (userId == null || userId.trim().isEmpty()) {
            throw new InvalidRmsCredentialsException("User ID is required.");
        }
        return userId.trim().toUpperCase(Locale.ROOT);
    }

    private void startOtpResendCooldown(String userKey) {
        otpResendAllowedAt.put(userKey, System.currentTimeMillis() + OTP_RESEND_COOLDOWN_MILLIS);
    }

    private void validateSeniorDcmDesignation(RmsAuthSessionContext ctx, String selectedDesig) {
        String raw = selectedDesig == null ? "" : selectedDesig.trim();
        if (raw.isEmpty()) {
            throw new InvalidRmsCredentialsException("Please select a designation.");
        }

        // Confirm selection is in the user's available designations
        boolean inList = ctx.getDesignations() != null && ctx.getDesignations().stream()
                .anyMatch(d -> d.trim().equalsIgnoreCase(raw));
        if (!inList) {
            LOGGER.warn("Designation {} not in allowed list for userId={}", raw, ctx.getUserId());
            throw new InvalidRmsCredentialsException("Selected designation is not valid for your account.");
        }

        // Senior DCM / Senior DFM authorization gate
        if (!isAuthorizedDesignation(raw)) {
            LOGGER.info("Access denied – userId={} selected unauthorized designation {}", ctx.getUserId(), raw);
            throw new AccessDeniedException(
                    "Access denied. Only Senior DCM / Senior DFM users may access this portal.");
        }

        ctx.setSelectedDesignation(raw);
    }

    private void dispatchOtp(
            RmsAuthSessionContext ctx, String clientIp, String serviceName) {
        RmsOtpGenerateRequest req = new RmsOtpGenerateRequest();
        req.setF_USERID(ctx.getUserId());
        req.setF_CLNTID(configuredClientId != null ? configuredClientId : (clientIp != null ? clientIp : "1.1.1.1"));
        req.setF_CNSR(projectName);
        req.setF_NEWRRNUMB(ctx.getMobileNo() != null ? ctx.getMobileNo() : "");
        req.setF_NEWRRTYPE(ctx.getEmail() != null ? ctx.getEmail() : "");
        req.setF_SRVCNAME(serviceName);

        RmsApiResponse response = rmsApiClient.generateOtp(req);
        if (!response.isOtpGenerationAccepted(ctx.getUserId())) {
            LOGGER.warn("RMS OTP generation rejected for userId={} serviceName={} errorNo={} status={}",
                    ctx.getUserId(), response.getSrvcName(), response.getErrorNo(), response.getStatus());
            throw new RmsApiException("OTP generation was rejected by the RMS service.");
        }
        LOGGER.info("RMS OTP generation accepted for userId={} service={}", ctx.getUserId(), serviceName);

        ctx.setStep(RmsAuthSessionContext.Step.OTP_PENDING);
    }

    // ─────────────────────────────────────────────────
    // Step 3: Verify OTP
    // ─────────────────────────────────────────────────

    /**
     * Verifies the OTP entered by the user.
     *
     * @param ctx      Session context (must be in {@code OTP_PENDING} step)
     * @param otp      5-digit OTP
     * @param clientIp HTTP client IP
     * @return fully populated {@link AuthUserDto} on success
     * @throws RmsApiException                on network or service error
     * @throws InvalidRmsCredentialsException on incorrect or expired OTP
     */
    public AuthUserDto verifyOtp(RmsAuthSessionContext ctx, String otp, String clientIp) {
        LOGGER.info("RMS verifyOtp – userId={}", ctx.getUserId());

        if (otp == null || otp.trim().isEmpty()) {
            throw new InvalidRmsCredentialsException("OTP is required.");
        }

        String userKey = normalizeUserId(ctx.getUserId());

        RmsOtpVerifyRequest req = new RmsOtpVerifyRequest();
        req.setF_USERID(ctx.getUserId());
        req.setF_CLNTID(configuredClientId != null ? configuredClientId : (clientIp != null ? clientIp : "1.1.1.1"));
        req.setF_DOMN(otp.trim());
        req.setF_SRVC(otp.trim());
        req.setF_SRVCNAME("VLDTOTP");
        req.setF_AJSTFLAG("APP_LOGIN");

        RmsApiResponse response = rmsApiClient.verifyOtp(req);

        if (!response.isSuccess()) {
            LOGGER.warn("RMS OTP verification rejected for userId={} serviceName={} errorNo={} status={}",
                    ctx.getUserId(), response.getSrvcName(), response.getErrorNo(), response.getStatus());
            throw new InvalidRmsCredentialsException("Invalid OTP. Please enter the valid 5-digit OTP.");
        }
        LOGGER.info("RMS OTP verification accepted for userId={}", ctx.getUserId());

        String confirmedRole = ctx.getSelectedDesignation() != null ? ctx.getSelectedDesignation() : REQUIRED_DESIGNATION;
        otpResendAllowedAt.remove(userKey);

        LOGGER.info("Authentication complete for userId={} role={}", ctx.getUserId(), confirmedRole);
        return new AuthUserDto(
                ctx.getUserId(),
                ctx.getUserName() != null ? ctx.getUserName() : ctx.getUserId(),
                confirmedRole,
                "Y",
                ctx.getEmail(),
                ctx.getMobileNo());
        authUser.setDivisionCode(ctx.getDivisionCode());
        authUser.setDesignation(ctx.getSelectedDesignation() != null ? ctx.getSelectedDesignation() : REQUIRED_DESIGNATION);
        return authUser;
    }

    // ─────────────────────────────────────────────────
    // Test helper accessors (package-private)
    // ─────────────────────────────────────────────────

    void clearCooldownForTesting(String userId) {
        otpResendAllowedAt.remove(normalizeUserId(userId));
    }

    // ─────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────

    private List<String> parseDesignations(String raw) {
        if (raw == null || raw.trim().isEmpty()) {
            return new ArrayList<>();
        }
        String trimmed = raw.trim();
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

    private RmsAuthSessionContext mockValidateCredentials(String userId, String password, String divisionCode) {
        if (password == null || password.trim().isEmpty() || "wrong".equalsIgnoreCase(password.trim()) || "invalid".equalsIgnoreCase(password.trim())) {
            LOGGER.info("MOCK mode – invalid password entered for userId={}", userId);
            throw new InvalidRmsCredentialsException("Invalid User ID or Password.");
        }

        if (divisionCode == null || divisionCode.trim().isEmpty()
                || "UNKNOWN_DIV_999".equalsIgnoreCase(divisionCode.trim())
                || "NONEXISTENT_DIV".equalsIgnoreCase(divisionCode.trim())
                || "INVALID".equalsIgnoreCase(divisionCode.trim())) {
            LOGGER.info("MOCK mode – invalid division code simulation for divisionCode={}", divisionCode);
            throw new InvalidRmsCredentialsException("Invalid Division Code. Please verify your division.");
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
        // Provide Senior DFM, Senior DCM, SR-DCM, Senior SR-DCM, DCM, JDCM
        ctx.setDesignations(Arrays.asList("Senior DFM", "Senior DCM", "SR-DCM", "Senior SR-DCM", "SR-DFM", "DCM", "JDCM"));
        return ctx;
    }

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

    public static class InvalidRmsCredentialsException extends RuntimeException {
        public InvalidRmsCredentialsException(String message) { super(message); }
    }

    public static class OtpResendCooldownException extends RuntimeException {
        private final int retryAfterSeconds;

        public OtpResendCooldownException(int retryAfterSeconds) {
            super("Please wait before requesting another OTP.");
            this.retryAfterSeconds = retryAfterSeconds;
        }

        public int getRetryAfterSeconds() {
            return retryAfterSeconds;
        }
    }

    public static class AccessDeniedException extends RuntimeException {
        public AccessDeniedException(String message) { super(message); }
    }
}
