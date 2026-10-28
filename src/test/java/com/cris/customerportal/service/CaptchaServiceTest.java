package com.cris.customerportal.service;

import org.junit.jupiter.api.Test;

import javax.servlet.http.HttpSession;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class CaptchaServiceTest {

    @Test
    void createsImageAndConsumesChallengeExactlyOnce() {
        CaptchaService captchaService = new CaptchaService();
        HttpSession session = mock(HttpSession.class);
        Map<String, Object> sessionAttributes = new HashMap<>();
        doAnswer(invocation -> {
            sessionAttributes.put(invocation.getArgument(0), invocation.getArgument(1));
            return null;
        }).when(session).setAttribute(anyString(), any());
        when(session.getAttribute(anyString())).thenAnswer(invocation ->
                sessionAttributes.get(invocation.getArgument(0)));
        doAnswer(invocation -> {
            sessionAttributes.remove(invocation.getArgument(0));
            return null;
        }).when(session).removeAttribute(anyString());

        String image = captchaService.createChallengeImage(session);
        String answer = (String) sessionAttributes.values().iterator().next();

        assertTrue(image.startsWith("data:image/png;base64,"));
        assertEquals(6, answer.length());
        assertTrue(captchaService.consumeChallenge(session, answer));
        assertFalse(captchaService.consumeChallenge(session, answer));
        verify(session, times(2)).removeAttribute(anyString());
    }

    @Test
    void rejectsWrongAndMissingAnswersAndConsumesTheChallenge() {
        CaptchaService captchaService = new CaptchaService();
        HttpSession session = mock(HttpSession.class);
        when(session.getAttribute(anyString())).thenReturn("AbCd23");

        assertFalse(captchaService.consumeChallenge(session, "wrong"));
        assertFalse(captchaService.consumeChallenge(session, null));
        verify(session, times(2)).removeAttribute(anyString());
    }
}
