package com.cris.customerportal.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;

import javax.servlet.http.HttpSession;
import java.util.Arrays;
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

    @Test
    void masksSensitiveJsonAndToStringFieldsCompletely() {
        String input = "{\"password\":\"not logged\", \"sessionId\":\"private-session\", "
                + "email='private@example.org', address=\"12 Private Road\"}";

        String masked = DataMaskingUtil.maskSensitive(input);

        org.junit.jupiter.api.Assertions.assertFalse(masked.contains("not logged"));
        org.junit.jupiter.api.Assertions.assertFalse(masked.contains("private-session"));
        org.junit.jupiter.api.Assertions.assertFalse(masked.contains("private@example.org"));
        org.junit.jupiter.api.Assertions.assertFalse(masked.contains("12 Private Road"));
    }

    @Test
    void summarizesCollectionsInsteadOfDumpingBusinessRecords() {
        assertEquals("Collection[size=2]", DataMaskingUtil.formatArg(Arrays.asList("first", "second")));
    }

    @Test
    void masksSqlValuesAndContactDetailsFromEmailBodyLogs() {
        String body = "Table: MEMWGONOWNRSHIP, MEMWGONOWNRPRTY\n"
                + "INSERT INTO MEMWGONOWNRSHIP VALUES('ALPS','PRIVATE COMPANY');\n"
                + "UserID: SREEJU\nEmail ID: user@example.org\nPhone Number: 9910303868";

        String masked = DataMaskingUtil.maskEmailBodyForLog(body);

        org.junit.jupiter.api.Assertions.assertTrue(masked.contains("Table: MEMWGONOWNRSHIP, MEMWGONOWNRPRTY"));
        org.junit.jupiter.api.Assertions.assertTrue(masked.contains("VALUES('[REDACTED]','[REDACTED]')"));
        org.junit.jupiter.api.Assertions.assertFalse(masked.contains("PRIVATE COMPANY"));
        org.junit.jupiter.api.Assertions.assertFalse(masked.contains("user@example.org"));
        org.junit.jupiter.api.Assertions.assertFalse(masked.contains("9910303868"));
        org.junit.jupiter.api.Assertions.assertFalse(masked.contains("SREEJU"));
    }
}
