package com.cris.customerportal.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

    @Test
    void preservesSafeIncomingRequestIdAcrossTheFilterChain() throws Exception {
        RequestIdFilter filter = new RequestIdFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/customers");
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader(RequestIdFilter.REQUEST_ID_HEADER, "trace-123");

        filter.doFilterInternal(request, response, (servletRequest, servletResponse) ->
                assertEquals("trace-123", MDC.get(RequestIdFilter.REQUEST_ID_MDC_KEY)));

        assertEquals("trace-123", response.getHeader(RequestIdFilter.REQUEST_ID_HEADER));
        assertEquals(null, MDC.get(RequestIdFilter.REQUEST_ID_MDC_KEY));
    }

    @Test
    void replacesUnsafeIncomingRequestIdWithGeneratedSafeValue() throws Exception {
        RequestIdFilter filter = new RequestIdFilter();
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/customers");
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader(RequestIdFilter.REQUEST_ID_HEADER, "bad\r\nforged");

        filter.doFilterInternal(request, response, (servletRequest, servletResponse) -> {
            String requestId = MDC.get(RequestIdFilter.REQUEST_ID_MDC_KEY);
            assertTrue(requestId.matches("[A-Za-z0-9._-]{1,64}"));
        });

        assertTrue(response.getHeader(RequestIdFilter.REQUEST_ID_HEADER)
                .matches("[A-Za-z0-9._-]{1,64}"));
        assertEquals(null, MDC.get(RequestIdFilter.REQUEST_ID_MDC_KEY));
    }
}
