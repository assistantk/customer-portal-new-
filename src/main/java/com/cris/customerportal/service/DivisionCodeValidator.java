package com.cris.customerportal.service;

import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Validates division codes against the known Indian Railways division codes
 * configured in the customer portal (derived from divisionsByZone and APIs.txt).
 */
public final class DivisionCodeValidator {

    private static final Set<String> VALID_CODES;

    static {
        Set<String> set = new HashSet<>();
        // Central Railway
        set.add("CSTM"); set.add("BSL"); set.add("NGP"); set.add("PUNE"); set.add("SUR");
        // Eastern Railway
        set.add("HWH"); set.add("SDAH"); set.add("ASN"); set.add("MLDT");
        // East Central Railway
        set.add("DNR"); set.add("DHN"); set.add("DDU"); set.add("SPJ"); set.add("SEE");
        // East Coast Railway
        set.add("KUR"); set.add("SBP"); set.add("RGDA");
        // Northern Railway
        set.add("DLI"); set.add("UMB"); set.add("FZR"); set.add("LKO"); set.add("MB"); set.add("TKD");
        // North Central Railway
        set.add("PRYJ"); set.add("AGC"); set.add("JHS");
        // North Eastern Railway
        set.add("IZN"); set.add("LJN"); set.add("BSB");
        // Northeast Frontier Railway
        set.add("APDJ"); set.add("KIR"); set.add("LMG"); set.add("RNY"); set.add("TSK");
        // North Western Railway
        set.add("JP"); set.add("AII"); set.add("BKN"); set.add("JU");
        // Southern Railway
        set.add("MAS"); set.add("MDU"); set.add("PGT"); set.add("SA"); set.add("TPJ"); set.add("TVC");
        // South Central Railway
        set.add("SC"); set.add("HYB"); set.add("GTL"); set.add("GNT"); set.add("BZA"); set.add("NED");
        // South Coast Railway
        set.add("VSKP");
        // South Eastern Railway
        set.add("ADRA"); set.add("CKP"); set.add("KGP"); set.add("RNC");
        // South East Central Railway
        set.add("BSP"); set.add("NAG"); set.add("R"); set.add("NCP");
        // South Western Railway
        set.add("UBL"); set.add("SBC"); set.add("MYS");
        // Western Railway
        set.add("BCT"); set.add("BRC"); set.add("ADI"); set.add("RJT"); set.add("BVP"); set.add("RTM");
        // West Central Railway
        set.add("JBP"); set.add("BPL"); set.add("KOTA");
        // Metro Railway Kolkata
        set.add("KMR");
        // Common administrative codes
        set.add("HQ"); set.add("CRIS");

        VALID_CODES = Collections.unmodifiableSet(set);
    }

    private DivisionCodeValidator() {}

    public static boolean isValid(String code) {
        if (code == null || code.trim().isEmpty()) {
            return false;
        }
        return VALID_CODES.contains(code.trim().toUpperCase(Locale.ROOT));
    }

    public static Set<String> getValidCodes() {
        return VALID_CODES;
    }
}
