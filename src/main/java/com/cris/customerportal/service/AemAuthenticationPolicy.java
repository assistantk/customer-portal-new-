package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;

/**
 * Policy for verifying user credentials against stored database password representations.
 */
public interface AemAuthenticationPolicy {
    AuthUserDto authenticate(AemUserLookupResult user, String password);
}
