package com.cris.customerportal.dto;

public class GstinDuplicateRecord {
    private String recordType;
    private String existingCode;
    private String companyName;
    private String gstin;
    private String pan;
    private String address;
    private String city;
    private String pincode;
    private String effectiveFrom;
    private String effectiveTo;
    private boolean flaggedInconsistent;

    public GstinDuplicateRecord() {}

    public GstinDuplicateRecord(String recordType, String existingCode, String companyName,
                                String gstin, String pan, String address, String city,
                                String pincode, String effectiveFrom, String effectiveTo) {
        this.recordType = recordType;
        this.existingCode = existingCode;
        this.companyName = companyName;
        this.gstin = gstin;
        this.pan = pan;
        this.address = address;
        this.city = city;
        this.pincode = pincode;
        this.effectiveFrom = effectiveFrom;
        this.effectiveTo = effectiveTo;
    }

    public String getRecordType() {
        return recordType;
    }

    public void setRecordType(String recordType) {
        this.recordType = recordType;
    }

    public String getExistingCode() {
        return existingCode;
    }

    public void setExistingCode(String existingCode) {
        this.existingCode = existingCode;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public String getGstin() {
        return gstin;
    }

    public void setGstin(String gstin) {
        this.gstin = gstin;
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

    public String getPincode() {
        return pincode;
    }

    public void setPincode(String pincode) {
        this.pincode = pincode;
    }

    public String getEffectiveFrom() {
        return effectiveFrom;
    }

    public void setEffectiveFrom(String effectiveFrom) {
        this.effectiveFrom = effectiveFrom;
    }

    public String getEffectiveTo() {
        return effectiveTo;
    }

    public void setEffectiveTo(String effectiveTo) {
        this.effectiveTo = effectiveTo;
    }

    public boolean isFlaggedInconsistent() {
        return flaggedInconsistent;
    }

    public void setFlaggedInconsistent(boolean flaggedInconsistent) {
        this.flaggedInconsistent = flaggedInconsistent;
    }
}

