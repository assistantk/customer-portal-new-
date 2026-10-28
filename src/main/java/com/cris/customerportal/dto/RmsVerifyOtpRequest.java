package com.cris.customerportal.dto;

public class RmsVerifyOtpRequest {
    private String otp;

    public RmsVerifyOtpRequest() {}

    public RmsVerifyOtpRequest(String otp) {
        this.otp = otp;
    }

    public String getOtp() {
        return otp;
    }

    public void setOtp(String otp) {
        this.otp = otp;
    }
}
