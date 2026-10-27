package com.cris.customerportal.dto;

import java.io.Serializable;

public class AuthUserDto implements Serializable {
    private static final long serialVersionUID = 1L;

    private String userId;
    private String userName;
    private String userRole;
    private String isActive;
    private String email;
    private String phoneNumber;

    public AuthUserDto() {}

    public AuthUserDto(String userId, String userName, String userRole, String isActive) {
        this(userId, userName, userRole, isActive, null);
    }

    public AuthUserDto(String userId, String userName, String userRole, String isActive, String email) {
        this(userId, userName, userRole, isActive, email, null);
    }

    public AuthUserDto(String userId, String userName, String userRole, String isActive, String email, String phoneNumber) {
        this.userId = userId;
        this.userName = userName;
        this.userRole = userRole;
        this.isActive = isActive;
        this.email = email;
        this.phoneNumber = phoneNumber;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }

    public String getUserRole() { return userRole; }
    public void setUserRole(String userRole) { this.userRole = userRole; }

    public String getIsActive() { return isActive; }
    public void setIsActive(String isActive) { this.isActive = isActive; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
}
