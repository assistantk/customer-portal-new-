package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;

public interface AuthService {
    AuthUserDto authenticate(String identifier, String password);
}
