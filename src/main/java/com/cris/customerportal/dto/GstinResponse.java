package com.cris.customerportal.dto;

public class GstinResponse {
    private String state;
    private String gstin;
    private String gstinFileName;

    public GstinResponse() {}

    public GstinResponse(String state, String gstin, String gstinFileName) {
        this.state = state;
        this.gstin = gstin;
        this.gstinFileName = gstinFileName;
    }

    public String state() { return state; }
    public String gstin() { return gstin; }
    public String gstinFileName() { return gstinFileName; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getGstin() { return gstin; }
    public void setGstin(String gstin) { this.gstin = gstin; }
    public String getGstinFileName() { return gstinFileName; }
    public void setGstinFileName(String gstinFileName) { this.gstinFileName = gstinFileName; }
}
