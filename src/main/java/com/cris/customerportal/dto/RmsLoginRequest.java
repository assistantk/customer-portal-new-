package com.cris.customerportal.dto;

/**
 * Request body sent to the RMS ATVLDTUSER API for user credential validation.
 * Fixed fields reflect the confirmed API contract from APIs.txt.
 */
public class RmsLoginRequest {
    // Variable fields — populated from login form
    private String F_LOCN;
    private String F_USERID;
    private String F_PSWD;
    private String F_APLYDATE;

    // Fixed fields per API contract
    private final String F_OPTN       = "S";
    private final String F_ROLEID     = "";
    private final String F_VRSN       = "9.87";
    private final String F_FLAG       = "N";
    private final String F_VALDFLAG   = "R";
    private final String F_RMSTMSFLAG = "R";
    private final String F_CLNTID     = "";
    private final String F_COMMITFLAG = "Y";
    private final String F_FUNCDESC   = "R";
    private final String F_SRVCNAME   = "ATVLDTUSER";
    private final String F_SESNNUMB   = "1";
    private final String F_FLINFLAG   = "W";
    private final String F_ENTYSRVC   = "RMS_TRANS";

    public RmsLoginRequest() {}

    public String getF_LOCN()       { return F_LOCN; }
    public void setF_LOCN(String v) { this.F_LOCN = v; }

    public String getF_USERID()       { return F_USERID; }
    public void setF_USERID(String v) { this.F_USERID = v; }

    public String getF_PSWD()       { return F_PSWD; }
    public void setF_PSWD(String v) { this.F_PSWD = v; }

    public String getF_APLYDATE()       { return F_APLYDATE; }
    public void setF_APLYDATE(String v) { this.F_APLYDATE = v; }

    public String getF_OPTN()       { return F_OPTN; }
    public String getF_ROLEID()     { return F_ROLEID; }
    public String getF_VRSN()       { return F_VRSN; }
    public String getF_FLAG()       { return F_FLAG; }
    public String getF_VALDFLAG()   { return F_VALDFLAG; }
    public String getF_RMSTMSFLAG() { return F_RMSTMSFLAG; }
    public String getF_CLNTID()     { return F_CLNTID; }
    public String getF_COMMITFLAG() { return F_COMMITFLAG; }
    public String getF_FUNCDESC()   { return F_FUNCDESC; }
    public String getF_SRVCNAME()   { return F_SRVCNAME; }
    public String getF_SESNNUMB()   { return F_SESNNUMB; }
    public String getF_FLINFLAG()   { return F_FLINFLAG; }
    public String getF_ENTYSRVC()   { return F_ENTYSRVC; }
}
