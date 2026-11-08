package com.cris.customerportal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;

import java.io.Serializable;
import java.util.Collections;
import java.util.List;

/**
 * Standard response DTO containing verified GSTIN registration information
 * retrieved from an authorized GST verification service / GSP API.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonInclude(JsonInclude.Include.NON_NULL)
public class GstVerificationResponse implements Serializable {
    private static final long serialVersionUID = 1L;

    private boolean success;
    private String gstin;
    private String legalName;
    private String tradeName;
    private String businessName; // Preferred name (tradeName if present & non-empty, else legalName)
    private String pan;
    private String status; // "Active", "Cancelled", "Suspended"
    private String registrationDate;
    private String constitutionOfBusiness;
    private String taxpayerType;
    private String address;
    private String city;
    private String district;
    private String state;
    private String stateCode;
    private String pincode;
    private List<String> natureOfBusiness;
    private String verificationStatus; // "VERIFIED", "CANCELLED", "SUSPENDED", "NOT_FOUND", "INVALID_GSTIN", "SERVICE_UNAVAILABLE", "ERROR"
    private String message;

    public GstVerificationResponse() {}

    public static GstVerificationResponse invalid(String gstin, String message) {
        GstVerificationResponse r = new GstVerificationResponse();
        r.setSuccess(false);
        r.setGstin(gstin);
        r.setVerificationStatus("INVALID_GSTIN");
        r.setMessage(message != null ? message : "Invalid GSTIN format.");
        return r;
    }

    public static GstVerificationResponse notFound(String gstin, String message) {
        GstVerificationResponse r = new GstVerificationResponse();
        r.setSuccess(false);
        r.setGstin(gstin);
        r.setVerificationStatus("NOT_FOUND");
        r.setMessage(message != null ? message : "GSTIN not found in the authorized GST registry.");
        return r;
    }

    public static GstVerificationResponse unavailable(String gstin, String message) {
        GstVerificationResponse r = new GstVerificationResponse();
        r.setSuccess(false);
        r.setGstin(gstin);
        r.setVerificationStatus("SERVICE_UNAVAILABLE");
        r.setMessage(message != null ? message : "GST verification service is temporarily unavailable. Please retry later.");
        return r;
    }

    public static GstVerificationResponse error(String gstin, String message) {
        GstVerificationResponse r = new GstVerificationResponse();
        r.setSuccess(false);
        r.setGstin(gstin);
        r.setVerificationStatus("ERROR");
        r.setMessage(message != null ? message : "An error occurred while verifying the GSTIN.");
        return r;
    }

    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }

    public String getGstin() { return gstin; }
    public void setGstin(String gstin) { this.gstin = gstin; }

    public String getLegalName() { return legalName; }
    public void setLegalName(String legalName) { this.legalName = legalName; }

    public String getTradeName() { return tradeName; }
    public void setTradeName(String tradeName) { this.tradeName = tradeName; }

    public String getBusinessName() {
        if (businessName != null && !businessName.trim().isEmpty()) {
            return businessName;
        }
        if (tradeName != null && !tradeName.trim().isEmpty()) {
            return tradeName.trim();
        }
        return legalName != null ? legalName.trim() : "";
    }
    public void setBusinessName(String businessName) { this.businessName = businessName; }

    public String getPan() { return pan; }
    public void setPan(String pan) { this.pan = pan; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getRegistrationDate() { return registrationDate; }
    public void setRegistrationDate(String registrationDate) { this.registrationDate = registrationDate; }

    public String getConstitutionOfBusiness() { return constitutionOfBusiness; }
    public void setConstitutionOfBusiness(String constitutionOfBusiness) { this.constitutionOfBusiness = constitutionOfBusiness; }

    public String getTaxpayerType() { return taxpayerType; }
    public void setTaxpayerType(String taxpayerType) { this.taxpayerType = taxpayerType; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getDistrict() { return district; }
    public void setDistrict(String district) { this.district = district; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getStateCode() { return stateCode; }
    public void setStateCode(String stateCode) { this.stateCode = stateCode; }

    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }

    public List<String> getNatureOfBusiness() {
        return natureOfBusiness != null ? natureOfBusiness : Collections.emptyList();
    }
    public void setNatureOfBusiness(List<String> natureOfBusiness) { this.natureOfBusiness = natureOfBusiness; }

    public String getVerificationStatus() { return verificationStatus; }
    public void setVerificationStatus(String verificationStatus) { this.verificationStatus = verificationStatus; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}

