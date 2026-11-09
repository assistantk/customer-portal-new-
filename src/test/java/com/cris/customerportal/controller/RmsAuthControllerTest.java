package com.cris.customerportal.controller;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.dto.RmsApiResponse;
import com.cris.customerportal.dto.RmsSelectDesignationRequest;
import com.cris.customerportal.dto.RmsValidateUserRequest;
import com.cris.customerportal.dto.RmsVerifyOtpRequest;
import com.cris.customerportal.config.AuthInterceptor;
import com.cris.customerportal.service.CaptchaService;
import com.cris.customerportal.service.RmsApiClient;
import com.cris.customerportal.service.RmsApiException;
import com.cris.customerportal.service.RmsAuthOrchestrator;
import com.cris.customerportal.service.RmsAuthSessionContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
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
        captchaService = mock(CaptchaService.class);

        RmsApiClient mockClient = mock(RmsApiClient.class);
        RmsApiResponse credentialsAccepted = new RmsApiResponse();
        credentialsAccepted.setErrorNo("0");
        credentialsAccepted.setUserId("SREEJU");
        credentialsAccepted.setSrvcName("ATVLDTUSER");
        credentialsAccepted.setRmrk("SUCCESS");
        credentialsAccepted.setRoleId("SR-DCM|DCM");
        when(mockClient.validateUser(any(com.cris.customerportal.dto.RmsLoginRequest.class)))
                .thenReturn(credentialsAccepted);
        when(mockClient.generateOtp(any(com.cris.customerportal.dto.RmsOtpGenerateRequest.class)))
                .thenReturn(credentialsAccepted);
        when(mockClient.verifyOtp(any(com.cris.customerportal.dto.RmsOtpVerifyRequest.class)))
                .thenReturn(credentialsAccepted);
        orchestrator = spy(new RmsAuthOrchestrator(mockClient, "FREIGHTCOD"));
        controller = new AuthController(captchaService, orchestrator, false);

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
    void validateUser_requiresHttpsBeforeCaptchaOrCredentialValidationWhenEnabled() {
        controller = new AuthController(captchaService, orchestrator, true);
        RmsValidateUserRequest req = new RmsValidateUserRequest("SREEJU", "test@123", "TKD");
        req.setCaptchaInput("AbCd23");

        ResponseEntity<?> response = controller.validateUser(req, request);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        verifyNoInteractions(captchaService, orchestrator);
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
    void validateUser_invalidCredentialsClearsPreviousAuthenticationState() {
        RmsValidateUserRequest req = new RmsValidateUserRequest("SREEJU", "wrong", "TKD");
        req.setCaptchaInput("AbCd23");
        when(captchaService.consumeChallenge(session, "AbCd23")).thenReturn(true);
        String rmsRejection = "YOUR USER ID OR PASSWORD IS INCORRECT.";
        doThrow(new RmsAuthOrchestrator.InvalidRmsCredentialsException(rmsRejection))
                .when(orchestrator).validateCredentials("SREEJU", "wrong", "TKD");

        ResponseEntity<?> response = controller.validateUser(req, request);

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        assertEquals(rmsRejection, ((Map<?, ?>) response.getBody()).get("message"));
        verify(session).removeAttribute(AuthController.RMS_SESSION_CONTEXT_KEY);
        verify(session).removeAttribute(AuthController.AUTH_SESSION_KEY);
        verify(session, never()).setAttribute(eq(AuthController.RMS_SESSION_CONTEXT_KEY), any());
    }

    @Test
    void validateUser_invalidDivision_returnsUnauthorizedOrBadRequest() {
        RmsValidateUserRequest req = new RmsValidateUserRequest("SREEJU", "test@123", "NONEXISTENT_DIV");
        req.setCaptchaInput("AbCd23");
        when(captchaService.consumeChallenge(session, "AbCd23")).thenReturn(true);
        doThrow(new RmsAuthOrchestrator.InvalidRmsCredentialsException("Invalid Division Code."))
                .when(orchestrator).validateCredentials("SREEJU", "test@123", "NONEXISTENT_DIV");

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
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        RmsSelectDesignationRequest req = new RmsSelectDesignationRequest("SR-DCM");
        ResponseEntity<?> response = controller.selectDesignation(req, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertTrue((Boolean) body.get("success"));
    }

    @Test
    void selectDesignation_nonSrDcm_returnsOk() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setDesignations(Arrays.asList("SR-DCM", "DCM"));
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        RmsSelectDesignationRequest req = new RmsSelectDesignationRequest("DCM");
        ResponseEntity<?> response = controller.selectDesignation(req, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertTrue((Boolean) body.get("success"));
        assertEquals("DCM", ctx.getSelectedDesignation());
        assertEquals(RmsAuthSessionContext.Step.OTP_PENDING, ctx.getStep());
        verify(session, never()).removeAttribute(AuthController.RMS_SESSION_CONTEXT_KEY);
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
        ctx.setStep(RmsAuthSessionContext.Step.OTP_PENDING);
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        ResponseEntity<?> response = controller.resendOtp(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(orchestrator).resendOtp(eq(ctx), anyString());
    }

    @Test
    void resendOtp_withActiveCooldown_returnsTooManyRequests() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setDesignations(Arrays.asList("SR-DCM"));
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);
        orchestrator.selectDesignationAndGenerateOtp(ctx, "SR-DCM", "127.0.0.1");
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        ResponseEntity<?> response = controller.resendOtp(request);

        assertEquals(HttpStatus.TOO_MANY_REQUESTS, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertTrue(((Number) body.get("retryAfterSeconds")).intValue() > 0);
        verify(orchestrator).resendOtp(eq(ctx), anyString());
    }

    // ─────────────────────────────────────────────────────────────
    // Step 3: verifyOtp Endpoint Tests
    // ─────────────────────────────────────────────────────────────
    @Test
    void verifyOtp_validOtp_createsAuthenticatedSession() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setDesignations(Arrays.asList("SR-DCM", "DCM"));
        ctx.setStep(RmsAuthSessionContext.Step.OTP_PENDING);
        ctx.setSelectedDesignation("SR-DCM");
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);
        when(session.getAttribute(AuthController.RMS_LOGOUT_CONTEXT_KEY)).thenReturn(null);

        RmsVerifyOtpRequest req = new RmsVerifyOtpRequest("78901");
        AuthUserDto authenticatedUser = new AuthUserDto(
                "SREEJU", "SREEJU KRISHNAN", "SR-DCM", "Y", "sreeju@cris.org.in", "9910303868");
        doReturn(authenticatedUser)
                .when(orchestrator).verifyOtp(eq(ctx), eq("78901"), anyString());
        ResponseEntity<?> response = controller.verifyOtp(req, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertTrue((Boolean) body.get("success"));
        verify(request).changeSessionId();
        verify(session).setAttribute(AuthController.AUTH_SESSION_KEY, authenticatedUser);
        verify(session).setMaxInactiveInterval(4 * 60 * 60);
        verify(session, never()).invalidate();
    }

    @Test
    void verifyOtp_sameUserCanAuthenticateAnIndependentSecondSession() {
        AuthUserDto authenticatedUser = new AuthUserDto(
                "SREEJU", "SREEJU KRISHNAN", "SR-DCM", "Y", "sreeju@cris.org.in", "9910303868");
        doReturn(authenticatedUser).when(orchestrator)
                .verifyOtp(any(RmsAuthSessionContext.class), eq("78901"), anyString());

        HttpSession firstSession = mock(HttpSession.class);
        HttpServletRequest firstRequest = mock(HttpServletRequest.class);
        when(firstRequest.getSession(false)).thenReturn(firstSession);
        RmsAuthSessionContext firstContext = otpPendingContext();
        when(firstSession.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(firstContext);

        HttpSession secondSession = mock(HttpSession.class);
        HttpServletRequest secondRequest = mock(HttpServletRequest.class);
        when(secondRequest.getSession(false)).thenReturn(secondSession);
        RmsAuthSessionContext secondContext = otpPendingContext();
        when(secondSession.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(secondContext);

        ResponseEntity<?> firstResponse = controller.verifyOtp(new RmsVerifyOtpRequest("78901"), firstRequest);
        ResponseEntity<?> secondResponse = controller.verifyOtp(new RmsVerifyOtpRequest("78901"), secondRequest);

        assertEquals(HttpStatus.OK, firstResponse.getStatusCode());
        assertEquals(HttpStatus.OK, secondResponse.getStatusCode());
        verify(firstRequest).changeSessionId();
        verify(secondRequest).changeSessionId();
        verify(firstSession).setAttribute(AuthController.AUTH_SESSION_KEY, authenticatedUser);
        verify(secondSession).setAttribute(AuthController.AUTH_SESSION_KEY, authenticatedUser);
        verify(firstSession, never()).invalidate();
        verify(secondSession, never()).invalidate();
    }

    @Test
    void verifyOtp_invalidOtp_returnsUnauthorized() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setDesignations(Arrays.asList("SR-DCM", "DCM"));
        ctx.setStep(RmsAuthSessionContext.Step.OTP_PENDING);
        ctx.setSelectedDesignation("SR-DCM");
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        RmsVerifyOtpRequest req = new RmsVerifyOtpRequest("00000");
        doThrow(new RmsAuthOrchestrator.InvalidRmsCredentialsException("Invalid OTP. Please enter the valid OTP."))
                .when(orchestrator).verifyOtp(eq(ctx), eq("00000"), anyString());
        ResponseEntity<?> response = controller.verifyOtp(req, request);

        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertFalse((Boolean) body.get("success"));
    }

    @Test
    void verifyOtp_withoutSelectedOtpPendingFlow_isRejected() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setDesignations(Arrays.asList("SR-DCM", "DCM"));
        ctx.setStep(RmsAuthSessionContext.Step.CREDENTIALS_VALIDATED);
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        ResponseEntity<?> response = controller.verifyOtp(new RmsVerifyOtpRequest("78901"), request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals("Session expired or invalid flow. Please start over.",
                ((Map<?, ?>) response.getBody()).get("message"));
        verify(orchestrator, never()).verifyOtp(any(), anyString(), anyString());
    }

    private RmsAuthSessionContext otpPendingContext() {
        RmsAuthSessionContext context = new RmsAuthSessionContext();
        context.setUserId("SREEJU");
        context.setDesignations(Arrays.asList("SR-DCM", "DCM"));
        context.setStep(RmsAuthSessionContext.Step.OTP_PENDING);
        context.setSelectedDesignation("SR-DCM");
        return context;
    }

    @Test
    void getOtpStatus_noSession_returnsNotSuccess() {
        when(request.getSession(false)).thenReturn(null);
        ResponseEntity<?> response = controller.getOtpStatus(request);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertFalse((Boolean) body.get("success"));
    }

    @Test
    void getOtpStatus_activeSession_returnsContextAndCooldown() {
        RmsAuthSessionContext ctx = new RmsAuthSessionContext();
        ctx.setUserId("SREEJU");
        ctx.setUserName("SREEJU KRISHNAN");
        ctx.setDivisionCode("TKD");
        ctx.setSelectedDesignation("SR-DCM");
        ctx.setStep(RmsAuthSessionContext.Step.OTP_PENDING);
        when(session.getAttribute(AuthController.RMS_SESSION_CONTEXT_KEY)).thenReturn(ctx);

        ResponseEntity<?> response = controller.getOtpStatus(request);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertTrue((Boolean) body.get("success"));
        Map<?, ?> data = (Map<?, ?>) body.get("data");
        assertNotNull(data);
        assertEquals("OTP_PENDING", data.get("step"));
        assertEquals("SREEJU", data.get("userId"));
        assertEquals("TKD", data.get("divisionCode"));
        assertEquals("SR-DCM", data.get("selectedDesignation"));
        assertNotNull(data.get("resendCooldownSeconds"));
    }

    @Test
    void logout_withRmsSessionContext_callsOrchestratorAndInvalidatesSession() {
        com.cris.customerportal.dto.RmsLoginRequest logoutReq = new com.cris.customerportal.dto.RmsLoginRequest();
        logoutReq.setF_USERID("SREEJU");
        logoutReq.setF_LOCN("TKD");
        logoutReq.setF_PSWD("password");
        logoutReq.setF_ROLEID("SR-DCM");
        when(session.getAttribute(AuthController.AUTH_SESSION_KEY))
                .thenReturn(new AuthUserDto("SREEJU", "SREEJU KRISHNAN", "SR-DCM", "Y"));
        when(session.getAttribute(AuthController.RMS_LOGOUT_CONTEXT_KEY)).thenReturn(logoutReq);
        doNothing().when(orchestrator).logout(eq(logoutReq), anyString());

        ResponseEntity<?> response = controller.logout(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertTrue((Boolean) body.get("success"));
        assertEquals("Logged out successfully.", body.get("message"));

        verify(orchestrator).logout(eq(logoutReq), anyString());
        verify(session).invalidate();
    }

    @Test
    void logout_whenRmsOrchestratorFails_stillInvalidatesSessionAndReturnsBadGateway() {
        com.cris.customerportal.dto.RmsLoginRequest logoutReq = new com.cris.customerportal.dto.RmsLoginRequest();
        logoutReq.setF_USERID("SREEJU");
        when(session.getAttribute(AuthController.AUTH_SESSION_KEY))
                .thenReturn(new AuthUserDto("SREEJU", "SREEJU KRISHNAN", "SR-DCM", "Y"));
        when(session.getAttribute(AuthController.RMS_LOGOUT_CONTEXT_KEY)).thenReturn(logoutReq);
        doThrow(new RmsApiException("RMS logout rejected by host"))
                .when(orchestrator).logout(eq(logoutReq), anyString());

        ResponseEntity<?> response = controller.logout(request);

        assertEquals(HttpStatus.BAD_GATEWAY, response.getStatusCode());
        Map<?, ?> body = (Map<?, ?>) response.getBody();
        assertNotNull(body);
        assertFalse((Boolean) body.get("success"));
        assertTrue(body.get("message").toString().contains("RMS logout rejected by host"));

        verify(session).invalidate();
    }

    @Test
    void logout_invalidatesOnlyTheRequestingDeviceSession() throws Exception {
        HttpSession firstSession = mock(HttpSession.class);
        HttpSession secondSession = mock(HttpSession.class);
        HttpServletRequest firstRequest = mock(HttpServletRequest.class);
        HttpServletRequest secondRequest = mock(HttpServletRequest.class);
        HttpServletResponse secondResponse = mock(HttpServletResponse.class);
        AuthUserDto user = new AuthUserDto("SREEJU", "SREEJU KRISHNAN", "SR-DCM", "Y");
        when(firstRequest.getSession(false)).thenReturn(firstSession);
        when(firstSession.getAttribute(AuthController.AUTH_SESSION_KEY)).thenReturn(user);
        when(secondRequest.getMethod()).thenReturn("GET");
        when(secondRequest.getSession(false)).thenReturn(secondSession);
        when(secondSession.getAttribute(AuthController.AUTH_SESSION_KEY)).thenReturn(user);
        when(secondRequest.getRequestURI()).thenReturn("/api/customers/lookup");

        ResponseEntity<?> response = controller.logout(firstRequest);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(firstSession).invalidate();
        assertTrue(new AuthInterceptor().preHandle(secondRequest, secondResponse, new Object()));
        verify(secondSession, never()).invalidate();
    }

}
