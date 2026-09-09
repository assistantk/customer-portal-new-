package com.cris.customerportal.audit;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

public class DatabaseOperationAudit {
    private String operationType;
    private String pageName;
    private String tableName;
    private String customerCode;
    private String companyName;
    private String sqlStatement;
    private List<ParameterEntry> parameters = new ArrayList<>();
    private LocalDateTime executionTime;
    private int rowsAffected;
    private String status;
    private String errorMessage;

    public static class ParameterEntry {
        private final int index;
        private final String name;
        private final Object value;
        private final boolean sensitive;

        public ParameterEntry(int index, String name, Object value, boolean sensitive) {
            this.index = index;
            this.name = name;
            this.value = value;
            this.sensitive = sensitive;
        }

        public int getIndex() { return index; }
        public String getName() { return name; }
        public Object getValue() { return value; }
        public boolean isSensitive() { return sensitive; }

        public String getFormattedValue() {
            if (value == null) {
                return "NULL";
            }
            String strVal = String.valueOf(value);
            if (sensitive) {
                return maskValue(name, strVal);
            }
            return "\"" + strVal + "\"";
        }

        private String maskValue(String paramName, String val) {
            if (val == null || val.isEmpty()) return "NULL";
            String upperName = paramName != null ? paramName.toUpperCase() : "";
            if (upperName.contains("MOBILE") || upperName.contains("PHONE")) {
                if (val.length() > 4) {
                    return "\"" + "*".repeat(val.length() - 4) + val.substring(val.length() - 4) + "\"";
                }
                return "\"******" + val + "\"";
            } else if (upperName.contains("PAN")) {
                return "\"XXXXXXXXXX\"";
            } else if (upperName.contains("EMAIL")) {
                int atIdx = val.indexOf('@');
                if (atIdx > 1) {
                    return "\"" + val.charAt(0) + "***" + val.substring(atIdx) + "\"";
                }
                return "\"a***@email.com\"";
            }
            return "\"XXXXXXXX\"";
        }
    }

    public DatabaseOperationAudit() {
        this.executionTime = LocalDateTime.now();
        this.status = "SUCCESS";
        this.rowsAffected = 0;
    }

    // Getters and Setters
    public String getOperationType() { return operationType; }
    public void setOperationType(String operationType) { this.operationType = operationType; }

    public String getPageName() { return pageName; }
    public void setPageName(String pageName) { this.pageName = pageName; }

    public String getTableName() { return tableName; }
    public void setTableName(String tableName) { this.tableName = tableName; }

    public String getCustomerCode() { return customerCode; }
    public void setCustomerCode(String customerCode) { this.customerCode = customerCode; }

    public String getCompanyName() { return companyName; }
    public void setCompanyName(String companyName) { this.companyName = companyName; }

    public String getSqlStatement() { return sqlStatement; }
    public void setSqlStatement(String sqlStatement) { this.sqlStatement = sqlStatement; }

    public List<ParameterEntry> getParameters() { return parameters; }
    public void setParameters(List<ParameterEntry> parameters) { this.parameters = parameters; }

    public void addParameter(int index, String name, Object value) {
        addParameter(index, name, value, isSensitiveParam(name));
    }

    public void addParameter(int index, String name, Object value, boolean sensitive) {
        this.parameters.add(new ParameterEntry(index, name, value, sensitive));
    }

    private boolean isSensitiveParam(String name) {
        if (name == null) return false;
        String upper = name.toUpperCase();
        return upper.contains("MOBILE") || upper.contains("PAN") || upper.contains("EMAIL") || upper.contains("PASSWORD");
    }

    public LocalDateTime getExecutionTime() { return executionTime; }
    public void setExecutionTime(LocalDateTime executionTime) { this.executionTime = executionTime; }

    public String getFormattedExecutionTime() {
        if (executionTime == null) return "";
        return executionTime.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
    }

    public int getRowsAffected() { return rowsAffected; }
    public void setRowsAffected(int rowsAffected) { this.rowsAffected = rowsAffected; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
}
