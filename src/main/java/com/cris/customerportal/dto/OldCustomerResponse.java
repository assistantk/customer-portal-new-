package com.cris.customerportal.dto;

public class OldCustomerResponse {
    private String phoneNumber;
    private String emailId;
    private String companyName;
    private String address;
    private String panNumber;
    private String gstinNumbers;

    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }

    public String getEmailId() { return emailId; }
    public void setEmailId(String emailId) { this.emailId = emailId; }

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }

    public String getPanNumber() { return panNumber; }
    public void setPanNumber(String panNumber) { this.panNumber = panNumber; }

    public String getGstinNumbers() { return gstinNumbers; }
    public void setGstinNumbers(String gstinNumbers) { this.gstinNumbers = gstinNumbers; }
}
