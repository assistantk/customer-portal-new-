package com.cris.customerportal.controller;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.dto.RmsSelectDesignationRequest;
import com.cris.customerportal.dto.RmsValidateUserRequest;
import com.cris.customerportal.dto.RmsVerifyOtpRequest;
import com.cris.customerportal.service.AuthService;
import com.cris.customerportal.service.CaptchaService;
import com.cris.customerportal.service.RmsApiClient;
import com.cris.customerportal.service.RmsAuthOrchestrator;
import com.cris.customerportal.service.RmsAuthSessionContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import java.util.Arrays;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RmsAuthControllerTest {

    private AuthController controller;
    private RmsAuthOrchestrator orchestrator;
    private CaptchaService captchaService;
    private HttpServletRequest request;
    private HttpSession session;

    @BeforeEach
    void setUp() {
        AuthService authService = mock(AuthService.class);
        captchaService = mock(CaptchaService.class);

        RmsApiClient mockClient = new RmsApiClient(
                new RestTemplateBuilder(),
                "http://10.60.201.192:7101/RMS",
                "/ATVLDTUSER",
                "/RTGNRTOTP",
                "/RTVRFYOTP",
                5000,
                10000
        );
        orchestrator = spy(new RmsAuthOrchestrator(mockClient, "mock", "FREIGHTCOD"));
        controller = new AuthController(authService, captchaService, orchestrator);

        request = mock(HttpServletRequest.class);
        session = mock(HttpSession.class);
        when(request.getSession(true)).thenReturn(session);
        when(request.getSession(false)).thenReturn(session);
    }

    // ─────────────────────────────────────────────────────────────
    // Step 1: validateUser Endpoint Tests
    // ─────────────────────────────────────────────────────────────
    @Test
    void validateUser_withValidCredentialsAndDivision_returnsOkWithDesignations() {
        RmsValidateUserRequest req = new RmsValidateUserRequest("SREEJU", "test@123", "TKD");
        req.setCaptchaInput("AbCd23");
        when(captchaService.consumeChallenge(session, "AbCd23")).thenReturn(true);

        ResponseEntity<?> response = controller.validateUser(req, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertTrue((Boolean) body.get("success"));
        verify(captchaService).consumeChallenge(session, "AbCd23");
        verify(session).setAttribute(eq(AuthController.RMS_SESSION_CONTEXT_KEY), any(RmsAuthSessionContext.class));
    }

    @Test
    void validateUser_invalidCaptcha_rejectsBeforeCredentialValidation() {
        RmsValidateUserRequest req = new RmsValidateUserRequest("SREEJU", "test@123", "TKD");
        req.setCaptchaInput("wrong");
        when(captchaService.consumeChallenge(session, "wrong")).thenReturn(false);

        ResponseEntity<?> response = controller.validateUser(req, request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("CAPTCHA validation failed. Please refresh and try again.",
                ((Map<?, ?>) response.getBody()).get("message"));
        verify(orchestrator, never()).validateCredentials(anyString(), anyString(), anyString());
        verify(session, never()).setAttribute(eq(AuthController.RMS_SESSION_CONTEXT_KEY), any());
    }

    @Test
    void validateUser_missingCaptcha_rejectsRequest() {
        RmsValidateUserRequest req = new RmsValidateUserRequest("SREEJU", "test@123", "TKD");

        ResponseEntity<?> response = controller.validateUser(req, request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verify(captchaService, never()).consumeChallenge(any(), anyString());
        verify(orchestrator, never()).validateCredentials(anyString(), anyString(), anyString());
    }

    @Test
    void validateUser_missingFields_returnsBadRequest() {
        RmsValidateUserRequest req = new RmsValidateUserRequest("", "pass", "TKD");
        req.setCaptchaInput("AbCd23");

        ResponseEntity<?> response = controller.validateUser(req, request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void validateUser_invalidDivision_returnsUnauthorizedOrBadRequest() {
        RmsValidateUserRequest req = new RmsValidateUserRequest("SREEJU", "test@123", "NONEXISTENT_DIV");
        req.setCaptchaInput("AbCd23");
        when(captchaService.consumeChallenge(session, "AbCd23")).thenReturn(true);

        ResponseEntity<?> response = controller.validateUser(req, request);

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertFalse((Boolean) body.get("success"));
    }

    // ─────────────────────────────────────────────────────────────
    // Step 2: selectDesignation Endpoint Tests
    // ─────────────────────────────────────────────────────────────
    @Test
    void selectDesignation_srDcm_returnsOkWithMaskedContact() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setMobileNo("9910303868");
        ctx.setEmail("krishnan.sreeju@gmail.com");
        ctx.setDesignations(Arrays.asList("SR-DCM", "DCM"));
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        RmsSelectDesignationRequest req = new RmsSelectDesignationRequest("SR-DCM");
        ResponseEntity<?> response = controller.selectDesignation(req, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertTrue((Boolean) body.get("success"));
    }

    @Test
    void selectDesignation_nonSrDcm_returnsForbiddenWithAccessDenied() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setDesignations(Arrays.asList("SR-DCM", "DCM"));
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        RmsSelectDesignationRequest req = new RmsSelectDesignationRequest("DCM");
        ResponseEntity<?> response = controller.selectDesignation(req, request);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertFalse((Boolean) body.get("success"));
        assertEquals(Boolean.TRUE, body.get("accessDenied"));
        verify(session).removeAttribute(AuthController.RMS_SESSION_CONTEXT_KEY);
    }

    @Test
    void selectDesignation_noSession_returnsBadRequest() {
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(null);

        RmsSelectDesignationRequest req = new RmsSelectDesignationRequest("SR-DCM");
        ResponseEntity<?> response = controller.selectDesignation(req, request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void resendOtp_usesDedicatedResendFlow() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setSelectedDesignation("SR-DCM");
        ctx.setDesignations(Arrays.asList("SR-DCM"));
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        ResponseEntity<?> response = controller.resendOtp(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(orchestrator).resendOtp(eq(ctx), anyString());
    }

    // ─────────────────────────────────────────────────────────────
    // Step 3: verifyOtp Endpoint Tests
    // ─────────────────────────────────────────────────────────────
    @Test
    void verifyOtp_validOtp_createsAuthenticatedSession() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setStep(RmsAuthSessionContext.Step.OTP_PENDING);
        ctx.setSelectedDesignation("SR-DCM");
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        HttpSession newSession = mock(HttpSession.class);
        when(request.getSession(true)).thenReturn(newSession);

        RmsVerifyOtpRequest req = new RmsVerifyOtpRequest("123456");
        ResponseEntity<?> response = controller.verifyOtp(req, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertTrue((Boolean) body.get("success"));
        verify(newSession).setAttribute(eq(AuthController.AUTH_SESSION_KEY), any(AuthUserDto.class));
        verify(newSession).setMaxInactiveInterval(3600);
    }

    @Test
    void verifyOtp_invalidOtp_returnsUnauthorized() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setStep(RmsAuthSessionContext.Step.OTP_PENDING);
        ctx.setSelectedDesignation("SR-DCM");
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        RmsVerifyOtpRequest req = new RmsVerifyOtpRequest("000000");
        ResponseEntity<?> response = controller.verifyOtp(req, request);

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertFalse((Boolean) body.get("success"));
    }
}
