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
import com.cris.customerportal.audit.DatabaseOperationAudit;
import com.cris.customerportal.service.DbaEmailService;

@Service
public class CustomerServiceImpl implements CustomerService {
 @Autowired private org.springframework.mail.javamail.JavaMailSender mailSender;
 @Autowired private DbaEmailService dbaEmailService;
 @Value("${spring.mail.username}") private String auditFromEmail;
 private final CustomerRepository repo;
 private final CustomerGstinRepository gstinRepo;
 private final Path uploadPath;
 private final DataSource dataSource;
 public CustomerServiceImpl(CustomerRepository repo, CustomerGstinRepository gstinRepo, @Value("${app.upload-dir:uploads/gstin}") String dir, DataSource dataSource) { this.repo=repo; this.gstinRepo=gstinRepo; this.uploadPath=Paths.get(dir).toAbsolutePath().normalize(); this.dataSource=dataSource;}

 @Override
 public Long register(CustomerRegistrationRequest request, List<MultipartFile> files) {
  CustomerRegistrationRequest r = request;
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
     String sql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVCUSTPANNUMB, MAVCUSTGSTNUMB, MAVGNBLCUSTCITYNAME, MADIMPLDATE FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?";
    try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, customerCode == null ? null : customerCode.trim().toUpperCase(Locale.ROOT));
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     com.cris.customerportal.dto.OldCustomerResponse response = new com.cris.customerportal.dto.OldCustomerResponse();
     response.setCustomerCode(rs.getString("MAVGLBLCUSTCODE"));
     response.setCompanyName(rs.getString("MAVGLBLCUSTNAME"));
     response.setAddress(rs.getString("MAVGLBLCUSTADDRTEXT"));
     response.setPanNumber(rs.getString("MAVCUSTPANNUMB"));
     response.setGstinNumbers(rs.getString("MAVCUSTGSTNUMB"));
     response.setCity(rs.getString("MAVGNBLCUSTCITYNAME"));
     
     java.sql.Timestamp ts = rs.getTimestamp("MADIMPLDATE");
     if (ts != null) {
         response.setCreationDate(new java.text.SimpleDateFormat("dd-MM-yyyy").format(new java.util.Date(ts.getTime())));
     }
     
     return response;
    } else {
     throw new ResourceNotFoundException("No record found for this Global Customer Code.");
    }
   }
  } catch (SQLException e) {
     System.err.printf("[DB ERROR] lookupOldCustomerByCode SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
   throw new RuntimeException("Database error occurred while fetching old customer data: " + e.getMessage(), e);
  }
 }

  public java.util.List<com.cris.customerportal.dto.OldCustomerResponse> lookupOldCustomerByGstin(String gstin) {
     String sql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVCUSTPANNUMB, MAVCUSTGSTNUMB, MAVGNBLCUSTCITYNAME, MADIMPLDATE FROM MEMGLBLCUST WHERE MAVCUSTGSTNUMB LIKE ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, "%" + gstin + "%");
   try (ResultSet rs = ps.executeQuery()) {
    java.util.List<com.cris.customerportal.dto.OldCustomerResponse> responses = new java.util.ArrayList<>();
    while (rs.next()) {
     com.cris.customerportal.dto.OldCustomerResponse response = new com.cris.customerportal.dto.OldCustomerResponse();
     response.setCustomerCode(rs.getString("MAVGLBLCUSTCODE"));
     response.setCompanyName(rs.getString("MAVGLBLCUSTNAME"));
     response.setAddress(rs.getString("MAVGLBLCUSTADDRTEXT"));
     response.setPanNumber(rs.getString("MAVCUSTPANNUMB"));
     response.setGstinNumbers(rs.getString("MAVCUSTGSTNUMB"));
     response.setCity(rs.getString("MAVGNBLCUSTCITYNAME"));
     
     java.sql.Timestamp ts = rs.getTimestamp("MADIMPLDATE");
     if (ts != null) {
         response.setCreationDate(new java.text.SimpleDateFormat("dd-MM-yyyy").format(new java.util.Date(ts.getTime())));
     }
     
     responses.add(response);
    }
    
    if (responses.isEmpty()) {
     throw new ResourceNotFoundException("No record found for this GSTIN.");
    }
    return responses;
   }
  } catch (SQLException e) {
   throw new RuntimeException("Database error occurred while fetching customer by GSTIN", e);
  }
 }

 private void validateFile(MultipartFile f) { if(f==null||f.isEmpty())throw new IllegalArgumentException("GSTIN file is required"); if(f.getSize()>5*1024*1024)throw new IllegalArgumentException("File size must not exceed 5MB"); String type=Optional.ofNullable(f.getContentType()).orElse(""); if(!Set.of("application/pdf").contains(type))throw new IllegalArgumentException("Only PDF files are allowed"); }

 public String generateUniqueCodeJDBC(String companyName, String type) {
  String cleaned = (companyName != null ? companyName.replaceAll("[^A-Za-z]", "").toUpperCase() : "");
  if (cleaned.isEmpty()) cleaned = "CUST";
  
  StringBuilder baseCode = new StringBuilder();
  String[] words = (companyName != null ? companyName.replaceAll("[^A-Za-z ]", " ").trim().split("\\s+") : new String[0]);
  
  if (words.length >= 4) {
      for (int i = 0; i < 4; i++) {
          if (words[i].length() > 0) baseCode.append(Character.toUpperCase(words[i].charAt(0)));
      }
  } else {
      baseCode.append(cleaned);
  }
  
  String base = baseCode.toString();
  if (base.length() > 4) base = base.substring(0, 4);
  while (base.length() < 4) base += "X";

  String tableName = type.equals("global") ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
  String colName = type.equals("global") ? "MAVGLBLCUSTCODE" : "MAVHNDGAGNTCODE";
  String sql = "SELECT 1 FROM " + tableName + " WHERE " + colName + " = ?";

  String candidate = base;
  char[] chars = candidate.toCharArray();
  
  int attempts = 0;
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
   
   attempts++;
   if (attempts < 26) {
       chars[3] = (char) ('A' + (attempts % 26));
   } else if (attempts < 26 * 26) {
       chars[2] = (char) ('A' + ((attempts / 26) % 26));
       chars[3] = (char) ('A' + (attempts % 26));
   } else {
       chars[1] = (char) ('A' + ((attempts / (26 * 26)) % 26));
       chars[2] = (char) ('A' + ((attempts / 26) % 26));
       chars[3] = (char) ('A' + (attempts % 26));
   }
    candidate = new String(chars);
  }
 }

 private String firstValue(java.util.Map<String, String> values, String... keys) {
  for (String key : keys) {
   String value = values.get(key);
   if (value != null && !value.isBlank()) return value;
  }
  return null;
 }

 public String registerNewEntryJDBC(java.util.Map<String, String> formData) {
  String type = formData.get("codeType");
  if (type != null) type = type.toLowerCase();
  if ("handling_agent".equals(type)) type = "handling";
  if (!"global".equals(type) && !"handling".equals(type)) throw new IllegalArgumentException("Invalid codeType: " + type);

  String tableName = "global".equals(type) ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
  String colName = "global".equals(type) ? "MAVGLBLCUSTCODE" : "MAVHNDGAGNTCODE";
  String nameCol = "global".equals(type) ? "MAVGLBLCUSTNAME" : "MAVHNDGAGNTNAME";
  String addrCol = "global".equals(type) ? "MAVGLBLCUSTADDRTEXT" : "MAVHNDGAGNTADDRTEXT";
  String cityCol = "global".equals(type) ? "MAVGNBLCUSTCITYNAME" : "MAVHNDGAGNTCITYNAME";
  String panCol = "global".equals(type) ? "MAVCUSTPANNUMB" : null;
  String sql = "global".equals(type) 
      ? "INSERT INTO " + tableName + " (" + colName + ", " + nameCol + ", " + addrCol + ", " + cityCol + ", MAVCUSTGSTNUMB, " + panCol + ") VALUES (?, ?, ?, ?, ?, ?)"
      : "INSERT INTO " + tableName + " (" + colName + ", " + nameCol + ", " + addrCol + ", " + cityCol + ") VALUES (?, ?, ?, ?)";

    String companyName = firstValue(formData, "companyName", "customerName");
    String providedCode = firstValue(formData, "customerCode", "globalCustomerCode", "handlingAgentCode");

  while (true) {
    String finalCode = (providedCode != null && !providedCode.isEmpty()) ? providedCode.trim().toUpperCase(Locale.ROOT) : generateUniqueCodeJDBC(companyName, type);
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, finalCode);
    ps.setString(2, companyName);
    ps.setString(3, formData.get("address"));
    ps.setString(4, formData.get("city"));
    if ("global".equals(type)) {
        ps.setString(5, formData.get("gstinNumbers"));
        ps.setString(6, formData.get("panNumber"));
    }
    ps.executeUpdate();
    
    // Send INSERT audit email asynchronously
    final String finalCodeForEmail = finalCode;
    final String finalTypeForEmail = type;
    java.util.concurrent.CompletableFuture.runAsync(() -> {
        try {
            org.springframework.mail.SimpleMailMessage message = new org.springframework.mail.SimpleMailMessage();
            message.setFrom(auditFromEmail);
            message.setTo("shurak949@gmail.com");
            message.setSubject("New Customer Database INSERT - " + finalCodeForEmail);
            
            java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
            String timestamp = sdf.format(new java.util.Date());
            String table = "global".equals(finalTypeForEmail) ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
            String col = "global".equals(finalTypeForEmail) ? "MAVGLBLCUSTCODE" : "MAVHNDGAGNTCODE";

            String sqlQuery = "";
            if ("global".equals(finalTypeForEmail)) {
                sqlQuery = "INSERT INTO MEMGLBLCUST VALUES (" +
                    formatSqlValue(finalCodeForEmail) + ", " +
                    formatSqlValue(companyName) + ", " +
                    formatSqlValue(formData.get("address")) + ", " +
                    formatSqlValue(formData.get("city")) + ", " +
                    "NULL, NULL, SYSDATE, " +
                    formatSqlValue(formData.get("operatingDivision")) + ", NULL, " +
                    formatSqlValue(formData.get("gstinNumbers")) + ", " +
                    formatSqlValue(formData.get("panNumber")) + ");";
            } else {
                sqlQuery = "INSERT INTO MEMGLBLHNDGAGNT VALUES (" +
                    formatSqlValue(finalCodeForEmail) + ", " +
                    formatSqlValue(companyName) + ", " +
                    formatSqlValue(formData.get("address")) + ", " +
                    formatSqlValue(formData.get("city")) + ", " +
                    "NULL, NULL, SYSDATE, " +
                    formatSqlValue(formData.get("operatingDivision")) + ", NULL);";
            }


                    
            String text = "Operation: INSERT\n" +
                    "Table: " + table + "\n" +
                    "Code: " + finalCodeForEmail + "\n\n" +
                    "SQL QUERY:\n" +
                    "----------------------------------------\n" +
                    sqlQuery + "\n" +
                    "----------------------------------------";
                    
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
  String type = formData.get("codeType");
  if (type != null) type = type.toLowerCase();
  if ("handling_agent".equals(type)) type = "handling";
  boolean isGlobal = !"handling".equals(type); 

  String table = isGlobal ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
    String sql = isGlobal
        ? "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = ?, MAVGLBLCUSTADDRTEXT = ?, MAVGNBLCUSTCITYNAME = ?, MAVCUSTPANNUMB = ?, MAVCUSTGSTNUMB = ? WHERE MAVGLBLCUSTCODE = ?"
            : "UPDATE MEMGLBLHNDGAGNT SET MAVHNDGAGNTNAME = ?, MAVHNDGAGNTADDRTEXT = ?, MAVHNDGAGNTCITYNAME = ? WHERE MAVHNDGAGNTCODE = ?";
      
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, formData.get("companyName"));
   ps.setString(2, formData.get("address"));
   ps.setString(3, formData.get("city"));
   if (isGlobal) {
       ps.setString(4, formData.get("panNumber"));
       ps.setString(5, formData.get("gstinNumbers"));
       ps.setString(6, formData.get("customerCode"));
   } else {
       ps.setString(4, formData.get("customerCode"));
   }
   
   ps.executeUpdate();
   
   // Send UPDATE audit email asynchronously
   java.util.concurrent.CompletableFuture.runAsync(() -> {
       try {
           org.springframework.mail.SimpleMailMessage message = new org.springframework.mail.SimpleMailMessage();
           message.setFrom(auditFromEmail);
           message.setTo("sura767848@gmail.com");
           message.setSubject("Customer Database UPDATE - " + formData.get("customerCode"));
           
           java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
           String timestamp = sdf.format(new java.util.Date());
            String sqlQuery = "";
            if (isGlobal) {
                sqlQuery = "UPDATE MEMGLBLCUST\nSET\n" +
                    "    MAVGLBLCUSTNAME = " + formatSqlValue(formData.get("companyName")) + ",\n" +
                    "    MAVGLBLCUSTADDRTEXT = " + formatSqlValue(formData.get("address")) + ",\n" +
                    "    MAVGNBLCUSTCITYNAME = " + formatSqlValue(formData.get("city")) + ",\n" +
                    "    MAVCUSTPANNUMB = " + formatSqlValue(formData.get("panNumber")) + ",\n" +
                    "    MAVCUSTGSTNUMB = " + formatSqlValue(formData.get("gstinNumbers")) + "\n" +
                    "WHERE MAVGLBLCUSTCODE = " + formatSqlValue(formData.get("customerCode")) + ";";
            } else {
                sqlQuery = "UPDATE MEMGLBLHNDGAGNT\nSET\n" +
                    "    MAVHNDGAGNTNAME = " + formatSqlValue(formData.get("companyName")) + ",\n" +
                    "    MAVHNDGAGNTADDRTEXT = " + formatSqlValue(formData.get("address")) + ",\n" +
                    "    MAVHNDGAGNTCITYNAME = " + formatSqlValue(formData.get("city")) + "\n" +
                    "WHERE MAVHNDGAGNTCODE = " + formatSqlValue(formData.get("customerCode")) + ";";
            }
                    
            String text = "Operation: UPDATE\n" +
                    "Table: " + table + "\n" +
                    "Code: " + formData.get("customerCode") + "\n\n" +
                    "SQL QUERY:\n" +
                    "----------------------------------------\n" +
                    sqlQuery + "\n" +
                    "----------------------------------------";
                   
           message.setText(text);
           mailSender.send(message);
           System.out.println("[EMAIL AUDIT] Real email sent successfully to sura767848@gmail.com for UPDATE " + formData.get("customerCode"));
       } catch (Exception ex) {
           System.err.println("[EMAIL AUDIT] Failed to send email: " + ex.getMessage());
       }
   });
  } catch (SQLException e) {
   throw new RuntimeException("Database error in updateOldCustomerJDBC connecting/committing: " + e.getMessage(), e);
  }
 }

 public com.cris.customerportal.dto.GlobalAgentResponse lookupHandlingAgentByCode(String handlingCode) {
    String sql = "SELECT MAVHNDGAGNTCODE as handling_code, MAVHNDGAGNTNAME as company_name, MAVHNDGAGNTADDRTEXT as address, MAVHNDGAGNTCITYNAME as city FROM MEMGLBLHNDGAGNT WHERE MAVHNDGAGNTCODE = ?";
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
     return response; // Handling agent lookup without Pincode
    } else {
     throw new ResourceNotFoundException("Agent Handling Code not found.");
    }
   }
  } catch (SQLException e) {
   throw new RuntimeException("Database error occurred while fetching handling agent data", e);
  }
 }


 // ===== Ownership: MEMWGONOWNRSHIP =====

 public java.util.Map<String, String> lookupOwnershipJDBC(String ownershipCode) {
  String sql = "SELECT MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC FROM MEMWGONOWNRSHIP WHERE MAVWGONOWNRSHIPCODE = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, ownershipCode == null ? null : ownershipCode.trim().toUpperCase(Locale.ROOT));
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     java.util.Map<String, String> result = new java.util.LinkedHashMap<>();
     result.put("ownershipCode", rs.getString("MAVWGONOWNRSHIPCODE"));
     result.put("ownershipDesc", rs.getString("MAVWGONOWNRSHIPDESC"));
     return result;
    } else {
     return null; // Code not found — caller handles null as "new record"
    }
   }
  } catch (SQLException e) {
   System.err.printf("[DB ERROR] lookupOwnershipJDBC SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
   throw new RuntimeException("Database error while looking up ownership code: " + e.getMessage(), e);
  }
 }

 public void saveOwnershipJDBC(String ownershipCode, String ownershipDesc) {
  String normalizedCode = ownershipCode == null ? null : ownershipCode.trim().toUpperCase(Locale.ROOT);
  // Check existence first
  java.util.Map<String, String> existing = lookupOwnershipJDBC(normalizedCode);
  if (existing != null) {
   // UPDATE
   String sql = "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = ? WHERE MAVWGONOWNRSHIPCODE = ?";
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, ownershipDesc);
    ps.setString(2, normalizedCode);
    ps.executeUpdate();
   } catch (SQLException e) {
    System.err.printf("[DB ERROR] saveOwnershipJDBC UPDATE SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
    throw new RuntimeException("Database error while updating ownership record: " + e.getMessage(), e);
   }
  } else {
   // INSERT
   String sql = "INSERT INTO MEMWGONOWNRSHIP (MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC) VALUES (?, ?)";
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, normalizedCode);
    ps.setString(2, ownershipDesc);
    ps.executeUpdate();
   } catch (SQLException e) {
    System.err.printf("[DB ERROR] saveOwnershipJDBC INSERT SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
    throw new RuntimeException("Database error while inserting ownership record: " + e.getMessage(), e);
   }
  }
 }

 // ===== Ownership Party: MEMWGONOWNRPRTY =====

 public java.util.Map<String, String> lookupOwnershipPartyJDBC(String partyCode) {
  String sql = "SELECT MAVWGONOWNRPRTYCODE, MAVWGONOWNRPRTYDESC FROM MEMWGONOWNRPRTY WHERE MAVWGONOWNRPRTYCODE = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, partyCode == null ? null : partyCode.trim().toUpperCase(Locale.ROOT));
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     java.util.Map<String, String> result = new java.util.LinkedHashMap<>();
     result.put("partyCode", rs.getString("MAVWGONOWNRPRTYCODE"));
     result.put("partyDesc", rs.getString("MAVWGONOWNRPRTYDESC"));
     return result;
    } else {
     return null; // Code not found — caller handles null as "new record"
    }
   }
  } catch (SQLException e) {
   System.err.printf("[DB ERROR] lookupOwnershipPartyJDBC SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
   throw new RuntimeException("Database error while looking up ownership party code: " + e.getMessage(), e);
  }
 }

 public void saveOwnershipPartyJDBC(String partyCode, String partyDesc) {
  String normalizedCode = partyCode == null ? null : partyCode.trim().toUpperCase(Locale.ROOT);
  // Check existence first
  java.util.Map<String, String> existing = lookupOwnershipPartyJDBC(normalizedCode);
  if (existing != null) {
   // UPDATE
   String sql = "UPDATE MEMWGONOWNRPRTY SET MAVWGONOWNRPRTYDESC = ? WHERE MAVWGONOWNRPRTYCODE = ?";
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, partyDesc);
    ps.setString(2, normalizedCode);
    ps.executeUpdate();
   } catch (SQLException e) {
    System.err.printf("[DB ERROR] saveOwnershipPartyJDBC UPDATE SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
    throw new RuntimeException("Database error while updating ownership party record: " + e.getMessage(), e);
   }
  } else {
   // INSERT
   String sql = "INSERT INTO MEMWGONOWNRPRTY (MAVWGONOWNRPRTYCODE, MAVWGONOWNRPRTYDESC) VALUES (?, ?)";
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, normalizedCode);
    ps.setString(2, partyDesc);
    ps.executeUpdate();
   } catch (SQLException e) {
    System.err.printf("[DB ERROR] saveOwnershipPartyJDBC INSERT SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
    throw new RuntimeException("Database error while inserting ownership party record: " + e.getMessage(), e);
   }
  }
 }

 private String formatSqlValue(String value) {
  if (value == null || value.trim().isEmpty() || "null".equalsIgnoreCase(value)) return "NULL";
  return "'" + value.replace("'", "''") + "'";
 }

  public com.cris.customerportal.dto.OldCustomerResponse lookupOwnershipCustomerByCode(String customerCode) {
     // TODO: exact mapping not provided, using MEMWGONOWNRSHIP and placeholder columns to deliberately throw a mapping error
     // as requested: "Keep the database mapping isolated and clearly identify what needs to be mapped."
     String sql = "SELECT TODO_MAP_OWNERSHIP_CODE AS MAVGLBLCUSTCODE, TODO_MAP_OWNERSHIP_ADDR AS MAVGLBLCUSTNAME, 'N/A' AS MAVGLBLCUSTADDRTEXT, 'N/A' AS MAVCUSTPANNUMB, 'N/A' AS MAVCUSTGSTNUMB, 'N/A' AS MAVGNBLCUSTCITYNAME, NULL AS MADIMPLDATE FROM MEMWGONOWNRSHIP WHERE TODO_MAP_OWNERSHIP_CODE = ?";
    try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, customerCode == null ? null : customerCode.trim().toUpperCase(Locale.ROOT));
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     com.cris.customerportal.dto.OldCustomerResponse response = new com.cris.customerportal.dto.OldCustomerResponse();
     response.setCustomerCode(rs.getString("MAVGLBLCUSTCODE"));
     response.setCompanyName(rs.getString("MAVGLBLCUSTNAME"));
     return response;
    } else {
     throw new ResourceNotFoundException("No record found for this Ownership Code.");
    }
   }
  } catch (SQLException e) {
     System.err.printf("[DB ERROR] lookupOwnershipCustomerByCode SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
   throw new RuntimeException("Database mapping error: Ownership columns must be mapped in SQL before this function can execute.", e);
  }
 }

 public void updateOwnershipCustomerJDBC(java.util.Map<String, String> formData) {
     // TODO: exact mapping not provided, using placeholder columns to deliberately throw a mapping error
     String sql = "UPDATE MEMWGONOWNRSHIP SET TODO_MAP_OWNERSHIP_ADDR = ? WHERE TODO_MAP_OWNERSHIP_CODE = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, formData.get("companyName")); // Ownership address
   ps.setString(2, formData.get("customerCode"));
   ps.executeUpdate();
   
   // Send UPDATE audit email asynchronously
   java.util.concurrent.CompletableFuture.runAsync(() -> {
       try {
           org.springframework.mail.SimpleMailMessage message = new org.springframework.mail.SimpleMailMessage();
           message.setFrom(auditFromEmail);
           message.setTo("sura767848@gmail.com");
           message.setSubject("Ownership Database UPDATE - " + formData.get("customerCode"));
           
           String sqlQuery = "UPDATE MEMWGONOWNRSHIP\nSET\n" +
               "    TODO_MAP_OWNERSHIP_ADDR = " + formatSqlValue(formData.get("companyName")) + "\n" +
               "WHERE TODO_MAP_OWNERSHIP_CODE = " + formatSqlValue(formData.get("customerCode")) + ";";
                   
           String text = "Operation: UPDATE\n" +
                   "Table: MEMWGONOWNRSHIP\n" +
                   "Code: " + formData.get("customerCode") + "\n\n" +
                   "SQL QUERY:\n" +
                   "----------------------------------------\n" +
                   sqlQuery + "\n" +
                   "----------------------------------------";
                  
           message.setText(text);
           mailSender.send(message);
           System.out.println("[EMAIL AUDIT] Email sent successfully for UPDATE " + formData.get("customerCode"));
       } catch (Exception ex) {
           System.err.println("[EMAIL AUDIT] Failed to send email: " + ex.getMessage());
       }
   });
  } catch (SQLException e) {
   throw new RuntimeException("Database mapping error: Ownership columns must be mapped in SQL before this update can execute.", e);
  }
 }
}
