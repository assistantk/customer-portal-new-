package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.dto.RmsApiResponse;
import com.cris.customerportal.dto.RmsLoginRequest;
import com.cris.customerportal.dto.RmsOtpGenerateRequest;
import com.cris.customerportal.dto.RmsOtpVerifyRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;

import java.lang.reflect.Field;
import java.util.concurrent.ConcurrentMap;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RmsAuthOrchestratorTest {

    private RmsAuthOrchestrator orchestrator;

    @Test
    void liveRmsEndpointRequiresHttpsAndRejectsEmbeddedCredentials() {
        assertDoesNotThrow(() ->
                RmsApiClient.requireHttpsBaseUrl("https://rms.example.org/RMS"));
        assertThrows(IllegalStateException.class, () ->
                RmsApiClient.requireHttpsBaseUrl("http://rms.example.org/RMS"));
        assertThrows(IllegalStateException.class, () ->
                RmsApiClient.requireHttpsBaseUrl("https://user@rms.example.org/RMS"));
    }

    @BeforeEach
    void setUp() {
        RmsApiClient mockClient = new RmsApiClient(
                new RestTemplateBuilder(),
                "http://10.60.201.192:7101/RMS",
                "/ATVLDTUSER",
                "/RTGNRTOTP",
                "/RTVRFYOTP",
                5000,
                10000
        );
        // Start in mock mode for local unit testing
        orchestrator = new RmsAuthOrchestrator(mockClient, "mock", "FreightCodeGenerator", "1.1.1.1");
    }

    // ─────────────────────────────────────────────────────────────
    // Test 1: Valid Senior DCM Login Flow (End-to-End Mock)
    // ─────────────────────────────────────────────────────────────
    @Test
    void test1_validSeniorDcmLogin_succeedsEndToEnd() {
        // Step 1: Validate credentials + valid division
        RmsAuthSessionContext ctx = orchestrator.validateCredentials("SREEJU", "test@123", "TKD");
        assertNotNull(ctx);
        assertEquals(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED, ctx.getStep());
        assertEquals("SREEJU", ctx.getUserId());
        assertTrue(ctx.getDesignations().contains("SR-DCM"));

        // Step 2: Select SR-DCM designation -> triggers OTP
        orchestrator.selectDesignationAndGenerateOtp(ctx, "SR-DCM", "127.0.0.1");
        assertEquals(RmsAuthSessionContext.Step.OTP_PENDING, ctx.getStep());
        assertEquals("SR-DCM", ctx.getSelectedDesignation());

        // Step 3: Verify with mock OTP 123456
        AuthUserDto user = orchestrator.verifyOtp(ctx, "123456", "127.0.0.1");
        assertNotNull(user);
        assertEquals("SREEJU", user.getUserId());
        assertEquals("SR-DCM", user.getUserRole());
    }

    // ─────────────────────────────────────────────────────────────
    // Test 2: Invalid Password Fails
    // ─────────────────────────────────────────────────────────────
    @Test
    void test2_invalidPassword_failsAuthentication() {
        assertThrows(RmsAuthOrchestrator.InvalidRmsCredentialsException.class, () ->
                orchestrator.validateCredentials("SREEJU", "wrong", "TKD")
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Test 3: Invalid Division Code Fails
    // ─────────────────────────────────────────────────────────────
    @Test
    void test3_invalidDivisionCode_failsValidation() {
        assertThrows(RmsAuthOrchestrator.InvalidRmsCredentialsException.class, () ->
                orchestrator.validateCredentials("SREEJU", "test@123", "UNKNOWN_DIV_999")
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Test 4: Unknown User ID Fails
    // ─────────────────────────────────────────────────────────────
    @Test
    void test4_unknownUserId_failsAuthentication() {
        assertThrows(RmsAuthOrchestrator.InvalidRmsCredentialsException.class, () ->
                orchestrator.validateCredentials("UNKNOWN", "test@123", "TKD")
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Test 5: Unauthorized Designation Triggers Access Denied
    // ─────────────────────────────────────────────────────────────
    @Test
    void test5_unauthorizedDesignation_triggersAccessDenied() {
        RmsAuthSessionContext ctx = orchestrator.validateCredentials("SREEJU", "test@123", "TKD");
        // User selects DCM (non-SR-DCM)
        assertThrows(RmsAuthOrchestrator.AccessDeniedException.class, () ->
                orchestrator.selectDesignationAndGenerateOtp(ctx, "DCM", "127.0.0.1")
        );
        // Step must NOT move to OTP_PENDING
        assertNotEquals(RmsAuthSessionContext.Step.OTP_PENDING, ctx.getStep());
    }

    // ─────────────────────────────────────────────────────────────
    // Test 6: Invalid OTP Fails Verification
    // ─────────────────────────────────────────────────────────────
    @Test
    void test6_invalidOtp_failsVerification() {
        RmsAuthSessionContext ctx = orchestrator.validateCredentials("SREEJU", "test@123", "TKD");
        orchestrator.selectDesignationAndGenerateOtp(ctx, "SR-DCM", "127.0.0.1");

        // Wrong OTP
        assertThrows(RmsAuthOrchestrator.InvalidRmsCredentialsException.class, () ->
                orchestrator.verifyOtp(ctx, "000000", "127.0.0.1")
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Test 7: Simulated Service Timeout / Unavailable
    // ─────────────────────────────────────────────────────────────
    @Test
    void test7_serviceTimeout_throwsRmsApiException() {
        assertThrows(RmsApiException.class, () ->
                orchestrator.validateCredentials("TIMEOUT", "test@123", "TKD")
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Test 8: Masked contact formatting
    // ─────────────────────────────────────────────────────────────
    @Test
    void testMaskedContactFormatting() {
        RmsAuthSessionContext ctx = orchestrator.validateCredentials("SREEJU", "test@123", "TKD");
        String masked = orchestrator.getMaskedContact(ctx);
        assertNotNull(masked);
        assertTrue(masked.contains("******3868"));
        assertTrue(masked.contains("@gmail.com"));
    }

    // ─────────────────────────────────────────────────────────────
    // Test 9: Live Mode with Real RMS API Client (End-to-End Flow)
    // ─────────────────────────────────────────────────────────────
    @Test
    void test9_liveMode_validCredentials_advancesToDesignation() {
        RmsApiClient clientMock = mock(RmsApiClient.class);
        RmsAuthOrchestrator liveOrchestrator = new RmsAuthOrchestrator(clientMock, "live", "FreightCodeGenerator", "1.1.1.1");
        assertFalse(liveOrchestrator.isMockMode());

        RmsApiResponse successResponse = new RmsApiResponse();
        successResponse.setErrorNo("0");
        successResponse.setRmrk("SUCCESS");
        successResponse.setUserId("SREEJU");
        successResponse.setUserName("SREEJU KRISHNAN");
        successResponse.setDesignations("SR-DCM|DCM");
        successResponse.setEmail("krishnan.sreeju@gmail.com");
        successResponse.setMobileNo("9910303868");

        when(clientMock.validateUser(any(RmsLoginRequest.class))).thenReturn(successResponse);

        RmsAuthSessionContext ctx = liveOrchestrator.validateCredentials("SREEJU", "test@123", "TKD");
        assertNotNull(ctx);
        assertEquals("SREEJU", ctx.getUserId());
        assertEquals("SREEJU KRISHNAN", ctx.getUserName());
        assertEquals(2, ctx.getDesignations().size());
        assertTrue(ctx.getDesignations().contains("SR-DCM"));
        assertTrue(ctx.getDesignations().contains("DCM"));
        verify(clientMock).validateUser(any(RmsLoginRequest.class));
    }

    @Test
    void test10_liveMode_invalidCredentials_rejectedWithoutMockFallback() {
        RmsApiClient clientMock = mock(RmsApiClient.class);
        RmsAuthOrchestrator liveOrchestrator = new RmsAuthOrchestrator(clientMock, "live", "FreightCodeGenerator", "1.1.1.1");

        RmsApiResponse failResponse = new RmsApiResponse();
        failResponse.setErrorNo("1");
        failResponse.setRmrk("INVALID USER ID OR PASSWORD");

        when(clientMock.validateUser(any(RmsLoginRequest.class))).thenReturn(failResponse);

        assertThrows(RmsAuthOrchestrator.InvalidRmsCredentialsException.class, () ->
                liveOrchestrator.validateCredentials("SREEJU", "wrongpass", "TKD")
        );
        verify(clientMock).validateUser(any(RmsLoginRequest.class));
    }

    @Test
    void test11_liveMode_serverUnavailable_throwsApiExceptionWithoutMockFallback() {
        RmsApiClient clientMock = mock(RmsApiClient.class);
        RmsAuthOrchestrator liveOrchestrator = new RmsAuthOrchestrator(clientMock, "live", "FreightCodeGenerator", "1.1.1.1");

        when(clientMock.validateUser(any(RmsLoginRequest.class)))
                .thenThrow(new RmsApiException("Connection timed out"));

        RmsApiException ex = assertThrows(RmsApiException.class, () ->
                liveOrchestrator.validateCredentials("SREEJU", "test@123", "TKD")
        );
        assertTrue(ex.getMessage().contains("Connection timed out"));
        verify(clientMock).validateUser(any(RmsLoginRequest.class));
    }

    @Test
    void test12_liveMode_otpGenerationAndVerification_succeeds() {
        RmsApiClient clientMock = mock(RmsApiClient.class);
        RmsAuthOrchestrator liveOrchestrator = new RmsAuthOrchestrator(clientMock, "live", "FreightCodeGenerator", "1.1.1.1");

        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setUserName("SREEJU KRISHNAN");
        ctx.setEmail("krishnan.sreeju@gmail.com");
        ctx.setMobileNo("9910303868");
        ctx.setDesignations(java.util.Collections.singletonList("SR-DCM"));
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);

        RmsApiResponse otpGenResponse = new RmsApiResponse();
        otpGenResponse.setErrorNo("0");
        otpGenResponse.setRmrk("OTP GENERATED SUCCESSFULLY");
        when(clientMock.generateOtp(any(RmsOtpGenerateRequest.class))).thenReturn(otpGenResponse);

        liveOrchestrator.selectDesignationAndGenerateOtp(ctx, "SR-DCM", "127.0.0.1");
        assertEquals(RmsAuthSessionContext.Step.OTP_PENDING, ctx.getStep());
        verify(clientMock).generateOtp(argThat(req -> "GNRTOTP".equals(req.getF_SRVCNAME())));

        RmsApiResponse otpVerifyResponse = new RmsApiResponse();
        otpVerifyResponse.setErrorNo("0");
        otpVerifyResponse.setRmrk("OTP VERIFIED");
        when(clientMock.verifyOtp(any(RmsOtpVerifyRequest.class))).thenReturn(otpVerifyResponse);

        AuthUserDto user = liveOrchestrator.verifyOtp(ctx, "59521", "127.0.0.1");
        assertNotNull(user);
        assertEquals("SREEJU", user.getUserId());
        assertEquals("SR-DCM", user.getUserRole());
        verify(clientMock).verifyOtp(any(RmsOtpVerifyRequest.class));
    }

    @Test
    void resendOtp_isBlockedForOneMinuteAfterSuccessfulInitialGeneration() {
        RmsApiClient clientMock = mock(RmsApiClient.class);
        RmsApiResponse successResponse = new RmsApiResponse();
        successResponse.setErrorNo("0");
        when(clientMock.generateOtp(any(RmsOtpGenerateRequest.class))).thenReturn(successResponse);
        RmsAuthOrchestrator liveOrchestrator =
                new RmsAuthOrchestrator(clientMock, "live", "FreightCodeGenerator", "1.1.1.1");

        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setDesignations(java.util.Collections.singletonList("SR-DCM"));
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);

        liveOrchestrator.selectDesignationAndGenerateOtp(ctx, "SR-DCM", "127.0.0.1");

        assertEquals(RmsAuthOrchestrator.OTP_RESEND_COOLDOWN_SECONDS,
                liveOrchestrator.getResendCooldownSeconds("sreeju"));
        RmsAuthOrchestrator.OtpResendCooldownException exception = assertThrows(
                RmsAuthOrchestrator.OtpResendCooldownException.class,
                () -> liveOrchestrator.resendOtp(ctx, "127.0.0.1"));
        assertTrue(exception.getRetryAfterSeconds() > 0);

        RmsAuthSessionContext secondContext = new RmsAuthSessionContext();
        secondContext.setUserId("SREEJU");
        secondContext.setDesignations(java.util.Collections.singletonList("SR-DCM"));
        secondContext.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);
        assertThrows(RmsAuthOrchestrator.OtpResendCooldownException.class,
                () -> liveOrchestrator.selectDesignationAndGenerateOtp(
                        secondContext, "SR-DCM", "127.0.0.1"));
        verify(clientMock, times(1)).generateOtp(any(RmsOtpGenerateRequest.class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void subsequentLoginOnSameDayUsesRmsResendOperation() throws Exception {
        RmsApiClient clientMock = mock(RmsApiClient.class);
        RmsApiResponse successResponse = new RmsApiResponse();
        successResponse.setErrorNo("0");
        when(clientMock.generateOtp(any(RmsOtpGenerateRequest.class))).thenReturn(successResponse);
        RmsAuthOrchestrator liveOrchestrator =
                new RmsAuthOrchestrator(clientMock, "live", "FreightCodeGenerator", "1.1.1.1");

        RmsAuthSessionContext firstContext = new RmsAuthSessionContext();
        firstContext.setUserId("SREEJU");
        firstContext.setDesignations(java.util.Collections.singletonList("SR-DCM"));
        firstContext.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);
        liveOrchestrator.selectDesignationAndGenerateOtp(firstContext, "SR-DCM", "127.0.0.1");

        Field cooldownField = RmsAuthOrchestrator.class.getDeclaredField("otpResendAllowedAt");
        cooldownField.setAccessible(true);
        ConcurrentMap<String, Long> cooldowns =
                (ConcurrentMap<String, Long>) cooldownField.get(liveOrchestrator);
        cooldowns.put("SREEJU", System.currentTimeMillis() - 1);

        RmsAuthSessionContext secondContext = new RmsAuthSessionContext();
        secondContext.setUserId("SREEJU");
        secondContext.setDesignations(java.util.Collections.singletonList("SR-DCM"));
        secondContext.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);
        liveOrchestrator.selectDesignationAndGenerateOtp(secondContext, "SR-DCM", "127.0.0.1");

        org.mockito.ArgumentCaptor<RmsOtpGenerateRequest> requestCaptor =
                forClass(RmsOtpGenerateRequest.class);
        verify(clientMock, times(2)).generateOtp(requestCaptor.capture());
        assertEquals("GNRTOTP", requestCaptor.getAllValues().get(0).getF_SRVCNAME());
        assertEquals("REGNRTOTP", requestCaptor.getAllValues().get(1).getF_SRVCNAME());
    }

    @Test
    void repeatedInitialGenerationDoesNotCallRmsAgainOnceOtpIsPending() {
        RmsApiClient clientMock = mock(RmsApiClient.class);
        RmsApiResponse successResponse = new RmsApiResponse();
        successResponse.setErrorNo("0");
        when(clientMock.generateOtp(any(RmsOtpGenerateRequest.class))).thenReturn(successResponse);
        RmsAuthOrchestrator liveOrchestrator =
                new RmsAuthOrchestrator(clientMock, "live", "FreightCodeGenerator", "1.1.1.1");

        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setDesignations(java.util.Collections.singletonList("SR-DCM"));
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);

        liveOrchestrator.selectDesignationAndGenerateOtp(ctx, "SR-DCM", "127.0.0.1");

        assertThrows(RmsAuthOrchestrator.InvalidRmsCredentialsException.class,
                () -> liveOrchestrator.selectDesignationAndGenerateOtp(ctx, "SR-DCM", "127.0.0.1"));
        verify(clientMock, times(1)).generateOtp(any(RmsOtpGenerateRequest.class));
    }

    @Test
    void test13_liveMode_roleIdAsJsonArray_parsesSuccessfully() throws Exception {
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        String jsonResponse = "{\n" +
                "  \"F_ERRORNO\": 0,\n" +
                "  \"F_RMRK\": \"SUCCESS\",\n" +
                "  \"F_USERID\": \"SREEJU\",\n" +
                "  \"F_ROLEID\": [\"SR-DCM\", \"DCM\"]\n" +
                "}";

        RmsApiResponse parsed = mapper.readValue(jsonResponse, RmsApiResponse.class);
        assertTrue(parsed.isSuccess());
        assertEquals(2, parsed.extractAllDesignations().size());
        assertTrue(parsed.extractAllDesignations().contains("SR-DCM"));
        assertTrue(parsed.extractAllDesignations().contains("DCM"));

        RmsApiClient clientMock = mock(RmsApiClient.class);
        when(clientMock.validateUser(any(RmsLoginRequest.class))).thenReturn(parsed);

        RmsAuthOrchestrator liveOrchestrator = new RmsAuthOrchestrator(clientMock, "live", "FreightCodeGenerator", "1.1.1.1");
        RmsAuthSessionContext ctx = liveOrchestrator.validateCredentials("SREEJU", "test@123", "CSTM");

        assertNotNull(ctx);
        assertEquals("SREEJU", ctx.getUserId());
        assertEquals(2, ctx.getDesignations().size());
        assertTrue(ctx.getDesignations().contains("SR-DCM"));
    }

    @Test
    void test14_liveMode_roleIdAsJsonArrayOfObjects_parsesSuccessfully() throws Exception {
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        String jsonResponse = "{\n" +
                "  \"F_ERRORNO\": \"0\",\n" +
                "  \"F_RMRK\": \"SUCCESS\",\n" +
                "  \"F_USERID\": \"SREEJU\",\n" +
                "  \"F_ROLEID\": [\n" +
                "    {\"ROLEID\": \"SR-DCM\", \"ROLEDESC\": \"Senior DCM\"},\n" +
                "    {\"ROLEID\": \"DCM\", \"ROLEDESC\": \"Divisional Commercial Manager\"}\n" +
                "  ]\n" +
                "}";

        RmsApiResponse parsed = mapper.readValue(jsonResponse, RmsApiResponse.class);
        assertTrue(parsed.isSuccess());
        assertEquals(2, parsed.extractAllDesignations().size());
        assertTrue(parsed.extractAllDesignations().contains("SR-DCM"));
        assertTrue(parsed.extractAllDesignations().contains("DCM"));
    }

    @Test
    void liveMode_emptyErrorNoForGnrtOtpAcknowledgement_advancesToOtpVerification() throws Exception {
        String jsonResponse = "{\n" +
                "  \"F_AJSTFLAG\": \"APP_LOGIN\",\n" +
                "  \"F_CLNTID\": \"1.1.1.1\",\n" +
                "  \"F_CNSR\": \"FreightCodeGenerator\",\n" +
                "  \"F_ERRORNO\": \"\",\n" +
                "  \"F_NEWRRNUMB\": \"9910303868\",\n" +
                "  \"F_NEWRRTYPE\": \"krishnan.sreeju@gmail.com\",\n" +
                "  \"F_USERID\": \"SREEJU\",\n" +
                "  \"F_SRVCNAME\": \"GNRTOTP\"\n" +
                "}";
        RmsApiResponse response = new com.fasterxml.jackson.databind.ObjectMapper()
                .readValue(jsonResponse, RmsApiResponse.class);
        assertFalse(response.isSuccess());
        assertTrue(response.isOtpGenerationAccepted("SREEJU"));
        assertFalse(response.isOtpGenerationAccepted("OTHERUSER"));

        RmsApiClient clientMock = mock(RmsApiClient.class);
        when(clientMock.generateOtp(any(RmsOtpGenerateRequest.class))).thenReturn(response);
        RmsAuthOrchestrator liveOrchestrator =
                new RmsAuthOrchestrator(clientMock, "live", "FreightCodeGenerator", "1.1.1.1");
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setEmail("krishnan.sreeju@gmail.com");
        ctx.setMobileNo("9910303868");
        ctx.setDesignations(java.util.Collections.singletonList("SR-DCM"));
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);

        liveOrchestrator.selectDesignationAndGenerateOtp(ctx, "SR-DCM", "127.0.0.1");

        assertEquals(RmsAuthSessionContext.Step.OTP_PENDING, ctx.getStep());
        verify(clientMock).generateOtp(any(RmsOtpGenerateRequest.class));
    }

    @Test
    void otpGenerationAcknowledgementWithFailureRemark_isRejected() throws Exception {
        String jsonResponse = "{\n" +
                "  \"F_ERRORNO\": \"\",\n" +
                "  \"F_RMRK\": \"OTP generation failed\",\n" +
                "  \"F_USERID\": \"SREEJU\",\n" +
                "  \"F_SRVCNAME\": \"GNRTOTP\"\n" +
                "}";
        RmsApiResponse response = new com.fasterxml.jackson.databind.ObjectMapper()
                .readValue(jsonResponse, RmsApiResponse.class);

        assertFalse(response.isOtpGenerationAccepted("SREEJU"));
    }

    @Test
    void otpGenerationAcknowledgementWithoutServiceOrErrorFields_isAcceptedForMatchingUser() throws Exception {
        String jsonResponse = "{\n" +
                "  \"F_USERID\": \"SREEJU\"\n" +
                "}";
        RmsApiResponse response = new com.fasterxml.jackson.databind.ObjectMapper()
                .readValue(jsonResponse, RmsApiResponse.class);

        assertTrue(response.isOtpGenerationAccepted("SREEJU"));
        assertFalse(response.isOtpGenerationAccepted("OTHERUSER"));
    }

    @Test
    void resendOtp_usesRegnrtOtpServiceName() {
        RmsApiClient clientMock = mock(RmsApiClient.class);
        RmsApiResponse successResponse = new RmsApiResponse();
        successResponse.setErrorNo("0");
        when(clientMock.generateOtp(any(RmsOtpGenerateRequest.class))).thenReturn(successResponse);

        RmsAuthOrchestrator liveOrchestrator =
                new RmsAuthOrchestrator(clientMock, "live", "FreightCodeGenerator", "1.1.1.1");
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setSelectedDesignation("SR-DCM");
        ctx.setDesignations(java.util.Collections.singletonList("SR-DCM"));
        ctx.setEmail("krishnan.sreeju@gmail.com");
        ctx.setMobileNo("9910303868");
        ctx.setStep(RmsAuthSessionContext.Step.OTP_PENDING);

        liveOrchestrator.resendOtp(ctx, "127.0.0.1");

        verify(clientMock).generateOtp(argThat(req -> "REGNRTOTP".equals(req.getF_SRVCNAME())
                && "SREEJU".equals(req.getF_USERID())
                && "1.1.1.1".equals(req.getF_CLNTID())
                && "FreightCodeGenerator".equals(req.getF_CNSR())
                && "9910303868".equals(req.getF_NEWRRNUMB())
                && "krishnan.sreeju@gmail.com".equals(req.getF_NEWRRTYPE())));
    }

    @Test
    void resendOtp_blankErrorNoRegnrtOtpAcknowledgement_isAccepted() throws Exception {
        String jsonResponse = "{\n" +
                "  \"F_ERRORNO\": \"\",\n" +
                "  \"F_USERID\": \"SREEJU\",\n" +
                "  \"F_SRVCNAME\": \"REGNRTOTP\"\n" +
                "}";
        RmsApiResponse response = new com.fasterxml.jackson.databind.ObjectMapper()
                .readValue(jsonResponse, RmsApiResponse.class);

        assertTrue(response.isOtpGenerationAccepted("SREEJU"));
    }
}
