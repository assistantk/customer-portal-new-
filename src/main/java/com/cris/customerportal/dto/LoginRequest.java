package com.cris.customerportal.dto;

public class LoginRequest {
    private String userId;
    private String username;
    private String password;

    public LoginRequest() {}

    public String getEffectiveUserId() {
        if (userId != null && !userId.trim().isEmpty()) {
            return userId.trim();
        }
        if (username != null && !username.trim().isEmpty()) {
            return username.trim();
        }
        return null;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
