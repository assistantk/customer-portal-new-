package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class AuthServiceImpl implements AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthServiceImpl.class);

    private final AemAuthenticationService aemAuthenticationService;

    public AuthServiceImpl(AemAuthenticationService aemAuthenticationService) {
        this.aemAuthenticationService = aemAuthenticationService;
    }

    @Override
    public AuthUserDto authenticate(String identifier, String password) {
        log.debug("AuthServiceImpl.authenticate: delegating to AemAuthenticationService");
        return aemAuthenticationService.authenticate(identifier, password);
    }
}
