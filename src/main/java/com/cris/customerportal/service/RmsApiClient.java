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
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

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

    public RmsApiClient(
            RestTemplateBuilder builder,
            @Value("${rms.api.base-url:http://10.60.201.192:7101/RMS}") String baseUrl,
            @Value("${rms.api.validate-user-path:/ATVLDTUSER}") String validateUserPath,
            @Value("${rms.api.generate-otp-path:/RTGNRTOTP}") String generateOtpPath,
            @Value("${rms.api.verify-otp-path:/RTVRFYOTP}") String verifyOtpPath,
            @Value("${rms.api.connect-timeout-ms:5000}") long connectTimeoutMs,
            @Value("${rms.api.read-timeout-ms:10000}") long readTimeoutMs) {

        this.validateUserUrl = baseUrl + validateUserPath;
        this.generateOtpUrl  = baseUrl + generateOtpPath;
        this.verifyOtpUrl    = baseUrl + verifyOtpPath;

        this.restTemplate = builder
                .setConnectTimeout(Duration.ofMillis(connectTimeoutMs))
                .setReadTimeout(Duration.ofMillis(readTimeoutMs))
                .build();

        LOGGER.info("RmsApiClient initialized. validateUserUrl={} generateOtpUrl={} verifyOtpUrl={} connectTimeoutMs={} readTimeoutMs={}",
                validateUserUrl, generateOtpUrl, verifyOtpUrl, connectTimeoutMs, readTimeoutMs);
    }

    public RmsApiResponse validateUser(RmsLoginRequest request) {
        LOGGER.info("Dispatching ATVLDTUSER to {} for userId={} locn={}", validateUserUrl, request.getF_USERID(), request.getF_LOCN());
        try {
            ResponseEntity<RmsApiResponse> response =
                    restTemplate.postForEntity(validateUserUrl, request, RmsApiResponse.class);
            RmsApiResponse body = response.getBody();
            if (body == null) {
                LOGGER.error("Empty response received from ATVLDTUSER at {}", validateUserUrl);
                throw new RmsApiException("Empty response received from RMS validation service.");
            }
            LOGGER.info("ATVLDTUSER response received: status={} errorNo={} msg={}",
                    body.getStatus(), body.getErrorNo(), body.getMessage());
            return body;
        } catch (ResourceAccessException ex) {
            LOGGER.error("Network/timeout error calling ATVLDTUSER at {}: {}", validateUserUrl, ex.getMessage());
            throw new RmsApiException("RMS validation service is currently unreachable (" + ex.getMessage() + "). Please check server network connectivity or try again.", ex);
        } catch (RestClientException ex) {
            LOGGER.error("HTTP error calling ATVLDTUSER: {}", ex.getMessage());
            throw new RmsApiException("RMS validation service error: " + ex.getMessage(), ex);
        }
    }

    public RmsApiResponse generateOtp(RmsOtpGenerateRequest request) {
        LOGGER.info("Dispatching RTGNRTOTP to {} for userId={} cnsr={}", generateOtpUrl, request.getF_USERID(), request.getF_CNSR());
        try {
            ResponseEntity<RmsApiResponse> response =
                    restTemplate.postForEntity(generateOtpUrl, request, RmsApiResponse.class);
            RmsApiResponse body = response.getBody();
            if (body == null) {
                LOGGER.error("Empty response received from RTGNRTOTP at {}", generateOtpUrl);
                throw new RmsApiException("Empty response received from RMS OTP generation service.");
            }
            LOGGER.info("RTGNRTOTP response received: status={} errorNo={} msg={}",
                    body.getStatus(), body.getErrorNo(), body.getMessage());
            return body;
        } catch (ResourceAccessException ex) {
            LOGGER.error("Network/timeout error calling RTGNRTOTP at {}: {}", generateOtpUrl, ex.getMessage());
            throw new RmsApiException("RMS OTP service is currently unreachable (" + ex.getMessage() + "). Please check server network connectivity or try again.", ex);
        } catch (RestClientException ex) {
            LOGGER.error("HTTP error calling RTGNRTOTP: {}", ex.getMessage());
            throw new RmsApiException("RMS OTP service error: " + ex.getMessage(), ex);
        }
    }

    public RmsApiResponse verifyOtp(RmsOtpVerifyRequest request) {
        LOGGER.info("Dispatching RTVRFYOTP to {} for userId={}", verifyOtpUrl, request.getF_USERID());
        try {
            ResponseEntity<RmsApiResponse> response =
                    restTemplate.postForEntity(verifyOtpUrl, request, RmsApiResponse.class);
            RmsApiResponse body = response.getBody();
            if (body == null) {
                LOGGER.error("Empty response received from RTVRFYOTP at {}", verifyOtpUrl);
                throw new RmsApiException("Empty response received from RMS OTP verification service.");
            }
            LOGGER.info("RTVRFYOTP response received: status={} errorNo={} msg={}",
                    body.getStatus(), body.getErrorNo(), body.getMessage());
            return body;
        } catch (ResourceAccessException ex) {
            LOGGER.error("Network/timeout error calling RTVRFYOTP at {}: {}", verifyOtpUrl, ex.getMessage());
            throw new RmsApiException("RMS OTP verification service is currently unreachable (" + ex.getMessage() + "). Please check server network connectivity or try again.", ex);
        } catch (RestClientException ex) {
            LOGGER.error("HTTP error calling RTVRFYOTP: {}", ex.getMessage());
            throw new RmsApiException("RMS OTP verification service error: " + ex.getMessage(), ex);
        }
    }
}
