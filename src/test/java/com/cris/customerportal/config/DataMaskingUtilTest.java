package com.cris.customerportal.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

import javax.servlet.http.HttpSession;
import org.junit.jupiter.api.Test;

class DataMaskingUtilTest {

    @Test
    void masksEmailAddresses() {
        assertEquals("Contact ***@***", DataMaskingUtil.maskSensitive("Contact admin@example.org"));
    }

    @Test
    void doesNotIncludeSessionIdInFormattedArguments() {
        assertEquals("HttpSession[redacted]", DataMaskingUtil.formatArg(mock(HttpSession.class)));
    }
}
