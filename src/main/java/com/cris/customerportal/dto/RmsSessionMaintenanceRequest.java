package com.cris.customerportal.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.Serializable;

/**
 * Request body sent to the RMS ATSESNMNTC API for terminating all previously
 * active sessions associated with a user ID before establishing a new session.
 */
public class RmsSessionMaintenanceRequest implements Serializable {
    private static final long serialVersionUID = 1L;

    @JsonProperty("F_USERID")
    private String F_USERID;

    @JsonProperty("F_AJSTFLAG")
    private String F_AJSTFLAG = "LOGOUT_ALL_SESN";

    @JsonProperty("F_CLNTID")
    private String F_CLNTID;

    public RmsSessionMaintenanceRequest() {}

    public RmsSessionMaintenanceRequest(String userId, String clientId) {
        this.F_USERID = userId;
        this.F_AJSTFLAG = "LOGOUT_ALL_SESN";
        this.F_CLNTID = clientId;
    }

    public String getF_USERID() {
        return F_USERID;
    }

    public void setF_USERID(String f_USERID) {
        this.F_USERID = f_USERID;
    }

    public String getF_AJSTFLAG() {
        return F_AJSTFLAG;
    }

    public void setF_AJSTFLAG(String f_AJSTFLAG) {
        this.F_AJSTFLAG = f_AJSTFLAG;
    }

    public String getF_CLNTID() {
        return F_CLNTID;
    }

    public void setF_CLNTID(String f_CLNTID) {
        this.F_CLNTID = f_CLNTID;
    }
}
