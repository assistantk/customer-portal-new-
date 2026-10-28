package com.cris.customerportal.dto;

/**
 * Request body for RMS RTVRFYOTP (OTP verification) API.
 * F_DOMN = OTP entered by user (mobile OTP).
 * F_SRVC = Email OTP entered by user (may be same as F_DOMN or separate).
 */
public class RmsOtpVerifyRequest {
    private String F_USERID;
    private String F_CLNTID;
    private String F_DOMN;
    private String F_SRVC;

    private final String F_SRVCNAME  = "VLDTOTP";
    private final String F_AJSTFLAG  = "APP_LOGIN";

    public RmsOtpVerifyRequest() {}

    public String getF_USERID()       { return F_USERID; }
    public void setF_USERID(String v) { this.F_USERID = v; }

    public String getF_CLNTID()       { return F_CLNTID; }
    public void setF_CLNTID(String v) { this.F_CLNTID = v; }

    public String getF_DOMN()       { return F_DOMN; }
    public void setF_DOMN(String v) { this.F_DOMN = v; }

    public String getF_SRVC()       { return F_SRVC; }
    public void setF_SRVC(String v) { this.F_SRVC = v; }

    public String getF_SRVCNAME()  { return F_SRVCNAME; }
    public String getF_AJSTFLAG() { return F_AJSTFLAG; }
}
