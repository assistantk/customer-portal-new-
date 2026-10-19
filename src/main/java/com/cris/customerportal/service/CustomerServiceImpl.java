package com.cris.customerportal.service;

import com.cris.customerportal.dto.CustomerLookupResponse;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import com.cris.customerportal.entity.Customer;
import com.cris.customerportal.exception.ResourceAlreadyExistsException;
import com.cris.customerportal.exception.ResourceNotFoundException;
import com.cris.customerportal.repository.CustomerRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.util.*;
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
 @Autowired private DbaEmailService dbaEmailService;
 private final CustomerRepository repo;
 private final DataSource dataSource;
 public CustomerServiceImpl(CustomerRepository repo, DataSource dataSource) { this.repo=repo; this.dataSource=dataSource;}

 private volatile boolean columnsResolved = false;
 private String glblCityCol = "MAVGNBLCUSTCITYNAME";
 private String glblGstCol = "MAVCUSTGSTNUMB";
 private String glblDateCol = "MADEDMNDDATE";

 private String hndgCodeCol = "MAVHNDGAGNTCODE";
 private String hndgNameCol = "MAVHNDGAGNTNAME";
 private String hndgAddrCol = "MAVHNDGAGNTADDRTEXT";
 private String hndgCityCol = "MAVHNDGAGNTCITYNAME";
 private String hndgGstCol = "MAVCUSTGSTNUMB";
 private String hndgDateCol = "MADEDMNDDATE";

 private synchronized void initDbColumns() {
  if (columnsResolved) return;
  try (Connection conn = dataSource.getConnection()) {
   if (conn == null) {
    columnsResolved = true;
    return;
   }
   java.sql.DatabaseMetaData meta = conn.getMetaData();
   if (meta == null) {
    columnsResolved = true;
    return;
   }

   Set<String> glblCols = new HashSet<>();
   try (ResultSet rs = meta.getColumns(null, "%", "MEMGLBLCUST", "%")) {
    if (rs != null) {
     while (rs.next()) {
      String col = rs.getString("COLUMN_NAME");
      if (col != null) glblCols.add(col.toUpperCase(Locale.ROOT));
     }
    }
   }
   if (!glblCols.isEmpty()) {
    if (glblCols.contains("MAVGLBLCUSTCITYNAME")) glblCityCol = "MAVGLBLCUSTCITYNAME";
    else if (glblCols.contains("MAVGNBLCUSTCITYNAME")) glblCityCol = "MAVGNBLCUSTCITYNAME";

    if (glblCols.contains("MAVCUSTGSTNNUMB")) glblGstCol = "MAVCUSTGSTNNUMB";
    else if (glblCols.contains("MAVCUSTGSTNUMB")) glblGstCol = "MAVCUSTGSTNUMB";

    if (glblCols.contains("MADEDMDNDATE")) glblDateCol = "MADEDMDNDATE";
    else if (glblCols.contains("MADEDMNDDATE")) glblDateCol = "MADEDMNDDATE";
   }

   Set<String> hndgCols = new HashSet<>();
   try (ResultSet rs = meta.getColumns(null, "%", "MEMGLBLHNDGAGNT", "%")) {
    if (rs != null) {
     while (rs.next()) {
      String col = rs.getString("COLUMN_NAME");
      if (col != null) hndgCols.add(col.toUpperCase(Locale.ROOT));
     }
    }
   }
   if (!hndgCols.isEmpty()) {
    if (hndgCols.contains("MAVHNDGAGNTCODE")) hndgCodeCol = "MAVHNDGAGNTCODE";
    else if (hndgCols.contains("MAVHNDAGNTCODE")) hndgCodeCol = "MAVHNDAGNTCODE";

    if (hndgCols.contains("MAVHNDGAGNTNAME")) hndgNameCol = "MAVHNDGAGNTNAME";
    else if (hndgCols.contains("MAVHNDAGNTNAME")) hndgNameCol = "MAVHNDAGNTNAME";

    if (hndgCols.contains("MAVHNDGAGNTADDRTEXT")) hndgAddrCol = "MAVHNDGAGNTADDRTEXT";
    else if (hndgCols.contains("MAVHNDAGNTADDRTEXT")) hndgAddrCol = "MAVHNDAGNTADDRTEXT";

    if (hndgCols.contains("MAVHNDGAGNTCITYNAME")) hndgCityCol = "MAVHNDGAGNTCITYNAME";
    else if (hndgCols.contains("MAVHNDAGNTCITYNAME")) hndgCityCol = "MAVHNDAGNTCITYNAME";

    if (hndgCols.contains("MAVCUSTGSTNNUMB")) hndgGstCol = "MAVCUSTGSTNNUMB";
    else if (hndgCols.contains("MAVCUSTGSTNUMB")) hndgGstCol = "MAVCUSTGSTNUMB";

    if (hndgCols.contains("MADEDMDNDATE")) hndgDateCol = "MADEDMDNDATE";
    else if (hndgCols.contains("MADEDMNDDATE")) hndgDateCol = "MADEDMNDDATE";
   }
  } catch (Throwable t) {
   // Fall back gracefully to defaults
  } finally {
   columnsResolved = true;
  }
 }


 @Override
 public String register(CustomerRegistrationRequest request, List<MultipartFile> files) {
  CustomerRegistrationRequest r = request;
  if (r.gstins() == null || files == null || r.gstins().size() != files.size()) throw new IllegalArgumentException("Number of GSTIN records must match uploaded files");
  files.forEach(this::validateFile);
  Map<String, String> formData = new HashMap<>();
  formData.put("codeType", r.codeType());
  formData.put("customerCode", r.customerCode());
  formData.put("companyName", r.companyName());
  formData.put("address", r.address());
  formData.put("city", r.city());
  formData.put("pincode", r.pincode());
  formData.put("panNumber", r.panNumber());
  formData.put("operatingDivision", r.operatingDivision());
  formData.put("zone", r.zone());
  formData.put("email", r.email());
  formData.put("mobile", r.mobile());
  formData.put("gstinNumbers", r.gstins().stream()
      .map(com.cris.customerportal.dto.GstinRequest::gstin)
      .filter(Objects::nonNull)
      .collect(Collectors.joining(",")));
  return registerNewEntryJDBC(formData);
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
    initDbColumns();
    String sql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVCUSTPANNUMB, "
        + glblGstCol + " AS MAVCUSTGSTNUMB, "
        + glblCityCol + " AS MAVGNBLCUSTCITYNAME, "
        + "TO_CHAR(" + glblDateCol + ", 'DD-MM-YYYY') AS MADEDMNDDATE_TEXT "
        + "FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?";
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
     response.setCity(rs.getString("MAVGNBLCUSTCITYNAME"));
     
     String amendmentDate = rs.getString("MADEDMNDDATE_TEXT");
     if (amendmentDate != null && !amendmentDate.isBlank()) {
         response.setCreationDate(amendmentDate);
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
    initDbColumns();
    String sql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVCUSTPANNUMB, "
        + glblGstCol + " AS MAVCUSTGSTNUMB, "
        + glblCityCol + " AS MAVGNBLCUSTCITYNAME, "
        + "TO_CHAR(" + glblDateCol + ", 'DD-MM-YYYY') AS MADEDMNDDATE_TEXT "
        + "FROM MEMGLBLCUST WHERE " + glblGstCol + " LIKE ?";
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
     response.setCity(rs.getString("MAVGNBLCUSTCITYNAME"));
     
     String amendmentDate = rs.getString("MADEDMNDDATE_TEXT");
     if (amendmentDate != null && !amendmentDate.isBlank()) {
         response.setCreationDate(amendmentDate);
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

  initDbColumns();
  String tableName = type.equals("global") ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
  String colName = type.equals("global") ? "MAVGLBLCUSTCODE" : hndgCodeCol;
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
  if (type != null) type = type.trim().toLowerCase(Locale.ROOT);
  if ("handling_agent".equals(type)) type = "handling";
  if (!"global".equals(type) && !"handling".equals(type)) throw new IllegalArgumentException("Invalid codeType: " + type);

  for (String field : List.of("companyName", "address", "city", "pincode", "operatingDivision", "zone", "panNumber", "gstinNumbers")) {
   if (firstValue(formData, field) == null) {
    throw new IllegalArgumentException(field + " is required");
   }
  }
  if (formData.get("address").length() > 100) {
   throw new IllegalArgumentException("Address cannot exceed 100 characters.");
  }
  if (!formData.get("pincode").matches("^[1-9][0-9]{5}$")) {
   throw new IllegalArgumentException("Invalid pincode");
  }
  if (!formData.get("panNumber").trim().toUpperCase(Locale.ROOT).matches("^[A-Z]{5}[0-9]{4}[A-Z]$")) {
   throw new IllegalArgumentException("Enter a valid PAN number.");
  }
  List<String> gstinNumbers = Arrays.stream(formData.get("gstinNumbers").split(","))
      .map(String::trim)
      .filter(value -> !value.isEmpty())
      .toList();
  if (gstinNumbers.isEmpty() || gstinNumbers.stream().anyMatch(value ->
      !value.toUpperCase(Locale.ROOT).matches("^[A-Z0-9]{15}$"))) {
   throw new IllegalArgumentException("Enter valid 15-character GSTIN numbers.");
  }
  String email = formData.get("email");
  if (email != null && !email.isBlank() && !email.trim().matches("^\\S+@\\S+\\.\\S+$")) {
   throw new IllegalArgumentException("Invalid email");
  }
  String mobile = formData.get("mobile");
  if (mobile != null && !mobile.isBlank() && !mobile.trim().matches("^[6-9][0-9]{9}$")) {
   throw new IllegalArgumentException("Enter a valid 10-digit Indian mobile number.");
  }

  initDbColumns();
  String tableName = "global".equals(type) ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
  String colName = "global".equals(type) ? "MAVGLBLCUSTCODE" : hndgCodeCol;
  String nameCol = "global".equals(type) ? "MAVGLBLCUSTNAME" : hndgNameCol;
  String addrCol = "global".equals(type) ? "MAVGLBLCUSTADDRTEXT" : hndgAddrCol;
  String cityCol = "global".equals(type) ? glblCityCol : hndgCityCol;
  String sql;
  String companyName = firstValue(formData, "companyName", "customerName");
  if (companyName != null) companyName = companyName.trim();
  String codeCompanyName = companyName;
  if ("global".equals(type) && companyName != null) {
   companyName = withGlobalCompanyNamePrefix(companyName);
  }
    String providedCode = firstValue(formData, "customerCode", "globalCustomerCode", "handlingAgentCode");

   String address = formData.get("address");

  String divisionDesignation = "global".equals(type)
      ? DivisionDesignationResolver.resolve(formData.get("operatingDivision"))
      : formData.get("operatingDivision");
  sql = "global".equals(type)
      ? "INSERT INTO MEMGLBLCUST (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, " + glblCityCol + ", MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, " + glblDateCol + ", " + glblGstCol + ", MAVCUSTPANNUMB) VALUES (?, ?, ?, ?, ?, ?, ?, SYSDATE, ?, NULL, ?, ?)"
      : "INSERT INTO " + tableName + " (" + colName + ", " + nameCol + ", " + addrCol + ", " + cityCol + ", " + hndgDateCol + ") VALUES (?, ?, ?, ?, SYSDATE)";

  String finalCode = (providedCode != null && !providedCode.isEmpty())
      ? providedCode.trim().toUpperCase(Locale.ROOT)
      : generateUniqueCodeJDBC(codeCompanyName, type);
  String duplicateSql = "SELECT 1 FROM " + tableName + " WHERE " + colName + " = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(duplicateSql)) {
   ps.setString(1, finalCode);
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     throw new ResourceAlreadyExistsException("Customer code " + finalCode + " already exists. Please verify the code before submitting.");
    }
   }
  } catch (SQLException e) {
   throw new RuntimeException("Database error while checking customer code availability: " + e.getMessage(), e);
  }

    List<String> insertParameters = new ArrayList<>();
    insertParameters.add(finalCode);
    insertParameters.add(companyName);
    insertParameters.add(address);
    insertParameters.add(formData.get("city"));
    if ("global".equals(type)) {
        insertParameters.add(null);
        insertParameters.add(null);
        insertParameters.add(null);
        insertParameters.add(divisionDesignation);
        insertParameters.add(formData.get("gstinNumbers"));
        insertParameters.add(formData.get("panNumber"));
    }
   String executableSql = formatBoundSql(sql, insertParameters) + ";";
   dbaEmailService.sendDbaSqlEmail(List.of(
       new DbaEmailService.SqlRequest("INSERT", tableName, finalCode, executableSql)));
   return finalCode;
 }

 private String withGlobalCompanyNamePrefix(String companyName) {
  if (companyName.length() >= 3
      && companyName.regionMatches(true, 0, "M/S", 0, 3)
      && (companyName.length() == 3 || Character.isWhitespace(companyName.charAt(3)))) {
   return companyName;
  }
  return "M/S " + companyName;
 }

 @Override
 public void deleteGlobalCustomerJDBC(String customerCode) {
   String normalizedCode = customerCode == null ? null : customerCode.trim().toUpperCase(Locale.ROOT);
   if (normalizedCode == null || normalizedCode.isEmpty()) {
     throw new IllegalArgumentException("Global customer code is required");
   }

   try (Connection conn = dataSource.getConnection()) {
     try (PreparedStatement deleteGstin = conn.prepareStatement("DELETE FROM MEMCUSTOMERGSTIN WHERE MAVCUSTOMERCODE IN (SELECT MAVCUSTOMERCODE FROM MEMCUSTOMER WHERE MAVGLBLCUSTCODE = ?)")) {
       deleteGstin.setString(1, normalizedCode);
       deleteGstin.executeUpdate();
     }

     try (PreparedStatement deleteCustomers = conn.prepareStatement("DELETE FROM MEMCUSTOMER WHERE MAVGLBLCUSTCODE = ?")) {
       deleteCustomers.setString(1, normalizedCode);
       deleteCustomers.executeUpdate();
     }

     try (PreparedStatement deleteCustomer = conn.prepareStatement("DELETE FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?")) {
       deleteCustomer.setString(1, normalizedCode);
       int rowsAffected = deleteCustomer.executeUpdate();
       if (rowsAffected == 0) {
         throw new ResourceNotFoundException("No record found for this Global Customer Code.");
       }
     }

     DatabaseOperationAudit audit = new DatabaseOperationAudit();
     audit.setOperationType("DELETE");
     audit.setPageName("Customer");
     audit.setTableName("MEMGLBLCUST");
     audit.setCustomerCode(normalizedCode);
     audit.setCompanyName("Deleted global customer");
     audit.setSqlStatement("DELETE FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = " + formatSqlValue(normalizedCode) + ";");
     audit.setRowsAffected(1);
     dbaEmailService.sendDbaAuditEmail(audit);
   } catch (SQLException e) {
     System.err.printf("[DB ERROR] deleteGlobalCustomerJDBC SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
     throw new RuntimeException("Database error while deleting global customer code: " + e.getMessage(), e);
   }
 }

 public void updateOldCustomerJDBC(java.util.Map<String, String> formData) {
 String type = formData.get("codeType");
 if (type != null) type = type.trim().toLowerCase(Locale.ROOT);
 if ("handling_agent".equals(type)) type = "handling";
 if (!"global".equals(type) && !"handling".equals(type)) throw new IllegalArgumentException("Invalid codeType: " + type);
 boolean isGlobal = "global".equals(type);
 String customerCode = firstValue(formData, "customerCode");
 if (customerCode == null) throw new IllegalArgumentException("Customer code is required");

  initDbColumns();
  String table = isGlobal ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
  com.cris.customerportal.dto.OldCustomerResponse oldCustomer;
  String keyColumn;
  String nameColumn;
  String addressColumn;
  String cityColumn;
  String panColumn = "MAVCUSTPANNUMB";
  String gstColumn;
  if (isGlobal) {
   oldCustomer = lookupOldCustomerByCode(customerCode);
   keyColumn = "MAVGLBLCUSTCODE";
   nameColumn = "MAVGLBLCUSTNAME";
   addressColumn = "MAVGLBLCUSTADDRTEXT";
   cityColumn = glblCityCol;
   gstColumn = glblGstCol;
  } else {
   com.cris.customerportal.dto.GlobalAgentResponse agent = lookupHandlingAgentByCode(customerCode);
   oldCustomer = new com.cris.customerportal.dto.OldCustomerResponse();
   oldCustomer.setCompanyName(agent.getCompanyName());
   oldCustomer.setAddress(agent.getAddress());
   oldCustomer.setCity(agent.getCity());
   oldCustomer.setPanNumber(agent.getPanNumber());
   oldCustomer.setGstinNumbers(agent.getGstinNumbers());
   keyColumn = hndgCodeCol;
   nameColumn = hndgNameCol;
   addressColumn = hndgAddrCol;
   cityColumn = hndgCityCol;
   gstColumn = hndgGstCol;
  }

  Map<String, String> current = new LinkedHashMap<>();
  current.put(nameColumn, oldCustomer.getCompanyName());
  current.put(addressColumn, oldCustomer.getAddress());
  current.put(cityColumn, oldCustomer.getCity());
  current.put(panColumn, oldCustomer.getPanNumber());
  current.put(gstColumn, oldCustomer.getGstinNumbers());
  Map<String, String> requested = new LinkedHashMap<>();
  requested.put(nameColumn, formData.get("companyName"));
  requested.put(addressColumn, formData.get("address"));
  requested.put(cityColumn, formData.get("city"));
  requested.put(panColumn, formData.get("panNumber"));
  requested.put(gstColumn, formData.get("gstinNumbers"));

  List<String> assignments = new ArrayList<>();
  for (Map.Entry<String, String> entry : requested.entrySet()) {
   if (!Objects.equals(normalizeOracleValue(current.get(entry.getKey())), normalizeOracleValue(entry.getValue()))) {
    assignments.add(entry.getKey() + " = " + formatSqlValue(entry.getValue()));
   }
  }
  if (assignments.isEmpty()) throw new IllegalArgumentException("No changes detected for this record.");
  String executableSql = "UPDATE " + table + " SET " + String.join(", ", assignments)
      + " WHERE " + keyColumn + " = " + formatSqlValue(customerCode.trim().toUpperCase(Locale.ROOT)) + ";";
  dbaEmailService.sendDbaSqlEmail(List.of(
      new DbaEmailService.SqlRequest("UPDATE", table, customerCode.trim().toUpperCase(Locale.ROOT), executableSql)));
 }

 public com.cris.customerportal.dto.GlobalAgentResponse lookupHandlingAgentByCode(String handlingCode) {
    initDbColumns();
    // SELECT all columns needed for the Old User Handling Agent fetch/edit flow
    String sql = "SELECT " + hndgCodeCol + " AS MAVHNDAGNTCODE, "
        + hndgNameCol + " AS MAVHNDAGNTNAME, "
        + hndgAddrCol + " AS MAVHNDAGNTADDRTEXT, "
        + hndgCityCol + " AS MAVHNDAGNTCITYNAME,"
        + " MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, "
        + hndgGstCol + " AS MAVCUSTGSTNUMB, "
        + "MAVCUSTPANNUMB"
        + " FROM MEMGLBLHNDGAGNT WHERE " + hndgCodeCol + " = ?";
    try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, handlingCode == null ? null : handlingCode.trim().toUpperCase(Locale.ROOT));
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     com.cris.customerportal.dto.GlobalAgentResponse response = new com.cris.customerportal.dto.GlobalAgentResponse();
     response.setCode(rs.getString("MAVHNDAGNTCODE"));
     response.setCompanyName(rs.getString("MAVHNDAGNTNAME"));
     response.setAddress(rs.getString("MAVHNDAGNTADDRTEXT"));
     response.setCity(rs.getString("MAVHNDAGNTCITYNAME"));
     response.setCentBlng(rs.getString("MAVCENTBLNG"));
     response.setPcoCode(rs.getString("MAVPCOCODE"));
     response.setEdMndFlag(rs.getString("MAVEDMNDFLAG"));
     response.setGstinNumbers(rs.getString("MAVCUSTGSTNUMB"));
     response.setPanNumber(rs.getString("MAVCUSTPANNUMB"));
     response.setStatus("Active");
     return response;
    } else {
     throw new ResourceNotFoundException("Handling agent code not found.");
    }
   }
  } catch (SQLException e) {
   System.err.printf("[DB ERROR] lookupHandlingAgentByCode SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
   throw new RuntimeException("Database error occurred while fetching handling agent data", e);
  }
 }


 // ===== Ownership: MEMWGONOWNRSHIP =====

 public java.util.Map<String, String> lookupGlobalCustomerForOwnership(String ownershipCode) {
  String sql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, ownershipCode == null ? null : ownershipCode.trim().toUpperCase(Locale.ROOT));
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     java.util.Map<String, String> result = new java.util.LinkedHashMap<>();
     result.put("ownershipCode", rs.getString("MAVGLBLCUSTCODE"));
     result.put("ownershipDesc", rs.getString("MAVGLBLCUSTNAME"));
     return result;
    }
    return null;
   }
  } catch (SQLException e) {
   System.err.printf("[DB ERROR] lookupGlobalCustomerForOwnership SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
   throw new RuntimeException("Database error while looking up global customer code: " + e.getMessage(), e);
  }
 }

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
  submitOwnershipJDBC(ownershipCode, ownershipDesc, null, null);
 }

 public void submitOwnershipJDBC(String ownershipCode, String ownershipDesc, String partyCode, String partyDesc) {
  boolean hasOwnership = ownershipCode != null && !ownershipCode.isBlank();
  boolean hasParty = partyCode != null && !partyCode.isBlank();
  if (!hasOwnership && !hasParty) throw new IllegalArgumentException("At least one ownership code is required.");

  List<DbaEmailService.SqlRequest> statements = new ArrayList<>();
  if (hasOwnership) {
   String sql = generateOwnershipSql(ownershipCode, ownershipDesc);
   if (sql != null) {
    statements.add(new DbaEmailService.SqlRequest(
        sql.startsWith("INSERT") ? "INSERT" : "UPDATE",
        "MEMWGONOWNRSHIP",
        ownershipCode.trim().toUpperCase(Locale.ROOT),
        sql));
   }
  }
  if (hasParty) {
   String sql = generateOwnershipPartySql(partyCode, partyDesc);
   if (sql != null) {
    statements.add(new DbaEmailService.SqlRequest(
        sql.startsWith("INSERT") ? "INSERT" : "UPDATE",
        "MEMWGONOWNRPRTY",
        partyCode.trim().toUpperCase(Locale.ROOT),
        sql));
   }
  }
  if (statements.isEmpty()) throw new IllegalArgumentException("No changes detected for the ownership records.");
  dbaEmailService.sendDbaSqlEmail(statements);
 }

 private String generateOwnershipSql(String ownershipCode, String ownershipDesc) {
  String normalizedCode = ownershipCode.trim().toUpperCase(Locale.ROOT);
  Map<String, String> existing = lookupOwnershipJDBC(normalizedCode);
  if (existing != null) {
   if (Objects.equals(normalizeOracleValue(existing.get("ownershipDesc")), normalizeOracleValue(ownershipDesc))) return null;
   return "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = " + formatSqlValue(ownershipDesc)
       + " WHERE MAVWGONOWNRSHIPCODE = " + formatSqlValue(normalizedCode) + ";";
  }
  return "INSERT INTO MEMWGONOWNRSHIP (MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC, MACPRVTPRTYCODE) VALUES ("
      + formatSqlValue(normalizedCode) + ", " + formatSqlValue(ownershipDesc) + ", 'Y');";
 }

 // ===== Ownership Party: MEMWGONOWNRPRTY =====

 public java.util.Map<String, String> lookupGlobalCustomerForOwnershipParty(String partyCode) {
  String sql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, partyCode == null ? null : partyCode.trim().toUpperCase(Locale.ROOT));
   try (ResultSet rs = ps.executeQuery()) {
    if (rs.next()) {
     java.util.Map<String, String> result = new java.util.LinkedHashMap<>();
     result.put("partyCode", rs.getString("MAVGLBLCUSTCODE"));
     result.put("partyDesc", rs.getString("MAVGLBLCUSTNAME"));
     return result;
    }
    return null;
   }
  } catch (SQLException e) {
   System.err.printf("[DB ERROR] lookupGlobalCustomerForOwnershipParty SQLState=%s ErrorCode=%d Message=%s%n", e.getSQLState(), e.getErrorCode(), e.getMessage());
   throw new RuntimeException("Database error while looking up global customer code: " + e.getMessage(), e);
  }
 }

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
  submitOwnershipJDBC(null, null, partyCode, partyDesc);
 }

 private String generateOwnershipPartySql(String partyCode, String partyDesc) {
  String normalizedCode = partyCode.trim().toUpperCase(Locale.ROOT);
  Map<String, String> existing = lookupOwnershipPartyJDBC(normalizedCode);
  if (existing != null) {
   if (Objects.equals(normalizeOracleValue(existing.get("partyDesc")), normalizeOracleValue(partyDesc))) return null;
   return "UPDATE MEMWGONOWNRPRTY SET MAVWGONOWNRPRTYDESC = " + formatSqlValue(partyDesc)
       + " WHERE MAVWGONOWNRPRTYCODE = " + formatSqlValue(normalizedCode) + ";";
  }
  return "INSERT INTO MEMWGONOWNRPRTY (MAVWGONOWNRPRTYCODE, MAVWGONOWNRPRTYDESC) VALUES ("
      + formatSqlValue(normalizedCode) + ", " + formatSqlValue(partyDesc) + ");";
 }

  private String formatBoundSql(String sql, List<String> parameters) {
   StringBuilder formattedSql = new StringBuilder(sql.length() + parameters.size() * 8);
   int parameterIndex = 0;
   boolean inString = false;
   boolean inQuotedIdentifier = false;
   for (int i = 0; i < sql.length(); i++) {
    char current = sql.charAt(i);
    if (current == '\'' && !inQuotedIdentifier) {
     formattedSql.append(current);
     if (inString && i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
      formattedSql.append(sql.charAt(++i));
     } else {
      inString = !inString;
     }
    } else if (current == '"' && !inString) {
     formattedSql.append(current);
     inQuotedIdentifier = !inQuotedIdentifier;
    } else if (current == '?' && !inString && !inQuotedIdentifier) {
     if (parameterIndex >= parameters.size()) {
      throw new IllegalArgumentException("SQL contains more placeholders than bound parameters.");
     }
     String value = parameters.get(parameterIndex++);
     formattedSql.append(value == null ? "NULL" : "'" + value.replace("'", "''") + "'");
    } else {
     formattedSql.append(current);
    }
   }
   if (parameterIndex != parameters.size()) {
    throw new IllegalArgumentException("Bound parameter count does not match SQL placeholders.");
   }
   return formattedSql.toString();
  }

  private String formatSqlValue(String value) {
   if (value == null || value.isEmpty()) return "NULL";
   return "'" + value.replace("'", "''") + "'";
 }

  private String normalizeOracleValue(String value) {
   return value == null || value.isEmpty() ? null : value;
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
  throw new IllegalStateException("The legacy ownership update has no valid Oracle column mapping. Use the ownership request workflow.");
 }
}
