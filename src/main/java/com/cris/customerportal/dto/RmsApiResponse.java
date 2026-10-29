package com.cris.customerportal.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Locale;

/**
 * Generic wrapper for JSON responses from RMS APIs.
 * Supports ATVLDTUSER, RTGNRTOTP, and RTVRFYOTP envelopes.
 * Resilient to differing field names used across RMS services (F_STATUS vs F_ERRORNO, F_MSG vs F_RMRK, etc.)
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class RmsApiResponse {

    @JsonProperty("F_STATUS")
    @JsonAlias({"status", "STATUS"})
    private String status;

    @JsonProperty("F_MSG")
    @JsonAlias({"message", "MESSAGE", "F_MESSAGE", "msg"})
    private String message;

    @JsonProperty("F_ERRORNO")
    @JsonAlias({"errorNo", "ERRORNO", "F_ERRNO", "errno"})
    private String errorNo;

    @JsonProperty("F_RMRK")
    @JsonAlias({"rmrk", "RMRK", "remark", "REMARK", "remarks", "REMARKS"})
    private String rmrk;

    @JsonProperty("F_USERID")
    @JsonAlias({"userId", "USERID", "F_USER_ID"})
    private String userId;

    @JsonProperty("F_SRVCNAME")
    @JsonAlias({"srvcName", "SRVCNAME"})
    private String srvcName;

    @JsonProperty("F_VALDFLAG")
    @JsonAlias({"valdFlag", "VALDFLAG"})
    private String valdFlag;

    @JsonProperty("F_ROLEID")
    @JsonAlias({"roleId", "ROLEID"})
    private String roleId;

    @JsonProperty("F_DESIG")
    @JsonAlias({"designations", "DESIG", "F_DESIGNATION", "DESIGNATION"})
    private String designations;

    @JsonProperty("F_DATA")
    @JsonAlias({"data", "DATA"})
    private String data;

    @JsonProperty("F_USERNAME")
    @JsonAlias({"userName", "USERNAME", "F_USER_NAME"})
    private String userName;

    @JsonProperty("F_EMAILID")
    @JsonAlias({"email", "EMAILID", "EMAIL", "F_NEWRRTYPE", "NEWRRTYPE"})
    private String email;

    @JsonProperty("F_MOBILENO")
    @JsonAlias({"mobileNo", "MOBILENO", "MOBILE", "F_NEWRRNUMB", "NEWRRNUMB"})
    private String mobileNo;

    @JsonProperty("F_CLNTID")
    @JsonAlias({"clientId", "CLNTID"})
    private String clientId;

    @JsonProperty("F_DOMN")
    @JsonAlias({"domain", "DOMN"})
    private String domain;

    @JsonProperty("F_SRVC")
    @JsonAlias({"service", "SRVC"})
    private String service;

    public RmsApiResponse() {}

    public String getStatus()       { return status; }
    public void setStatus(String s) { this.status = s; }

    public String getMessage() {
        if (message != null && !message.trim().isEmpty()) {
            return message.trim();
        }
        if (rmrk != null && !rmrk.trim().isEmpty()) {
            return rmrk.trim();
        }
        return null;
    }
    public void setMessage(String m) { this.message = m; }

    public String getErrorNo()        { return errorNo; }
    public void setErrorNo(String en) { this.errorNo = en; }

    public String getRmrk()        { return rmrk; }
    public void setRmrk(String r)  { this.rmrk = r; }

    public String getUserId()        { return userId; }
    public void setUserId(String u)  { this.userId = u; }

    public String getSrvcName()        { return srvcName; }
    public void setSrvcName(String sn) { this.srvcName = sn; }

    public String getValdFlag()        { return valdFlag; }
    public void setValdFlag(String vf) { this.valdFlag = vf; }

    public String getRoleId()        { return roleId; }
    public void setRoleId(String r)  { this.roleId = r; }

    public String getDesignations()       { return designations; }
    public void setDesignations(String d) { this.designations = d; }

    public String getData()       { return data; }
    public void setData(String d) { this.data = d; }

    public String getUserName()       { return userName; }
    public void setUserName(String u) { this.userName = u; }

    public String getEmail()       { return email; }
    public void setEmail(String e) { this.email = e; }

    public String getMobileNo()       { return mobileNo; }
    public void setMobileNo(String m) { this.mobileNo = m; }

    public String getClientId()       { return clientId; }
    public void setClientId(String c) { this.clientId = c; }

    public String getDomain()       { return domain; }
    public void setDomain(String d) { this.domain = d; }

    public String getService()       { return service; }
    public void setService(String s) { this.service = s; }

    /**
     * Determines whether the response represents an application-level success.
     * Evaluates F_ERRORNO, F_STATUS, F_VALDFLAG, and F_RMRK.
     */
    public boolean isSuccess() {
        // 1. Explicit error number check
        if (errorNo != null && !errorNo.trim().isEmpty()) {
            String trimmedErr = errorNo.trim();
            if (!"0".equals(trimmedErr) && !"00".equals(trimmedErr) && !"SUCCESS".equalsIgnoreCase(trimmedErr)) {
                return false;
            }
        }

        // 2. Explicit status check
        if (status != null && !status.trim().isEmpty()) {
            String s = status.trim().toUpperCase(Locale.ROOT);
            if ("E".equals(s) || "ERROR".equals(s) || "F".equals(s) || "FAIL".equals(s) || "FAILED".equals(s)) {
                return false;
            }
            if ("S".equals(s) || "SUCCESS".equals(s)) {
                return true;
            }
        }

        // 3. Inspect remarks for negative keywords
        if (rmrk != null && !rmrk.trim().isEmpty()) {
            String lower = rmrk.trim().toLowerCase(Locale.ROOT);
            if (lower.contains("invalid") || lower.contains("error") || lower.contains("failed")
                    || lower.contains("not found") || lower.contains("wrong") || lower.contains("incorrect")
                    || lower.contains("denied") || lower.contains("locked") || lower.contains("expired")
                    || lower.contains("unauthorized")) {
                return false;
            }
            if (lower.contains("success") || lower.contains("valid") || lower.contains("ok") || lower.contains("verified")) {
                return true;
            }
        }

        // 4. Inspect validation flag
        if (valdFlag != null && !valdFlag.trim().isEmpty()) {
            String vf = valdFlag.trim().toUpperCase(Locale.ROOT);
            if ("N".equals(vf) || "F".equals(vf) || "E".equals(vf)) {
                return false;
            }
            if ("S".equals(vf) || "Y".equals(vf) || "R".equals(vf) || "V".equals(vf)) {
                return true;
            }
        }

        // 5. If error number is explicitly 0/00/SUCCESS and no negative remarks
        if (errorNo != null && ("0".equals(errorNo.trim()) || "00".equals(errorNo.trim()) || "SUCCESS".equalsIgnoreCase(errorNo.trim()))) {
            return true;
        }

        // 6. Inspect message for positive indicator
        if (message != null && !message.trim().isEmpty()) {
            String lower = message.trim().toLowerCase(Locale.ROOT);
            if (lower.contains("invalid") || lower.contains("error") || lower.contains("failed")
                    || lower.contains("not found") || lower.contains("wrong") || lower.contains("incorrect")
                    || lower.contains("denied") || lower.contains("unauthorized")) {
                return false;
            }
            if (lower.contains("success") || lower.contains("valid") || lower.contains("verified")) {
                return true;
            }
        }

        return false;
    }
}
