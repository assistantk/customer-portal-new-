package com.cris.customerportal.service;
import com.cris.customerportal.dto.CustomerLookupResponse;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import org.springframework.web.multipart.MultipartFile;
public interface CustomerService {
  String register(CustomerRegistrationRequest request, java.util.List<MultipartFile> files);
  CustomerLookupResponse lookupByCode(String customerCode);
  String generateUniqueCode(String baseCode);
  com.cris.customerportal.dto.OldCustomerResponse lookupOldCustomerByCode(String customerCode);
  java.util.List<com.cris.customerportal.dto.OldCustomerResponse> lookupOldCustomerByGstin(String gstin);
  java.util.List<com.cris.customerportal.dto.OldCustomerResponse> searchGlobalCustomersByCompanyName(String companyName);
  java.util.List<com.cris.customerportal.dto.GlobalAgentResponse> searchHandlingAgents(String search);
  java.util.List<com.cris.customerportal.dto.GlobalAgentResponse> searchHandlingAgents(String search, String searchMode);
  java.util.List<java.util.Map<String, String>> searchOwnershipCodes(String search);
  java.util.List<java.util.Map<String, String>> searchOwnershipCodes(String search, String searchMode);
  String generateUniqueCodeJDBC(String companyName, String type);
  String registerNewEntryJDBC(java.util.Map<String, String> formData);
  void updateOldCustomerJDBC(java.util.Map<String, String> formData);
  com.cris.customerportal.dto.GlobalAgentResponse lookupHandlingAgentByCode(String handlingCode);
  com.cris.customerportal.dto.GstinDuplicateCheckResult checkGstinDuplicate(String gstin, String currentCode);
  default com.cris.customerportal.dto.GstinDuplicateCheckResult checkGstinDuplicate(String gstin) {
    return checkGstinDuplicate(gstin, null);
  }

  com.cris.customerportal.dto.PanDuplicateCheckResult checkPanDuplicate(String pan);
  // Ownership (MEMWGONOWNRSHIP)
  java.util.Map<String, String> lookupGlobalCustomerForOwnership(String ownershipCode);
  java.util.Map<String, String> lookupOwnershipJDBC(String ownershipCode);
  void saveOwnershipJDBC(String ownershipCode, String ownershipDesc);
  void submitOwnershipJDBC(String ownershipCode, String ownershipDesc, String partyCode, String partyDesc);
  /** Returns true if the code already exists in MEMWGONOWNRSHIP (duplicate check). */
  boolean checkOwnershipDuplicate(String ownershipCode);
  // Ownership Party (MEMWGONOWNRPRTY)
  java.util.Map<String, String> lookupGlobalCustomerForOwnershipParty(String partyCode);
  java.util.Map<String, String> lookupOwnershipPartyJDBC(String partyCode);
  void saveOwnershipPartyJDBC(String partyCode, String partyDesc);
  /** Returns true if the code already exists in MEMWGONOWNRPRTY (duplicate check). */
  boolean checkOwnershipPartyDuplicate(String partyCode);
}
