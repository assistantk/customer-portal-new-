package com.cris.customerportal.service;

import com.cris.customerportal.dto.RmsApiResponse;
import com.cris.customerportal.dto.RmsLoginRequest;
import com.cris.customerportal.dto.RmsOtpGenerateRequest;
import com.cris.customerportal.dto.RmsOtpVerifyRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.net.URI;
import java.net.URISyntaxException;
import java.io.IOException;
import java.net.HttpURLConnection;

/**
 * Thin HTTP client for the three RMS office APIs:
 *   ATVLDTUSER  – credential validation / designation retrieval
 *   RTGNRTOTP   – OTP generation
 *   RTVRFYOTP   – OTP verification
 */
@Service
public class RmsApiClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(RmsApiClient.class);

    private final String validateUserUrl;
    private final String generateOtpUrl;
    private final String verifyOtpUrl;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    public RmsApiClient(
            RestTemplateBuilder builder,
            String baseUrl,
            String validateUserPath,
            String generateOtpPath,
            String verifyOtpPath,
            long connectTimeoutMs,
            long readTimeoutMs) {
        this(builder, baseUrl, validateUserPath, generateOtpPath, verifyOtpPath,
                connectTimeoutMs, readTimeoutMs, "mock");
    }

    @Autowired
    public RmsApiClient(
            RestTemplateBuilder builder,
            @Value("${rms.api.base-url:}") String baseUrl,
            @Value("${rms.api.validate-user-path:/ATVLDTUSER}") String validateUserPath,
            @Value("${rms.api.generate-otp-path:/RTGNRTOTP}") String generateOtpPath,
            @Value("${rms.api.verify-otp-path:/RTVRFYOTP}") String verifyOtpPath,
            @Value("${rms.api.connect-timeout-ms:5000}") long connectTimeoutMs,
            @Value("${rms.api.read-timeout-ms:10000}") long readTimeoutMs,
            @Value("${rms.auth.mode:live}") String authMode) {

        if (!"mock".equalsIgnoreCase(authMode == null ? "" : authMode.trim())) {
            requireHttpsBaseUrl(baseUrl);
        }

        String normalizedBaseUrl = baseUrl == null ? "" : baseUrl.replaceAll("/+$", "");
        this.validateUserUrl = normalizedBaseUrl + validateUserPath;
        this.generateOtpUrl  = normalizedBaseUrl + generateOtpPath;
        this.verifyOtpUrl    = normalizedBaseUrl + verifyOtpPath;

        this.restTemplate = builder
                .setConnectTimeout(Duration.ofMillis(connectTimeoutMs))
                .setReadTimeout(Duration.ofMillis(readTimeoutMs))
                .requestFactory(RmsApiClient::noRedirectRequestFactory)
                .build();

        this.objectMapper = new ObjectMapper()
                .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

        LOGGER.info("RmsApiClient initialized with connectTimeoutMs={} readTimeoutMs={}",
                connectTimeoutMs, readTimeoutMs);
    }

    static void requireHttpsBaseUrl(String baseUrl) {
        try {
            URI uri = new URI(baseUrl);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || uri.getUserInfo() != null || uri.getQuery() != null
                    || uri.getFragment() != null) {
                throw new IllegalStateException(
                        "A valid HTTPS RMS_API_BASE_URL without embedded credentials or query parameters is required in live mode.");
            }

        } catch (URISyntaxException | NullPointerException ex) {
            throw new IllegalStateException(
                    "A valid HTTPS RMS_API_BASE_URL without embedded credentials or query parameters is required in live mode.", ex);
        }
    }

    private static ClientHttpRequestFactory noRedirectRequestFactory() {
        return new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(HttpURLConnection connection, String httpMethod) throws IOException {
                super.prepareConnection(connection, httpMethod);
                connection.setInstanceFollowRedirects(false);
            }
        };
    }

    public RmsApiResponse validateUser(RmsLoginRequest request) {
        LOGGER.info("Dispatching ATVLDTUSER credential validation request");
        try {
            ResponseEntity<String> response =
                    restTemplate.postForEntity(validateUserUrl, request, String.class);
            String rawJson = response.getBody();
            if (rawJson == null || rawJson.trim().isEmpty()) {
                LOGGER.error("Empty response received from ATVLDTUSER");
                throw new RmsApiException("Empty response received from RMS validation service.");
            }
            RmsApiResponse body = objectMapper.readValue(rawJson, RmsApiResponse.class);
            LOGGER.info("ATVLDTUSER parsed response: status={} errorNo={} roles={}",
                    body.getStatus(), body.getErrorNo(), body.extractAllDesignations());
            return body;
        } catch (ResourceAccessException ex) {
            LOGGER.error("Network/timeout error calling ATVLDTUSER");
            throw new RmsApiException("RMS validation service is currently unreachable. Please try again later.");
        } catch (JsonProcessingException ex) {
            LOGGER.error("JSON parse error calling ATVLDTUSER");
            throw new RmsApiException("RMS validation response format error.");
        } catch (RestClientException ex) {
            LOGGER.error("HTTP error calling ATVLDTUSER");
            throw new RmsApiException("RMS validation service error.");
        }
    }

    public RmsApiResponse generateOtp(RmsOtpGenerateRequest request) {
        LOGGER.info("Dispatching RTGNRTOTP to {} for userId={} cnsr={}", generateOtpUrl, request.getF_USERID(), request.getF_CNSR());
        try {
            ResponseEntity<String> response =
                    restTemplate.postForEntity(generateOtpUrl, request, String.class);
            String rawJson = response.getBody();
            if (rawJson == null || rawJson.trim().isEmpty()) {
                LOGGER.error("Empty response received from RTGNRTOTP at {}", generateOtpUrl);
                throw new RmsApiException("Empty response received from RMS OTP generation service.");
            }
            RmsApiResponse body = objectMapper.readValue(rawJson, RmsApiResponse.class);
            LOGGER.info("RTGNRTOTP parsed response: status={} errorNo={} msg={}",
                    body.getStatus(), body.getErrorNo(), body.getMessage());
            return body;
        } catch (ResourceAccessException ex) {
            LOGGER.error("Network/timeout error calling RTGNRTOTP at {}: {}", generateOtpUrl, ex.getMessage());
            throw new RmsApiException("RMS OTP service is currently unreachable (" + ex.getMessage() + "). Please check server network connectivity or try again.", ex);
        } catch (JsonProcessingException ex) {
            LOGGER.error("JSON parse error calling RTGNRTOTP: {}", ex.getMessage());
            throw new RmsApiException("RMS OTP response format error: " + ex.getMessage(), ex);
        } catch (RestClientException ex) {
            LOGGER.error("HTTP error calling RTGNRTOTP: {}", ex.getMessage());
            throw new RmsApiException("RMS OTP service error: " + ex.getMessage(), ex);
        }
    }

    public RmsApiResponse verifyOtp(RmsOtpVerifyRequest request) {
        LOGGER.info("Dispatching RTVRFYOTP to {} for userId={}", verifyOtpUrl, request.getF_USERID());
        try {
            ResponseEntity<String> response =
                    restTemplate.postForEntity(verifyOtpUrl, request, String.class);
            String rawJson = response.getBody();
            if (rawJson == null || rawJson.trim().isEmpty()) {
                LOGGER.error("Empty response received from RTVRFYOTP at {}", verifyOtpUrl);
                throw new RmsApiException("Empty response received from RMS OTP verification service.");
            }
            RmsApiResponse body = objectMapper.readValue(rawJson, RmsApiResponse.class);
            LOGGER.info("RTVRFYOTP parsed response: status={} errorNo={} msg={}",
                    body.getStatus(), body.getErrorNo(), body.getMessage());
            return body;
        } catch (ResourceAccessException ex) {
            LOGGER.error("Network/timeout error calling RTVRFYOTP at {}: {}", verifyOtpUrl, ex.getMessage());
            throw new RmsApiException("RMS OTP verification service is currently unreachable (" + ex.getMessage() + "). Please check server network connectivity or try again.", ex);
        } catch (JsonProcessingException ex) {
            LOGGER.error("JSON parse error calling RTVRFYOTP: {}", ex.getMessage());
            throw new RmsApiException("RMS OTP verification response format error: " + ex.getMessage(), ex);
        } catch (RestClientException ex) {
            LOGGER.error("HTTP error calling RTVRFYOTP: {}", ex.getMessage());
            throw new RmsApiException("RMS OTP verification service error: " + ex.getMessage(), ex);
        }
    }
}
