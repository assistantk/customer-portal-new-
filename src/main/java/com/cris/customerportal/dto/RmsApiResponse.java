package com.cris.customerportal.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.TextNode;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Generic wrapper for JSON responses from RMS APIs.
 * Supports ATVLDTUSER, RTGNRTOTP, and RTVRFYOTP envelopes.
 * Resilient to differing field types (e.g. F_ROLEID as array vs string, F_ERRORNO as int vs string).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class RmsApiResponse {

    @JsonProperty("F_STATUS")
    @JsonAlias({"status", "STATUS"})
    private JsonNode statusNode;

    @JsonProperty("F_MSG")
    @JsonAlias({"message", "MESSAGE", "F_MESSAGE", "msg"})
    private JsonNode msgNode;

    @JsonProperty("F_ERRORNO")
    @JsonAlias({"errorNo", "ERRORNO", "F_ERRNO", "errno"})
    private JsonNode errorNoNode;

    @JsonProperty("F_RMRK")
    @JsonAlias({"rmrk", "RMRK", "remark", "REMARK", "remarks", "REMARKS"})
    private JsonNode rmrkNode;

    @JsonProperty("F_USERID")
    @JsonAlias({"userId", "USERID", "F_USER_ID"})
    private JsonNode userIdNode;

    @JsonProperty("F_SRVCNAME")
    @JsonAlias({"srvcName", "SRVCNAME"})
    private JsonNode srvcNameNode;

    @JsonProperty("F_VALDFLAG")
    @JsonAlias({"valdFlag", "VALDFLAG"})
    private JsonNode valdFlagNode;

    @JsonProperty("F_ROLEID")
    @JsonAlias({"roleId", "ROLEID"})
    private JsonNode roleIdNode;

    @JsonProperty("F_DESIG")
    @JsonAlias({"designations", "DESIG", "F_DESIGNATION", "DESIGNATION"})
    private JsonNode designationsNode;

    @JsonProperty("F_DATA")
    @JsonAlias({"data", "DATA"})
    private JsonNode dataNode;

    @JsonProperty("F_USERNAME")
    @JsonAlias({"userName", "USERNAME", "F_USER_NAME"})
    private JsonNode userNameNode;

    @JsonProperty("F_EMAILID")
    @JsonAlias({"email", "EMAILID", "EMAIL", "F_NEWRRTYPE", "NEWRRTYPE"})
    private JsonNode emailNode;

    @JsonProperty("F_MOBILENO")
    @JsonAlias({"mobileNo", "MOBILENO", "MOBILE", "F_NEWRRNUMB", "NEWRRNUMB"})
    private JsonNode mobileNoNode;

    @JsonProperty("F_CLNTID")
    @JsonAlias({"clientId", "CLNTID"})
    private JsonNode clientIdNode;

    @JsonProperty("F_DOMN")
    @JsonAlias({"domain", "DOMN"})
    private JsonNode domainNode;

    @JsonProperty("F_SRVC")
    @JsonAlias({"service", "SRVC"})
    private JsonNode serviceNode;

    public RmsApiResponse() {}

    public String getStatus() {
        return statusNode != null && !statusNode.isNull() ? statusNode.asText() : null;
    }
    public void setStatus(String s) {
        this.statusNode = s != null ? TextNode.valueOf(s) : null;
    }

    public String getMessage() {
        if (msgNode != null && !msgNode.isNull() && !msgNode.asText().trim().isEmpty()) {
            return msgNode.asText().trim();
        }
        if (rmrkNode != null && !rmrkNode.isNull() && !rmrkNode.asText().trim().isEmpty()) {
            return rmrkNode.asText().trim();
        }
        return null;
    }
    public void setMessage(String m) {
        this.msgNode = m != null ? TextNode.valueOf(m) : null;
    }

    public String getErrorNo() {
        return errorNoNode != null && !errorNoNode.isNull() ? errorNoNode.asText() : null;
    }
    public void setErrorNo(String en) {
        this.errorNoNode = en != null ? TextNode.valueOf(en) : null;
    }

    public String getRmrk() {
        return rmrkNode != null && !rmrkNode.isNull() ? rmrkNode.asText() : null;
    }
    public void setRmrk(String r) {
        this.rmrkNode = r != null ? TextNode.valueOf(r) : null;
    }

    public String getUserId() {
        return userIdNode != null && !userIdNode.isNull() ? userIdNode.asText() : null;
    }
    public void setUserId(String u) {
        this.userIdNode = u != null ? TextNode.valueOf(u) : null;
    }

    public String getSrvcName() {
        return srvcNameNode != null && !srvcNameNode.isNull() ? srvcNameNode.asText() : null;
    }
    public void setSrvcName(String sn) {
        this.srvcNameNode = sn != null ? TextNode.valueOf(sn) : null;
    }

    public String getValdFlag() {
        return valdFlagNode != null && !valdFlagNode.isNull() ? valdFlagNode.asText() : null;
    }
    public void setValdFlag(String vf) {
        this.valdFlagNode = vf != null ? TextNode.valueOf(vf) : null;
    }

    public JsonNode getRoleIdNode() {
        return roleIdNode;
    }
    public void setRoleIdNode(JsonNode n) {
        this.roleIdNode = n;
    }

    public String getRoleId() {
        return getDesignations();
    }
    public void setRoleId(String r) {
        this.roleIdNode = r != null ? TextNode.valueOf(r) : null;
    }

    public JsonNode getDesignationsNode() {
        return designationsNode;
    }
    public void setDesignationsNode(JsonNode n) {
        this.designationsNode = n;
    }

    public String getDesignations() {
        List<String> list = extractAllDesignations();
        return list.isEmpty() ? null : String.join("|", list);
    }
    public void setDesignations(String d) {
        this.designationsNode = d != null ? TextNode.valueOf(d) : null;
    }

    public String getData() {
        if (dataNode == null || dataNode.isNull()) return null;
        return dataNode.isTextual() ? dataNode.asText() : dataNode.toString();
    }
    public void setData(String d) {
        this.dataNode = d != null ? TextNode.valueOf(d) : null;
    }

    public String getUserName() {
        return userNameNode != null && !userNameNode.isNull() ? userNameNode.asText() : null;
    }
    public void setUserName(String u) {
        this.userNameNode = u != null ? TextNode.valueOf(u) : null;
    }

    public String getEmail() {
        return emailNode != null && !emailNode.isNull() ? emailNode.asText() : null;
    }
    public void setEmail(String e) {
        this.emailNode = e != null ? TextNode.valueOf(e) : null;
    }

    public String getMobileNo() {
        return mobileNoNode != null && !mobileNoNode.isNull() ? mobileNoNode.asText() : null;
    }
    public void setMobileNo(String m) {
        this.mobileNoNode = m != null ? TextNode.valueOf(m) : null;
    }

    public String getClientId() {
        return clientIdNode != null && !clientIdNode.isNull() ? clientIdNode.asText() : null;
    }
    public void setClientId(String c) {
        this.clientIdNode = c != null ? TextNode.valueOf(c) : null;
    }

    public String getDomain() {
        return domainNode != null && !domainNode.isNull() ? domainNode.asText() : null;
    }
    public void setDomain(String d) {
        this.domainNode = d != null ? TextNode.valueOf(d) : null;
    }

    public String getService() {
        return serviceNode != null && !serviceNode.isNull() ? serviceNode.asText() : null;
    }
    public void setService(String s) {
        this.serviceNode = s != null ? TextNode.valueOf(s) : null;
    }

    /**
     * Resiliently extracts all designations from F_ROLEID, F_DESIG, and F_DATA.
     * Handles string literals, delimited strings ("SR-DCM|DCM"), JSON arrays of strings (["SR-DCM", "DCM"]),
     * and JSON arrays of objects ([{"ROLEID": "SR-DCM"}]).
     */
    public List<String> extractAllDesignations() {
        List<String> list = new ArrayList<>();
        extractFromNode(roleIdNode, list);
        extractFromNode(designationsNode, list);
        extractFromNode(dataNode, list);
        return list.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .distinct()
                .collect(Collectors.toList());
    }

    private void extractFromNode(JsonNode node, List<String> target) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isArray()) {
            for (JsonNode item : node) {
                if (item == null || item.isNull()) continue;
                if (item.isTextual()) {
                    addStringTokens(item.asText(), target);
                } else if (item.isObject()) {
                    String[] candidates = {"F_ROLEID", "ROLEID", "ROLE_ID", "ROLE", "F_DESIG", "DESIG", "DESIGNATION", "NAME", "CODE", "F_ROLEDESC", "ROLEDESC"};
                    boolean found = false;
                    for (String key : candidates) {
                        JsonNode val = item.get(key);
                        if (val != null && val.isTextual() && !val.asText().trim().isEmpty()) {
                            addStringTokens(val.asText(), target);
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        Iterator<Map.Entry<String, JsonNode>> fields = item.fields();
                        while (fields.hasNext()) {
                            Map.Entry<String, JsonNode> field = fields.next();
                            if (field.getValue().isTextual()) {
                                addStringTokens(field.getValue().asText(), target);
                            }
                        }
                    }
                }
            }
        } else if (node.isTextual()) {
            addStringTokens(node.asText(), target);
        }
    }

    private void addStringTokens(String raw, List<String> target) {
        if (raw == null) return;
        String trimmed = raw.trim();
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }
        String[] parts = trimmed.contains("|") ? trimmed.split("\\|")
                : trimmed.contains(",") ? trimmed.split(",")
                : new String[]{trimmed};
        for (String p : parts) {
            String clean = p.replace("\"", "").replace("'", "").trim();
            if (!clean.isEmpty()) {
                target.add(clean);
            }
        }
    }

    /**
     * Determines whether the response represents an application-level success.
     * Evaluates F_ERRORNO, F_STATUS, F_VALDFLAG, F_RMRK, and role list availability.
     */
    public boolean isSuccess() {
        String err = getErrorNo();
        if (err != null && !err.trim().isEmpty()) {
            String trimmedErr = err.trim();
            if (!"0".equals(trimmedErr) && !"00".equals(trimmedErr) && !"SUCCESS".equalsIgnoreCase(trimmedErr)) {
                return false;
            }

        }

        String st = getStatus();
        if (st != null && !st.trim().isEmpty()) {
            String s = st.trim().toUpperCase(Locale.ROOT);
            if ("E".equals(s) || "ERROR".equals(s) || "F".equals(s) || "FAIL".equals(s) || "FAILED".equals(s)) {
                return false;
            }
            if ("S".equals(s) || "SUCCESS".equals(s)) {
                return true;
            }
        }

        String rk = getRmrk();
        if (rk != null && !rk.trim().isEmpty()) {
            String lower = rk.trim().toLowerCase(Locale.ROOT);
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

        String vf = getValdFlag();
        if (vf != null && !vf.trim().isEmpty()) {
            String v = vf.trim().toUpperCase(Locale.ROOT);
            if ("N".equals(v) || "F".equals(v) || "E".equals(v)) {
                return false;
            }
            if ("S".equals(v) || "Y".equals(v) || "R".equals(v) || "V".equals(v)) {
                return true;
            }
        }

        if (err != null && ("0".equals(err.trim()) || "00".equals(err.trim()) || "SUCCESS".equalsIgnoreCase(err.trim()))) {
            return true;
        }

        if ("S".equalsIgnoreCase(st)) {
            return true;
        }

        String msg = getMessage();
        if (msg != null && !msg.trim().isEmpty()) {
            String lower = msg.trim().toLowerCase(Locale.ROOT);
            if (lower.contains("invalid") || lower.contains("error") || lower.contains("failed")
                    || lower.contains("not found") || lower.contains("wrong") || lower.contains("incorrect")
                    || lower.contains("denied") || lower.contains("unauthorized")) {
                return false;
            }
            if (lower.contains("success") || lower.contains("valid") || lower.contains("verified")) {
                return true;
            }
        }

        // If F_ROLEID contains designations and no error was reported, it is a successful validation response
        if (!extractAllDesignations().isEmpty()) {
            return true;
        }

        return false;
    }

    /**
     * Recognizes the RMS OTP-generation acknowledgement, which can contain an empty
     * error number instead of the status and remark fields used by other responses.
     */
    public boolean isOtpGenerationAccepted(String expectedUserId) {
        if (isSuccess()) {
            return true;
        }

        String errorNo = getErrorNo();
        String serviceName = getSrvcName();
        String userId = getUserId();
        if ((errorNo != null && !errorNo.trim().isEmpty())
                || expectedUserId == null || expectedUserId.trim().isEmpty()
                || userId == null || !expectedUserId.trim().equalsIgnoreCase(userId.trim())
                || (serviceName != null && !serviceName.trim().isEmpty()
                    && !"GNRTOTP".equalsIgnoreCase(serviceName.trim())
                    && !"REGNRTOTP".equalsIgnoreCase(serviceName.trim()))) {
            return false;
        }

        String status = getStatus();
        if (status != null) {
            String normalizedStatus = status.trim().toUpperCase(Locale.ROOT);
            if ("E".equals(normalizedStatus) || "ERROR".equals(normalizedStatus)
                    || "F".equals(normalizedStatus) || "FAIL".equals(normalizedStatus)
                    || "FAILED".equals(normalizedStatus)) {
                return false;
            }
        }

        String validationFlag = getValdFlag();
        if (validationFlag != null) {
            String normalizedFlag = validationFlag.trim().toUpperCase(Locale.ROOT);
            if ("N".equals(normalizedFlag) || "F".equals(normalizedFlag) || "E".equals(normalizedFlag)) {
                return false;
            }
        }

        return !containsFailureIndicator(getRmrk()) && !containsFailureIndicator(getMessage());
    }

    private boolean containsFailureIndicator(String value) {
        if (value == null || value.trim().isEmpty()) {
            return false;
        }
        String lower = value.trim().toLowerCase(Locale.ROOT);
        return lower.contains("invalid") || lower.contains("error") || lower.contains("failed")
                || lower.contains("not found") || lower.contains("wrong") || lower.contains("incorrect")
                || lower.contains("denied") || lower.contains("locked") || lower.contains("expired")
                || lower.contains("unauthorized");
    }
}
