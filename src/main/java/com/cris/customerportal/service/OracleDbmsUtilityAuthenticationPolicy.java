package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.exception.AccountInactiveException;
import com.cris.customerportal.exception.InvalidCredentialsException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Applies the Oracle DBMS_UTILITY.GET_HASH_VALUE password verification policy.
 * Verifies credentials by comparing the database-calculated hash with the stored password.
 */
@Component
public class OracleDbmsUtilityAuthenticationPolicy implements AemAuthenticationPolicy {

    private final OraclePasswordHashService passwordHashService;

    public OracleDbmsUtilityAuthenticationPolicy(OraclePasswordHashService passwordHashService) {
        this.passwordHashService = passwordHashService;
    }

    @Override
    public AuthUserDto authenticate(AemUserLookupResult user, String password) {
        if (user == null || user.storedPassword() == null || password == null || password.isEmpty()) {
            throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
        }

        if (user.isActive() != null && !"Y".equalsIgnoreCase(user.isActive().trim())) {
            throw new AccountInactiveException("Your account is inactive. Please contact the administrator.");
        }

        String calculatedHash = passwordHashService.calculatePasswordHash(user.userId(), password);
        if (calculatedHash == null) {
            throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
        }

        // Normalize casing and whitespace (handles Oracle CHAR column padding)
        String normalizedCalculated = calculatedHash.trim().toUpperCase(Locale.ROOT);
        String normalizedStored = user.storedPassword().trim().toUpperCase(Locale.ROOT);

        if (!MessageDigest.isEqual(
                normalizedCalculated.getBytes(StandardCharsets.UTF_8),
                normalizedStored.getBytes(StandardCharsets.UTF_8))) {
            throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
        }

        return new AuthUserDto(user.userId(), user.userId(), "USER", "Y", user.email(), user.phoneNumber());
    }
}
