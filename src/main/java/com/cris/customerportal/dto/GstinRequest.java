package com.cris.customerportal.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;

public class GstinRequest {
    @NotBlank(message="State is required") private String state;
    @Pattern(regexp="^[A-Za-z0-9]{15}$", message="GSTIN must contain exactly 15 letters or numbers") private String gstin;
    private String address;
    private String city;
    private String pincode;

    public GstinRequest() {}

    public GstinRequest(String state, String gstin) {
        this.state = state;
        this.gstin = gstin;
    }

    public GstinRequest(String state, String gstin, String address, String city, String pincode) {
        this.state = state;
        this.gstin = gstin;
        this.address = address;
        this.city = city;
        this.pincode = pincode;
    }

    public String state() { return state; }
    public String gstin() { return gstin; }
    public String address() { return address; }
    public String city() { return city; }
    public String pincode() { return pincode; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getGstin() { return gstin; }
    public void setGstin(String gstin) { this.gstin = gstin; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getPincode() { return pincode; }
    public void setPincode(String pincode) { this.pincode = pincode; }
}
