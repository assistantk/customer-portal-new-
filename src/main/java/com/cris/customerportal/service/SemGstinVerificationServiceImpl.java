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
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class SemGstinVerificationServiceImpl implements SemGstinVerificationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(SemGstinVerificationServiceImpl.class);

    private static final Pattern PINCODE_PATTERN = Pattern.compile("\\b([1-9][0-9]{5})\\b");

    private final DataSource dataSource;

    // Detected column names for SEM_GSTIN (with standard defaults)
    private volatile boolean columnsResolved = false;
    private String gstinCol = "SAVCUSTGSTIN";
    private String nameCol = "SAVCUSTNAME";
    private String addrCol = "SAVCUSTADDR";
    private String valdFlagCol = "SAVCVALDFLAG";
    private String effcFromCol = "SADEFFCFROM";
    private String effcToCol = "SADEFFCTO";

    @Autowired
    public SemGstinVerificationServiceImpl(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    private synchronized void initDbColumns() {
        if (columnsResolved || dataSource == null) return;
        try (Connection conn = dataSource.getConnection()) {
            if (conn == null) {
                columnsResolved = true;
                return;
            }
            java.sql.DatabaseMetaData meta = conn.getMetaData();
            if (meta == null) {
                columnsResolved = true;
                return;
            }
            Set<String> cols = new HashSet<>();
            try (ResultSet rs = meta.getColumns(null, "%", "SEM_GSTIN", "%")) {
                if (rs != null) {
                    while (rs.next()) {
                        String col = rs.getString("COLUMN_NAME");
                        if (col != null) cols.add(col.toUpperCase(Locale.ROOT));
                    }
                }
            }
            if (!cols.isEmpty()) {
                if (cols.contains("SAVCUSTGSTIN")) gstinCol = "SAVCUSTGSTIN";
                if (cols.contains("SAVCUSTNAME")) nameCol = "SAVCUSTNAME";
                if (cols.contains("SAVCUSTADDR")) addrCol = "SAVCUSTADDR";
                if (cols.contains("SAVCVALDFLAG")) valdFlagCol = "SAVCVALDFLAG";
                if (cols.contains("SADEFFCFROM")) effcFromCol = "SADEFFCFROM";
                if (cols.contains("SADEFFCTO")) effcToCol = "SADEFFCTO";
            }
        } catch (Throwable t) {
            LOGGER.debug("initDbColumns for SEM_GSTIN fell back to defaults: {}",
                    DataMaskingUtil.maskSensitive(t.getMessage()));
        } finally {
            columnsResolved = true;
        }
    }

    @Override
    public SemGstinVerificationResponse verifyGstin(String gstin, String companyName, String address) {
        if (gstin == null || gstin.trim().isEmpty()) {
            return SemGstinVerificationResponse.notFound("",
                    "ℹ Verification Unavailable – GSTIN not found in office database.");
        }

        String cleanGstin = gstin.trim().toUpperCase(Locale.ROOT);
        String cleanCompanyName = (companyName != null) ? companyName.trim() : "";
        String cleanAddress = (address != null) ? address.trim() : "";

        if (dataSource == null) {
            LOGGER.warn("DataSource is null when verifying GSTIN in SEM_GSTIN");
            return SemGstinVerificationResponse.unavailable(cleanGstin,
                    "ℹ Verification Unavailable – Unable to connect to office database.");
        }

        initDbColumns();

        String sql = "SELECT " + gstinCol + ", " + nameCol + ", " + addrCol + ", "
                + valdFlagCol + ", " + effcFromCol + ", " + effcToCol + " "
                + "FROM SEM_GSTIN "
                + "WHERE UPPER(TRIM(" + gstinCol + ")) = ? "
                + "ORDER BY "
                + "CASE WHEN UPPER(TRIM(NVL(" + valdFlagCol + ", 'Y'))) IN ('Y', 'A') THEN 1 ELSE 2 END, "
                + effcFromCol + " DESC NULLS LAST, "
                + effcToCol + " DESC NULLS LAST";

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
                        rec.gstin = rs.getString(gstinCol);
                        rec.name = rs.getString(nameCol);
                        rec.addr = rs.getString(addrCol);
                        rec.valdFlag = rs.getString(valdFlagCol);
                        java.sql.Date f = rs.getDate(effcFromCol);
                        if (f != null) rec.effcFrom = f.toLocalDate();
                        java.sql.Date t = rs.getDate(effcToCol);
                        if (t != null) rec.effcTo = t.toLocalDate();
                        records.add(rec);
                    }

                    if (records.isEmpty()) {
                        // Case 3: GSTIN does not exist in the database
                        LOGGER.info("SEM_GSTIN verification: GSTIN {} not found in office database.",
                                DataMaskingUtil.maskSensitive(cleanGstin));
                        return SemGstinVerificationResponse.notFound(cleanGstin,
                                "ℹ Verification Unavailable – GSTIN not found in office database.");
                    }

                    // Evaluate matching against records
                    LocalDate today = LocalDate.now();
                    GstinDbRecord primaryRecord = records.get(0);

                    for (GstinDbRecord rec : records) {
                        boolean isValid = isRecordCurrentlyValid(rec, today);
                        boolean nameMatch = isCompanyNameMatch(cleanCompanyName, rec.name);
                        boolean addrMatch = isAddressMatch(cleanAddress, rec.addr);

                        if (isValid && nameMatch && addrMatch) {
                            // Case 1: GSTIN and company details match the database
                            LOGGER.info("SEM_GSTIN verification: GSTIN {} verified with details match.",
                                    DataMaskingUtil.maskSensitive(cleanGstin));
                            return SemGstinVerificationResponse.verified(
                                    cleanGstin,
                                    rec.name,
                                    rec.addr,
                                    "✓ Verified – Details matched with office database."
                            );
                        }
                    }

                    // If GSTIN exists but company details differ (Case 2)
                    boolean anyNameMatch = false;
                    boolean anyAddrMatch = false;
                    for (GstinDbRecord rec : records) {
                        if (isCompanyNameMatch(cleanCompanyName, rec.name)) anyNameMatch = true;
                        if (isAddressMatch(cleanAddress, rec.addr)) anyAddrMatch = true;
                    }

                    LOGGER.info("SEM_GSTIN verification: GSTIN {} exists but company details do not match (nameMatch={}, addrMatch={}).",
                            DataMaskingUtil.maskSensitive(cleanGstin), anyNameMatch, anyAddrMatch);
                    return SemGstinVerificationResponse.mismatch(
                            cleanGstin,
                            primaryRecord.name,
                            primaryRecord.addr,
                            anyNameMatch,
                            anyAddrMatch,
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

    public boolean isRecordCurrentlyValid(GstinDbRecord rec, LocalDate today) {
        if (rec == null) return false;
        if (rec.valdFlag != null) {
            String vf = rec.valdFlag.trim().toUpperCase(Locale.ROOT);
            if ("N".equals(vf) || "D".equals(vf) || "I".equals(vf) || "INACTIVE".equals(vf)) {
                return false;
            }
        }
        if (rec.effcFrom != null && rec.effcFrom.isAfter(today)) {
            return false;
        }
        if (rec.effcTo != null && rec.effcTo.isBefore(today)) {
            return false;
        }
        return true;
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

    public boolean isAddressMatch(String entered, String db) {
        // Address comparison is "where available and applicable"
        if (entered == null || entered.trim().isEmpty() || db == null || db.trim().isEmpty()) {
            return true;
        }

        String nEntered = normalizeAddress(entered);
        String nDb = normalizeAddress(db);

        // Check PIN code conflicts
        String enteredPin = extractPin(entered);
        String dbPin = extractPin(db);
        if (enteredPin != null && dbPin != null && !enteredPin.equals(dbPin)) {
            return false;
        }

        if (nEntered.equals(nDb)) return true;
        if (nEntered.contains(nDb) || nDb.contains(nEntered)) return true;

        Set<String> enteredTokens = tokenize(nEntered);
        Set<String> dbTokens = tokenize(nDb);
        if (enteredTokens.isEmpty() || dbTokens.isEmpty()) return true;

        int common = 0;
        for (String t : enteredTokens) {
            if (dbTokens.contains(t)) common++;
        }

        double ratio = (double) common / Math.max(1, Math.min(enteredTokens.size(), dbTokens.size()));
        return ratio >= 0.4;
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

    private String normalizeAddress(String addr) {
        if (addr == null) return "";
        return addr.toUpperCase(Locale.ROOT)
                .replaceAll("[^A-Z0-9\\s]", " ")
                .replaceAll("\\s+", " ")
                .trim();
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

    private String extractPin(String text) {
        if (text == null) return null;
        Matcher m = PINCODE_PATTERN.matcher(text);
        if (m.find()) {
            return m.group(1);
        }
        return null;
    }

    public static class GstinDbRecord {
        public String gstin;
        public String name;
        public String addr;
        public String valdFlag;
        public LocalDate effcFrom;
        public LocalDate effcTo;
    }
}

