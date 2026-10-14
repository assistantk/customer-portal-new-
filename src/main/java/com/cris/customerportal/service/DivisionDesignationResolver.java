package com.cris.customerportal.service;

import java.util.Locale;
import java.util.Map;

public final class DivisionDesignationResolver {
    private static final Map<String, String> DIVISION_CODES = Map.of(
        "NAGPUR (NGP)", "NCP"
    );

    private DivisionDesignationResolver() {
    }

    public static String resolve(String location) {
        if (location == null || location.isBlank()) {
            return null;
        }

        String divisionCode = DIVISION_CODES.get(location.trim().toUpperCase(Locale.ROOT));
        return divisionCode == null ? null : "SR.DCM/" + divisionCode;
    }
}
