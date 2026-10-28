package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.exception.AccountInactiveException;
import com.cris.customerportal.exception.InvalidCredentialsException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger LOGGER = LoggerFactory.getLogger(OracleDbmsUtilityAuthenticationPolicy.class);
    private final OraclePasswordHashService passwordHashService;

    public OracleDbmsUtilityAuthenticationPolicy(OraclePasswordHashService passwordHashService) {
        this.passwordHashService = passwordHashService;
    }

    @Override
    public AuthUserDto authenticate(AemUserLookupResult user, String password) {
        if (user != null && !user.eligibilityFailures().isEmpty()) {
            LOGGER.info("AEM credential authentication rejected by account eligibility: {}",
                    String.join(", ", user.eligibilityFailures()));
            throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
        }

        if (user == null || user.storedPassword() == null || password == null || password.isEmpty()) {
            LOGGER.info("AEM credential authentication rejected: required credential data missing");
            throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
        }

        if (user.isActive() != null && !"Y".equalsIgnoreCase(user.isActive().trim())) {
            LOGGER.info("AEM credential authentication rejected by configured account status");
            throw new AccountInactiveException("Your account is inactive. Please contact the administrator.");
        }

        String authenticatedUserId = user.userId() == null ? null : user.userId().trim();
        if (authenticatedUserId == null || authenticatedUserId.isEmpty()) {
            LOGGER.info("AEM credential authentication rejected: canonical account ID is blank");
            throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
        }

        LOGGER.debug("Calculating legacy AEM password representation in Oracle");
        String calculatedHash = passwordHashService.calculatePasswordHash(authenticatedUserId, password);
        if (calculatedHash == null) {
            LOGGER.info("AEM credential authentication rejected: Oracle returned no calculated value");
            throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
        }

        // Normalize casing and whitespace (handles Oracle CHAR column padding)
        String normalizedCalculated = calculatedHash.trim().toUpperCase(Locale.ROOT);
        String normalizedStored = user.storedPassword().trim().toUpperCase(Locale.ROOT);

        if (!MessageDigest.isEqual(
                normalizedCalculated.getBytes(StandardCharsets.UTF_8),
                normalizedStored.getBytes(StandardCharsets.UTF_8))) {
            LOGGER.info("AEM credential authentication rejected: calculated value did not match AAVPSWD");
            throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
        }

        LOGGER.debug("Oracle-calculated AEM password representation matched AAVPSWD");
        return new AuthUserDto(
                authenticatedUserId,
                authenticatedUserId,
                "USER",
                "Y",
                user.email() == null ? null : user.email().trim(),
                user.phoneNumber());
    }
}
