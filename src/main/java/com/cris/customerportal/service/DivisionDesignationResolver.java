package com.cris.customerportal.service;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class DivisionDesignationResolver {
    private static final Map<String, String> DIVISION_CODES = Map.of(
        "NAGPUR (NGP)", "NCP"
    );
    private static final Pattern DIVISION_CODE_PATTERN = Pattern.compile("\\(([^()]+)\\)\\s*$");

    private DivisionDesignationResolver() {
    }

    public static String resolve(String location) {
        if (location == null || location.isBlank()) {
            return null;
        }

        String normalizedLocation = location.trim().toUpperCase(Locale.ROOT);
        String divisionCode = DIVISION_CODES.get(normalizedLocation);
        if (divisionCode == null) {
            Matcher matcher = DIVISION_CODE_PATTERN.matcher(normalizedLocation);
            if (matcher.find()) {
                divisionCode = matcher.group(1).trim();
            }
        }
        return divisionCode == null ? null : "SR.DCM/" + divisionCode;
    }
}
