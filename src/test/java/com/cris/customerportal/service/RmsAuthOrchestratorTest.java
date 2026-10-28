package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;

import static org.junit.jupiter.api.Assertions.*;

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
        orchestrator = new RmsAuthOrchestrator(mockClient, "mock", "FREIGHTCOD");
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
    // Test: Masked contact formatting
    // ─────────────────────────────────────────────────────────────
    @Test
    void testMaskedContactFormatting() {
        RmsAuthSessionContext ctx = orchestrator.validateCredentials("SREEJU", "test@123", "TKD");
        String masked = orchestrator.getMaskedContact(ctx);
        assertNotNull(masked);
        assertTrue(masked.contains("******3868"));
        assertTrue(masked.contains("@gmail.com"));
    }
}
