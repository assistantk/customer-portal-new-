package com.cris.customerportal.service;

import com.cris.customerportal.dto.GstVerificationResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;

import static org.junit.jupiter.api.Assertions.*;

class GstVerificationServiceTest {

    private GstVerificationServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new GstVerificationServiceImpl(
                new RestTemplateBuilder(),
                true,
                "mock",
                "https://api.sandbox.co.in/gsp/public/taxpayer/search",
                "",
                "",
                "",
                5000,
                10000
        );
    }

    @Test
    void verifyValidGstin_returnsVerifiedActiveResponse() {
        GstVerificationResponse response = service.verifyGstin("07AAAAA0000A1Z5");

        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals("07AAAAA0000A1Z5", response.getGstin());
        assertEquals("DELHI FREIGHT LOGISTICS PRIVATE LIMITED", response.getLegalName());
        assertEquals("DELHI FREIGHT EXPRESS", response.getTradeName());
        assertEquals("AAAAA0000A", response.getPan());
        assertEquals("Active", response.getStatus());
        assertEquals("VERIFIED", response.getVerificationStatus());
        assertEquals("Delhi", response.getState());
        assertEquals("110020", response.getPincode());
        assertTrue(response.getAddress().contains("OKHLA"));
    }

    @Test
    void verifyDynamicValidGstin_derivesStateAndPan() {
        // Maharashtra state code 27, PAN ABCDE1234F
        GstVerificationResponse response = service.verifyGstin("27ABCDE1234F1Z5");

        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals("27ABCDE1234F1Z5", response.getGstin());
        assertEquals("ABCDE1234F", response.getPan());
        assertEquals("Maharashtra", response.getState());
        assertEquals("Active", response.getStatus());
        assertEquals("VERIFIED", response.getVerificationStatus());
    }

    @Test
    void verifyInvalidGstinFormat_returnsInvalidGstinStatus() {
        GstVerificationResponse r1 = service.verifyGstin("INVALID_GSTIN");
        assertFalse(r1.isSuccess());
        assertEquals("INVALID_GSTIN", r1.getVerificationStatus());

        GstVerificationResponse r2 = service.verifyGstin("");
        assertFalse(r2.isSuccess());
        assertEquals("INVALID_GSTIN", r2.getVerificationStatus());

        GstVerificationResponse r3 = service.verifyGstin(null);
        assertFalse(r3.isSuccess());
        assertEquals("INVALID_GSTIN", r3.getVerificationStatus());
    }

    @Test
    void verifyNotFoundGstin_returnsNotFoundStatus() {
        GstVerificationResponse response = service.verifyGstin("07AAAAA0000A9Z9");

        assertNotNull(response);
        assertFalse(response.isSuccess());
        assertEquals("NOT_FOUND", response.getVerificationStatus());
    }

    @Test
    void verifyCancelledGstin_returnsCancelledStatus() {
        GstVerificationResponse response = service.verifyGstin("07AAAAA0000A8Z8");

        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals("Cancelled", response.getStatus());
        assertEquals("CANCELLED", response.getVerificationStatus());
        assertTrue(response.getMessage().contains("CANCELLED"));
    }

    @Test
    void verifySuspendedGstin_returnsSuspendedStatus() {
        GstVerificationResponse response = service.verifyGstin("07AAAAA0000A7Z7");

        assertNotNull(response);
        assertTrue(response.isSuccess());
        assertEquals("Suspended", response.getStatus());
        assertEquals("SUSPENDED", response.getVerificationStatus());
        assertTrue(response.getMessage().contains("SUSPENDED"));
    }

    @Test
    void verifyTimeoutGstin_returnsServiceUnavailable() {
        GstVerificationResponse response = service.verifyGstin("07TIMEO0000T1Z5");

        assertNotNull(response);
        assertFalse(response.isSuccess());
        assertEquals("SERVICE_UNAVAILABLE", response.getVerificationStatus());
    }

    @Test
    void disabledService_returnsServiceUnavailable() {
        GstVerificationServiceImpl disabledService = new GstVerificationServiceImpl(
                new RestTemplateBuilder(),
                false,
                "mock",
                "https://api.sandbox.co.in/gsp/public/taxpayer/search",
                "",
                "",
                "",
                5000,
                10000
        );

        GstVerificationResponse response = disabledService.verifyGstin("07AAAAA0000A1Z5");
        assertNotNull(response);
        assertFalse(response.isSuccess());
        assertEquals("SERVICE_UNAVAILABLE", response.getVerificationStatus());
    }

    @Test
    void caching_repeatedCallsReturnCachedResponse() {
        GstVerificationResponse r1 = service.verifyGstin("07AAAAA0000A1Z5");
        GstVerificationResponse r2 = service.verifyGstin("07AAAAA0000A1Z5");

        assertSame(r1, r2);

        service.clearCache();
        GstVerificationResponse r3 = service.verifyGstin("07AAAAA0000A1Z5");
        assertNotSame(r1, r3);
        assertEquals(r1.getGstin(), r3.getGstin());
    }

    @Test
    void parseGspApiResponse_correctlyParsesJsonStructure() {
        String json = "{\n" +
                "  \"data\": {\n" +
                "    \"legal_name\": \"RELIABLE FREIGHT SERVICES PRIVATE LIMITED\",\n" +
                "    \"trade_name\": \"RELIABLE FREIGHT\",\n" +
                "    \"pan\": \"AABCR1234D\",\n" +
                "    \"status\": \"Active\",\n" +
                "    \"registration_date\": \"12-04-2018\",\n" +
                "    \"constitution_of_business\": \"Private Limited Company\",\n" +
                "    \"taxpayer_type\": \"Regular\",\n" +
                "    \"pradr\": {\n" +
                "      \"addr\": {\n" +
                "        \"bno\": \"101\",\n" +
                "        \"bnm\": \"RAIL TOWERS\",\n" +
                "        \"st\": \"BARAKHAMBA ROAD\",\n" +
                "        \"loc\": \"CONNAUGHT PLACE\",\n" +
                "        \"dst\": \"NEW DELHI\",\n" +
                "        \"stcd\": \"Delhi\",\n" +
                "        \"pncd\": \"110001\"\n" +
                "      }\n" +
                "    },\n" +
                "    \"nba\": [\"Transport\", \"Logistics\"]\n" +
                "  }\n" +
                "}";

        GstVerificationResponse res = service.parseGspApiResponse("07AABCR1234D1Z5", json);

        assertNotNull(res);
        assertTrue(res.isSuccess());
        assertEquals("07AABCR1234D1Z5", res.getGstin());
        assertEquals("RELIABLE FREIGHT SERVICES PRIVATE LIMITED", res.getLegalName());
        assertEquals("RELIABLE FREIGHT", res.getTradeName());
        assertEquals("RELIABLE FREIGHT", res.getBusinessName());
        assertEquals("AABCR1234D", res.getPan());
        assertEquals("Active", res.getStatus());
        assertEquals("VERIFIED", res.getVerificationStatus());
        assertEquals("110001", res.getPincode());
        assertTrue(res.getAddress().contains("BARAKHAMBA ROAD"));
        assertTrue(res.getNatureOfBusiness().contains("Transport"));
    }
}
