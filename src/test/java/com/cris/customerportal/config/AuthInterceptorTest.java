package com.cris.customerportal.config;

import com.cris.customerportal.controller.AuthController;
import com.cris.customerportal.dto.AuthUserDto;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.PrintWriter;
import java.io.StringWriter;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthInterceptorTest {

    private AuthInterceptor interceptor;
    private HttpServletRequest request;
    private HttpServletResponse response;
    private HttpSession session;
    private StringWriter responseWriter;

    @BeforeEach
    void setUp() throws Exception {
        interceptor = new AuthInterceptor();
        request = mock(HttpServletRequest.class);
        response = mock(HttpServletResponse.class);
        session = mock(HttpSession.class);
        responseWriter = new StringWriter();

        when(response.getWriter()).thenReturn(new PrintWriter(responseWriter));
        when(request.getMethod()).thenReturn("GET");
    }

    @Test
    void optionsRequest_isAlwaysAllowedForCors() throws Exception {
        when(request.getMethod()).thenReturn("OPTIONS");

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        verify(response, never()).setStatus(anyInt());
    }

    @Test
    void unauthenticatedRequest_isRejectedWith401() throws Exception {
        when(request.getSession(false)).thenReturn(null);
        when(request.getRequestURI()).thenReturn("/api/customers/lookup");

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        verify(response).setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        assertTrue(responseWriter.toString().contains("Authentication required"));
    }

    @Test
    void authenticatedUser_accessStandardCustomerApi_isAllowed() throws Exception {
        AuthUserDto user = new AuthUserDto("USR1", "Standard User", "USER", "Y");
        when(request.getSession(false)).thenReturn(session);
        when(session.getAttribute(AuthController.AUTH_SESSION_KEY)).thenReturn(user);
        when(request.getRequestURI()).thenReturn("/api/customers/lookup");

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        verify(response, never()).setStatus(anyInt());
    }

    @Test
    void nonAdminUser_attemptAdminOperation_isRejectedWith403() throws Exception {
        AuthUserDto normalUser = new AuthUserDto("USR1", "Standard User", "USER", "Y");
        when(request.getSession(false)).thenReturn(session);
        when(session.getAttribute(AuthController.AUTH_SESSION_KEY)).thenReturn(normalUser);
        when(request.getRequestURI()).thenReturn("/api/customers/global-delete");
        when(request.getMethod()).thenReturn("DELETE");

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        verify(response).setStatus(HttpServletResponse.SC_FORBIDDEN);
        assertTrue(responseWriter.toString().contains("Administrator privileges required"));
    }

    @Test
    void adminUser_attemptAdminOperation_isAllowed() throws Exception {
        AuthUserDto adminUser = new AuthUserDto("ADMIN1", "Admin User", "ADMIN", "Y");
        when(request.getSession(false)).thenReturn(session);
        when(session.getAttribute(AuthController.AUTH_SESSION_KEY)).thenReturn(adminUser);
        when(request.getRequestURI()).thenReturn("/api/customers/global-delete");
        when(request.getMethod()).thenReturn("DELETE");

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertTrue(allowed);
        verify(response, never()).setStatus(anyInt());
    }

    @Test
    void nonAdminUser_attemptDeleteRequest_isRejectedWith403() throws Exception {
        AuthUserDto normalUser = new AuthUserDto("USR1", "Standard User", "USER", "Y");
        when(request.getSession(false)).thenReturn(session);
        when(session.getAttribute(AuthController.AUTH_SESSION_KEY)).thenReturn(normalUser);
        when(request.getRequestURI()).thenReturn("/api/customers/delete-requests/submit");
        when(request.getMethod()).thenReturn("POST");

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertFalse(allowed);
        verify(response).setStatus(HttpServletResponse.SC_FORBIDDEN);
        assertTrue(responseWriter.toString().contains("Administrator privileges required"));
    }
}
