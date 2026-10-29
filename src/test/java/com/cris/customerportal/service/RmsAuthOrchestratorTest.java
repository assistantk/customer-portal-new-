package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.dto.RmsApiResponse;
import com.cris.customerportal.dto.RmsLoginRequest;
import com.cris.customerportal.dto.RmsOtpGenerateRequest;
import com.cris.customerportal.dto.RmsOtpVerifyRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class RmsAuthOrchestratorTest {

    private RmsAuthOrchestrator orchestrator;

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
        assertTrue(ctx.getDesignations().contains("SR.DCM"));

        // Step 2: Select SR.DCM designation -> triggers OTP
        orchestrator.selectDesignationAndGenerateOtp(ctx, "SR.DCM", "127.0.0.1");
        assertEquals(RmsAuthSessionContext.Step.OTP_PENDING, ctx.getStep());
        assertEquals("SR.DCM", ctx.getSelectedDesignation());

        // Step 3: Verify with mock OTP 123456
        AuthUserDto user = orchestrator.verifyOtp(ctx, "123456", "127.0.0.1");
        assertNotNull(user);
        assertEquals("SREEJU", user.getUserId());
        assertEquals("SR.DCM", user.getUserRole());
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
        // User selects DCM (non-SR.DCM)
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
        orchestrator.selectDesignationAndGenerateOtp(ctx, "SR.DCM", "127.0.0.1");

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
        successResponse.setDesignations("SR.DCM|DCM");
        successResponse.setEmail("krishnan.sreeju@gmail.com");
        successResponse.setMobileNo("9910303868");

        when(clientMock.validateUser(any(RmsLoginRequest.class))).thenReturn(successResponse);

        RmsAuthSessionContext ctx = liveOrchestrator.validateCredentials("SREEJU", "test@123", "TKD");
        assertNotNull(ctx);
        assertEquals("SREEJU", ctx.getUserId());
        assertEquals("SREEJU KRISHNAN", ctx.getUserName());
        assertEquals(2, ctx.getDesignations().size());
        assertTrue(ctx.getDesignations().contains("SR.DCM"));
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
        ctx.setDesignations(java.util.Collections.singletonList("SR.DCM"));
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);

        RmsApiResponse otpGenResponse = new RmsApiResponse();
        otpGenResponse.setErrorNo("0");
        otpGenResponse.setRmrk("OTP GENERATED SUCCESSFULLY");
        when(clientMock.generateOtp(any(RmsOtpGenerateRequest.class))).thenReturn(otpGenResponse);

        liveOrchestrator.selectDesignationAndGenerateOtp(ctx, "SR.DCM", "127.0.0.1");
        assertEquals(RmsAuthSessionContext.Step.OTP_PENDING, ctx.getStep());
        verify(clientMock).generateOtp(any(RmsOtpGenerateRequest.class));

        RmsApiResponse otpVerifyResponse = new RmsApiResponse();
        otpVerifyResponse.setErrorNo("0");
        otpVerifyResponse.setRmrk("OTP VERIFIED");
        when(clientMock.verifyOtp(any(RmsOtpVerifyRequest.class))).thenReturn(otpVerifyResponse);

        AuthUserDto user = liveOrchestrator.verifyOtp(ctx, "59521", "127.0.0.1");
        assertNotNull(user);
        assertEquals("SREEJU", user.getUserId());
        assertEquals("SR.DCM", user.getUserRole());
        verify(clientMock).verifyOtp(any(RmsOtpVerifyRequest.class));
    }
}
