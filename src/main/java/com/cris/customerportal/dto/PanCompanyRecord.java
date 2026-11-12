package com.cris.customerportal.dto;

import java.util.ArrayList;
import java.util.List;

public class PanCompanyRecord {
    private String recordType;      // "Global Customer" or "Handling Agent"
    private String codeType;        // "global" or "handling_agent"
    private String companyCode;
    private String companyName;
    private String pan;
    private String primaryAddress;
    private String city;
    private String pincode;
    private List<PanGstinRecord> gstins = new ArrayList<>();

    public PanCompanyRecord() {}

    public PanCompanyRecord(String recordType, String codeType, String companyCode, String companyName,
                            String pan, String primaryAddress, String city, String pincode) {
        this.recordType = recordType;
        this.codeType = codeType;
        this.companyCode = companyCode;
        this.companyName = companyName;
        this.pan = pan;
        this.primaryAddress = primaryAddress;
        this.city = city;
        this.pincode = pincode;
    }

    public String getRecordType() {
        return recordType;
    }

    public void setRecordType(String recordType) {
        this.recordType = recordType;
    }

    public String getCodeType() {
        return codeType;
    }

    public void setCodeType(String codeType) {
        this.codeType = codeType;
    }

    public String getCompanyCode() {
        return companyCode;
    }

    public void setCompanyCode(String companyCode) {
        this.companyCode = companyCode;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public String getPan() {
        return pan;
    }

    public void setPan(String pan) {
        this.pan = pan;
    }

    public String getPrimaryAddress() {
        return primaryAddress;
    }

    public void setPrimaryAddress(String primaryAddress) {
        this.primaryAddress = primaryAddress;
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

    public List<PanGstinRecord> getGstins() {
        return gstins;
    }

    public void setGstins(List<PanGstinRecord> gstins) {
        this.gstins = gstins != null ? gstins : new ArrayList<>();
    }
}

