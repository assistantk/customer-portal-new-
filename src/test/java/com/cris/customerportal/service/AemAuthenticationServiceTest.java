package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.exception.InvalidCredentialsException;
import com.cris.customerportal.repository.AemUserLookupRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AemAuthenticationServiceTest {

    private AemUserLookupRepository userLookupRepository;
    private AemAuthenticationPolicy authenticationPolicy;
    private AemAuthenticationService authenticationService;

    @BeforeEach
    void setUp() {
        userLookupRepository = mock(AemUserLookupRepository.class);
        authenticationPolicy = mock(AemAuthenticationPolicy.class);
        authenticationService = new AemAuthenticationService(userLookupRepository, authenticationPolicy);
    }

    @Test
    void delegatesCandidateAndPasswordToConfiguredPolicy() {
        AemUserLookupResult candidate =
                new AemUserLookupResult("RAILUSER", "rail.user@example.org", "stored-value");
        AuthUserDto authenticatedUser = new AuthUserDto("RAILUSER", "Rail User", "USER", "Y");
        when(userLookupRepository.findByIdentifier("rail.user@example.org")).thenReturn(Optional.of(candidate));
        when(authenticationPolicy.authenticate(candidate, "entered-password")).thenReturn(authenticatedUser);

        assertSame(authenticatedUser,
                authenticationService.authenticate(" rail.user@example.org ", "entered-password"));
        verify(authenticationPolicy).authenticate(candidate, "entered-password");
    }

    @Test
    void acceptsUserIdAsIdentifier() {
        AemUserLookupResult candidate =
                new AemUserLookupResult("RAILUSER", "rail.user@example.org", "stored-value");
        AuthUserDto authenticatedUser = new AuthUserDto("RAILUSER", "RAILUSER", "USER", "Y");
        when(userLookupRepository.findByIdentifier("RAILUSER")).thenReturn(Optional.of(candidate));
        when(authenticationPolicy.authenticate(candidate, "entered-password")).thenReturn(authenticatedUser);

        assertSame(authenticatedUser, authenticationService.authenticate("RAILUSER", "entered-password"));
        verify(userLookupRepository).findByIdentifier("RAILUSER");
    }

    @Test
    void rejectsMissingUserWithoutInvokingAuthenticationPolicy() {
        when(userLookupRepository.findByIdentifier("missing")).thenReturn(Optional.empty());

        assertThrows(InvalidCredentialsException.class,
                () -> authenticationService.authenticate("missing", "entered-password"));
        verifyNoInteractions(authenticationPolicy);
    }

    @Test
    void rejectsMissingPasswordWithoutLookingUpOrAuthenticating() {
        assertThrows(IllegalArgumentException.class,
                () -> authenticationService.authenticate("RAILUSER", ""));
        verifyNoInteractions(userLookupRepository, authenticationPolicy);
    }
}
