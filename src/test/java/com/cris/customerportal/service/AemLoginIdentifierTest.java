package com.cris.customerportal.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AemLoginIdentifierTest {

    @Test
    void trimsUserIdOrEmailWithoutChangingItsValue() {
        assertEquals("RAILUSER", AemLoginIdentifier.parse("  RAILUSER  "));
        assertEquals("rail.user@example.org", AemLoginIdentifier.parse(" rail.user@example.org "));
    }

    @Test
    void rejectsMissingOrBlankIdentifier() {
        assertThrows(IllegalArgumentException.class, () -> AemLoginIdentifier.parse(null));
        assertThrows(IllegalArgumentException.class, () -> AemLoginIdentifier.parse("  "));
    }
}
