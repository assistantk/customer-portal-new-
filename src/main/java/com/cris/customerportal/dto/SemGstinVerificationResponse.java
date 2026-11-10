package com.cris.customerportal.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class SemGstinVerificationResponse {

    private boolean verified;
    private String status; // "VERIFIED" | "MISMATCH" | "NOT_FOUND" | "UNAVAILABLE"
    private String message;
    private String gstin;
    private String dbCompanyName;
    private String dbAddress;
    private Boolean companyNameMatched;
    private Boolean addressMatched;

    public SemGstinVerificationResponse() {}

    public static SemGstinVerificationResponse verified(String gstin, String dbName, String dbAddr, String message) {
        SemGstinVerificationResponse res = new SemGstinVerificationResponse();
        res.setVerified(true);
        res.setStatus("VERIFIED");
        res.setGstin(gstin);
        res.setDbCompanyName(dbName);
        res.setDbAddress(dbAddr);
        res.setCompanyNameMatched(true);
        res.setAddressMatched(true);
        res.setMessage(message != null ? message : "✓ Verified – Details matched with office database.");
        return res;
    }

    public static SemGstinVerificationResponse verifiedByGstinAndName(String gstin, String dbName, String message) {
        SemGstinVerificationResponse res = new SemGstinVerificationResponse();
        res.setVerified(true);
        res.setStatus("VERIFIED");
        res.setGstin(gstin);
        res.setDbCompanyName(dbName);
        res.setCompanyNameMatched(true);
        res.setMessage(message != null ? message : "✓ Verified – Details matched with office database.");
        return res;
    }

    public static SemGstinVerificationResponse mismatch(String gstin, String dbName, String dbAddr,
                                                        boolean nameMatch, boolean addrMatch, String message) {
        SemGstinVerificationResponse res = new SemGstinVerificationResponse();
        res.setVerified(false);
        res.setStatus("MISMATCH");
        res.setGstin(gstin);
        res.setDbCompanyName(dbName);
        res.setDbAddress(dbAddr);
        res.setCompanyNameMatched(nameMatch);
        res.setAddressMatched(addrMatch);
        res.setMessage(message != null ? message : "⚠ Verification Failed – Entered details do not match office database.");
        return res;
    }

    public static SemGstinVerificationResponse nameMismatch(String gstin, String dbName, String message) {
        SemGstinVerificationResponse res = new SemGstinVerificationResponse();
        res.setVerified(false);
        res.setStatus("MISMATCH");
        res.setGstin(gstin);
        res.setDbCompanyName(dbName);
        res.setCompanyNameMatched(false);
        res.setMessage(message != null ? message : "⚠ Verification Failed – Entered details do not match office database.");
        return res;
    }

    public static SemGstinVerificationResponse notFound(String gstin, String message) {
        SemGstinVerificationResponse res = new SemGstinVerificationResponse();
        res.setVerified(false);
        res.setStatus("NOT_FOUND");
        res.setGstin(gstin);
        res.setCompanyNameMatched(false);
        res.setMessage(message != null ? message : "ℹ Verification Unavailable – GSTIN not found in office database.");
        return res;
    }

    public static SemGstinVerificationResponse unavailable(String gstin, String message) {
        SemGstinVerificationResponse res = new SemGstinVerificationResponse();
        res.setVerified(false);
        res.setStatus("UNAVAILABLE");
        res.setGstin(gstin);
        res.setMessage(message != null ? message : "ℹ Verification Unavailable – Unable to connect to office database.");
        return res;
    }

    public boolean isVerified() {
        return verified;
    }

    public void setVerified(boolean verified) {
        this.verified = verified;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getGstin() {
        return gstin;
    }

    public void setGstin(String gstin) {
        this.gstin = gstin;
    }

    public String getDbCompanyName() {
        return dbCompanyName;
    }

    public void setDbCompanyName(String dbCompanyName) {
        this.dbCompanyName = dbCompanyName;
    }

    public String getDbAddress() {
        return dbAddress;
    }

    public void setDbAddress(String dbAddress) {
        this.dbAddress = dbAddress;
    }

    public Boolean getCompanyNameMatched() {
        return companyNameMatched;
    }

    public void setCompanyNameMatched(Boolean companyNameMatched) {
        this.companyNameMatched = companyNameMatched;
    }

    public Boolean getAddressMatched() {
        return addressMatched;
    }

    public void setAddressMatched(Boolean addressMatched) {
        this.addressMatched = addressMatched;
    }
}
