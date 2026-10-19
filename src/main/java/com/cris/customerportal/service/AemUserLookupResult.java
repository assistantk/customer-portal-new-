package com.cris.customerportal.service;

public final class AemUserLookupResult {

    private final String userId;
    private final String email;
    private final String storedPassword;

    public AemUserLookupResult(String userId, String email, String storedPassword) {
        this.userId = userId;
        this.email = email;
        this.storedPassword = storedPassword;
    }

    public String userId() {
        return userId;
    }

    public String email() {
        return email;
    }

    public String storedPassword() {
        return storedPassword;
    }
}
