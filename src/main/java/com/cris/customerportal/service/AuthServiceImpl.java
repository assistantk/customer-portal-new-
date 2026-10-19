package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import org.springframework.stereotype.Service;

@Service
public class AuthServiceImpl implements AuthService {

    private final AemAuthenticationService aemAuthenticationService;

    public AuthServiceImpl(AemAuthenticationService aemAuthenticationService) {
        this.aemAuthenticationService = aemAuthenticationService;
    }

    @Override
    public AuthUserDto authenticate(String identifier, String password) {
        return aemAuthenticationService.authenticate(identifier, password);
    }
}
