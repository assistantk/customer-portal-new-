package com.cris.customerportal.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class AemLoginIdentifier {

    private static final Logger log = LoggerFactory.getLogger(AemLoginIdentifier.class);

    private AemLoginIdentifier() {
    }

    public static String parse(String identifier) {
        if (identifier == null || identifier.trim().isEmpty()) {
            log.warn("AemLoginIdentifier: empty or null identifier provided");
            throw new IllegalArgumentException("User ID or email is required.");
        }
        return identifier.trim();
    }
}
