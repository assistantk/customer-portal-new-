package com.cris.customerportal.dto;

import javax.validation.constraints.*;
import java.util.List;

public class CustomerRegistrationRequest {
    @NotBlank(message="Company name is required") private String companyName;
    @NotBlank(message="Customer code is required") private String customerCode;
    @NotBlank(message="Address is required") private String address;
    @NotBlank(message="City is required") private String city;
    @Pattern(regexp="^[1-9][0-9]{5}$", message="Invalid pincode") private String pincode;
    @NotEmpty(message="At least one GSTIN is required") private List<GstinRequest> gstins;
    @Pattern(regexp="^[A-Za-z0-9]{10}$", message="PAN No. must contain exactly 10 letters or numbers") private String panNumber;
    @NotBlank(message="Operating division is required") private String operatingDivision;
    @NotBlank(message="Zone is required") private String zone;
    @Email(message="Invalid email") private String email;
    @Pattern(regexp="^[6-9][0-9]{9}$", message="Invalid mobile number") private String mobile;
    @NotBlank(message="Code type is required") @Pattern(regexp="^(GLOBAL|HANDLING_AGENT)$", message="Code type must be GLOBAL or HANDLING_AGENT") private String codeType;

    // Default constructor required for deserialization
    public CustomerRegistrationRequest() {}

    public CustomerRegistrationRequest(String companyName, String customerCode, String address,
                                       String city, String pincode, List<GstinRequest> gstins,
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
        // Normalise blank-to-null (mirrors the record compact constructor)
        this.email = (email != null && email.trim().isEmpty()) ? null : email;
        this.mobile = (mobile != null && mobile.trim().isEmpty()) ? null : mobile;
        this.codeType = codeType;
    }

    public String companyName() { return companyName; }
    public String customerCode() { return customerCode; }
    public String address() { return address; }
    public String city() { return city; }
    public String pincode() { return pincode; }
    public List<GstinRequest> gstins() { return gstins; }
    public String panNumber() { return panNumber; }
    public String operatingDivision() { return operatingDivision; }
    public String zone() { return zone; }
    public String email() { return email; }
    public String mobile() { return mobile; }
    public String codeType() { return codeType; }

    // Bean-style getters/setters for Jackson deserialization
    public String getCompanyName() { return companyName; }
    public void setCompanyName(String v) { this.companyName = v; }
    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String v) { this.customerCode = v; }
    public String getAddress() { return address; }
    public void setAddress(String v) { this.address = v; }
    public String getCity() { return city; }
    public void setCity(String v) { this.city = v; }
    public String getPincode() { return pincode; }
    public void setPincode(String v) { this.pincode = v; }
    public List<GstinRequest> getGstins() { return gstins; }
    public void setGstins(List<GstinRequest> v) { this.gstins = v; }
    public String getPanNumber() { return panNumber; }
    public void setPanNumber(String v) { this.panNumber = v; }
    public String getOperatingDivision() { return operatingDivision; }
    public void setOperatingDivision(String v) { this.operatingDivision = v; }
    public String getZone() { return zone; }
    public void setZone(String v) { this.zone = v; }
    public String getEmail() { return email; }
    public void setEmail(String v) { this.email = (v != null && v.trim().isEmpty()) ? null : v; }
    public String getMobile() { return mobile; }
    public void setMobile(String v) { this.mobile = (v != null && v.trim().isEmpty()) ? null : v; }
    public String getCodeType() { return codeType; }
    public void setCodeType(String v) { this.codeType = v; }
}
