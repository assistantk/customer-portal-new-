package com.cris.customerportal.service;

import com.cris.customerportal.config.DataMaskingUtil;
import com.cris.customerportal.exception.DatabaseUnavailableException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class DeleteRequestService {

    private static final Logger log = LoggerFactory.getLogger(DeleteRequestService.class);

    private final DataSource dataSource;
    private final DbaEmailService dbaEmailService;

    public DeleteRequestService(DataSource dataSource, DbaEmailService dbaEmailService) {
        this.dataSource = dataSource;
        this.dbaEmailService = dbaEmailService;
    }

    public VerifiedRecord verify(String codeType, String code) {
        log.debug("DeleteRequestService.verify: codeType={}", codeType);
        CodeMapping mapping = mappingFor(codeType);
        String normalizedCode = normalizeCode(code);
        String sql = "SELECT " + mapping.codeColumn + ", " + mapping.nameColumn
                + " FROM " + mapping.table + " WHERE " + mapping.codeColumn + " = ?";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, normalizedCode);
            try (ResultSet results = statement.executeQuery()) {
                if (!results.next()) {
                    log.debug("DeleteRequestService.verify: no record found for codeType={}", codeType);
                    return null;
                }

                VerifiedRecord record = new VerifiedRecord(
                        mapping, results.getString(1), results.getString(2));
                if (results.next()) {
                    throw new IllegalStateException("The selected code matches multiple records.");
                }
                log.debug("DeleteRequestService.verify: found record for codeType={}", codeType);
                return record;
            }
        } catch (SQLException e) {
            log.error("Delete request DB error: SQLState={} ErrorCode={} stackTrace={}",
                    e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
            throw new DatabaseUnavailableException("Unable to verify the code at this time.", e);
        }
    }

    public void sendRequest(String codeType, String code, String companyName) {
        log.info("DeleteRequestService.sendRequest: codeType={}", codeType);
        String normalizedCompanyName = normalizeCompanyName(companyName);
        VerifiedRecord record = verify(codeType, code);
        if (record == null) {
            log.warn("DeleteRequestService.sendRequest: code not found for codeType={}", codeType);
            throw new IllegalArgumentException("This code was not found in the records, so it cannot be deleted.");
        }
        String verifiedCompanyName = record.companyName == null ? "" : record.companyName.trim();
        if (verifiedCompanyName.isEmpty()
                || !verifiedCompanyName.equalsIgnoreCase(normalizedCompanyName)) {
            log.warn("DeleteRequestService.sendRequest: company name mismatch for codeType={}", codeType);
            throw new IllegalArgumentException(
                    "Company name does not match the selected code. Please verify the company name.");
        }

        List<DetailRecord> details = findDetails(record.mapping, record.code);
        String detailsDeleteSql = buildDeleteSql(
                record.mapping.detailTable, record.mapping.codeColumn, record.code);
        String parentDeleteSql = buildDeleteSql(
                record.mapping.table, record.mapping.codeColumn, record.code);
        dbaEmailService.sendDbaDeleteRequestEmail(
                record.mapping.table,
                record.mapping.detailTable,
                record.mapping.codeColumn,
                record.code,
                verifiedCompanyName,
                details,
                detailsDeleteSql,
                parentDeleteSql);
        log.info("DeleteRequestService.sendRequest: DBA email sent for codeType={} table={} detailRecords={}",
                codeType, record.mapping.table, details.size());
    }

    private List<DetailRecord> findDetails(CodeMapping mapping, String code) {
        String sql = "SELECT MAVCUSTGSTNUMB, " + mapping.detailAddressColumn
                + ", MANPINCODE, MAVCUSTPANNUMB FROM " + mapping.detailTable
                + " WHERE " + mapping.codeColumn + " = ?";
        List<DetailRecord> details = new ArrayList<>();
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, code);
            try (ResultSet results = statement.executeQuery()) {
                while (results.next()) {
                    details.add(new DetailRecord(
                            results.getString(1),
                            results.getString(2),
                            results.getString(3),
                            results.getString(4)));
                }
            }
            return details;
        } catch (SQLException e) {
            log.error("Delete request detail lookup failed: table={} SQLState={} ErrorCode={} stackTrace={}",
                    mapping.detailTable, e.getSQLState(), e.getErrorCode(),
                    DataMaskingUtil.formatThrowable(e));
            throw new DatabaseUnavailableException(
                    "Unable to retrieve related detail records. The delete request was not sent.", e);
        }
    }

    private String buildDeleteSql(String table, String codeColumn, String code) {
        return "DELETE FROM " + table
                + " WHERE " + codeColumn + " = '" + escapeSqlLiteral(code) + "';";
    }

    private String escapeSqlLiteral(String value) {
        return value == null ? "" : value.replace("'", "''");
    }

    private CodeMapping mappingFor(String codeType) {
        String normalizedType = codeType == null ? "" : codeType.trim();
        if ("GLOBAL_CUSTOMER".equals(normalizedType)) {
            return new CodeMapping(
                    "MEMGLBLCUST", "MAVGLBLCUSTCODE", "MAVGLBLCUSTNAME",
                    "MEMGLBLCUSTDTLS", "MAVGLBLCUSTADDRTEXT");
        }
        if ("HANDLING_AGENT".equals(normalizedType)) {
            return new CodeMapping(
                    "MEMGLBLHNDGAGNT", "MAVHNDGAGNTCODE", "MAVHNDGAGNTNAME",
                    "MEMGLBLHNDGAGNTDTLS", "MAVHNDGAGNTADDRTEXT");
        }
        throw new IllegalArgumentException("Select a supported code type.");
    }

    private String normalizeCode(String code) {
        String normalized = code == null ? "" : code.trim().toUpperCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("Code is required.");
        }
        if (normalized.length() > 100) {
            throw new IllegalArgumentException("Code must not exceed 100 characters.");
        }
        for (int i = 0; i < normalized.length(); i++) {
            if (Character.isISOControl(normalized.charAt(i))) {
                throw new IllegalArgumentException("Code contains invalid characters.");
            }
        }
        return normalized;
    }

    private String normalizeCompanyName(String companyName) {
        if (companyName == null || companyName.trim().isEmpty()) {
            throw new IllegalArgumentException("Company name is required.");
        }
        return companyName.trim();
    }

    public static final class VerifiedRecord {
        private final CodeMapping mapping;
        private final String code;
        private final String companyName;

        private VerifiedRecord(CodeMapping mapping, String code, String companyName) {
            this.mapping = mapping;
            this.code = code;
            this.companyName = companyName;
        }

        public String getCode() {
            return code;
        }

        public String getCompanyName() {
            return companyName;
        }
    }

    public static final class DetailRecord {
        private final String gstin;
        private final String address;
        private final String pincode;
        private final String pan;

        private DetailRecord(String gstin, String address, String pincode, String pan) {
            this.gstin = gstin;
            this.address = address;
            this.pincode = pincode;
            this.pan = pan;
        }

        public String getGstin() { return gstin; }
        public String getAddress() { return address; }
        public String getPincode() { return pincode; }
        public String getPan() { return pan; }
    }

    private static final class CodeMapping {
        private final String table;
        private final String codeColumn;
        private final String nameColumn;
        private final String detailTable;
        private final String detailAddressColumn;

        private CodeMapping(String table, String codeColumn, String nameColumn,
                            String detailTable, String detailAddressColumn) {
            this.table = table;
            this.codeColumn = codeColumn;
            this.nameColumn = nameColumn;
            this.detailTable = detailTable;
            this.detailAddressColumn = detailAddressColumn;
        }
    }
}
