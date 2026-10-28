package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.exception.InvalidCredentialsException;
import com.cris.customerportal.repository.AemUserLookupRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Authentication flow for users stored in TMS3T.AEM_USER.
 */
@Service
public class AemAuthenticationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(AemAuthenticationService.class);
    private final AemUserLookupRepository userLookupRepository;
    private final AemAuthenticationPolicy authenticationPolicy;

    public AemAuthenticationService(
            AemUserLookupRepository userLookupRepository,
            AemAuthenticationPolicy authenticationPolicy) {
        this.userLookupRepository = userLookupRepository;
        this.authenticationPolicy = authenticationPolicy;
    }

    public AuthUserDto authenticate(String identifier, String password) {
        String parsedIdentifier = AemLoginIdentifier.parse(identifier);
        if (password == null || password.isEmpty()) {
            throw new IllegalArgumentException("User ID/Email and Password are required.");
        }

        LOGGER.debug("Starting parameterized lookup in TMS3T.AEM_USER");
        AemUserLookupResult user = userLookupRepository.findByIdentifier(parsedIdentifier)
                .orElseThrow(() -> {
                    LOGGER.info("AEM credential authentication rejected: no matching account");
                    return new InvalidCredentialsException("Invalid User ID/Email or Password.");
                });
        LOGGER.debug("AEM account lookup matched one canonical account");
        return authenticationPolicy.authenticate(user, password);
    }
}
