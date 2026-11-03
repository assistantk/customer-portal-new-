package com.cris.customerportal.service;

import com.cris.customerportal.dto.RmsOtpVerifyRequest;
import com.cris.customerportal.dto.RmsApiResponse;
import com.cris.customerportal.dto.RmsLoginRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RmsApiClientTest {

    @Test
    void validateUserPostsDynamicCredentialsAsJsonToAtvldtuser() throws IOException {
        AtomicReference<String> requestMethod = new AtomicReference<>();
        AtomicReference<String> requestContentType = new AtomicReference<>();
        AtomicReference<String> requestBody = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/RMS/ATVLDTUSER", exchange -> {
            requestMethod.set(exchange.getRequestMethod());
            requestContentType.set(exchange.getRequestHeaders().getFirst("Content-Type"));
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = ("{\"F_ERORNO\":\"\",\"F_USERID\":\"DYNAMIC\","
                    + "\"F_SRVCNAME\":\"ATVLDTUSER\",\"F_ROLEID\":[\"SR-DCM\"]}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        try {
            RmsApiClient client = new RmsApiClient(
                    new RestTemplateBuilder(),
                    "http://127.0.0.1:" + server.getAddress().getPort() + "/RMS",
                    "http://127.0.0.1:" + server.getAddress().getPort() + "/RMS",
                    "/ATVLDTUSER",
                    "/RTGNRTOTP",
                    "/RTVRFYOTP",
                    5000,
                    10000);
            RmsLoginRequest request = new RmsLoginRequest();
            request.setF_LOCN("TKD");
            request.setF_USERID("DYNAMIC");
            request.setF_PSWD("runtime-password");
            request.setF_APLYDATE("02-11-2026");

            RmsApiResponse response = client.validateUser(request);
            JsonNode sent = new ObjectMapper().readTree(requestBody.get());

            assertEquals("POST", requestMethod.get());
            assertNotNull(requestContentType.get());
            assertTrue(requestContentType.get().startsWith("application/json"));
            assertEquals("DYNAMIC", sent.path("F_USERID").asText());
            assertEquals("runtime-password", sent.path("F_PSWD").asText());
            assertEquals("TKD", sent.path("F_LOCN").asText());
            assertEquals("S", sent.path("F_OPTN").asText());
            assertEquals("ATVLDTUSER", sent.path("F_SRVCNAME").asText());
            assertTrue(response.isCredentialValidationSuccessful("DYNAMIC"));
            assertEquals(java.util.Collections.singletonList("SR-DCM"), response.extractRoleIds());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void parsesHttpClientErrorWithAtvldtuserCredentialFailureAsRejectedCredentials() {
        RmsApiClient client = new RmsApiClient(
                new RestTemplateBuilder(),
                "https://credentials.example/RMS",
                "http://127.0.0.1:7101/RMS",
                "/ATVLDTUSER",
                "/RTGNRTOTP",
                "/RTVRFYOTP",
                5000,
                10000);

        RmsApiResponse response = client.parseCredentialRejection(
                "{\"F_ERORNO\":\"YOUR USER ID OR PASSWORD IS INCORRECT\","
                        + "\"F_USERID\":\"SREEJU\",\"F_SRVCNAME\":\"ATVLDTUSER\","
                        + "\"F_ROLEID\":\"\"}");

        assertEquals("E", response.getStatus());
        assertFalse(response.isCredentialValidationSuccessful("SREEJU"));
        assertEquals("error", client.parseCredentialRejection(
                "{\"F_ERORNO\":\"error\"}").getErrorNo());
        assertNull(client.parseCredentialRejection(
                "{\"F_ERORNO\":\"0\",\"F_SRVCNAME\":\"RTGNRTOTP\"}"));
    }

    @Test
    void verifyOtpUsesConfiguredOtpApiBaseUrl() throws IOException {
        AtomicReference<String> requestPath = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/RMS/RTVRFYOTP", exchange -> {
            requestPath.set(exchange.getRequestURI().getPath());
            byte[] response = "{}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
        });
        server.start();

        try {
            String otpBaseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/RMS";
            RmsApiClient client = new RmsApiClient(
                    new RestTemplateBuilder(),
                    "https://credentials.example/RMS",
                    otpBaseUrl,
                    "/ATVLDTUSER",
                    "/RTGNRTOTP",
                    "/RTVRFYOTP",
                    5000,
                    10000);

            client.verifyOtp(new RmsOtpVerifyRequest());

            assertEquals("/RMS/RTVRFYOTP", requestPath.get());
        } finally {
            server.stop(0);
        }
    }
}
