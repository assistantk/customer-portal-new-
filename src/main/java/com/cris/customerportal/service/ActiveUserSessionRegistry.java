package com.cris.customerportal.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.servlet.http.HttpSession;
import java.lang.ref.WeakReference;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Server-side registry that maps each normalized user ID to its single active application session.
 *
 * <p>Requirements:
 * <ul>
 *   <li>Only one active session per user ID across devices and browsers.</li>
 *   <li>When a user completes a new login, any previous active session is immediately superseded
 *       and invalidated.</li>
 *   <li>Protected requests from superseded sessions are rejected with HTTP 401 SESSION_SUPERSEDED.</li>
 *   <li>Session cleanup occurs automatically on logout, inactivity timeout, or session destruction.</li>
 *   <li>Thread-safe and atomic session replacement using {@link ConcurrentHashMap#compute}.</li>
 * </ul>
 */
@Component
public class ActiveUserSessionRegistry {

    private static final Logger LOGGER = LoggerFactory.getLogger(ActiveUserSessionRegistry.class);

    public static final String SESSION_USER_ATTRIBUTE = "ACTIVE_SESSION_USER_ID";
    public static final String SESSION_TOKEN_ATTRIBUTE = "ACTIVE_SESSION_TOKEN";

    /**
     * Internal record holding active session state for a single user.
     */
    public static final class ActiveSessionRecord {
        private final String sessionId;
        private final String sessionToken;
        private final WeakReference<HttpSession> sessionRef;
        private final String clientId;
        private final long creationTimeMillis;

        public ActiveSessionRecord(String sessionId, String sessionToken, HttpSession session, String clientId) {
            this.sessionId = sessionId;
            this.sessionToken = sessionToken;
            this.sessionRef = session != null ? new WeakReference<>(session) : null;
            this.clientId = clientId;
            this.creationTimeMillis = System.currentTimeMillis();
        }

        public String getSessionId() {
            return sessionId;
        }

        public String getSessionToken() {
            return sessionToken;
        }

        public HttpSession getHttpSession() {
            return sessionRef != null ? sessionRef.get() : null;
        }

        public String getClientId() {
            return clientId;
        }

        public long getCreationTimeMillis() {
            return creationTimeMillis;
        }
    }

    private final ConcurrentHashMap<String, ActiveSessionRecord> activeSessions = new ConcurrentHashMap<>();

    /**
     * Atomically registers a newly authenticated session for the given user, invalidating any
     * previously active session for that user.
     *
     * @param rawUserId the user ID to associate
     * @param sessionId the HTTP session ID
     * @param sessionToken a unique cryptographic token stored in the session
     * @param session the HTTP session reference
     * @param clientId the dynamic client IP / ID
     * @return the new ActiveSessionRecord
     */
    public ActiveSessionRecord registerSession(String rawUserId, String sessionId, String sessionToken,
                                              HttpSession session, String clientId) {
        if (rawUserId == null || rawUserId.trim().isEmpty() || sessionId == null || sessionToken == null) {
            return null;
        }
        String normalizedUserId = normalize(rawUserId);

        return activeSessions.compute(normalizedUserId, (key, existing) -> {
            if (existing != null && !existing.getSessionId().equals(sessionId)) {
                LOGGER.info("Superseding prior active session for user {}: oldSessionId={} superseded by newSessionId={}",
                        normalizedUserId, existing.getSessionId(), sessionId);
                HttpSession oldSession = existing.getHttpSession();
                if (oldSession != null) {
                    try {
                        oldSession.removeAttribute("AUTH_USER");
                        oldSession.removeAttribute("RMS_LOGOUT_CONTEXT");
                        oldSession.invalidate();
                        LOGGER.info("Prior HttpSession invalidated successfully for user {}", normalizedUserId);
                    } catch (IllegalStateException e) {
                        LOGGER.debug("Prior HttpSession was already invalidated for user {}", normalizedUserId);
                    } catch (Exception e) {
                        LOGGER.warn("Error invalidating prior HttpSession for user {}: {}", normalizedUserId, e.getMessage());
                    }
                }
            }
            return new ActiveSessionRecord(sessionId, sessionToken, session, clientId);
        });
    }

    /**
     * Checks if the supplied session is the single currently active session for the user.
     *
     * @param rawUserId the user ID
     * @param session the HTTP session being inspected
     * @return true if this session is the active registered session; false otherwise
     */
    public boolean isSessionActive(String rawUserId, HttpSession session) {
        if (rawUserId == null || session == null) {
            return false;
        }
        String normalizedUserId = normalize(rawUserId);
        ActiveSessionRecord record = activeSessions.get(normalizedUserId);
        if (record == null) {
            LOGGER.debug("No active session record found in registry for user {}", normalizedUserId);
            return false;
        }

        boolean idMatches = record.getSessionId().equals(session.getId());
        Object sessionTokenObj = null;
        try {
            sessionTokenObj = session.getAttribute(SESSION_TOKEN_ATTRIBUTE);
        } catch (IllegalStateException e) {
            return false;
        }

        boolean tokenMatches = sessionTokenObj != null && record.getSessionToken().equals(sessionTokenObj.toString());

        if (idMatches && tokenMatches) {
            return true;
        }

        LOGGER.warn("Session check failed for user {}: presented sessionId={} (active sessionId={}), token match={}",
                normalizedUserId, session.getId(), record.getSessionId(), tokenMatches);
        return false;
    }

    /**
     * Unregisters an active session if it matches the current session ID and token.
     *
     * @param rawUserId the user ID
     * @param sessionId the session ID being removed
     * @param sessionToken the session token being removed
     */
    public void unregisterSession(String rawUserId, String sessionId, String sessionToken) {
        if (rawUserId == null || sessionId == null) {
            return;
        }
        String normalizedUserId = normalize(rawUserId);
        activeSessions.computeIfPresent(normalizedUserId, (key, existing) -> {
            boolean matchesId = existing.getSessionId().equals(sessionId);
            boolean matchesToken = sessionToken == null || existing.getSessionToken().equals(sessionToken);
            if (matchesId && matchesToken) {
                LOGGER.info("Unregistering active session for user {}: sessionId={}", normalizedUserId, sessionId);
                return null;
            }
            return existing;
        });
    }

    /**
     * Returns the number of currently active registered users.
     */
    public int getActiveSessionCount() {
        return activeSessions.size();
    }

    /**
     * Clears all registrations (primarily for unit tests).
     */
    public void clear() {
        activeSessions.clear();
    }

    private static String normalize(String userId) {
        return userId.trim().toUpperCase(Locale.ROOT);
    }
}
