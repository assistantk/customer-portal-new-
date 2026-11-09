package com.cris.customerportal.controller;

import com.cris.customerportal.dto.ImageOcrResponse;
import com.cris.customerportal.dto.SemGstinVerificationResponse;
import com.cris.customerportal.service.CustomerService;
import com.cris.customerportal.service.ImageOcrService;
import com.cris.customerportal.service.SemGstinVerificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CustomerControllerTest {

    private CustomerService customerService;
    private ImageOcrService imageOcrService;
    private SemGstinVerificationService semGstinVerificationService;
    private CustomerController controller;

    @BeforeEach
    void setUp() {
        customerService = mock(CustomerService.class);
        imageOcrService = mock(ImageOcrService.class);
        semGstinVerificationService = mock(SemGstinVerificationService.class);
        controller = new CustomerController(customerService, imageOcrService, semGstinVerificationService);
    }

    @Test
    void testOcrImage_delegatesToService() {
        MockMultipartFile file = new MockMultipartFile("file", "cert.png", "image/png", new byte[]{1, 2, 3});
        ImageOcrResponse expected = new ImageOcrResponse();
        expected.setSuccess(true);
        expected.setGstin("07AAAAA0000A1Z5");
        when(imageOcrService.processImage(file)).thenReturn(expected);

        ResponseEntity<ImageOcrResponse> response = controller.ocrImage(file);

        assertNotNull(response);
        assertEquals(200, response.getStatusCodeValue());
        assertTrue(response.getBody().isSuccess());
        assertEquals("07AAAAA0000A1Z5", response.getBody().getGstin());
        verify(imageOcrService, times(1)).processImage(file);
    }

    @Test
    void testVerifySemGstin_delegatesToService() {
        SemGstinVerificationResponse expected = SemGstinVerificationResponse.verified(
                "07AAAAA0000A1Z4", "ACME LOGISTICS", "DELHI", "✓ Verified – Details matched with office database."
        );
        when(semGstinVerificationService.verifyGstin("07AAAAA0000A1Z4", "ACME LOGISTICS", "DELHI"))
                .thenReturn(expected);

        ResponseEntity<SemGstinVerificationResponse> response =
                controller.verifySemGstin("07AAAAA0000A1Z4", "ACME LOGISTICS", "DELHI");

        assertNotNull(response);
        assertEquals(200, response.getStatusCodeValue());
        assertTrue(response.getBody().isVerified());
        assertEquals("VERIFIED", response.getBody().getStatus());
        assertEquals("✓ Verified – Details matched with office database.", response.getBody().getMessage());
        verify(semGstinVerificationService, times(1))
                .verifyGstin("07AAAAA0000A1Z4", "ACME LOGISTICS", "DELHI");
    }
}
