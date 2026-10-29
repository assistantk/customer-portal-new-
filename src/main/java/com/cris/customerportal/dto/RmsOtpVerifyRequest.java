package com.cris.customerportal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Request body for RMS RTVRFYOTP (OTP verification) API.
 * F_DOMN = OTP entered by user (mobile domain).
 * F_SRVC = OTP entered by user (service domain).
 */
public class RmsOtpVerifyRequest {
    @JsonProperty("F_USERID")
    private String F_USERID;

    @JsonProperty("F_CLNTID")
    private String F_CLNTID;

    @JsonProperty("F_DOMN")
    private String F_DOMN;

    @JsonProperty("F_SRVC")
    private String F_SRVC;

    @JsonProperty("F_SRVCNAME")
    private String F_SRVCNAME = "VLDTOTP";

    @JsonProperty("F_AJSTFLAG")
    private String F_AJSTFLAG = "APP_LOGIN";

    public RmsOtpVerifyRequest() {}

    public String getF_USERID()       { return F_USERID; }
    public void setF_USERID(String v) { this.F_USERID = v; }

    public String getF_CLNTID()       { return F_CLNTID; }
    public void setF_CLNTID(String v) { this.F_CLNTID = v; }

    public String getF_DOMN()       { return F_DOMN; }
    public void setF_DOMN(String v) { this.F_DOMN = v; }

    public String getF_SRVC()       { return F_SRVC; }
    public void setF_SRVC(String v) { this.F_SRVC = v; }

    public String getF_SRVCNAME()       { return F_SRVCNAME; }
    public void setF_SRVCNAME(String v) { this.F_SRVCNAME = v; }

    public String getF_AJSTFLAG()       { return F_AJSTFLAG; }
    public void setF_AJSTFLAG(String v) { this.F_AJSTFLAG = v; }
}
