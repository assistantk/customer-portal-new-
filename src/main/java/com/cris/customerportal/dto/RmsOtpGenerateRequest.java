package com.cris.customerportal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Request body for RMS RTGNRTOTP (OTP generation) API.
 * F_CNSR = project identifier (FreightCodeGenerator).
 * F_NEWRRNUMB = mobile number (from authenticated user record).
 * F_NEWRRTYPE = email address (from authenticated user record).
 */
public class RmsOtpGenerateRequest {
    @JsonProperty("F_USERID")
    private String F_USERID;

    @JsonProperty("F_CLNTID")
    private String F_CLNTID;

    @JsonProperty("F_CNSR")
    private String F_CNSR;

    @JsonProperty("F_NEWRRNUMB")
    private String F_NEWRRNUMB;

    @JsonProperty("F_NEWRRTYPE")
    private String F_NEWRRTYPE;

    @JsonProperty("F_SRVCNAME")
    private String F_SRVCNAME = "GNRTOTP";

    @JsonProperty("F_AJSTFLAG")
    private String F_AJSTFLAG = "APP_LOGIN";

    public RmsOtpGenerateRequest() {}

    public String getF_USERID()       { return F_USERID; }
    public void setF_USERID(String v) { this.F_USERID = v; }

    public String getF_CLNTID()       { return F_CLNTID; }
    public void setF_CLNTID(String v) { this.F_CLNTID = v; }

    public String getF_CNSR()       { return F_CNSR; }
    public void setF_CNSR(String v) { this.F_CNSR = v; }

    public String getF_NEWRRNUMB()       { return F_NEWRRNUMB; }
    public void setF_NEWRRNUMB(String v) { this.F_NEWRRNUMB = v; }

    public String getF_NEWRRTYPE()       { return F_NEWRRTYPE; }
    public void setF_NEWRRTYPE(String v) { this.F_NEWRRTYPE = v; }

    public String getF_SRVCNAME()       { return F_SRVCNAME; }
    public void setF_SRVCNAME(String v) { this.F_SRVCNAME = v; }

    public String getF_AJSTFLAG()       { return F_AJSTFLAG; }
    public void setF_AJSTFLAG(String v) { this.F_AJSTFLAG = v; }
}
