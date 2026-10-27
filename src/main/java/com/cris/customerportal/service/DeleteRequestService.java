package com.cris.customerportal.service;

import com.cris.customerportal.exception.DatabaseUnavailableException;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

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
            throw new DatabaseUnavailableException("Unable to verify the code at this time.", e);
        }
    }

    public void sendRequest(String codeType, String code, String companyName) {
        if (companyName == null || companyName.trim().isEmpty()) {
            throw new IllegalArgumentException("Company name is required.");
        }

        VerifiedRecord record = verify(codeType, code);
        if (record == null) {
            throw new IllegalArgumentException("This code is not present in the table, so it cannot be deleted.");
        }
        if (record.companyName == null
                || !record.companyName.trim().equalsIgnoreCase(companyName.trim())) {
            throw new IllegalArgumentException(
                    "Company name does not match the selected code. Please verify the company name.");
        }

        String sql = "DELETE FROM " + record.mapping.table
                + " WHERE " + record.mapping.codeColumn + " = '"
                + record.code.replace("'", "''") + "';";
        dbaEmailService.sendDbaQueryEmail("DELETE", record.mapping.table, record.code, sql);
    }

    private CodeMapping mappingFor(String codeType) {
        if ("GLOBAL_CUSTOMER".equals(codeType)) {
            return new CodeMapping("MEMGLBLCUST", "MAVGLBLCUSTCODE", "MAVGLBLCUSTNAME");
        }
        if ("HANDLING_AGENT".equals(codeType)) {
            return new CodeMapping("MEMGLBLHNDGAGNT", "MAVHNDGAGNTCODE", "MAVHNDGAGNTNAME");
        }
        throw new IllegalArgumentException("Select a supported code type.");
    }

    private String normalizeCode(String code) {
        String normalized = code == null ? "" : code.trim();
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
