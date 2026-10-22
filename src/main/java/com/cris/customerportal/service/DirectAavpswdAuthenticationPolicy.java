package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.exception.InvalidCredentialsException;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class DirectAavpswdAuthenticationPolicy implements AemAuthenticationPolicy {

    @Override
    public AuthUserDto authenticate(AemUserLookupResult user, String password) {
        if (user.storedPassword() == null || password == null
                || !MessageDigest.isEqual(
                        user.storedPassword().getBytes(StandardCharsets.UTF_8),
                        password.getBytes(StandardCharsets.UTF_8))) {
            throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
        }

        return new AuthUserDto(user.userId(), user.userId(), "USER", "Y", user.email());
    }
}
