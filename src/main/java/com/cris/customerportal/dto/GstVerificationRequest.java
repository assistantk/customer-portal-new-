package com.cris.customerportal.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;

public class GstVerificationRequest {

    @NotBlank(message = "GSTIN is required")
    @Pattern(regexp = "^[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z]$",
             message = "Invalid 15-character GSTIN format")
    private String gstin;

    public GstVerificationRequest() {}

    public GstVerificationRequest(String gstin) {
        this.gstin = gstin;
    }

    public String getGstin() { return gstin; }
    public void setGstin(String gstin) { this.gstin = gstin; }
}

