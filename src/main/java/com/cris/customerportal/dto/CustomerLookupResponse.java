package com.cris.customerportal.dto;

public record CustomerLookupResponse(
  String companyName,
  String customerCode,
  String address,
  String city,
  String pincode,
  String gstin,
  String panNumber,
  String operatingDivision,
  String zone,
  String email,
  String mobile,
  String codeType,
  String gstinFileName
) {}
