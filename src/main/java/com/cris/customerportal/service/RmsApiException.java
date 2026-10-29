package com.cris.customerportal.service;

/**
 * Thrown when communication with an RMS office API fails or the API returns
 * an error-status response that cannot be handled by the caller.
 */
public class RmsApiException extends RuntimeException {

    public RmsApiException(String message) {
        super(message);
    }

    public RmsApiException(String message, Throwable cause) {
        super(message, cause);
    }
}
