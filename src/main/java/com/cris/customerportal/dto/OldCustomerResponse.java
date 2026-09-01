package com.cris.customerportal.dto;

public class OldCustomerResponse {
    private String customerCode;
    private String phoneNumber;
    private String emailId;
    private String companyName;
    private String address;
    private String panNumber;
    private String gstinNumbers;
    private String city;
    private String pincode;
    private String zone;
    private String division;
    private String creationDate;

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }

    public String getZone() { return zone; }
    public void setZone(String zone) { this.zone = zone; }

    public String getDivision() { return division; }
    public void setDivision(String division) { this.division = division; }

    public String getCreationDate() { return creationDate; }
    public void setCreationDate(String creationDate) { this.creationDate = creationDate; }

    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }

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
