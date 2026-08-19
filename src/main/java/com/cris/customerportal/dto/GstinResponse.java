package com.cris.customerportal.dto;

public record GstinResponse(
    String state,
    String gstin,
    String gstinFileName
) {}
