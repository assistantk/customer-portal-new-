package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.exception.InvalidCredentialsException;
import com.cris.customerportal.repository.AemUserLookupRepository;
import org.springframework.stereotype.Service;

/**
 * Authentication flow for users stored in TMS3T.AEM_USER.
 */
@Service
public final class AemAuthenticationService {

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

        AemUserLookupResult user = userLookupRepository.findByIdentifier(parsedIdentifier)
                .orElseThrow(() ->
                        new InvalidCredentialsException("Invalid User ID/Email or Password."));
        return authenticationPolicy.authenticate(user, password);
    }
}
