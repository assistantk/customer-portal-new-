package com.cris.customerportal.service;

public final class AemUserLookupResult {

    private final String userId;
    private final String email;
    private final String phoneNumber;
    private final String storedPassword;
    private final String isActive;

    public AemUserLookupResult(String userId, String email, String storedPassword) {
        this(userId, email, null, storedPassword, "Y");
    }

    public AemUserLookupResult(String userId, String email, String phoneNumber, String storedPassword) {
        this(userId, email, phoneNumber, storedPassword, "Y");
    }

    public AemUserLookupResult(String userId, String email, String phoneNumber, String storedPassword, String isActive) {
        this.userId = userId;
        this.email = email;
        this.phoneNumber = phoneNumber;
        this.storedPassword = storedPassword;
        this.isActive = isActive != null ? isActive : "Y";
    }

    public String userId() {
        return userId;
    }

    public String email() {
        return email;
    }

    public String phoneNumber() {
        return phoneNumber;
    }

    public String storedPassword() {
        return storedPassword;
    }

    public String isActive() {
        return isActive;
    }
}
