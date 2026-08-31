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
 @Autowired private org.springframework.mail.javamail.JavaMailSender mailSender;
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
  String sql = "SELECT phone_number, email_id, company_name, address, pan_number, gstin_numbers FROM customer_code WHERE customer_code = ?";
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
     response.setPanNumber(rs.getString("pan_number"));
     response.setGstinNumbers(rs.getString("gstin_numbers"));
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

 public String generateUniqueCodeJDBC(String companyName, String type) {
  int maxLength = 4;
  String cleaned = (companyName != null ? companyName.replaceAll("[^A-Za-z0-9]", " ").replaceAll("\\s+", " ").trim().toUpperCase() : "");
  String[] words = cleaned.split(" ");
  String base = "";
  if (words.length >= maxLength) {
   for(int i = 0; i < maxLength; i++) base += words[i].charAt(0);
  } else if (words.length == 1) {
   base = words[0].length() > maxLength ? words[0].substring(0, maxLength) : words[0];
  } else if (words.length > 0) {
   for (String w : words) base += w.charAt(0);
   int remaining = maxLength - base.length();
   String lastWord = words[words.length - 1];
   if (remaining > 0 && lastWord.length() > 1) {
    base += lastWord.substring(1, Math.min(1 + remaining, lastWord.length()));
   }
  }
  if (base.length() > maxLength) base = base.substring(0, maxLength);
  if (base.isEmpty()) base = "TEMP";

  String tableName = type.equals("global") ? "global_customers" : "handling_agents";
  String colName = type.equals("global") ? "global_code" : "handling_code";
  String sql = "SELECT 1 FROM " + tableName + " WHERE " + colName + " = ?";

  String candidate = base;
  int suffix = 1;
  while (true) {
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, candidate);
    try (ResultSet rs = ps.executeQuery()) {
     if (!rs.next()) return candidate;
    }
   } catch (SQLException e) {
    throw new RuntimeException("Database error in generateUniqueCodeJDBC", e);
   }
   candidate = base + suffix;
   if (candidate.length() > maxLength) {
       String num = String.valueOf(suffix);
       candidate = base.substring(0, Math.max(1, maxLength - num.length())) + num;
   }
   suffix++;
  }
 }

 public String registerNewEntryJDBC(java.util.Map<String, String> formData) {
  String type = formData.get("codeType");
  if (type != null) type = type.toLowerCase();
  if ("handling_agent".equals(type)) type = "handling";
  if (!"global".equals(type) && !"handling".equals(type)) throw new IllegalArgumentException("Invalid codeType: " + type);

  String tableName = "global".equals(type) ? "global_customers" : "handling_agents";
  String colName = "global".equals(type) ? "global_code" : "handling_code";
  String sql = "INSERT INTO " + tableName + " (" + colName + ", company_name, pan_number, address, city, pincode, zone, division, email, mobile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

  String providedCode = "global".equals(type) ? formData.get("globalCustomerCode") : formData.get("handlingAgentCode");

  while (true) {
   String finalCode = (providedCode != null && !providedCode.isEmpty()) ? providedCode : generateUniqueCodeJDBC(formData.get("customerName"), type);
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, finalCode);
    ps.setString(2, formData.get("customerName"));
    ps.setString(3, formData.get("pan"));
    ps.setString(4, formData.get("address"));
    ps.setString(5, formData.get("city"));
    ps.setString(6, formData.get("pincode"));
    ps.setString(7, formData.get("zone"));
    ps.setString(8, formData.get("operatingDivision")); // Match frontend key
    ps.setString(9, formData.get("email"));
    ps.setString(10, formData.get("mobile"));
    ps.executeUpdate();
    
    // Send INSERT audit email asynchronously
    final String finalCodeForEmail = finalCode;
    final String finalTypeForEmail = type;
    java.util.concurrent.CompletableFuture.runAsync(() -> {
        try {
            org.springframework.mail.SimpleMailMessage message = new org.springframework.mail.SimpleMailMessage();
            message.setFrom("shurak949@gmail.com");
            message.setTo("shurak949@gmail.com");
            message.setSubject("New Customer Database INSERT - " + finalCodeForEmail);
            
            java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            String timestamp = sdf.format(new java.util.Date());
            String table = "global".equals(finalTypeForEmail) ? "global_customers" : "handling_agents";
            String col = "global".equals(finalTypeForEmail) ? "global_code" : "handling_code";
            
            String sqlQuery = "INSERT INTO " + table + "\n(\n" +
                    "    " + col + ",\n" +
                    "    company_name,\n" +
                    "    pan_number,\n" +
                    "    address,\n" +
                    "    city,\n" +
                    "    pincode,\n" +
                    "    zone,\n" +
                    "    division,\n" +
                    "    email,\n" +
                    "    mobile\n" +
                    ")\nVALUES\n(\n" +
                    "    '" + finalCodeForEmail + "',\n" +
                    "    '" + formData.get("customerName") + "',\n" +
                    "    '" + formData.get("pan") + "',\n" +
                    "    '" + formData.get("address") + "',\n" +
                    "    '" + formData.get("city") + "',\n" +
                    "    '" + formData.get("pincode") + "',\n" +
                    "    '" + formData.get("zone") + "',\n" +
                    "    '" + formData.get("operatingDivision") + "',\n" +
                    "    '" + formData.get("email") + "',\n" +
                    "    '" + formData.get("mobile") + "'\n" +
                    ");";
                    
            String text = "Operation: INSERT\n" +
                    "Table: " + table + "\n\n" +
                    sqlQuery + "\n\n" +
                    "Date/Time: " + timestamp + "\n" +
                    "Generated Code: " + finalCodeForEmail + "\n" +
                    "Company Name: " + formData.get("customerName");
                    
            message.setText(text);
            mailSender.send(message);
            System.out.println("[EMAIL AUDIT] Real email sent successfully to shurak949@gmail.com for INSERT " + finalCodeForEmail);
        } catch (Exception ex) {
            System.err.println("[EMAIL AUDIT] Failed to send email: " + ex.getMessage());
        }
    });
    
    return finalCode;
   } catch (SQLException e) {
    // MySQL Duplicate Entry Code
    if (e.getErrorCode() == 1062) {
     providedCode = null; // Regenerate code
    } else {
     throw new RuntimeException("Database error in registerNewEntryJDBC: " + e.getMessage(), e);
    }
   }
  }
 }

 public void updateOldCustomerJDBC(java.util.Map<String, String> formData) {
  String sql = "UPDATE customer_code SET company_name = ?, phone_number = ?, email_id = ?, address = ?, pan_number = ?, gstin_numbers = ? WHERE customer_code = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, formData.get("companyName"));
   ps.setString(2, formData.get("mobile"));
   ps.setString(3, formData.get("email"));
   ps.setString(4, formData.get("address"));
   ps.setString(5, formData.get("panNumber"));
   ps.setString(6, formData.get("gstinNumbers"));
   ps.setString(7, formData.get("customerCode"));
   
   ps.executeUpdate();
   
   // Send UPDATE audit email asynchronously
   java.util.concurrent.CompletableFuture.runAsync(() -> {
       try {
           org.springframework.mail.SimpleMailMessage message = new org.springframework.mail.SimpleMailMessage();
           message.setFrom("sura767848@gmail.com");
           message.setTo("sura767848@gmail.com");
           message.setSubject("Customer Database UPDATE - " + formData.get("customerCode"));
           
           java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
           String timestamp = sdf.format(new java.util.Date());
           
           String sqlQuery = "UPDATE customer_code\nSET\n" +
                   "    company_name = '" + formData.get("companyName") + "',\n" +
                   "    phone_number = '" + formData.get("mobile") + "',\n" +
                   "    email_id = '" + formData.get("email") + "',\n" +
                   "    address = '" + formData.get("address") + "',\n" +
                   "    pan_number = '" + formData.get("panNumber") + "',\n" +
                   "    gstin_numbers = '" + formData.get("gstinNumbers") + "'\n" +
                   "WHERE customer_code = '" + formData.get("customerCode") + "';";
                   
           String text = "Operation: UPDATE\n" +
                   "Table: customer_code\n" +
                   "Customer Code: " + formData.get("customerCode") + "\n\n" +
                   sqlQuery + "\n\n" +
                   "Date/Time: " + timestamp;
                   
           message.setText(text);
           mailSender.send(message);
           System.out.println("[EMAIL AUDIT] Real email sent successfully to sura767848@gmail.com for UPDATE " + formData.get("customerCode"));
       } catch (Exception ex) {
           System.err.println("[EMAIL AUDIT] Failed to send email: " + ex.getMessage());
       }
   });
  } catch (SQLException e) {
   throw new RuntimeException("Database error in updateOldCustomerJDBC: " + e.getMessage(), e);
  }
 }

 public com.cris.customerportal.dto.GlobalAgentResponse lookupGlobalCustomerByCode(String globalCode) {
  String sql = "SELECT global_code, company_name, address, city, email, mobile FROM global_customers WHERE global_code = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, globalCode);
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     com.cris.customerportal.dto.GlobalAgentResponse response = new com.cris.customerportal.dto.GlobalAgentResponse();
     response.setCode(rs.getString("global_code"));
     response.setCompanyName(rs.getString("company_name"));
     response.setAddress(rs.getString("address"));
     response.setCity(rs.getString("city"));
     response.setEmail(rs.getString("email"));
     response.setMobile(rs.getString("mobile"));
     response.setStatus("Active");
     return response;
    } else {
     throw new ResourceNotFoundException("Global Customer Code not found.");
    }
   }
  } catch (SQLException e) {
   throw new RuntimeException("Database error occurred while fetching global customer data", e);
  }
 }

 public com.cris.customerportal.dto.GlobalAgentResponse lookupHandlingAgentByCode(String handlingCode) {
  String sql = "SELECT handling_code, company_name, address, city, email, mobile FROM handling_agents WHERE handling_code = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, handlingCode);
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     com.cris.customerportal.dto.GlobalAgentResponse response = new com.cris.customerportal.dto.GlobalAgentResponse();
     response.setCode(rs.getString("handling_code"));
     response.setCompanyName(rs.getString("company_name"));
     response.setAddress(rs.getString("address"));
     response.setCity(rs.getString("city"));
     response.setEmail(rs.getString("email"));
     response.setMobile(rs.getString("mobile"));
     response.setStatus("Active");
     return response;
    } else {
     throw new ResourceNotFoundException("Agent Handling Code not found.");
    }
   }
  } catch (SQLException e) {
   throw new RuntimeException("Database error occurred while fetching handling agent data", e);
  }
 }
}
