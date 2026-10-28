package com.cris.customerportal.controller;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.dto.LoginRequest;
import com.cris.customerportal.exception.InvalidCredentialsException;
import com.cris.customerportal.service.AuthService;
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

    private AuthService authService;
    private CaptchaService captchaService;
    private AuthController controller;
    private HttpServletRequest request;
    private HttpSession captchaSession;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        captchaService = mock(CaptchaService.class);
        controller = new AuthController(authService, captchaService);
        request = mock(HttpServletRequest.class);
        captchaSession = mock(HttpSession.class);
        when(request.getSession(false)).thenReturn(captchaSession);
    }

    @Test
    void rejectsInvalidCaptchaBeforeLookingUpCredentials() {
        LoginRequest loginRequest = loginRequest("RAILUSER", "password", "wrong");
        when(captchaService.consumeChallenge(captchaSession, "wrong")).thenReturn(false);

        ResponseEntity<?> response = controller.login(loginRequest, request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        verifyNoInteractions(authService);
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
    void successfulLoginConsumesCaptchaThenCreatesAuthenticatedSession() {
        LoginRequest loginRequest = loginRequest("RAILUSER", "password", "AbCd23");
        AuthUserDto user = new AuthUserDto("RAILUSER", "Rail User", "USER", "Y");
        HttpSession authenticatedSession = mock(HttpSession.class);
        when(captchaService.consumeChallenge(captchaSession, "AbCd23")).thenReturn(true);
        when(authService.authenticate("RAILUSER", "password")).thenReturn(user);
        when(request.getSession(true)).thenReturn(authenticatedSession);

        ResponseEntity<?> response = controller.login(loginRequest, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(captchaSession).invalidate();
        verify(authenticatedSession).setAttribute(AuthController.AUTH_SESSION_KEY, user);
        verify(authenticatedSession).setMaxInactiveInterval(3600);
    }

    @Test
    void invalidCredentialsDoNotCreateAuthenticatedSession() {
        LoginRequest loginRequest = loginRequest("RAILUSER", "wrong", "AbCd23");
        when(captchaService.consumeChallenge(captchaSession, "AbCd23")).thenReturn(true);
        when(authService.authenticate("RAILUSER", "wrong"))
                .thenThrow(new InvalidCredentialsException("Invalid User ID/Email or Password."));

        assertThrows(InvalidCredentialsException.class, () -> controller.login(loginRequest, request));
        verify(request, never()).getSession(true);
    }

    @Test
    void logoutInvalidatesExistingSession() {
        ResponseEntity<?> response = controller.logout(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(captchaSession).invalidate();
    }

    private LoginRequest loginRequest(String userId, String password, String captchaInput) {
        LoginRequest loginRequest = new LoginRequest();
        loginRequest.setUserId(userId);
        loginRequest.setPassword(password);
        loginRequest.setCaptchaInput(captchaInput);
        return loginRequest;
    }
}
