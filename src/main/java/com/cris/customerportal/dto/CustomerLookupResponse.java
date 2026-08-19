package com.cris.customerportal.dto;

import java.util.List;

public record CustomerLookupResponse(
  String companyName,
  String customerCode,
  String address,
  String city,
  String pincode,
  List<GstinResponse> gstins,
  String panNumber,
  String operatingDivision,
  String zone,
  String email,
  String mobile,
  String codeType
) {}
