package com.cris.customerportal.dto;

import java.util.List;

public class CustomerLookupResponse {
    private String companyName;
    private String customerCode;
    private String address;
    private String city;
    private String pincode;
    private List<GstinResponse> gstins;
    private String panNumber;
    private String operatingDivision;
    private String zone;
    private String email;
    private String mobile;
    private String codeType;

    public CustomerLookupResponse(String companyName, String customerCode, String address,
                                  String city, String pincode, List<GstinResponse> gstins,
                                  String panNumber, String operatingDivision, String zone,
                                  String email, String mobile, String codeType) {
        this.companyName = companyName;
        this.customerCode = customerCode;
        this.address = address;
        this.city = city;
        this.pincode = pincode;
        this.gstins = gstins;
        this.panNumber = panNumber;
        this.operatingDivision = operatingDivision;
        this.zone = zone;
        this.email = email;
        this.mobile = mobile;
        this.codeType = codeType;
    }

    public String getCompanyName() { return companyName; }
    public String getCustomerCode() { return customerCode; }
    public String getAddress() { return address; }
    public String getCity() { return city; }
    public String getPincode() { return pincode; }
    public List<GstinResponse> getGstins() { return gstins; }
    public String getPanNumber() { return panNumber; }
    public String getOperatingDivision() { return operatingDivision; }
    public String getZone() { return zone; }
    public String getEmail() { return email; }
    public String getMobile() { return mobile; }
    public String getCodeType() { return codeType; }
}
