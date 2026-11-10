package com.cris.customerportal.service;

import com.cris.customerportal.config.DataMaskingUtil;
import com.cris.customerportal.dto.SemGstinVerificationResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.*;

@Service
public class SemGstinVerificationServiceImpl implements SemGstinVerificationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(SemGstinVerificationServiceImpl.class);

    private final DataSource dataSource;

    @Autowired
    public SemGstinVerificationServiceImpl(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public SemGstinVerificationResponse verifyGstin(String gstin, String companyName, String address) {
        if (gstin == null || gstin.trim().isEmpty()) {
            return SemGstinVerificationResponse.notFound("",
                    "ℹ Verification Unavailable – GSTIN not found in office database.");
        }
        String cleanGstin = gstin.trim().toUpperCase(Locale.ROOT);
        String cleanCompanyName = (companyName != null) ? companyName.trim() : "";

        if (dataSource == null) {
            LOGGER.warn("DataSource is null when verifying GSTIN in SEM_GSTIN");
            return SemGstinVerificationResponse.unavailable(cleanGstin,
                    "ℹ Verification Unavailable – Unable to connect to office database.");
        }

        String sql = "SELECT SAVCUSTGSTIN, SAVCUSTNAME "
                + "FROM SEM_GSTIN "
                + "WHERE UPPER(TRIM(SAVCUSTGSTIN)) = ?";

        try (Connection conn = dataSource.getConnection()) {
            if (conn == null) {
                return SemGstinVerificationResponse.unavailable(cleanGstin,
                        "ℹ Verification Unavailable – Unable to connect to office database.");
            }

            try (PreparedStatement ps = conn.prepareStatement(sql)) {
                ps.setString(1, cleanGstin);
                try (ResultSet rs = ps.executeQuery()) {
                    List<GstinDbRecord> records = new ArrayList<>();
                    while (rs.next()) {
                        GstinDbRecord rec = new GstinDbRecord();
                        rec.gstin = rs.getString("SAVCUSTGSTIN");
                        rec.name = rs.getString("SAVCUSTNAME");
                        records.add(rec);
                    }

                    if (records.isEmpty()) {
                        // Case 3: GSTIN does not exist in the database
                        LOGGER.info("SEM_GSTIN verification: GSTIN {} not found in office database.",
                                DataMaskingUtil.maskSensitive(cleanGstin));
                        return SemGstinVerificationResponse.notFound(cleanGstin,
                                "ℹ Verification Unavailable – GSTIN not found in office database.");
                    }

                    for (GstinDbRecord rec : records) {
                        boolean nameMatch = isCompanyNameMatch(cleanCompanyName, rec.name);
                        if (nameMatch) {
                            LOGGER.info("SEM_GSTIN verification: GSTIN {} and company name matched.",
                                    DataMaskingUtil.maskSensitive(cleanGstin));
                            return SemGstinVerificationResponse.verifiedByGstinAndName(
                                    cleanGstin,
                                    rec.name,
                                    "✓ Verified – Details matched with office database."
                            );
                        }
                    }

                    LOGGER.info("SEM_GSTIN verification: GSTIN {} exists but company name does not match.",
                            DataMaskingUtil.maskSensitive(cleanGstin));
                    return SemGstinVerificationResponse.nameMismatch(
                            cleanGstin,
                            records.get(0).name,
                            "⚠ Verification Failed – Entered details do not match office database."
                    );
                }
            }
        } catch (Throwable t) {
            // Case 4: Database connection or verification service is unavailable
            LOGGER.warn("SEM_GSTIN verification error for gstin {}: {}",
                    DataMaskingUtil.maskSensitive(cleanGstin),
                    DataMaskingUtil.maskSensitive(t.getMessage()));
            return SemGstinVerificationResponse.unavailable(cleanGstin,
                    "ℹ Verification Unavailable – Unable to connect to office database.");
        }
    }

    public boolean isCompanyNameMatch(String entered, String db) {
        if (entered == null || db == null) return false;
        String nEntered = normalizeCompanyName(entered);
        String nDb = normalizeCompanyName(db);
        if (nEntered.isEmpty() || nDb.isEmpty()) return false;

        if (nEntered.equals(nDb)) return true;

        // Substring / containment check for company name
        if (nEntered.length() >= 4 && nDb.contains(nEntered)) return true;
        if (nDb.length() >= 4 && nEntered.contains(nDb)) return true;

        // Token overlap check
        Set<String> enteredTokens = tokenize(nEntered);
        Set<String> dbTokens = tokenize(nDb);
        if (enteredTokens.isEmpty() || dbTokens.isEmpty()) return false;

        int common = 0;
        for (String t : enteredTokens) {
            if (dbTokens.contains(t)) common++;
        }

        double ratio = (double) common / Math.max(1, Math.min(enteredTokens.size(), dbTokens.size()));
        return ratio >= 0.6;
    }

    private String normalizeCompanyName(String name) {
        if (name == null) return "";
        String s = name.toUpperCase(Locale.ROOT)
                .replace("&", " AND ")
                .replaceAll("\\b(M/S|MS)\\b", " ")
                .replaceAll("\\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CORP|CORPORATION|CO|COMPANY)\\b", " ")
                .replaceAll("[^A-Z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return s;
    }

    private Set<String> tokenize(String s) {
        if (s == null || s.trim().isEmpty()) return Collections.emptySet();
        String[] parts = s.split("\\s+");
        Set<String> set = new HashSet<>();
        for (String p : parts) {
            if (p.length() >= 2) set.add(p);
        }
        return set;
    }

    public static class GstinDbRecord {
        public String gstin;
        public String name;
    }
}
