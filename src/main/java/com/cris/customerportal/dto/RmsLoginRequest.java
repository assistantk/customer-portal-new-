package com.cris.customerportal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Request body sent to the RMS ATVLDTUSER API for user credential validation.
 * Fixed fields reflect the confirmed API contract from Postman.
 */
public class RmsLoginRequest {
    // Variable fields — populated from login form
    @JsonProperty("F_LOCN")
    private String F_LOCN;

    @JsonProperty("F_USERID")
    private String F_USERID;

    @JsonProperty("F_PSWD")
    private String F_PSWD;

    @JsonProperty("F_APLYDATE")
    private String F_APLYDATE;

    // Fixed fields per API contract
    @JsonProperty("F_OPTN")
    private String F_OPTN = "S";

    @JsonProperty("F_ROLEID")
    private String F_ROLEID = "";

    @JsonProperty("F_VRSN")
    private String F_VRSN = "9.87";

    @JsonProperty("F_FLAG")
    private String F_FLAG = "N";

    @JsonProperty("F_VALDFLAG")
    private String F_VALDFLAG = "R";

    @JsonProperty("F_RMSTMSFLAG")
    private String F_RMSTMSFLAG = "R";

    @JsonProperty("F_CLNTID")
    private String F_CLNTID = "";

    @JsonProperty("F_COMMITFLAG")
    private String F_COMMITFLAG = "Y";

    @JsonProperty("F_FUNCDESC")
    private String F_FUNCDESC = "R";

    @JsonProperty("F_SRVCNAME")
    private String F_SRVCNAME = "ATVLDTUSER";

    @JsonProperty("F_SESNNUMB")
    private String F_SESNNUMB = "1";

    @JsonProperty("F_FLINFLAG")
    private String F_FLINFLAG = "W";

    @JsonProperty("F_ENTYSRVC")
    private String F_ENTYSRVC = "RMS_TRANS";

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
    public void setF_OPTN(String v) { this.F_OPTN = v; }

    public String getF_ROLEID()       { return F_ROLEID; }
    public void setF_ROLEID(String v) { this.F_ROLEID = v; }

    public String getF_VRSN()       { return F_VRSN; }
    public void setF_VRSN(String v) { this.F_VRSN = v; }

    public String getF_FLAG()       { return F_FLAG; }
    public void setF_FLAG(String v) { this.F_FLAG = v; }

    public String getF_VALDFLAG()       { return F_VALDFLAG; }
    public void setF_VALDFLAG(String v) { this.F_VALDFLAG = v; }

    public String getF_RMSTMSFLAG()       { return F_RMSTMSFLAG; }
    public void setF_RMSTMSFLAG(String v) { this.F_RMSTMSFLAG = v; }

    public String getF_CLNTID()       { return F_CLNTID; }
    public void setF_CLNTID(String v) { this.F_CLNTID = v; }

    public String getF_COMMITFLAG()       { return F_COMMITFLAG; }
    public void setF_COMMITFLAG(String v) { this.F_COMMITFLAG = v; }

    public String getF_FUNCDESC()       { return F_FUNCDESC; }
    public void setF_FUNCDESC(String v) { this.F_FUNCDESC = v; }

    public String getF_SRVCNAME()       { return F_SRVCNAME; }
    public void setF_SRVCNAME(String v) { this.F_SRVCNAME = v; }

    public String getF_SESNNUMB()       { return F_SESNNUMB; }
    public void setF_SESNNUMB(String v) { this.F_SESNNUMB = v; }

    public String getF_FLINFLAG()       { return F_FLINFLAG; }
    public void setF_FLINFLAG(String v) { this.F_FLINFLAG = v; }

    public String getF_ENTYSRVC()       { return F_ENTYSRVC; }
    public void setF_ENTYSRVC(String v) { this.F_ENTYSRVC = v; }
}
