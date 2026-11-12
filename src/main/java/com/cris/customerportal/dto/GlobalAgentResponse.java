package com.cris.customerportal.dto;

import java.util.ArrayList;
import java.util.List;

public class GlobalAgentResponse {
    private String code;
    private String companyName;
    private String address;
    private String city;
    private String email;
    private String mobile;
    private String status;
    // Additional Handling Agent columns exposed for Old User / Handling Agent mode
    private String panNumber;
    private String gstinNumbers;
    private String centBlng;
    private String pcoCode;
    private String edMndFlag;
    private String division;
    private String creationDate;
    private List<PanGstinRecord> gstins = new ArrayList<>();

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

    public String getPanNumber() { return panNumber; }
    public void setPanNumber(String panNumber) { this.panNumber = panNumber; }

    public String getGstinNumbers() { return gstinNumbers; }
    public void setGstinNumbers(String gstinNumbers) { this.gstinNumbers = gstinNumbers; }

    public String getCentBlng() { return centBlng; }
    public void setCentBlng(String centBlng) { this.centBlng = centBlng; }

    public String getPcoCode() { return pcoCode; }
    public void setPcoCode(String pcoCode) { this.pcoCode = pcoCode; }

    public String getEdMndFlag() { return edMndFlag; }
    public void setEdMndFlag(String edMndFlag) { this.edMndFlag = edMndFlag; }

    public String getDivision() { return division; }
    public void setDivision(String division) { this.division = division; }

    public String getCreationDate() { return creationDate; }
    public void setCreationDate(String creationDate) { this.creationDate = creationDate; }

    public List<PanGstinRecord> getGstins() { return gstins; }
    public void setGstins(List<PanGstinRecord> gstins) {
        this.gstins = gstins == null ? new ArrayList<>() : new ArrayList<>(gstins);
    }
}
