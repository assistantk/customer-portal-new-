package com.cris.customerportal.controller;

import com.cris.customerportal.config.DataMaskingUtil;
import com.cris.customerportal.dto.GstVerificationRequest;
import com.cris.customerportal.dto.GstVerificationResponse;
import com.cris.customerportal.service.GstVerificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;

/**
 * Controller exposing endpoints for GSTIN-based taxpayer verification.
 * Keeps external API communications strictly on the backend.
 */
@RestController
@RequestMapping("/api/gst")
@CrossOrigin(originPatterns = {
        "http://localhost:[*]",
        "http://127.0.0.1:[*]",
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
}, allowCredentials = "true")
public class GstVerificationController {

    private static final Logger LOGGER = LoggerFactory.getLogger(GstVerificationController.class);

    private final GstVerificationService gstVerificationService;

    @Autowired
    public GstVerificationController(GstVerificationService gstVerificationService) {
        this.gstVerificationService = gstVerificationService;
    }

    /**
     * Verifies a GSTIN via path parameter.
     */
    @GetMapping("/verify/{gstin}")
    public ResponseEntity<GstVerificationResponse> verifyGstinByPath(
            @PathVariable("gstin") String gstin) {
        LOGGER.info("GET /api/gst/verify/{}", DataMaskingUtil.maskSensitive(gstin));
        return handleVerification(gstin);
    }

    /**
     * Verifies a GSTIN via JSON request body.
     */
    @PostMapping("/verify")
    public ResponseEntity<GstVerificationResponse> verifyGstinByPost(
            @Valid @RequestBody GstVerificationRequest request) {
        String gstin = request != null ? request.getGstin() : null;
        LOGGER.info("POST /api/gst/verify for gstin={}", DataMaskingUtil.maskSensitive(gstin));
        return handleVerification(gstin);
    }

    private ResponseEntity<GstVerificationResponse> handleVerification(String gstin) {
        if (gstin == null || gstin.trim().isEmpty()) {
            GstVerificationResponse response = GstVerificationResponse.invalid(gstin, "GSTIN is required.");
            return ResponseEntity.badRequest().body(response);
        }

        GstVerificationResponse response = gstVerificationService.verifyGstin(gstin);

        if ("INVALID_GSTIN".equals(response.getVerificationStatus())) {
            return ResponseEntity.badRequest().body(response);
        }
        if ("SERVICE_UNAVAILABLE".equals(response.getVerificationStatus())) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(response);
        }
        if ("NOT_FOUND".equals(response.getVerificationStatus())) {
            return ResponseEntity.status(HttpStatus.OK).body(response);
        }
        if ("ERROR".equals(response.getVerificationStatus())) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(response);
        }

        // Active, Cancelled, and Suspended registrations are valid verified responses returned with HTTP 200
        return ResponseEntity.ok(response);
    }
}

