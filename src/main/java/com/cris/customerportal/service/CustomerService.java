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
  String generateUniqueCodeJDBC(String companyName, String type);
  String registerNewEntryJDBC(java.util.Map<String, String> formData);
  void updateOldCustomerJDBC(java.util.Map<String, String> formData);
  void deleteGlobalCustomerJDBC(String customerCode);
  com.cris.customerportal.dto.GlobalAgentResponse lookupHandlingAgentByCode(String handlingCode);
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
