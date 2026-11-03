package com.cris.customerportal.controller;

import com.cris.customerportal.service.CaptchaService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthControllerTest {

    private CaptchaService captchaService;
    private AuthController controller;
    private HttpServletRequest request;
    private HttpSession captchaSession;

    @BeforeEach
    void setUp() {
        captchaService = mock(CaptchaService.class);
        controller = new AuthController(captchaService);
        request = mock(HttpServletRequest.class);
        captchaSession = mock(HttpSession.class);
        when(request.getSession(false)).thenReturn(captchaSession);
    }

    @Test
    void legacyLocalLoginIsDisabled() {
        ResponseEntity<?> response = controller.legacyLogin(request);

        assertEquals(HttpStatus.GONE, response.getStatusCode());
        assertFalse((Boolean) ((Map<?, ?>) response.getBody()).get("success"));
        verify(captchaSession).invalidate();
        verifyNoInteractions(captchaService);
    }

    @Test
    void httpsRequiredRejectsCredentialSubmissionOverHttp() {
        controller = new AuthController(captchaService, null, true);
        com.cris.customerportal.dto.RmsValidateUserRequest loginRequest =
                new com.cris.customerportal.dto.RmsValidateUserRequest("RAILUSER", "password", "TKD");

        ResponseEntity<?> response = controller.validateUser(loginRequest, request);

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
        assertEquals("HTTPS is required for credential submission.",
                ((Map<?, ?>) response.getBody()).get("message"));
        verifyNoInteractions(captchaService);
    }

    @Test
    void captchaEndpointCreatesSessionBoundNoStoreImage() {
        when(request.getSession(true)).thenReturn(captchaSession);
        when(captchaService.createChallengeImage(captchaSession)).thenReturn("data:image/png;base64,image");

        ResponseEntity<?> response = controller.captcha(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("no-store", response.getHeaders().getCacheControl());
        assertEquals("data:image/png;base64,image", ((Map<?, ?>) response.getBody()).get("image"));
    }

    @Test
    void captchaEndpointReturnsJsonWhenImageGenerationFails() {
        when(request.getSession(true)).thenReturn(captchaSession);
        when(captchaService.createChallengeImage(captchaSession))
                .thenThrow(new CaptchaService.CaptchaGenerationException("render failed", new Error("font failure")));

        ResponseEntity<?> response = controller.captcha(request);

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        assertEquals("no-store", response.getHeaders().getCacheControl());
        assertEquals(false, ((Map<?, ?>) response.getBody()).get("success"));
        assertEquals("CAPTCHA is temporarily unavailable. Please try again later.",
                ((Map<?, ?>) response.getBody()).get("message"));
    }

    @Test
    void logoutInvalidatesExistingSession() {
        ResponseEntity<?> response = controller.logout(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(captchaSession).invalidate();
    }
}
