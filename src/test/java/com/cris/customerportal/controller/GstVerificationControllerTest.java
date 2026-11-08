package com.cris.customerportal.controller;

import com.cris.customerportal.dto.GstVerificationRequest;
import com.cris.customerportal.dto.GstVerificationResponse;
import com.cris.customerportal.service.GstVerificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GstVerificationControllerTest {

    private GstVerificationService mockService;
    private GstVerificationController controller;

    @BeforeEach
    void setUp() {
        mockService = mock(GstVerificationService.class);
        controller = new GstVerificationController(mockService);
    }

    @Test
    void verifyGstinByPath_validGstin_returnsOk() {
        GstVerificationResponse res = new GstVerificationResponse();
        res.setSuccess(true);
        res.setGstin("07AAAAA0000A1Z5");
        res.setVerificationStatus("VERIFIED");
        res.setBusinessName("DELHI FREIGHT");

        when(mockService.verifyGstin("07AAAAA0000A1Z5")).thenReturn(res);

        ResponseEntity<GstVerificationResponse> response = controller.verifyGstinByPath("07AAAAA0000A1Z5");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().isSuccess());
        assertEquals("DELHI FREIGHT", response.getBody().getBusinessName());
    }

    @Test
    void verifyGstinByPath_invalidGstin_returnsBadRequest() {
        GstVerificationResponse res = GstVerificationResponse.invalid("BAD", "Invalid format");
        when(mockService.verifyGstin("BAD")).thenReturn(res);

        ResponseEntity<GstVerificationResponse> response = controller.verifyGstinByPath("BAD");

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertNotNull(response.getBody());
        assertFalse(response.getBody().isSuccess());
        assertEquals("INVALID_GSTIN", response.getBody().getVerificationStatus());
    }

    @Test
    void verifyGstinByPath_serviceUnavailable_returns503() {
        GstVerificationResponse res = GstVerificationResponse.unavailable("07AAAAA0000A1Z5", "Service timeout");
        when(mockService.verifyGstin("07AAAAA0000A1Z5")).thenReturn(res);

        ResponseEntity<GstVerificationResponse> response = controller.verifyGstinByPath("07AAAAA0000A1Z5");

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("SERVICE_UNAVAILABLE", response.getBody().getVerificationStatus());
    }

    @Test
    void verifyGstinByPost_validRequest_returnsOk() {
        GstVerificationResponse res = new GstVerificationResponse();
        res.setSuccess(true);
        res.setGstin("07AAAAA0000A1Z5");
        res.setVerificationStatus("VERIFIED");

        when(mockService.verifyGstin("07AAAAA0000A1Z5")).thenReturn(res);

        GstVerificationRequest req = new GstVerificationRequest("07AAAAA0000A1Z5");
        ResponseEntity<GstVerificationResponse> response = controller.verifyGstinByPost(req);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertTrue(response.getBody().isSuccess());
        verify(mockService).verifyGstin("07AAAAA0000A1Z5");
    }
}

