package com.cris.customerportal.service;

import com.cris.customerportal.dto.RmsLoginRequest;
import java.io.Serializable;
import java.util.Collections;
import java.util.List;

/**
 * Intermediate authentication context stored in the HTTP session during the
 * multi-step login flow. The session key is defined in {@link RmsAuthOrchestrator}.
 *
 * States:
 *   CREDENTIALS_VALIDATED  - user credentials accepted by ATVLDTUSER; waiting for designation selection.
 *   OTP_PENDING            - an RMS-returned designation is selected; OTP dispatched; waiting for OTP entry.
 */
public class RmsAuthSessionContext implements Serializable {
    private static final long serialVersionUID = 1L;

    public enum Step { CREDENTIALS_VALIDATED, OTP_PENDING }

    private Step step;
    private String userId;
    private String userName;
    private String email;
    private String mobileNo;
    private String divisionCode;
    private List<String> designations;
    private String selectedDesignation;
    private RmsLoginRequest loginRequest;

    public RmsAuthSessionContext() {}

    public Step getStep()                   { return step; }
    public void setStep(Step step)          { this.step = step; }

    public String getUserId()               { return userId; }
    public void setUserId(String v)         { this.userId = v; }

    public String getUserName()             { return userName; }
    public void setUserName(String v)       { this.userName = v; }

    public String getEmail()                { return email; }
    public void setEmail(String v)          { this.email = v; }

    public String getMobileNo()             { return mobileNo; }
    public void setMobileNo(String v)       { this.mobileNo = v; }

    public String getDivisionCode()         { return divisionCode; }
    public void setDivisionCode(String v)   { this.divisionCode = v; }

    public List<String> getDesignations()   { return designations == null ? Collections.emptyList() : designations; }
    public void setDesignations(List<String> v) { this.designations = v; }

    public String getSelectedDesignation()                  { return selectedDesignation; }
    public void setSelectedDesignation(String v)            { this.selectedDesignation = v; }

    public RmsLoginRequest getLoginRequest()                { return loginRequest; }
    public void setLoginRequest(RmsLoginRequest v)          { this.loginRequest = v; }
}
