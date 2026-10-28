package com.cris.customerportal.dto;

public class RmsValidateUserRequest {
    private String userId;
    private String password;
    private String divisionCode;

    public RmsValidateUserRequest() {}

    public RmsValidateUserRequest(String userId, String password, String divisionCode) {
        this.userId = userId;
        this.password = password;
        this.divisionCode = divisionCode;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getDivisionCode() {
        return divisionCode;
    }

    public void setDivisionCode(String divisionCode) {
        this.divisionCode = divisionCode;
    }
}
