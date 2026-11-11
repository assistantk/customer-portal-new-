package com.cris.customerportal.service;

import com.cris.customerportal.dto.SemGstinVerificationResponse;

public interface SemGstinVerificationService {
    /**
     * Verifies the user-entered GSTIN and company name against SEM_GSTIN.
     *
     * @param gstin        15-character GSTIN (primary identifier)
     * @param companyName  user-entered company name
     * @param address      retained for API compatibility; not used for verification
     * @return verification outcome structured response
     */
    SemGstinVerificationResponse verifyGstin(String gstin, String companyName, String address);
}
