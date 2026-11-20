package com.cris.customerportal.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.servlet.http.HttpSession;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ActiveUserSessionRegistryTest {

    private ActiveUserSessionRegistry registry;

    @BeforeEach
    void setUp() {
        registry = new ActiveUserSessionRegistry();
    }

    @Test
    void registerAndValidateActiveSession() {
        HttpSession session = mock(HttpSession.class);
        when(session.getId()).thenReturn("sess-1");
        when(session.getAttribute(ActiveUserSessionRegistry.SESSION_TOKEN_ATTRIBUTE)).thenReturn("tok-1");

        registry.registerSession("user123", "sess-1", "tok-1", session, "10.0.0.1");

        assertTrue(registry.isSessionActive("user123", session));
        // Case insensitive normalization
        assertTrue(registry.isSessionActive("USER123", session));
        assertEquals(1, registry.getActiveSessionCount());
    }

    @Test
    void newLoginFromAnotherDevice_supersedesPreviousSession() {
        HttpSession session1 = mock(HttpSession.class);
        when(session1.getId()).thenReturn("device-A-sess");
        when(session1.getAttribute(ActiveUserSessionRegistry.SESSION_TOKEN_ATTRIBUTE)).thenReturn("tok-A");

        HttpSession session2 = mock(HttpSession.class);
        when(session2.getId()).thenReturn("device-B-sess");
        when(session2.getAttribute(ActiveUserSessionRegistry.SESSION_TOKEN_ATTRIBUTE)).thenReturn("tok-B");

        // Device A logs in first
        registry.registerSession("user123", "device-A-sess", "tok-A", session1, "192.168.1.10");
        assertTrue(registry.isSessionActive("user123", session1));

        // Device B logs in second with same user ID
        registry.registerSession("user123", "device-B-sess", "tok-B", session2, "192.168.1.20");

        // Old session on Device A should now be superseded
        assertFalse(registry.isSessionActive("user123", session1));
        verify(session1).invalidate();

        // New session on Device B is the only active session
        assertTrue(registry.isSessionActive("user123", session2));
        assertEquals(1, registry.getActiveSessionCount());
    }

    @Test
    void unregisterRemovesSessionCleanly() {
        HttpSession session = mock(HttpSession.class);
        when(session.getId()).thenReturn("sess-1");
        when(session.getAttribute(ActiveUserSessionRegistry.SESSION_TOKEN_ATTRIBUTE)).thenReturn("tok-1");

        registry.registerSession("user123", "sess-1", "tok-1", session, "10.0.0.1");
        assertEquals(1, registry.getActiveSessionCount());

        registry.unregisterSession("user123", "sess-1", "tok-1");
        assertEquals(0, registry.getActiveSessionCount());
        assertFalse(registry.isSessionActive("user123", session));
    }

    @Test
    void unregisteringOldSessionDoesNotRemoveNewActiveSession() {
        HttpSession session1 = mock(HttpSession.class);
        when(session1.getId()).thenReturn("sess-1");

        HttpSession session2 = mock(HttpSession.class);
        when(session2.getId()).thenReturn("sess-2");
        when(session2.getAttribute(ActiveUserSessionRegistry.SESSION_TOKEN_ATTRIBUTE)).thenReturn("tok-2");

        registry.registerSession("user123", "sess-1", "tok-1", session1, "10.0.0.1");
        registry.registerSession("user123", "sess-2", "tok-2", session2, "10.0.0.2");

        // Stale unregister from destroyed sess-1 should not affect sess-2
        registry.unregisterSession("user123", "sess-1", "tok-1");
        assertEquals(1, registry.getActiveSessionCount());
        assertTrue(registry.isSessionActive("user123", session2));
    }

    @Test
    void nullAndEmptyInputsHandledSafely() {
        assertFalse(registry.isSessionActive(null, null));
        assertFalse(registry.isSessionActive("user", null));
        assertNull(registry.registerSession(null, "s1", "t1", null, null));
        assertNull(registry.registerSession("  ", "s1", "t1", null, null));
        assertNull(registry.registerSession("user", null, "t1", null, null));
    }
}
