package com.cris.customerportal.dto;

public class GlobalAgentResponse {
    private String code;
    private String companyName;
    private String address;
    private String city;
    private String email;
    private String mobile;
    private String status;

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getMobile() { return mobile; }
    public void setMobile(String mobile) { this.mobile = mobile; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
