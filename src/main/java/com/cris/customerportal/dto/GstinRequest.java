package com.cris.customerportal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record GstinRequest(
    @NotBlank(message="State is required") String state,
    @Pattern(regexp="^[A-Za-z0-9]{15}$", message="GSTIN must contain exactly 15 letters or numbers") String gstin
) {}
