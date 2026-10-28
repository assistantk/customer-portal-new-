package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.exception.AccountInactiveException;
import com.cris.customerportal.exception.DatabaseUnavailableException;
import com.cris.customerportal.exception.InvalidCredentialsException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OracleDbmsUtilityAuthenticationPolicyTest {

    private OraclePasswordHashService hashService;
    private OracleDbmsUtilityAuthenticationPolicy policy;

    @BeforeEach
    void setUp() {
        hashService = mock(OraclePasswordHashService.class);
        policy = new OracleDbmsUtilityAuthenticationPolicy(hashService);
    }

    @Test
    void matchingHashAuthenticatesActiveUser() {
        AemUserLookupResult user =
                new AemUserLookupResult("SREEJU", "sreeju@example.org", "9771429950", "3C12F4B", "Y");
        when(hashService.calculatePasswordHash("SREEJU", "Cris@123")).thenReturn("3C12F4B");

        AuthUserDto authenticatedUser = policy.authenticate(user, "Cris@123");

        assertEquals("SREEJU", authenticatedUser.getUserId());
        assertEquals("USER", authenticatedUser.getUserRole());
        assertEquals("SREEJU", authenticatedUser.getUserName());
        assertEquals("sreeju@example.org", authenticatedUser.getEmail());
        assertEquals("9771429950", authenticatedUser.getPhoneNumber());
        assertEquals("Y", authenticatedUser.getIsActive());
        verify(hashService).calculatePasswordHash("SREEJU", "Cris@123");
    }

    @Test
    void matchingHashIsCaseAndWhitespaceInsensitive() {
        // Test hex casing normalization and Oracle CHAR padding trimming
        AemUserLookupResult user =
                new AemUserLookupResult("SREEJU", "sreeju@example.org", "9771429950", "3c12f4b   ", "Y");
        when(hashService.calculatePasswordHash("SREEJU", "cris@123")).thenReturn("  3C12F4B  ");

        AuthUserDto authenticatedUser = policy.authenticate(user, "cris@123");

        assertEquals("SREEJU", authenticatedUser.getUserId());
        assertEquals("Y", authenticatedUser.getIsActive());
    }

    @Test
    void nonMatchingHashThrowsInvalidCredentialsException() {
        AemUserLookupResult user =
                new AemUserLookupResult("SREEJU", "sreeju@example.org", "3C12F4B");
        when(hashService.calculatePasswordHash("SREEJU", "wrong-password")).thenReturn("9A8B7C6");

        InvalidCredentialsException exception = assertThrows(InvalidCredentialsException.class,
                () -> policy.authenticate(user, "wrong-password"));

        assertEquals("Invalid User ID/Email or Password.", exception.getMessage());
    }

    @Test
    void inactiveAccountThrowsAccountInactiveExceptionBeforeHashCalculation() {
        AemUserLookupResult inactiveUser =
                new AemUserLookupResult("SREEJU", "sreeju@example.org", "9771429950", "3C12F4B", "N");

        AccountInactiveException exception = assertThrows(AccountInactiveException.class,
                () -> policy.authenticate(inactiveUser, "Cris@123"));

        assertTrue(exception.getMessage().contains("inactive"));
        verifyNoInteractions(hashService);
    }

    @Test
    void nullOrMissingCredentialsThrowInvalidCredentialsException() {
        AemUserLookupResult userWithNullPassword =
                new AemUserLookupResult("SREEJU", "sreeju@example.org", null);

        assertThrows(InvalidCredentialsException.class,
                () -> policy.authenticate(userWithNullPassword, "Cris@123"));
        assertThrows(InvalidCredentialsException.class,
                () -> policy.authenticate(null, "Cris@123"));
        assertThrows(InvalidCredentialsException.class,
                () -> policy.authenticate(
                        new AemUserLookupResult("SREEJU", "sreeju@example.org", "3C12F4B"), null));
        assertThrows(InvalidCredentialsException.class,
                () -> policy.authenticate(
                        new AemUserLookupResult("SREEJU", "sreeju@example.org", "3C12F4B"), ""));

        verifyNoInteractions(hashService);
    }

    @Test
    void databaseFailurePropagatesDatabaseUnavailableException() {
        AemUserLookupResult user =
                new AemUserLookupResult("SREEJU", "sreeju@example.org", "3C12F4B");
        when(hashService.calculatePasswordHash("SREEJU", "Cris@123"))
                .thenThrow(new DatabaseUnavailableException("Oracle database unreachable", null));

        assertThrows(DatabaseUnavailableException.class,
                () -> policy.authenticate(user, "Cris@123"));
    }
}
