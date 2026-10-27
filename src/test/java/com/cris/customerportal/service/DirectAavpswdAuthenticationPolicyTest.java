package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.exception.InvalidCredentialsException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DirectAavpswdAuthenticationPolicyTest {

    private final DirectAavpswdAuthenticationPolicy policy = new DirectAavpswdAuthenticationPolicy();

    @Test
    void matchingAavpswdAuthenticatesAsNonAdminUser() {
        AemUserLookupResult user =
                new AemUserLookupResult("RAILUSER", "rail.user@example.org", "9771429950", "entered-value");

        AuthUserDto authenticatedUser = policy.authenticate(user, "entered-value");

        assertEquals("RAILUSER", authenticatedUser.getUserId());
        assertEquals("USER", authenticatedUser.getUserRole());
        assertEquals("RAILUSER", authenticatedUser.getUserName());
        assertEquals("rail.user@example.org", authenticatedUser.getEmail());
        assertEquals("9771429950", authenticatedUser.getPhoneNumber());
    }

    @Test
    void incorrectOrMissingAavpswdIsRejected() {
        assertThrows(InvalidCredentialsException.class,
                () -> policy.authenticate(
                        new AemUserLookupResult("RAILUSER", "rail.user@example.org", "expected"),
                        "incorrect"));
        assertThrows(InvalidCredentialsException.class,
                () -> policy.authenticate(
                        new AemUserLookupResult("RAILUSER", "rail.user@example.org", null),
                        "entered-value"));
    }
}
