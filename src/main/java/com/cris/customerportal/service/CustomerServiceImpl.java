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
   String sql = "SELECT MAVGLBLCUSTCODE as customer_code, MAVGLBLCUSTNAME as company_name, MAVGLBLCUSTADDRTEXT as address, MAVCUSTPANNUMB as pan_number, MAVCUSTGSTINNUMB as gstin_numbers, MAVGNBLCUSTCITYNAME as city, MAVPCOCODE as pincode, MADIMPLDATE as creation_date FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, customerCode);
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
   throw new RuntimeException("Database error occurred while fetching old customer data", e);
  }
 }

  public com.cris.customerportal.dto.OldCustomerResponse lookupOldCustomerByGstin(String gstin) {
   String sql = "SELECT MAVGLBLCUSTCODE as customer_code, MAVGLBLCUSTNAME as company_name, MAVGLBLCUSTADDRTEXT as address, MAVCUSTPANNUMB as pan_number, MAVCUSTGSTINNUMB as gstin_numbers, MAVGNBLCUSTCITYNAME as city, MAVPCOCODE as pincode, MADIMPLDATE as creation_date FROM MEMGLBLCUST WHERE MAVCUSTGSTINNUMB LIKE ?";
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

  String tableName = type.equals("global") ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
  String colName = type.equals("global") ? "MAVGLBLCUSTCODE" : "MAVHNDGAGNTCODE";
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

  String tableName = "global".equals(type) ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
  String colName = "global".equals(type) ? "MAVGLBLCUSTCODE" : "MAVHNDGAGNTCODE";
  String nameCol = "global".equals(type) ? "MAVGLBLCUSTNAME" : "MAVHNDGAGNTNAME";
  String addrCol = "global".equals(type) ? "MAVGLBLCUSTADDRTEXT" : "MAVHNDGAGNTADDRTEXT";
  String cityCol = "global".equals(type) ? "MAVGNBLCUSTCITYNAME" : "MAVHNDGAGNTCITYNAME";
  String pinCol = "MAVPCOCODE";
  String panCol = "global".equals(type) ? "MAVCUSTPANNUMB" : null;
  String sql = "global".equals(type) 
      ? "INSERT INTO " + tableName + " (" + colName + ", " + nameCol + ", " + addrCol + ", " + cityCol + ", " + pinCol + ", " + panCol + ") VALUES (?, ?, ?, ?, ?, ?)"
      : "INSERT INTO " + tableName + " (" + colName + ", " + nameCol + ", " + addrCol + ", " + cityCol + ", " + pinCol + ") VALUES (?, ?, ?, ?, ?)";

  String providedCode = "global".equals(type) ? formData.get("globalCustomerCode") : formData.get("handlingAgentCode");

  while (true) {
   String finalCode = (providedCode != null && !providedCode.isEmpty()) ? providedCode : generateUniqueCodeJDBC(formData.get("customerName"), type);
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, finalCode);
    ps.setString(2, formData.get("customerName"));
    ps.setString(3, formData.get("address"));
    ps.setString(4, formData.get("city"));
    ps.setString(5, formData.get("pincode"));
    if ("global".equals(type)) {
        ps.setString(6, formData.get("pan"));
    }
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
            String table = "global".equals(finalTypeForEmail) ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
            String col = "global".equals(finalTypeForEmail) ? "MAVGLBLCUSTCODE" : "MAVHNDGAGNTCODE";
            String nCol = "global".equals(finalTypeForEmail) ? "MAVGLBLCUSTNAME" : "MAVHNDGAGNTNAME";
            String aCol = "global".equals(finalTypeForEmail) ? "MAVGLBLCUSTADDRTEXT" : "MAVHNDGAGNTADDRTEXT";
            String cCol = "global".equals(finalTypeForEmail) ? "MAVGNBLCUSTCITYNAME" : "MAVHNDGAGNTCITYNAME";

            String sqlQuery = "";
            if ("global".equals(finalTypeForEmail)) {
                sqlQuery = "INSERT INTO " + table + "\n(\n    " + col + ",\n    " + nCol + ",\n    " + aCol + ",\n    " + cCol + ",\n    " + pinCol + ",\n    MAVCUSTPANNUMB\n)\nVALUES\n(\n" +
                    "    '" + finalCodeForEmail + "',\n    '" + formData.get("customerName") + "',\n    '" + formData.get("address") + "',\n    '" + formData.get("city") + "',\n    '" + formData.get("pincode") + "',\n    '" + formData.get("pan") + "'\n);";
            } else {
                sqlQuery = "INSERT INTO " + table + "\n(\n    " + col + ",\n    " + nCol + ",\n    " + aCol + ",\n    " + cCol + ",\n    " + pinCol + "\n)\nVALUES\n(\n" +
                    "    '" + finalCodeForEmail + "',\n    '" + formData.get("customerName") + "',\n    '" + formData.get("address") + "',\n    '" + formData.get("city") + "',\n    '" + formData.get("pincode") + "'\n);";
            }
                    
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
  String sql = "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = ?, MAVGLBLCUSTADDRTEXT = ?, MAVCUSTPANNUMB = ?, MAVCUSTGSTINNUMB = ? WHERE MAVGLBLCUSTCODE = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, formData.get("companyName"));
   ps.setString(2, formData.get("address"));
   ps.setString(3, formData.get("panNumber"));
   ps.setString(4, formData.get("gstinNumbers"));
   ps.setString(5, formData.get("customerCode"));
   
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
            String sqlQuery = "UPDATE MEMGLBLCUST\nSET\n" +
                    "    MAVGLBLCUSTNAME = '" + formData.get("companyName") + "',\n" +
                    "    MAVGLBLCUSTADDRTEXT = '" + formData.get("address") + "',\n" +
                    "    MAVCUSTPANNUMB = '" + formData.get("panNumber") + "',\n" +
                    "    MAVCUSTGSTINNUMB = '" + formData.get("gstinNumbers") + "'\n" +
                    "WHERE MAVGLBLCUSTCODE = '" + formData.get("customerCode") + "';";
                    
            String text = "Operation: UPDATE\n" +
                    "Table: MEMGLBLCUST\n" +
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
