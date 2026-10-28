package com.cris.customerportal.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Generic wrapper for JSON responses from RMS APIs.
 * All three RMS endpoints (ATVLDTUSER, RTGNRTOTP, RTVRFYOTP) return a similar envelope.
 * Unknown fields are ignored so we stay resilient to API additions.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class RmsApiResponse {

    /** "S" = success, "E" = error (typical RMS convention) */
    @JsonProperty("F_STATUS")
    private String status;

    /** Human-readable message / error description */
    @JsonProperty("F_MSG")
    private String message;

    /**
     * For ATVLDTUSER: contains pipe-delimited or JSON designation list.
     * Interpretation depends on the specific API endpoint.
     */
    @JsonProperty("F_DESIG")
    private String designations;

    /** Additional data payload (varies by endpoint) */
    @JsonProperty("F_DATA")
    private String data;

    /** Username returned after successful validation */
    @JsonProperty("F_USERNAME")
    private String userName;

    /** Email returned after successful validation */
    @JsonProperty("F_EMAILID")
    private String email;

    /** Phone / mobile number returned after successful validation */
    @JsonProperty("F_MOBILENO")
    private String mobileNo;

    public RmsApiResponse() {}

    public String getStatus()       { return status; }
    public void setStatus(String s) { this.status = s; }

    public String getMessage()       { return message; }
    public void setMessage(String m) { this.message = m; }

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

    /** Convenience: returns true when F_STATUS is "S" (success). */
    public boolean isSuccess() {
        return "S".equalsIgnoreCase(status);
    }
}
