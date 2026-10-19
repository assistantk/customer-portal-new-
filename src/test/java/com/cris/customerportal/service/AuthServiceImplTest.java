package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthServiceImplTest {

    @Test
    void delegatesAuthenticationToAemService() {
        AemAuthenticationService aemAuthenticationService = mock(AemAuthenticationService.class);
        AuthServiceImpl authService = new AuthServiceImpl(aemAuthenticationService);
        AuthUserDto user = new AuthUserDto("RAILUSER", "RAILUSER", "USER", "Y");
        when(aemAuthenticationService.authenticate("rail.user@example.org", "entered-password"))
                .thenReturn(user);

        assertSame(user, authService.authenticate("rail.user@example.org", "entered-password"));
        verify(aemAuthenticationService).authenticate("rail.user@example.org", "entered-password");
    }
}
