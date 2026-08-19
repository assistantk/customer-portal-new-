package com.cris.customerportal.dto;

import jakarta.validation.constraints.*;
import java.util.List;

public record CustomerRegistrationRequest(
 @NotBlank(message="Company name is required") String companyName,
 @NotBlank(message="Customer code is required") String customerCode,
 @NotBlank(message="Address is required") String address,
 @NotBlank(message="City is required") String city,
 @Pattern(regexp="^[1-9][0-9]{5}$", message="Invalid pincode") String pincode,
 @NotEmpty(message="At least one GSTIN is required") List<GstinRequest> gstins,
 @Pattern(regexp="^[A-Za-z0-9]{10}$", message="PAN No. must contain exactly 10 letters or numbers") String panNumber,
 @NotBlank(message="Operating division is required") String operatingDivision,
 @NotBlank(message="Zone is required") String zone,
 @Email(message="Invalid email") @NotBlank(message="Email is required") String email,
 @Pattern(regexp="^[6-9][0-9]{9}$", message="Invalid mobile number") String mobile,
 @NotBlank(message="Code type is required") @Pattern(regexp="^(GLOBAL|HANDLING_AGENT)$", message="Code type must be GLOBAL or HANDLING_AGENT") String codeType) {}
