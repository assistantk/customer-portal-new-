package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;

/**
 * Applies the confirmed AEM login rule: compare AAVPSWD directly, ignore
 * AAVOLDPSWD and account flags, and grant only the portal USER role.
 */
public interface AemAuthenticationPolicy {
    AuthUserDto authenticate(AemUserLookupResult user, String password);
}
