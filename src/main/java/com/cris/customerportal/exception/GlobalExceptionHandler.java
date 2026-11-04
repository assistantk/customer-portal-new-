package com.cris.customerportal.exception;

import com.cris.customerportal.config.DataMaskingUtil;
import com.cris.customerportal.config.RequestIdFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import javax.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<?> validation(MethodArgumentNotValidException exception,
                                 HttpServletRequest request) {
        String message = exception.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(e -> e.getDefaultMessage())
                .orElse("Validation failed");
        LOGGER.warn("Validation failure: requestId={} url={} message={} stackTrace={}",
                requestId(), request.getRequestURI(), DataMaskingUtil.maskSensitive(message),
                DataMaskingUtil.formatThrowable(exception));
        return error(HttpStatus.BAD_REQUEST, message);
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    ResponseEntity<?> invalidCredentials(InvalidCredentialsException exception,
                                         HttpServletRequest request) {
        LOGGER.warn("Invalid credentials: requestId={} url={} stackTrace={}",
                requestId(), request.getRequestURI(), DataMaskingUtil.formatThrowable(exception));
        return error(HttpStatus.UNAUTHORIZED, exception.getMessage());
    }

    @ExceptionHandler(AccountInactiveException.class)
    ResponseEntity<?> accountInactive(AccountInactiveException exception,
                                      HttpServletRequest request) {
        LOGGER.warn("Account inactive: requestId={} url={} message={} stackTrace={}",
                requestId(), request.getRequestURI(), DataMaskingUtil.maskSensitive(exception.getMessage()),
                DataMaskingUtil.formatThrowable(exception));
        return error(HttpStatus.FORBIDDEN, exception.getMessage());
    }

    @ExceptionHandler(DatabaseUnavailableException.class)
    ResponseEntity<?> databaseUnavailable(DatabaseUnavailableException exception,
                                          HttpServletRequest request) {
        LOGGER.error("Database unavailable: requestId={} url={} stackTrace={}",
                requestId(), request.getRequestURI(), DataMaskingUtil.formatThrowable(exception));
        return error(HttpStatus.SERVICE_UNAVAILABLE, exception.getMessage());
    }

    @ExceptionHandler(ResourceAlreadyExistsException.class)
    ResponseEntity<?> duplicate(ResourceAlreadyExistsException exception,
                                HttpServletRequest request) {
        LOGGER.warn("Resource conflict: requestId={} url={} message={} stackTrace={}",
                requestId(), request.getRequestURI(), DataMaskingUtil.maskSensitive(exception.getMessage()),
                DataMaskingUtil.formatThrowable(exception));
        return error(HttpStatus.CONFLICT, exception.getMessage());
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    ResponseEntity<?> notFound(ResourceNotFoundException exception,
                               HttpServletRequest request) {
        LOGGER.warn("Resource not found: requestId={} url={} message={} stackTrace={}",
                requestId(), request.getRequestURI(), DataMaskingUtil.maskSensitive(exception.getMessage()),
                DataMaskingUtil.formatThrowable(exception));
        return error(HttpStatus.NOT_FOUND, exception.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<?> bad(IllegalArgumentException exception,
                          HttpServletRequest request) {
        LOGGER.warn("Bad argument: requestId={} url={} message={} stackTrace={}",
                requestId(), request.getRequestURI(), DataMaskingUtil.maskSensitive(exception.getMessage()),
                DataMaskingUtil.formatThrowable(exception));
        return error(HttpStatus.BAD_REQUEST, exception.getMessage());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<?> general(Exception exception, HttpServletRequest request) {
        LOGGER.error("Unhandled request error: requestId={} url={} stackTrace={}",
                requestId(), request.getRequestURI(), DataMaskingUtil.formatThrowable(exception));
        return error(HttpStatus.INTERNAL_SERVER_ERROR,
                "An unexpected error occurred. Please try again later.");
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private static String requestId() {
        String id = MDC.get(RequestIdFilter.REQUEST_ID_MDC_KEY);
        return id != null ? id : "n/a";
    }

    private ResponseEntity<?> error(HttpStatus status, String message) {
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("message", message);
        body.put("timestamp", Instant.now().toString());
        return ResponseEntity.status(status).body(body);
    }
}
