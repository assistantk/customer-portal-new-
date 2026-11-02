package com.cris.customerportal.service;

import com.cris.customerportal.dto.RmsOtpVerifyRequest;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.client.RestTemplateBuilder;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RmsApiClientTest {

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
                    10000,
                    "live");

            client.verifyOtp(new RmsOtpVerifyRequest());

            assertEquals("/RMS/RTVRFYOTP", requestPath.get());
        } finally {
            server.stop(0);
        }
    }
}
