package com.cris.customerportal.config;

import com.cris.customerportal.controller.AuthController;
import com.cris.customerportal.dto.AuthUserDto;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // Allow CORS pre-flight OPTIONS requests
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        HttpSession session = request.getSession(false);
        AuthUserDto user = session != null ? (AuthUserDto) session.getAttribute(AuthController.AUTH_SESSION_KEY) : null;

        if (user == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"success\":false,\"message\":\"Authentication required. Please log in.\"}");
            return false;
        }

        // Direct deletion remains admin-only; DBA requests follow the authenticated-user policy
        // used by the Old User lookup and update endpoints.
        String requestUri = request.getRequestURI();
        if (requestUri != null && requestUri.contains("/global-delete")) {
            if (!"ADMIN".equalsIgnoreCase(user.getUserRole())) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"success\":false,\"message\":\"Access denied. Administrator privileges required.\"}");
                return false;
            }
        }

        return true;
    }
}
