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

    @Test
    void testLookupOld_withCodeMode_delegatesToLookupOldCustomerByCode() {
        com.cris.customerportal.dto.OldCustomerResponse expected = new com.cris.customerportal.dto.OldCustomerResponse();
        expected.setCustomerCode("SAEB");
        expected.setCompanyName("SAMPLE CO");
        when(customerService.lookupOldCustomerByCode("SAEB")).thenReturn(expected);

        Object resp = controller.lookupOld("SAEB", "CODE", null);

        assertSame(expected, resp);
        verify(customerService, times(1)).lookupOldCustomerByCode("SAEB");
        verify(customerService, never()).searchGlobalCustomersByCompanyName(anyString());
    }

    @Test
    void testLookupOld_withNameMode_delegatesToSearchGlobalCustomersByCompanyName() {
        com.cris.customerportal.dto.OldCustomerResponse item = new com.cris.customerportal.dto.OldCustomerResponse();
        item.setCustomerCode("TISCO");
        item.setCompanyName("TATA STEEL");
        when(customerService.searchGlobalCustomersByCompanyName("TATA")).thenReturn(java.util.List.of(item));

        Object resp = controller.lookupOld("TATA", "NAME", null);

        assertTrue(resp instanceof java.util.List);
        assertEquals(1, ((java.util.List<?>) resp).size());
        verify(customerService, times(1)).searchGlobalCustomersByCompanyName("TATA");
        verify(customerService, never()).lookupOldCustomerByCode(anyString());
    }

    @Test
    void testSearchAgents_delegatesWithMode() {
        com.cris.customerportal.dto.GlobalAgentResponse agent = new com.cris.customerportal.dto.GlobalAgentResponse();
        agent.setCode("AG1");
        when(customerService.searchHandlingAgents("AG1", "CODE")).thenReturn(java.util.List.of(agent));

        java.util.List<com.cris.customerportal.dto.GlobalAgentResponse> resp =
                controller.searchAgents("AG1", "CODE", null);

        assertEquals(1, resp.size());
        verify(customerService, times(1)).searchHandlingAgents("AG1", "CODE");

        controller.searchAgents("LOGISTICS", "NAME", null);
        verify(customerService, times(1)).searchHandlingAgents("LOGISTICS", "NAME");
    }

    @Test
    void testSearchOwnership_delegatesWithMode() {
        java.util.Map<String, String> row = java.util.Map.of("ownershipCode", "OWN1", "companyName", "CORP");
        when(customerService.searchOwnershipCodes("OWN1", "CODE")).thenReturn(java.util.List.of(row));

        java.util.List<java.util.Map<String, String>> resp =
                controller.searchOwnership("OWN1", "CODE", null);

        assertEquals(1, resp.size());
        verify(customerService, times(1)).searchOwnershipCodes("OWN1", "CODE");

        controller.searchOwnership("CORP", "NAME", null);
        verify(customerService, times(1)).searchOwnershipCodes("CORP", "NAME");
    }

    @Test
    void testCheckGstinDuplicate_delegatesToService() {
        com.cris.customerportal.dto.GstinDuplicateCheckResult expected =
                new com.cris.customerportal.dto.GstinDuplicateCheckResult(false, "AVAILABLE", "GSTIN is available");
        when(customerService.checkGstinDuplicate("20APEPA6196G1Z9", "ABCD")).thenReturn(expected);

        ResponseEntity<com.cris.customerportal.dto.GstinDuplicateCheckResult> resp =
                controller.checkGstinDuplicate("20APEPA6196G1Z9", "ABCD");

        assertNotNull(resp);
        assertEquals(200, resp.getStatusCodeValue());
        assertSame(expected, resp.getBody());
        verify(customerService, times(1)).checkGstinDuplicate("20APEPA6196G1Z9", "ABCD");
    }

    @Test
    void testCheckPanDuplicate_delegatesToService() {
        com.cris.customerportal.dto.PanDuplicateCheckResult expected =
                new com.cris.customerportal.dto.PanDuplicateCheckResult(false, "AVAILABLE", "PAN is available");
        when(customerService.checkPanDuplicate("ABCDE1234F")).thenReturn(expected);

        ResponseEntity<com.cris.customerportal.dto.PanDuplicateCheckResult> resp =
                controller.checkPanDuplicate("ABCDE1234F");

        assertNotNull(resp);
        assertEquals(200, resp.getStatusCodeValue());
        assertSame(expected, resp.getBody());
        verify(customerService, times(1)).checkPanDuplicate("ABCDE1234F");
    }
}
