package com.cris.customerportal.dto;

import java.util.ArrayList;
import java.util.List;

public class PanDuplicateCheckResult {
    private boolean duplicate;
    private String status;
    private String message;
    private List<PanCompanyRecord> companies = new ArrayList<>();

    public PanDuplicateCheckResult() {}

    public PanDuplicateCheckResult(boolean duplicate, String status, String message) {
        this.duplicate = duplicate;
        this.status = status;
        this.message = message;
    }

    public PanDuplicateCheckResult(boolean duplicate, String status, String message, List<PanCompanyRecord> companies) {
        this.duplicate = duplicate;
        this.status = status;
        this.message = message;
        this.companies = companies != null ? companies : new ArrayList<>();
    }

    public boolean isDuplicate() {
        return duplicate;
    }

    public void setDuplicate(boolean duplicate) {
        this.duplicate = duplicate;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public List<PanCompanyRecord> getCompanies() {
        return companies;
    }

    public void setCompanies(List<PanCompanyRecord> companies) {
        this.companies = companies != null ? companies : new ArrayList<>();
    }
}

