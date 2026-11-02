package com.cris.customerportal.service;

import com.cris.customerportal.exception.DatabaseUnavailableException;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Locale;

@Service
public class DeleteRequestService {
    private final DataSource dataSource;
    private final DbaEmailService dbaEmailService;

    public DeleteRequestService(DataSource dataSource, DbaEmailService dbaEmailService) {
        this.dataSource = dataSource;
        this.dbaEmailService = dbaEmailService;
    }

    public VerifiedRecord verify(String codeType, String code) {
        CodeMapping mapping = mappingFor(codeType);
        String normalizedCode = normalizeCode(code);
        String sql = "SELECT " + mapping.codeColumn + ", " + mapping.nameColumn
                + " FROM " + mapping.table + " WHERE " + mapping.codeColumn + " = ?";

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, normalizedCode);
            try (ResultSet results = statement.executeQuery()) {
                if (!results.next()) {
                    return null;
                }

                VerifiedRecord record = new VerifiedRecord(
                        mapping, results.getString(1), results.getString(2));
                if (results.next()) {
                    throw new IllegalStateException("The selected code matches multiple records.");
                }
                return record;
            }
        } catch (SQLException e) {
            System.err.printf("[DELETE REQUEST DB ERROR] SQLState=%s ErrorCode=%d%n",
                    e.getSQLState(), e.getErrorCode());
            throw new DatabaseUnavailableException("Unable to verify the code at this time.", e);
        }
    }

    public void sendRequest(String codeType, String code, String companyName) {
        String normalizedCompanyName = normalizeCompanyName(companyName);
        VerifiedRecord record = verify(codeType, code);
        if (record == null) {
            throw new IllegalArgumentException("This code was not found in the records, so it cannot be deleted.");
        }
        String verifiedCompanyName = record.companyName == null ? "" : record.companyName.trim();
        if (verifiedCompanyName.isEmpty()
                || !verifiedCompanyName.equalsIgnoreCase(normalizedCompanyName)) {
            throw new IllegalArgumentException(
                    "Company name does not match the selected code. Please verify the company name.");
        }

        String sql = buildDeleteSql(record.mapping, record.code);
        dbaEmailService.sendDbaQueryEmail(
                "DELETE", record.mapping.table, record.code, verifiedCompanyName, sql);
    }

    private String buildDeleteSql(CodeMapping mapping, String code) {
        return "DELETE FROM " + mapping.table
                + " WHERE " + mapping.codeColumn + " = '" + escapeSqlLiteral(code) + "';";
    }

    private String escapeSqlLiteral(String value) {
        return value == null ? "" : value.replace("'", "''");
    }

    private CodeMapping mappingFor(String codeType) {
        String normalizedType = codeType == null ? "" : codeType.trim();
        if ("GLOBAL_CUSTOMER".equals(normalizedType)) {
            return new CodeMapping("MEMGLBLCUST", "MAVGLBLCUSTCODE", "MAVGLBLCUSTNAME");
        }
        if ("HANDLING_AGENT".equals(normalizedType)) {
            return new CodeMapping("MEMGLBLHNDGAGNT", "MAVHNDGAGNTCODE", "MAVHNDGAGNTNAME");
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

    private static final class CodeMapping {
        private final String table;
        private final String codeColumn;
        private final String nameColumn;

        private CodeMapping(String table, String codeColumn, String nameColumn) {
            this.table = table;
            this.codeColumn = codeColumn;
            this.nameColumn = nameColumn;
        }
    }
}
