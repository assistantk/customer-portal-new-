package com.cris.customerportal.dto;

import java.util.ArrayList;
import java.util.List;

public class GstinDuplicateCheckResult {
    private boolean duplicate;
    private String status;
    private String message;
    private List<GstinDuplicateRecord> records = new ArrayList<>();

    public GstinDuplicateCheckResult() {}

    public GstinDuplicateCheckResult(boolean duplicate, String status, String message) {
        this.duplicate = duplicate;
        this.status = status;
        this.message = message;
    }

    public GstinDuplicateCheckResult(boolean duplicate, String status, String message, List<GstinDuplicateRecord> records) {
        this.duplicate = duplicate;
        this.status = status;
        this.message = message;
        this.records = records != null ? records : new ArrayList<>();
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

    public List<GstinDuplicateRecord> getRecords() {
        return records;
    }

    public void setRecords(List<GstinDuplicateRecord> records) {
        this.records = records != null ? records : new ArrayList<>();
    }
}

