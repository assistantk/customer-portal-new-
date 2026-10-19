package com.cris.customerportal.service;

public final class AemLoginIdentifier {

    private AemLoginIdentifier() {
    }

    public static String parse(String identifier) {
        if (identifier == null || identifier.trim().isEmpty()) {
            throw new IllegalArgumentException("User ID or email is required.");
        }
        return identifier.trim();
    }
}
