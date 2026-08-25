package com.cris.customerportal.service;

import com.cris.customerportal.dto.CustomerLookupResponse;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import com.cris.customerportal.entity.Customer;
import com.cris.customerportal.entity.CustomerGstin;
import com.cris.customerportal.exception.ResourceAlreadyExistsException;
import com.cris.customerportal.exception.ResourceNotFoundException;
import com.cris.customerportal.repository.CustomerRepository;
import com.cris.customerportal.repository.CustomerGstinRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException; import java.nio.file.*; import java.util.*;
import java.util.stream.Collectors;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class CustomerServiceImpl implements CustomerService {
 private final CustomerRepository repo;
 private final CustomerGstinRepository gstinRepo;
 private final Path uploadPath;
 private final DataSource dataSource;
 public CustomerServiceImpl(CustomerRepository repo, CustomerGstinRepository gstinRepo, @Value("${app.upload-dir:uploads/gstin}") String dir, DataSource dataSource) { this.repo=repo; this.gstinRepo=gstinRepo; this.uploadPath=Paths.get(dir).toAbsolutePath().normalize(); this.dataSource=dataSource;}

 public Long register(CustomerRegistrationRequest r, List<MultipartFile> files) {
  if (r.gstins() == null || files == null || r.gstins().size() != files.size()) throw new IllegalArgumentException("Number of GSTIN records must match uploaded files");
  String uniqueCode = generateUniqueCode(r.customerCode());
  
  for(com.cris.customerportal.dto.GstinRequest gr : r.gstins()) {
      if(gstinRepo.existsByGstin(gr.gstin())) throw new ResourceAlreadyExistsException("GSTIN " + gr.gstin() + " already registered");
  }

  Customer c = new Customer(); c.setCompanyName(r.companyName());c.setCustomerCode(uniqueCode);c.setAddress(r.address());c.setCity(r.city());c.setPincode(r.pincode());c.setPanNumber(r.panNumber());c.setOperatingDivision(r.operatingDivision());c.setZone(r.zone());c.setEmail(r.email());c.setMobile(r.mobile());c.setCodeType(r.codeType());
  
  List<CustomerGstin> gstinEntities = new ArrayList<>();
  try { Files.createDirectories(uploadPath); } catch(IOException e){throw new IllegalStateException("Could not create upload directory");}

  for(int i=0; i<r.gstins().size(); i++) {
      com.cris.customerportal.dto.GstinRequest gr = r.gstins().get(i);
      MultipartFile file = files.get(i);
      validateFile(file);
      String ext = Optional.ofNullable(file.getOriginalFilename()).filter(n->n.contains(".")).map(n->n.substring(n.lastIndexOf('.')).toLowerCase()).orElse("");
      String name = UUID.randomUUID() + ext;
      Path saved = uploadPath.resolve(name).normalize();
      if(!saved.startsWith(uploadPath)) throw new IllegalArgumentException("Invalid file path");
      try { Files.copy(file.getInputStream(), saved, StandardCopyOption.REPLACE_EXISTING); } catch(IOException e){throw new IllegalStateException("Could not save uploaded file");}
      
      CustomerGstin cg = new CustomerGstin();
      cg.setState(gr.state());
      cg.setGstin(gr.gstin());
      cg.setGstinFileName(name);
      cg.setGstinFilePath(saved.toString());
      cg.setCustomer(c);
      gstinEntities.add(cg);
  }
  c.setGstins(gstinEntities);
  return repo.save(c).getId();
 }

 public CustomerLookupResponse lookupByCode(String customerCode) {
  Customer c = repo.findByCustomerCode(customerCode)
    .orElseThrow(() -> new ResourceNotFoundException("Customer Code not found. Please check the code or register as a New User."));
  List<com.cris.customerportal.dto.GstinResponse> gstinResponses = c.getGstins().stream()
      .map(g -> new com.cris.customerportal.dto.GstinResponse(g.getState(), g.getGstin(), g.getGstinFileName()))
      .collect(Collectors.toList());
  return new CustomerLookupResponse(
    c.getCompanyName(), c.getCustomerCode(), c.getAddress(), c.getCity(),
    c.getPincode(), gstinResponses, c.getPanNumber(), c.getOperatingDivision(),
    c.getZone(), c.getEmail(), c.getMobile(), c.getCodeType()
  );
 }

 public String generateUniqueCode(String baseCode) {
  if(baseCode == null || baseCode.isBlank()) throw new IllegalArgumentException("Base code cannot be empty");
  String upper = baseCode.toUpperCase().trim();
  if(!repo.existsByCustomerCode(upper)) return upper;
  // Find all codes starting with this base and determine next available suffix
  List<String> existing = repo.findByCustomerCodeStartingWith(upper)
    .stream().map(Customer::getCustomerCode).collect(Collectors.toList());
  int suffix = 1;
  while(existing.contains(upper + suffix)) { suffix++; }
  return upper + suffix;
 }

 public com.cris.customerportal.dto.OldCustomerResponse lookupOldCustomerByCode(String customerCode) {
  String sql = "SELECT phone_number, email_id, company_name, address FROM customer_code WHERE customer_code = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, customerCode);
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     com.cris.customerportal.dto.OldCustomerResponse response = new com.cris.customerportal.dto.OldCustomerResponse();
     response.setPhoneNumber(rs.getString("phone_number"));
     response.setEmailId(rs.getString("email_id"));
     response.setCompanyName(rs.getString("company_name"));
     response.setAddress(rs.getString("address"));
     return response;
    } else {
     throw new ResourceNotFoundException("Invalid Customer Code");
    }
   }
  } catch (SQLException e) {
   throw new RuntimeException("Database error occurred while fetching old customer data", e);
  }
 }

 private void validateFile(MultipartFile f) { if(f==null||f.isEmpty())throw new IllegalArgumentException("GSTIN file is required"); if(f.getSize()>5*1024*1024)throw new IllegalArgumentException("File size must not exceed 5MB"); String type=Optional.ofNullable(f.getContentType()).orElse(""); if(!Set.of("application/pdf").contains(type))throw new IllegalArgumentException("Only PDF files are allowed"); }
}
