package com.cris.customerportal.service;

public final class AemUserLookupResult {

    private final String userId;
    private final String email;
    private final String phoneNumber;
    private final String storedPassword;

    public AemUserLookupResult(String userId, String email, String storedPassword) {
        this(userId, email, null, storedPassword);
    }

    public AemUserLookupResult(String userId, String email, String phoneNumber, String storedPassword) {
        this.userId = userId;
        this.email = email;
        this.phoneNumber = phoneNumber;
        this.storedPassword = storedPassword;
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
}
