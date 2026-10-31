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
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;

/**
 * Orchestrates the RMS authentication flow:
 *
 *   1. validateCredentials()      – calls ATVLDTUSER; validates credentials and retrieves designations.
 *   2. selectDesignation()        – enforces Senior DCM / Senior DFM authorization; generates OTP via RTGNRTOTP.
 *   3. verifyOtp()                – calls RTVRFYOTP; on verification success returns a ready-to-store AuthUserDto.
 *
 * Defaults to LIVE mode in production (rms.auth.mode=live).
 * Offline mock mode (rms.auth.mode=mock) provides genuine in-memory OTP generation, email delivery, and verification.
 */
@Service
public class RmsAuthOrchestrator {

    private static final Logger LOGGER = LoggerFactory.getLogger(RmsAuthOrchestrator.class);

    /** Required canonical designation code for Senior DCM portal access. */
    public static final String REQUIRED_DESIGNATION = "SR-DCM";
    public static final int OTP_RESEND_COOLDOWN_SECONDS = 60;
    private static final long OTP_RESEND_COOLDOWN_MILLIS = OTP_RESEND_COOLDOWN_SECONDS * 1000L;
    private static final long OTP_EXPIRY_MILLIS = 10 * 60 * 1000L; // 10 minutes

    private static final DateTimeFormatter APPLY_DATE_FMT =
            DateTimeFormatter.ofPattern("dd-MM-yyyy");

    private final RmsApiClient rmsApiClient;
    private final boolean mockMode;
    private final String projectName;
    private final String configuredClientId;
    private final JavaMailSender mailSender;
    private final String fromEmail;
    private final SecureRandom secureRandom = new SecureRandom();

    private final ConcurrentMap<String, Long> otpResendAllowedAt = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Object> otpUserLocks = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, LocalDate> otpGeneratedOn = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, UserOtpRecord> userOtpStore = new ConcurrentHashMap<>();

    public RmsAuthOrchestrator(
            RmsApiClient rmsApiClient,
            @Value("${rms.auth.mode:live}") String authMode,
            @Value("${rms.api.project-name:FreightCodeGenerator}") String projectName) {
        this(rmsApiClient, authMode, projectName, "1.1.1.1", null, "freightcod@cris.org.in");
    }

    public RmsAuthOrchestrator(
            RmsApiClient rmsApiClient,
            String authMode,
            String projectName,
            String configuredClientId) {
        this(rmsApiClient, authMode, projectName, configuredClientId, null, "freightcod@cris.org.in");
    }

    @Autowired
    public RmsAuthOrchestrator(
            RmsApiClient rmsApiClient,
            @Value("${rms.auth.mode:live}") String authMode,
            @Value("${rms.api.project-name:FreightCodeGenerator}") String projectName,
            @Value("${rms.api.client-id:1.1.1.1}") String configuredClientId,
            @Autowired(required = false) JavaMailSender mailSender,
            @Value("${spring.mail.username:freightcod@cris.org.in}") String fromEmail) {
        this.rmsApiClient = rmsApiClient;
        this.mockMode = "mock".equalsIgnoreCase(authMode != null ? authMode.trim() : "");
        this.projectName = (projectName != null && !projectName.trim().isEmpty())
                ? projectName.trim() : "FreightCodeGenerator";
        this.configuredClientId = (configuredClientId != null && !configuredClientId.trim().isEmpty())
                ? configuredClientId.trim() : "1.1.1.1";
        this.mailSender = mailSender;
        this.fromEmail = (fromEmail != null && !fromEmail.trim().isEmpty())
                ? fromEmail.trim() : "freightcod@cris.org.in";

        if (this.mockMode) {
            LOGGER.warn("RmsAuthOrchestrator started in DEVELOPMENT MOCK mode (AUTH_MODE=mock). Genuine random OTP generation, email dispatch, and verification active.");
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
     * Validates the selected designation and triggers OTP generation/regeneration.
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

            LocalDate today = LocalDate.now();
            LocalDate lastGenerated = otpGeneratedOn.get(userKey);
            boolean alreadyGeneratedToday = today.equals(lastGenerated);
            String serviceName = alreadyGeneratedToday ? "REGNRTOTP" : "GNRTOTP";

            dispatchOtp(ctx, clientIp, serviceName, alreadyGeneratedToday);
            otpGeneratedOn.put(userKey, today);
            startOtpResendCooldown(userKey);
        }
    }

    /**
     * Resends the existing OTP using the REGNRTOTP service.
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

            dispatchOtp(ctx, clientIp, "REGNRTOTP", true);
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
            RmsAuthSessionContext ctx, String clientIp, String serviceName, boolean isResendOrRegenerate) {
        String userKey = normalizeUserId(ctx.getUserId());
        LocalDate today = LocalDate.now();

        if (mockMode) {
            String otp;
            UserOtpRecord existingRecord = userOtpStore.get(userKey);
            if (isResendOrRegenerate && existingRecord != null && today.equals(existingRecord.getGeneratedDate())) {
                // Reuse active OTP and extend expiry
                otp = existingRecord.getOtp();
                existingRecord.extendExpiry(OTP_EXPIRY_MILLIS);
                LOGGER.info("Regenerating/resending active OTP for userId={}", ctx.getUserId());
            } else {
                // Generate genuine random 5-digit OTP
                otp = generateRandomOtp();
                UserOtpRecord newRecord = new UserOtpRecord(otp, today, OTP_EXPIRY_MILLIS);
                userOtpStore.put(userKey, newRecord);
                LOGGER.info("Genuine random 5-digit OTP generated for userId={}", ctx.getUserId());
            }

            // Deliver OTP via email to user's registered email address
            sendOtpEmail(ctx.getEmail(), ctx.getUserId(), otp, isResendOrRegenerate);
        } else {
            RmsOtpGenerateRequest req = new RmsOtpGenerateRequest();
            req.setF_USERID(ctx.getUserId());
            req.setF_CLNTID(configuredClientId != null ? configuredClientId : (clientIp != null ? clientIp : "1.1.1.1"));
            req.setF_CNSR(projectName);
            req.setF_NEWRRNUMB(ctx.getMobileNo() != null ? ctx.getMobileNo() : "");
            req.setF_NEWRRTYPE(ctx.getEmail() != null ? ctx.getEmail() : "");
            req.setF_SRVCNAME(serviceName);

            RmsApiResponse response = rmsApiClient.generateOtp(req);
            if (!response.isOtpGenerationAccepted(ctx.getUserId())) {
                String msg = response.getMessage() != null ? response.getMessage()
                        : "OTP generation failed. Please try again.";
                LOGGER.warn("RTGNRTOTP response rejected for userId={}: serviceName={} errorNo={} status={} message={}",
                        ctx.getUserId(), response.getSrvcName(), response.getErrorNo(), response.getStatus(), msg);
                throw new RmsApiException(msg);
            }
            LOGGER.info("RTGNRTOTP ({}) accepted for userId={}", serviceName, ctx.getUserId());
        }

        ctx.setStep(RmsAuthSessionContext.Step.OTP_PENDING);
    }

    private String generateRandomOtp() {
        int num = secureRandom.nextInt(100_000);
        return String.format(Locale.ROOT, "%05d", num);
    }

    private void sendOtpEmail(String recipientEmail, String userId, String otp, boolean isResend) {
        if (recipientEmail == null || recipientEmail.trim().isEmpty() || !recipientEmail.contains("@")) {
            LOGGER.warn("No valid email registered for userId={}; cannot send OTP email", userId);
            return;
        }

        if (mailSender == null) {
            LOGGER.warn("JavaMailSender not configured; skipping email dispatch to {}", maskEmail(recipientEmail));
            return;
        }

        try {
            SimpleMailMessage mail = new SimpleMailMessage();
            mail.setFrom(fromEmail);
            mail.setTo(recipientEmail);
            String subjectAction = isResend ? "Regenerated" : "Verification";
            mail.setSubject("CRIS Customer Portal - " + subjectAction + " OTP");
            String bodyAction = isResend ? "regenerated" : "requested";
            mail.setText("Dear User,\n\n"
                    + "Your One-Time Password (OTP) " + bodyAction + " for Indian Railways Customer Registration Portal login is:\n\n"
                    + "    " + otp + "\n\n"
                    + "This OTP is valid for 10 minutes.\n"
                    + "If you did not initiate this request, please contact CRIS support immediately.\n\n"
                    + "Regards,\n"
                    + "Centre for Railway Information Systems (CRIS)");
            mailSender.send(mail);
            LOGGER.info("Genuine OTP successfully dispatched via email to {} for userId={}",
                    maskEmail(recipientEmail), userId);
        } catch (Exception ex) {
            LOGGER.error("Failed to dispatch OTP email to {} for userId={}: {}",
                    maskEmail(recipientEmail), userId, ex.getMessage());
        }
    }

    private String maskEmail(String email) {
        if (email == null || !email.contains("@")) return "******";
        int at = email.indexOf('@');
        return (at > 1 ? email.charAt(0) + "***" : "***") + email.substring(at);
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

        if (mockMode) {
            UserOtpRecord record = userOtpStore.get(userKey);
            if (record == null) {
                LOGGER.info("No active OTP record found for userId={}", ctx.getUserId());
                throw new InvalidRmsCredentialsException("Invalid OTP. Please enter the valid 5-digit OTP.");
            }
            if (record.isExpired()) {
                LOGGER.info("OTP expired for userId={}", ctx.getUserId());
                userOtpStore.remove(userKey);
                throw new InvalidRmsCredentialsException("OTP has expired. Please request a new OTP.");
            }
            if (!record.getOtp().equals(otp.trim())) {
                LOGGER.info("Incorrect OTP entered for userId={}", ctx.getUserId());
                throw new InvalidRmsCredentialsException("Invalid OTP. Please enter the valid 5-digit OTP.");
            }

            // OTP verified successfully; consume it immediately (single-use)
            record.setVerified(true);
            userOtpStore.remove(userKey);
            LOGGER.info("Genuine 5-digit OTP successfully verified for userId={}", ctx.getUserId());
        } else {
            RmsOtpVerifyRequest req = new RmsOtpVerifyRequest();
            req.setF_USERID(ctx.getUserId());
            req.setF_CLNTID(configuredClientId != null ? configuredClientId : (clientIp != null ? clientIp : "1.1.1.1"));
            req.setF_DOMN(otp.trim());
            req.setF_SRVC(otp.trim());
            req.setF_SRVCNAME("VLDTOTP");
            req.setF_AJSTFLAG("APP_LOGIN");

            RmsApiResponse response = rmsApiClient.verifyOtp(req);

            if (!response.isSuccess()) {
                String msg = response.getMessage() != null ? response.getMessage() : "Invalid OTP.";
                LOGGER.warn("RTVRFYOTP rejected for userId={}: srvcName={} errorNo={} status={} message={}",
                        ctx.getUserId(), response.getSrvcName(), response.getErrorNo(), response.getStatus(), msg);
                throw new InvalidRmsCredentialsException("Invalid OTP. Please enter the valid 5-digit OTP.");
            }
            LOGGER.info("RTVRFYOTP accepted for userId={}", ctx.getUserId());
        }

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
    }

    // ─────────────────────────────────────────────────
    // Test helper accessors (package-private)
    // ─────────────────────────────────────────────────

    String getActiveOtpForTesting(String userId) {
        UserOtpRecord r = userOtpStore.get(normalizeUserId(userId));
        return r != null ? r.getOtp() : null;
    }

    void expireOtpForTesting(String userId) {
        UserOtpRecord r = userOtpStore.get(normalizeUserId(userId));
        if (r != null) {
            r.setExpiresAtMillisForTesting(System.currentTimeMillis() - 1000);
        }
    }

    void resetDailyOtpForTesting(String userId) {
        String key = normalizeUserId(userId);
        otpGeneratedOn.remove(key);
        userOtpStore.remove(key);
        otpResendAllowedAt.remove(key);
    }

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

    public static class UserOtpRecord {
        private final String otp;
        private final LocalDate generatedDate;
        private final long createdAtMillis;
        private volatile long expiresAtMillis;
        private volatile boolean verified;

        public UserOtpRecord(String otp, LocalDate generatedDate, long ttlMillis) {
            this.otp = otp;
            this.generatedDate = generatedDate;
            this.createdAtMillis = System.currentTimeMillis();
            this.expiresAtMillis = this.createdAtMillis + ttlMillis;
            this.verified = false;
        }

        public String getOtp() {
            return otp;
        }

        public LocalDate getGeneratedDate() {
            return generatedDate;
        }

        public boolean isExpired() {
            return System.currentTimeMillis() > expiresAtMillis;
        }

        public void extendExpiry(long additionalMillis) {
            this.expiresAtMillis = Math.max(this.expiresAtMillis, System.currentTimeMillis() + additionalMillis);
        }

        public boolean isVerified() {
            return verified;
        }

        public void setVerified(boolean verified) {
            this.verified = verified;
        }

        public void setExpiresAtMillisForTesting(long expiresAtMillis) {
            this.expiresAtMillis = expiresAtMillis;
        }
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
