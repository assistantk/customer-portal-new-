package com.cris.customerportal.dto;

public class DeleteRequestPayload {
    private String codeType;
    private String code;
    private String companyName;
    private String disableScope;
    private java.util.List<String> selectedGstins;

    public String getCodeType() {
        return codeType;
    }

    public void setCodeType(String codeType) {
        this.codeType = codeType;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public String getDisableScope() {
        return disableScope;
    }

    public void setDisableScope(String disableScope) {
        this.disableScope = disableScope;
    }

    public java.util.List<String> getSelectedGstins() {
        return selectedGstins;
    }

    public void setSelectedGstins(java.util.List<String> selectedGstins) {
        this.selectedGstins = selectedGstins;
    }
}
