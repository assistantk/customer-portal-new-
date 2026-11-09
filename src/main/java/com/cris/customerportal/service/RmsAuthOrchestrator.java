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
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Orchestrates the RMS authentication flow:
 *
 *   1. validateCredentials()      – calls ATVLDTUSER; validates credentials and retrieves designations.
 *   2. selectDesignation()        – validates an RMS-returned designation and requests OTP via RTGNRTOTP.
 *   3. verifyOtp()                – calls RTVRFYOTP; on verification success returns a ready-to-store AuthUserDto.
 *
 * Always uses the live RMS APIs; local mock credential validation is disabled.
 */
@Service
public class RmsAuthOrchestrator {

    private static final Logger LOGGER = LoggerFactory.getLogger(RmsAuthOrchestrator.class);

    public static final int OTP_RESEND_COOLDOWN_SECONDS = 60;
    private static final long OTP_RESEND_COOLDOWN_MILLIS = OTP_RESEND_COOLDOWN_SECONDS * 1000L;

    private static final DateTimeFormatter APPLY_DATE_FMT =
            DateTimeFormatter.ofPattern("dd-MM-yyyy");

    private final RmsApiClient rmsApiClient;
    private final String projectName;
    private final String configuredClientId;

    private final ConcurrentMap<String, Long> otpResendAllowedAt = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Object> otpUserLocks = new ConcurrentHashMap<>();

    public RmsAuthOrchestrator(
            RmsApiClient rmsApiClient,
            @Value("${rms.api.project-name:FreightCodeGenerator}") String projectName) {
        this(rmsApiClient, projectName, "1.1.1.1");
    }

    @Autowired
    public RmsAuthOrchestrator(
            RmsApiClient rmsApiClient,
            @Value("${rms.api.project-name:FreightCodeGenerator}") String projectName,
            @Value("${rms.api.client-id:1.1.1.1}") String configuredClientId) {
        this.rmsApiClient = rmsApiClient;
        this.projectName = (projectName != null && !projectName.trim().isEmpty())
                ? projectName.trim() : "FreightCodeGenerator";
        this.configuredClientId = (configuredClientId != null && !configuredClientId.trim().isEmpty())
                ? configuredClientId.trim() : "1.1.1.1";

        LOGGER.info("RmsAuthOrchestrator started in LIVE mode. RMS APIs will be called with projectName={} clientId={}",
                this.projectName, this.configuredClientId);
    }

    // ─────────────────────────────────────────────────
    // Step 1: Validate user credentials + division code
    // ─────────────────────────────────────────────────

    /**
     * Validates the user's credentials via ATVLDTUSER.
     *
     * @param userId       User-entered User ID
     * @param password     Plain-text password
     * @param divisionCode Location / division code (F_LOCN), e.g. "TKD", "NGP"
     * @return populated {@link RmsAuthSessionContext} with {@code step=CREDENTIALS_VALIDATED}
     * @throws RmsApiException                on HTTP or network failure (live mode, no fallback)
     * @throws InvalidRmsCredentialsException on wrong password, unknown user, etc.
     */
    public RmsAuthSessionContext validateCredentials(String userId, String password, String divisionCode) {
        LOGGER.info("RMS validateCredentials request received");

        String applyDate = LocalDate.now().format(APPLY_DATE_FMT);

        RmsLoginRequest req = new RmsLoginRequest();
        req.setF_USERID(userId.trim().toUpperCase(Locale.ROOT));
        req.setF_PSWD(password);
        req.setF_LOCN(divisionCode.trim().toUpperCase(Locale.ROOT));
        req.setF_APLYDATE(applyDate);
        req.setF_ENTYSRVC("FRT_CODE");

        RmsApiResponse response = rmsApiClient.validateUser(req);

        if (!response.isCredentialValidationSuccessful(req.getF_USERID())) {
            LOGGER.warn("ATVLDTUSER authentication rejected: status={}", response.getStatus());
            String rmsError = response.getErrorNo();
            throw new InvalidRmsCredentialsException(
                    rmsError != null && !rmsError.trim().isEmpty()
                            ? rmsError.trim()
                            : "Invalid credentials.");
        }

        List<String> rawDesignations = response.extractRoleIds();
        if (rawDesignations.isEmpty()) {
            LOGGER.warn("ATVLDTUSER returned no designations");
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
        ctx.setLoginRequest(req);

        LOGGER.info("ATVLDTUSER accepted; designation count={}", rawDesignations.size());
        return ctx;
    }

    // ─────────────────────────────────────────────────
    // Step 2: Select designation & trigger OTP
    // ─────────────────────────────────────────────────

    /**
     * Validates the selected designation and requests an OTP from RMS.
     *
     * @param ctx              Session context
     * @param selectedDesig    Designation chosen by the user (e.g. Senior DFM, Senior DCM)
     * @param clientIp         HTTP client IP
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
            validateSelectedDesignation(ctx, selectedDesig);

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
            if (ctx.getDesignations() == null
                    || ctx.getDesignations().stream().noneMatch(
                            d -> d != null && d.equalsIgnoreCase(ctx.getSelectedDesignation()))) {
                throw new InvalidRmsCredentialsException("The selected designation is not valid for this session.");
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

    private void validateSelectedDesignation(RmsAuthSessionContext ctx, String selectedDesig) {
        String raw = selectedDesig == null ? "" : selectedDesig.trim();
        if (raw.isEmpty()) {
            throw new InvalidRmsCredentialsException("Please select a designation.");
        }

        // Confirm selection is in the user's available designations
        boolean inList = ctx.getDesignations() != null && ctx.getDesignations().stream()
                .anyMatch(d -> d.trim().equalsIgnoreCase(raw));
        if (!inList) {
            LOGGER.warn("Selected designation is not in the allowed list");
            throw new InvalidRmsCredentialsException("Selected designation is not valid for your account.");
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
            LOGGER.warn("RMS OTP generation rejected: serviceName={} errorNo={} status={}",
                    response.getSrvcName(), response.getErrorNo(), response.getStatus());
            throw new RmsApiException("OTP generation was rejected by the RMS service.");
        }
        LOGGER.info("RMS OTP generation accepted: service={}", serviceName);

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
        LOGGER.info("RMS OTP verification request received");

        if (ctx == null || ctx.getStep() != RmsAuthSessionContext.Step.OTP_PENDING) {
            throw new InvalidRmsCredentialsException("No OTP is pending. Please restart login.");
        }
        String confirmedRole = ctx.getSelectedDesignation() == null
                ? ""
                : ctx.getSelectedDesignation().trim();
        if (confirmedRole.isEmpty() || ctx.getDesignations().stream()
                .noneMatch(designation -> designation != null
                        && designation.trim().equalsIgnoreCase(confirmedRole))) {
            throw new InvalidRmsCredentialsException("Select a valid designation before verifying the OTP.");
        }
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
            LOGGER.warn("RMS OTP verification rejected: serviceName={} errorNo={} status={}",
                    response.getSrvcName(), response.getErrorNo(), response.getStatus());
            throw new InvalidRmsCredentialsException("Invalid OTP. Please enter the valid 5-digit OTP.");
        }
        LOGGER.info("RMS OTP verification accepted");

        if (ctx.getLoginRequest() != null) {
            ctx.getLoginRequest().setF_ROLEID(confirmedRole);
        }
        otpResendAllowedAt.remove(userKey);

        LOGGER.info("Authentication complete for role={}", confirmedRole);
        AuthUserDto authUser = new AuthUserDto(
                ctx.getUserId(),
                ctx.getUserName() != null ? ctx.getUserName() : ctx.getUserId(),
                confirmedRole,
                "Y",
                ctx.getEmail(),
                ctx.getMobileNo());
        authUser.setDivisionCode(ctx.getDivisionCode());
        authUser.setDesignation(confirmedRole);
        return authUser;
    }

    // ─────────────────────────────────────────────────
    // Test helper accessors (package-private)
    // ─────────────────────────────────────────────────

    public void logout(RmsLoginRequest request, String clientIp) {
        if (request == null) {
            throw new IllegalArgumentException("Logout request cannot be null.");
        }
        LOGGER.info("RMS logout initiated");
        request.setF_SRVCNAME("ATUSERLGOT");
        request.setF_ENTYSRVC("FRT_CODE");
        request.setF_APLYDATE(LocalDate.now().format(APPLY_DATE_FMT));
        if (request.getF_CLNTID() == null || request.getF_CLNTID().trim().isEmpty()) {
            request.setF_CLNTID(configuredClientId != null ? configuredClientId : (clientIp != null ? clientIp : "1.1.1.1"));
        }

        RmsApiResponse response = rmsApiClient.logoutUser(request);
        if (!response.isSuccess()) {
            LOGGER.warn("RMS logout rejected: serviceName={} errorNo={} status={}",
                    response.getSrvcName(), response.getErrorNo(), response.getStatus());
            String errorMsg = response.getMessage();
            if (errorMsg == null || errorMsg.trim().isEmpty()) {
                errorMsg = response.getErrorNo();
            }
            if (errorMsg == null || errorMsg.trim().isEmpty()) {
                errorMsg = "RMS logout rejected.";
            }
            throw new RmsApiException(errorMsg);
        }
        LOGGER.info("RMS logout successfully confirmed by ATUSERLGOT");
    }

    void clearCooldownForTesting(String userId) {
        otpResendAllowedAt.remove(normalizeUserId(userId));
    }

    // ─────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────

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

}
