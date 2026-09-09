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
    String sql = "SELECT MAVGLBLCUSTCODE as customer_code, MAVGLBLCUSTNAME as company_name, MAVGLBLCUSTADDRTEXT as address, MAVCUSTPANNUMB as pan_number, MAVCUSTGSTNUMB as gstin_numbers, MAVGNBLCUSTCITYNAME as city, MAVPCOCODE as pincode, MADIMPLDATE as creation_date FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, customerCode == null ? null : customerCode.trim().toUpperCase(Locale.ROOT));
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     com.cris.customerportal.dto.OldCustomerResponse response = new com.cris.customerportal.dto.OldCustomerResponse();
     response.setCustomerCode(rs.getString("customer_code"));
     response.setCompanyName(rs.getString("company_name"));
     response.setAddress(rs.getString("address"));
    response.setPanNumber(rs.getString("pan_number"));
    response.setGstinNumbers(rs.getString("gstin_numbers"));
     response.setCity(rs.getString("city"));
     response.setPincode(rs.getString("pincode"));
     
     java.sql.Timestamp ts = rs.getTimestamp("creation_date");
     if (ts != null) {
         response.setCreationDate(new java.text.SimpleDateFormat("dd-MM-yyyy").format(new java.util.Date(ts.getTime())));
     }
     
     return response;
    } else {
     throw new ResourceNotFoundException("Customer Code not found.");
    }
   }
  } catch (SQLException e) {
     System.err.printf("[DB ERROR] lookupOldCustomerByCode SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
   throw new RuntimeException("Database error occurred while fetching old customer data: " + e.getMessage(), e);
  }
 }

  public com.cris.customerportal.dto.OldCustomerResponse lookupOldCustomerByGstin(String gstin) {
    String sql = "SELECT MAVGLBLCUSTCODE as customer_code, MAVGLBLCUSTNAME as company_name, MAVGLBLCUSTADDRTEXT as address, MAVCUSTPANNUMB as pan_number, MAVCUSTGSTNUMB as gstin_numbers, MAVGNBLCUSTCITYNAME as city, MAVPCOCODE as pincode, MADIMPLDATE as creation_date FROM MEMGLBLCUST WHERE MAVCUSTGSTNUMB LIKE ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, "%" + gstin + "%");
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     com.cris.customerportal.dto.OldCustomerResponse response = new com.cris.customerportal.dto.OldCustomerResponse();
     response.setCustomerCode(rs.getString("customer_code"));
     response.setPhoneNumber(rs.getString("phone_number"));
     response.setEmailId(rs.getString("email_id"));
     response.setCompanyName(rs.getString("company_name"));
     response.setAddress(rs.getString("address"));
     response.setPanNumber(rs.getString("pan_number"));
     response.setGstinNumbers(rs.getString("gstin_numbers"));
     response.setCity(rs.getString("city"));
     response.setPincode(rs.getString("pincode"));
     response.setZone(rs.getString("zone"));
     response.setDivision(rs.getString("division"));
     
     java.sql.Timestamp ts = rs.getTimestamp("creation_date");
     if (ts != null) {
         response.setCreationDate(new java.text.SimpleDateFormat("dd-MM-yyyy").format(new java.util.Date(ts.getTime())));
     }
     
     return response;
    } else {
     throw new ResourceNotFoundException("No customer found for this GSTIN.");
    }
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

 public String registerNewEntryJDBC(java.util.Map<String, String> formData) {
  String type = formData.get("codeType");
  if (type != null) type = type.toLowerCase();
  if ("handling_agent".equals(type)) type = "handling";
  if (!"global".equals(type) && !"handling".equals(type)) throw new IllegalArgumentException("Invalid codeType: " + type);

  boolean isGlobal = "global".equals(type);
  String tableName = isGlobal ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
  String colName = isGlobal ? "MAVGLBLCUSTCODE" : "MAVHNDGAGNTCODE";
  String nameCol = isGlobal ? "MAVGLBLCUSTNAME" : "MAVHNDGAGNTNAME";
  String addrCol = isGlobal ? "MAVGLBLCUSTADDRTEXT" : "MAVHNDGAGNTADDRTEXT";
  String cityCol = isGlobal ? "MAVGNBLCUSTCITYNAME" : "MAVHNDGAGNTCITYNAME";
  String pinCol = "MAVPCOCODE";
  String panCol = isGlobal ? "MAVCUSTPANNUMB" : null;
  
  String sql = isGlobal 
      ? "INSERT INTO " + tableName + " (" + colName + ", " + nameCol + ", " + addrCol + ", " + cityCol + ", " + pinCol + ", " + panCol + ", MADIMPLDATE) VALUES (?, ?, ?, ?, ?, ?, SYSDATE)"
      : "INSERT INTO " + tableName + " (" + colName + ", " + nameCol + ", " + addrCol + ", " + cityCol + ", " + pinCol + ", MADIMPLDATE) VALUES (?, ?, ?, ?, ?, SYSDATE)";

  String providedCode = isGlobal ? formData.get("globalCustomerCode") : formData.get("handlingAgentCode");

  while (true) {
   String finalCode = (providedCode != null && !providedCode.isEmpty()) ? providedCode : generateUniqueCodeJDBC(formData.get("customerName"), type);
   
   try (Connection conn = dataSource.getConnection()) {
    conn.setAutoCommit(false);
    try (PreparedStatement ps = conn.prepareStatement(sql)) {
     ps.setString(1, finalCode);
     ps.setString(2, formData.get("customerName"));
     ps.setString(3, formData.get("address"));
     ps.setString(4, formData.get("city"));
     ps.setString(5, formData.get("pincode"));
     if (isGlobal) {
         ps.setString(6, formData.get("pan"));
     }
     
     int rowsAffected = ps.executeUpdate();
     conn.commit();
     
     if (rowsAffected > 0) {
         DatabaseOperationAudit audit = new DatabaseOperationAudit();
         audit.setOperationType("INSERT");
         audit.setPageName("New Entry");
         audit.setTableName(tableName);
         audit.setCustomerCode(finalCode);
         audit.setCompanyName(formData.get("customerName"));
         audit.setSqlStatement(sql);
         audit.setRowsAffected(rowsAffected);
         audit.setStatus("SUCCESS");
         
         audit.addParameter(1, "customerCode", finalCode);
         audit.addParameter(2, "companyName", formData.get("customerName"));
         audit.addParameter(3, "address", formData.get("address"));
         audit.addParameter(4, "city", formData.get("city"));
         audit.addParameter(5, "pincode", formData.get("pincode"));
         if (isGlobal) {
             audit.addParameter(6, "pan", formData.get("pan"));
         }
         
         dbaEmailService.sendDbaAuditEmail(audit);
     }
     
     return finalCode;
    } catch (SQLException e) {
     conn.rollback();
     if (e.getErrorCode() == 1062 || e.getMessage().contains("Unique") || e.getMessage().contains("UNIQUE")) {
      providedCode = null;
      continue;
     } else {
      throw new RuntimeException("Database error in registerNewEntryJDBC: " + e.getMessage(), e);
     }
    }
   } catch (SQLException e) {
    throw new RuntimeException("Database error connecting or committing in registerNewEntryJDBC", e);
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
    ? "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = ?, MAVGLBLCUSTADDRTEXT = ?, MAVGNBLCUSTCITYNAME = ?, MAVPCOCODE = ?, MAVCUSTPANNUMB = ?, MAVCUSTGSTNUMB = ? WHERE MAVGLBLCUSTCODE = ?"
    : "UPDATE MEMGLBLHNDGAGNT SET MAVHNDGAGNTNAME = ?, MAVHNDGAGNTADDRTEXT = ?, MAVHNDGAGNTCITYNAME = ?, MAVPCOCODE = ? WHERE MAVHNDGAGNTCODE = ?";
      
  try (Connection conn = dataSource.getConnection()) {
   conn.setAutoCommit(false);
   try (PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, formData.get("companyName"));
    ps.setString(2, formData.get("address"));
    ps.setString(3, formData.get("city"));
    ps.setString(4, formData.get("pincode"));
    
    if (isGlobal) {
        ps.setString(5, formData.get("panNumber"));
        ps.setString(6, formData.get("gstinNumbers"));
        ps.setString(7, formData.get("customerCode"));
    } else {
        ps.setString(5, formData.get("customerCode"));
    }
    
    int rowsAffected = ps.executeUpdate();
    
    if (rowsAffected > 0) {
        conn.commit();
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType("UPDATE");
        audit.setPageName("Old User");
        audit.setTableName(table);
        audit.setCustomerCode(formData.get("customerCode"));
        audit.setCompanyName(formData.get("companyName"));
        audit.setSqlStatement(sql);
        audit.setRowsAffected(rowsAffected);
        audit.setStatus("SUCCESS");
        
        audit.addParameter(1, "companyName", formData.get("companyName"));
        audit.addParameter(2, "address", formData.get("address"));
        audit.addParameter(3, "city", formData.get("city"));
        audit.addParameter(4, "pincode", formData.get("pincode"));
        if (isGlobal) {
            audit.addParameter(5, "panNumber", formData.get("panNumber"));
            audit.addParameter(6, "gstinNumbers", formData.get("gstinNumbers"));
            audit.addParameter(7, "customerCode", formData.get("customerCode"));
        } else {
            audit.addParameter(5, "customerCode", formData.get("customerCode"));
        }
        
        dbaEmailService.sendDbaAuditEmail(audit);
    } else {
        conn.rollback();
        throw new ResourceNotFoundException("Customer not found or update failed.");
    }
   } catch (SQLException e) {
    conn.rollback();
    throw new RuntimeException("Database error in updateOldCustomerJDBC executing query: " + e.getMessage(), e);
   }
  } catch (SQLException e) {
   throw new RuntimeException("Database error in updateOldCustomerJDBC connecting/committing: " + e.getMessage(), e);
  }
 }

 public com.cris.customerportal.dto.GlobalAgentResponse lookupHandlingAgentByCode(String handlingCode) {
  String sql = "SELECT MAVHNDGAGNTCODE as handling_code, MAVHNDGAGNTNAME as company_name, MAVHNDGAGNTADDRTEXT as address, MAVHNDGAGNTCITYNAME as city, MAVPCOCODE as pincode FROM MEMGLBLHNDGAGNT WHERE MAVHNDGAGNTCODE = ?";
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
