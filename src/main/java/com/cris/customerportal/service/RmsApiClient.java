package com.cris.customerportal.service;

import com.cris.customerportal.dto.RmsApiResponse;
import com.cris.customerportal.dto.RmsLoginRequest;
import com.cris.customerportal.dto.RmsOtpGenerateRequest;
import com.cris.customerportal.dto.RmsOtpVerifyRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * Thin HTTP client for the three RMS office APIs:
 *   ATVLDTUSER  – credential validation / designation retrieval
 *   RTGNRTOTP   – OTP generation
 *   RTVRFYOTP   – OTP verification
 *
 * This class is ONLY used when rms.auth.mode=live.
 * For local development use MockRmsApiClient instead.
 */
@Service
public class RmsApiClient {

    private static final Logger LOGGER = LoggerFactory.getLogger(RmsApiClient.class);

    private final String validateUserUrl;
    private final String generateOtpUrl;
    private final String verifyOtpUrl;
    private final RestTemplate restTemplate;

    public RmsApiClient(
            RestTemplateBuilder builder,
            @Value("${rms.api.base-url}") String baseUrl,
            @Value("${rms.api.validate-user-path}") String validateUserPath,
            @Value("${rms.api.generate-otp-path}") String generateOtpPath,
            @Value("${rms.api.verify-otp-path}") String verifyOtpPath,
            @Value("${rms.api.connect-timeout-ms:5000}") long connectTimeoutMs,
            @Value("${rms.api.read-timeout-ms:10000}") long readTimeoutMs) {

        this.validateUserUrl = baseUrl + validateUserPath;
        this.generateOtpUrl  = baseUrl + generateOtpPath;
        this.verifyOtpUrl    = baseUrl + verifyOtpPath;

        this.restTemplate = builder
                .setConnectTimeout(Duration.ofMillis(connectTimeoutMs))
                .setReadTimeout(Duration.ofMillis(readTimeoutMs))
                .build();

        LOGGER.info("RmsApiClient configured. validateUser={} generateOtp={} verifyOtp={}",
                validateUserUrl, generateOtpUrl, verifyOtpUrl);
    }

    /**
     * Calls ATVLDTUSER to validate the user's credentials and retrieve their designations.
     *
     * @param request fully-populated {@link RmsLoginRequest}
     * @return parsed {@link RmsApiResponse}
     * @throws RmsApiException if the HTTP call fails or returns a non-success response
     */
    public RmsApiResponse validateUser(RmsLoginRequest request) {
        LOGGER.debug("Calling ATVLDTUSER for userId={} locn={}", request.getF_USERID(), request.getF_LOCN());
        try {
            ResponseEntity<RmsApiResponse> response =
                    restTemplate.postForEntity(validateUserUrl, request, RmsApiResponse.class);
            RmsApiResponse body = response.getBody();
            if (body == null) {
                throw new RmsApiException("Empty response from ATVLDTUSER");
            }
            LOGGER.debug("ATVLDTUSER response: status={} msg={}", body.getStatus(), body.getMessage());
            return body;
        } catch (RestClientException ex) {
            LOGGER.error("HTTP error calling ATVLDTUSER: {}", ex.getMessage());
            throw new RmsApiException("Unable to reach RMS validation service. Please try again.", ex);
        }
    }

    /**
     * Calls RTGNRTOTP to generate and dispatch an OTP.
     *
     * @param request fully-populated {@link RmsOtpGenerateRequest}
     * @return parsed {@link RmsApiResponse}
     */
    public RmsApiResponse generateOtp(RmsOtpGenerateRequest request) {
        LOGGER.debug("Calling RTGNRTOTP for userId={}", request.getF_USERID());
        try {
            ResponseEntity<RmsApiResponse> response =
                    restTemplate.postForEntity(generateOtpUrl, request, RmsApiResponse.class);
            RmsApiResponse body = response.getBody();
            if (body == null) {
                throw new RmsApiException("Empty response from RTGNRTOTP");
            }
            LOGGER.debug("RTGNRTOTP response: status={} msg={}", body.getStatus(), body.getMessage());
            return body;
        } catch (RestClientException ex) {
            LOGGER.error("HTTP error calling RTGNRTOTP: {}", ex.getMessage());
            throw new RmsApiException("Unable to reach OTP generation service. Please try again.", ex);
        }
    }

    /**
     * Calls RTVRFYOTP to verify the OTP entered by the user.
     *
     * @param request fully-populated {@link RmsOtpVerifyRequest}
     * @return parsed {@link RmsApiResponse}
     */
    public RmsApiResponse verifyOtp(RmsOtpVerifyRequest request) {
        LOGGER.debug("Calling RTVRFYOTP for userId={}", request.getF_USERID());
        try {
            ResponseEntity<RmsApiResponse> response =
                    restTemplate.postForEntity(verifyOtpUrl, request, RmsApiResponse.class);
            RmsApiResponse body = response.getBody();
            if (body == null) {
                throw new RmsApiException("Empty response from RTVRFYOTP");
            }
            LOGGER.debug("RTVRFYOTP response: status={} msg={}", body.getStatus(), body.getMessage());
            return body;
        } catch (RestClientException ex) {
            LOGGER.error("HTTP error calling RTVRFYOTP: {}", ex.getMessage());
            throw new RmsApiException("Unable to reach OTP verification service. Please try again.", ex);
        }
    }
}
