package com.cris.customerportal.dto;

public class PanGstinRecord {
    private String gstin;
    private String address;
    private String city;
    private String pincode;
    private String effectiveFrom;
    private String effectiveTo;

    public PanGstinRecord() {}

    public PanGstinRecord(String gstin, String address, String city, String pincode, String effectiveFrom, String effectiveTo) {
        this.gstin = gstin;
        this.address = address;
        this.city = city;
        this.pincode = pincode;
        this.effectiveFrom = effectiveFrom;
        this.effectiveTo = effectiveTo;
    }

    public String getGstin() {
        return gstin;
    }

    public void setGstin(String gstin) {
        this.gstin = gstin;
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
}

