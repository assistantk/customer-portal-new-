package com.cris.customerportal.service;
import com.cris.customerportal.dto.CustomerLookupResponse;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import org.springframework.web.multipart.MultipartFile;
public interface CustomerService {
  Long register(CustomerRegistrationRequest request, java.util.List<MultipartFile> files);
  CustomerLookupResponse lookupByCode(String customerCode);
  String generateUniqueCode(String baseCode);
  com.cris.customerportal.dto.OldCustomerResponse lookupOldCustomerByCode(String customerCode);
  String generateUniqueCodeJDBC(String companyName, String type);
  String registerNewEntryJDBC(java.util.Map<String, String> formData);
  void updateOldCustomerJDBC(java.util.Map<String, String> formData);
  com.cris.customerportal.dto.GlobalAgentResponse lookupGlobalCustomerByCode(String globalCode);
  com.cris.customerportal.dto.GlobalAgentResponse lookupHandlingAgentByCode(String handlingCode);
}
