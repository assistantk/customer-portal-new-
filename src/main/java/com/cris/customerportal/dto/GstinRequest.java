package com.cris.customerportal.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;

public class GstinRequest {
    @NotBlank(message="State is required") private String state;
    @Pattern(regexp="^[A-Za-z0-9]{15}$", message="GSTIN must contain exactly 15 letters or numbers") private String gstin;

    public GstinRequest() {}

    public GstinRequest(String state, String gstin) {
        this.state = state;
        this.gstin = gstin;
    }

    public String state() { return state; }
    public String gstin() { return gstin; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getGstin() { return gstin; }
    public void setGstin(String gstin) { this.gstin = gstin; }
}
