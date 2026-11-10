package com.cris.customerportal.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ImageOcrResponse {
    private boolean success;
    private String message;
    private Boolean tesseractMissing;
    private String gstin;
    private String tradeName;
    private String legalName;
    private String businessName;
    private String pan;
    private String address;
    private String city;
    private String district;
    private String state;
    private String stateCode;
    private String stateName;
    private String pincode;
    private Boolean panMismatch;
    private Boolean companyNameTooLong;
    private String rawText;

    public ImageOcrResponse() {}

    public static ImageOcrResponse failure(String message, boolean tesseractMissing) {
        ImageOcrResponse res = new ImageOcrResponse();
        res.setSuccess(false);
        res.setMessage(message);
        res.setTesseractMissing(tesseractMissing);
        return res;
    }

    public static ImageOcrResponse failure(String message) {
        return failure(message, false);
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public Boolean getTesseractMissing() {
        return tesseractMissing;
    }

    public void setTesseractMissing(Boolean tesseractMissing) {
        this.tesseractMissing = tesseractMissing;
    }

    public String getGstin() {
        return gstin;
    }

    public void setGstin(String gstin) {
        this.gstin = gstin;
    }

    public String getTradeName() {
        return tradeName;
    }

    public void setTradeName(String tradeName) {
        this.tradeName = tradeName;
    }

    public String getLegalName() {
        return legalName;
    }

    public void setLegalName(String legalName) {
        this.legalName = legalName;
    }

    public String getBusinessName() {
        return businessName;
    }

    public void setBusinessName(String businessName) {
        this.businessName = businessName;
    }

    public String getPan() {
        return pan;
    }

    public void setPan(String pan) {
        this.pan = pan;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getDistrict() {
        return district;
    }

    public void setDistrict(String district) {
        this.district = district;
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = state;
    }

    public String getStateCode() {
        return stateCode;
    }

    public void setStateCode(String stateCode) {
        this.stateCode = stateCode;
    }

    public String getStateName() {
        return stateName;
    }

    public void setStateName(String stateName) {
        this.stateName = stateName;
    }

    public String getPincode() {
        return pincode;
    }

    public void setPincode(String pincode) {
        this.pincode = pincode;
    }

    public Boolean getPanMismatch() {
        return panMismatch;
    }

    public void setPanMismatch(Boolean panMismatch) {
        this.panMismatch = panMismatch;
    }

    public Boolean getCompanyNameTooLong() {
        return companyNameTooLong;
    }

    public void setCompanyNameTooLong(Boolean companyNameTooLong) {
        this.companyNameTooLong = companyNameTooLong;
    }

    public String getRawText() {
        return rawText;
    }

    public void setRawText(String rawText) {
        this.rawText = rawText;
    }
}

