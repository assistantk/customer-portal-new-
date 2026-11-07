package com.cris.customerportal.service;

import com.cris.customerportal.dto.GstVerificationResponse;

/**
 * Service for verifying GSTINs and retrieving registered taxpayer details
 * from an authorized GST Suvidha Provider (GSP) or GST verification API.
 */
public interface GstVerificationService {

    /**
     * Verifies the given GSTIN and retrieves the taxpayer's registration details.
     *
     * @param gstin 15-character GST identification number
     * @return populated {@link GstVerificationResponse}
     */
    GstVerificationResponse verifyGstin(String gstin);

    /**
     * Clears the in-memory verification cache (useful for testing or cache eviction).
     */
    void clearCache();
}

