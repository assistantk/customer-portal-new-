package com.cris.customerportal.service;

import com.cris.customerportal.dto.SemGstinVerificationResponse;

public interface SemGstinVerificationService {
    /**
     * Verifies user-entered GSTIN, company name, and address against the office SEM_GSTIN table.
     *
     * @param gstin        15-character GSTIN (primary identifier)
     * @param companyName  user-entered company name
     * @param address      user-entered address (optional, where available and applicable)
     * @return verification outcome structured response
     */
    SemGstinVerificationResponse verifyGstin(String gstin, String companyName, String address);
}

