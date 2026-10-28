package com.cris.customerportal.dto;

public class RmsSelectDesignationRequest {
    private String designation;

    public RmsSelectDesignationRequest() {}

    public RmsSelectDesignationRequest(String designation) {
        this.designation = designation;
    }

    public String getDesignation() {
        return designation;
    }

    public void setDesignation(String designation) {
        this.designation = designation;
    }
}
