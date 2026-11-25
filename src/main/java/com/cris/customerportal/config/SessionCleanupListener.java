package com.cris.customerportal.config;

import com.cris.customerportal.service.ActiveUserSessionRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpSession;
import javax.servlet.http.HttpSessionEvent;
import javax.servlet.http.HttpSessionListener;

/**
 * Standard Servlet HttpSessionListener that ensures whenever an HTTP session is destroyed
 * (inactivity timeout, WebLogic session expiry, or explicit invalidation), its record is
 * cleanly unregistered from {@link ActiveUserSessionRegistry}.
 */
@Component
public class SessionCleanupListener implements HttpSessionListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(SessionCleanupListener.class);

    private final ActiveUserSessionRegistry sessionRegistry;

    @Autowired
    public SessionCleanupListener(ActiveUserSessionRegistry sessionRegistry) {
        this.sessionRegistry = sessionRegistry;
    }

    @Override
    public void sessionCreated(HttpSessionEvent se) {
        LOGGER.debug("HttpSession created: id={}", se.getSession().getId());
    }

    @Override
    public void sessionDestroyed(HttpSessionEvent se) {
        HttpSession session = se.getSession();
        String sessionId = session.getId();
        LOGGER.debug("HttpSession destroyed: id={}", sessionId);

        if (sessionRegistry != null) {
            try {
                Object userIdObj = session.getAttribute(ActiveUserSessionRegistry.SESSION_USER_ATTRIBUTE);
                Object tokenObj = session.getAttribute(ActiveUserSessionRegistry.SESSION_TOKEN_ATTRIBUTE);
                if (userIdObj != null) {
                    String userId = userIdObj.toString();
                    String token = tokenObj != null ? tokenObj.toString() : null;
                    LOGGER.info("Cleaning up active session on session destruction: user={} sessionId={}", userId, sessionId);
                    sessionRegistry.unregisterSession(userId, sessionId, token);
                }
            } catch (Exception ex) {
                LOGGER.debug("Session attribute access failed during sessionDestroyed (session may already be invalidated): {}",
                        ex.getMessage());
            }
        }
    }
}
