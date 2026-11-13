package com.cris.customerportal.service;

import java.util.Collections;
import com.cris.customerportal.config.DataMaskingUtil;
import com.cris.customerportal.dto.CustomerLookupResponse;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import com.cris.customerportal.entity.Customer;
import com.cris.customerportal.exception.DatabaseUnavailableException;
import com.cris.customerportal.exception.ResourceAlreadyExistsException;
import com.cris.customerportal.exception.ResourceNotFoundException;
import com.cris.customerportal.repository.CustomerRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.InputStream;
import java.io.IOException;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.springframework.beans.factory.annotation.Autowired;
import com.cris.customerportal.audit.DatabaseOperationAudit;
import com.cris.customerportal.service.DbaEmailService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class CustomerServiceImpl implements CustomerService {
 private static final Logger log = LoggerFactory.getLogger(CustomerServiceImpl.class);
 private static final int MAX_COMPANY_NAME_LENGTH = 40;
 @Autowired private DbaEmailService dbaEmailService;
 private final CustomerRepository repo;
 private final DataSource dataSource;
 public CustomerServiceImpl(CustomerRepository repo, DataSource dataSource) { this.repo=repo; this.dataSource=dataSource;}

 private volatile boolean columnsResolved = false;
 private String glblCityCol = "MAVGNBLCUSTCITYNAME";
 private String glblDtlsCityCol = "MAVGNBLCUSTCITYNAME";
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

   Set<String> glblDtlsCols = new HashSet<>();
   try (ResultSet rs = meta.getColumns(null, "%", "MEMGLBLCUSTDTLS", "%")) {
    if (rs != null) {
     while (rs.next()) {
      String col = rs.getString("COLUMN_NAME");
      if (col != null) glblDtlsCols.add(col.toUpperCase(Locale.ROOT));
     }
    }
   }
   if (!glblDtlsCols.isEmpty()) {
    if (glblDtlsCols.contains("MAVGNBLCUSTCITYNAME")) glblDtlsCityCol = "MAVGNBLCUSTCITYNAME";
    else if (glblDtlsCols.contains("MAVGLBLCUSTCITYNAME")) glblDtlsCityCol = "MAVGLBLCUSTCITYNAME";
   }
  } catch (Throwable t) {
   log.debug("initDbColumns: column metadata discovery fell back to defaults: {}",
           DataMaskingUtil.maskSensitive(t.getMessage()));
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
  List<Map<String, String>> dList = new ArrayList<>();
  for (com.cris.customerportal.dto.GstinRequest gr : r.gstins()) {
   if (gr.gstin() != null) {
    Map<String, String> m = new HashMap<>();
    m.put("gstin", gr.gstin());
    m.put("state", gr.state());
    m.put("address", gr.address() != null ? gr.address() : r.address());
    m.put("city", gr.city() != null ? gr.city() : r.city());
    m.put("pincode", gr.pincode() != null ? gr.pincode() : r.pincode());
    dList.add(m);
   }
  }
  try {
   formData.put("gstinDetails", new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(dList));
  } catch (Exception ignore) {}
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
  if(baseCode == null || baseCode.trim().isEmpty()) throw new IllegalArgumentException("Base code cannot be empty");
  String upper = baseCode.toUpperCase().trim();
  if(!repo.existsByCustomerCode(upper)) return upper;
  // Find all codes starting with this base and determine next available suffix
  List<String> existing = repo.findByCustomerCodeStartingWith(upper)
    .stream().map(Customer::getCustomerCode).collect(Collectors.toList());
  int suffix = 1;
  while(existing.contains(upper + suffix)) { suffix++; }
  return upper + suffix;
 }

  private List<String> fetchGstinsForGlobalCustomer(Connection conn, String customerCode) {
   if (customerCode == null || customerCode.trim().isEmpty() || conn == null) {
    return Collections.emptyList();
   }
   String sql = "SELECT MAVCUSTGSTNUMB FROM MEMGLBLCUSTDTLS WHERE MAVGLBLCUSTCODE = ? AND MADDATEEFCTTO IS NULL ORDER BY MADIMPLDATE, MAVCUSTGSTNUMB";
   List<String> list = new ArrayList<>();
   try (PreparedStatement ps = conn.prepareStatement(sql)) {
    if (ps != null) {
     ps.setString(1, customerCode.trim().toUpperCase(Locale.ROOT));
     try (ResultSet rs = ps.executeQuery()) {
      if (rs != null) {
       int count = 0;
       while (rs.next() && ++count <= 50) {
        try {
         String g = rs.getString("MAVCUSTGSTNUMB");
         if (g != null && !g.trim().isEmpty() && !list.contains(g.trim())) {
          list.add(g.trim());
         }
        } catch (SQLException ignore) {
         break;
        }
       }
      }
     }
    }
   } catch (SQLException e) {
    log.debug("fetchGstinsForGlobalCustomer: error fetching GSTINs for {}: {}", customerCode, e.getMessage());
   }
   return list;
  }

  private List<String> fetchGstinsForHandlingAgent(Connection conn, String handlingCode) {
   if (handlingCode == null || handlingCode.trim().isEmpty() || conn == null) {
    return Collections.emptyList();
   }
   String sql = "SELECT MAVCUSTGSTNUMB FROM MEMGLBLHNDGAGNTDTLS WHERE MAVHNDGAGNTCODE = ? AND MADDATEEFCTTO IS NULL ORDER BY MADIMPLDATE, MAVCUSTGSTNUMB";
   List<String> list = new ArrayList<>();
   try (PreparedStatement ps = conn.prepareStatement(sql)) {
    if (ps != null) {
     ps.setString(1, handlingCode.trim().toUpperCase(Locale.ROOT));
     try (ResultSet rs = ps.executeQuery()) {
      if (rs != null) {
       int count = 0;
       while (rs.next() && ++count <= 50) {
        try {
         String g = rs.getString("MAVCUSTGSTNUMB");
         if (g != null && !g.trim().isEmpty() && !list.contains(g.trim())) {
          list.add(g.trim());
         }
        } catch (SQLException ignore) {
         break;
        }
       }
      }
     }
    }
   } catch (SQLException e) {
    log.debug("fetchGstinsForHandlingAgent: error fetching GSTINs for {}: {}", handlingCode, e.getMessage());
   }
   return list;
  }

  private List<com.cris.customerportal.dto.PanGstinRecord> fetchGstinDetails(
      Connection conn,
      String table,
      String codeColumn,
      String code,
      String addressColumn,
      String cityColumn) throws SQLException {
   if (code == null || code.trim().isEmpty()) {
    return Collections.emptyList();
   }
   String sql = "SELECT MAVCUSTGSTNUMB, " + addressColumn + " AS REGISTERED_ADDRESS, "
       + cityColumn + " AS CITY, MANPINCODE, "
       + "TO_CHAR(MADIMPLDATE, 'YYYY-MM-DD HH24:MI:SS') AS IMPLEMENTATION_DATE, "
       + "TO_CHAR(MADDATEEFCTFROM, 'YYYY-MM-DD HH24:MI:SS') AS EFFECTIVE_FROM, "
       + "TO_CHAR(MADDATEEFCTTO, 'YYYY-MM-DD HH24:MI:SS') AS EFFECTIVE_TO "
       + "FROM " + table + " WHERE " + codeColumn + " = ? AND MADDATEEFCTTO IS NULL "
       + "ORDER BY MADDATEEFCTFROM, MAVCUSTGSTNUMB";
   List<com.cris.customerportal.dto.PanGstinRecord> details = new ArrayList<>();
   try (PreparedStatement statement = conn.prepareStatement(sql)) {
    statement.setString(1, code.trim().toUpperCase(Locale.ROOT));
    try (ResultSet results = statement.executeQuery()) {
    while (results.next()) {
      String gstin = results.getString("MAVCUSTGSTNUMB");
      if (gstin != null && !gstin.trim().isEmpty()) {
       details.add(new com.cris.customerportal.dto.PanGstinRecord(
           gstin.trim(),
           results.getString("REGISTERED_ADDRESS"),
           results.getString("CITY"),
           results.getString("MANPINCODE"),
           results.getString("IMPLEMENTATION_DATE"),
           results.getString("EFFECTIVE_FROM"),
           results.getString("EFFECTIVE_TO")));
      }
     }
    }
   }
   return details;
  }

  public com.cris.customerportal.dto.OldCustomerResponse lookupOldCustomerByCode(String customerCode) {
    initDbColumns();
    String sql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVCUSTPANNUMB, "
        + glblCityCol + " AS MAVGNBLCUSTCITYNAME, MAVPCOCODE, MAVIMPLREMK, "
        + "NVL(MADEDMNDDATE, MADIMPLDATE) AS MAVVERIFICATIONDATE "
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
     response.setCity(rs.getString("MAVGNBLCUSTCITYNAME"));
     response.setPincode(rs.getString("MAVPCOCODE"));
     response.setDivision(rs.getString("MAVIMPLREMK"));
     response.setCreationDate(rs.getString("MAVVERIFICATIONDATE"));
     
     List<com.cris.customerportal.dto.PanGstinRecord> details = fetchGstinDetails(
         conn, "MEMGLBLCUSTDTLS", "MAVGLBLCUSTCODE", response.getCustomerCode(),
         "MAVGLBLCUSTADDRTEXT", glblDtlsCityCol);
     response.setGstins(details);
     response.setGstinNumbers(details.isEmpty() ? null : details.stream()
         .map(com.cris.customerportal.dto.PanGstinRecord::getGstin)
         .collect(Collectors.joining(",")));
     return response;
    } else {
     throw new ResourceNotFoundException("No record found for this Global Customer Code.");
    }
   }
  } catch (SQLException e) {
     log.error("CustomerServiceImpl.lookupOldCustomerByCode: SQLState={} ErrorCode={} stackTrace={}",
             e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
   throw new RuntimeException("Database error occurred while fetching old customer data: " + e.getMessage(), e);
  }
 }

  public java.util.List<com.cris.customerportal.dto.OldCustomerResponse> lookupOldCustomerByGstin(String gstin) {
    initDbColumns();
    String term = gstin == null ? "" : gstin.trim().toUpperCase(Locale.ROOT);
    List<com.cris.customerportal.dto.OldCustomerResponse> responses = new ArrayList<>();
    if (!term.isEmpty()) {
     String dtlsSql = "SELECT DISTINCT MAVGLBLCUSTCODE FROM MEMGLBLCUSTDTLS "
         + "WHERE MAVCUSTGSTNUMB LIKE ? AND MAVGLBLCUSTCODE IS NOT NULL "
         + "ORDER BY MAVGLBLCUSTCODE";
     Set<String> matchedCodes = new LinkedHashSet<>();
     try (Connection conn = dataSource.getConnection();
          PreparedStatement ps = conn.prepareStatement(dtlsSql)) {
      ps.setString(1, "%" + term + "%");
      try (ResultSet rs = ps.executeQuery()) {
       while (rs.next()) {
        String code = rs.getString("MAVGLBLCUSTCODE");
        if (code != null && !code.trim().isEmpty()) {
         matchedCodes.add(code.trim().toUpperCase(Locale.ROOT));
        }
       }
      }
     } catch (SQLException e) {
      log.error("CustomerServiceImpl.lookupOldCustomerByGstin: SQLState={} ErrorCode={} stackTrace={}",
          e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
      throw new RuntimeException("Database error occurred while fetching customer by GSTIN", e);
     }

     for (String code : matchedCodes) {
      try {
       com.cris.customerportal.dto.OldCustomerResponse response = lookupOldCustomerByCode(code);
       List<com.cris.customerportal.dto.PanGstinRecord> matchedDetails = response.getGstins().stream()
           .filter(detail -> detail.getGstin() != null
               && detail.getGstin().toUpperCase(Locale.ROOT).contains(term))
           .collect(Collectors.toList());
       if (!matchedDetails.isEmpty()) {
        response.setGstins(matchedDetails);
        response.setGstinNumbers(matchedDetails.stream()
            .map(com.cris.customerportal.dto.PanGstinRecord::getGstin)
            .collect(Collectors.joining(",")));
        responses.add(response);
       }
      } catch (ResourceNotFoundException ignore) {}
     }
    }

   List<String> handlingAgentCodes = findHandlingAgentCodesByGstin(term);
   if (responses.isEmpty()) {
    if (handlingAgentCodes.isEmpty()) {
     throw new ResourceNotFoundException("No record found for this GSTIN.");
    }
    com.cris.customerportal.dto.OldCustomerResponse response = new com.cris.customerportal.dto.OldCustomerResponse();
    response.setGstinNumbers(term);
    responses.add(response);
   }
   responses.forEach(response -> response.setHandlingAgentCodes(handlingAgentCodes));
   return responses;
  }

  private List<String> findHandlingAgentCodesByGstin(String gstin) {
   String sql = "SELECT DISTINCT MAVHNDGAGNTCODE FROM MEMGLBLHNDGAGNTDTLS "
       + "WHERE MAVCUSTGSTNUMB = ? AND MAVHNDGAGNTCODE IS NOT NULL "
       + "ORDER BY MAVHNDGAGNTCODE";
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, gstin == null ? "" : gstin.trim().toUpperCase(Locale.ROOT));
    try (ResultSet rs = ps.executeQuery()) {
     Set<String> codes = new LinkedHashSet<>();
     while (rs.next()) {
      String code = rs.getString(1);
      if (code != null && !code.trim().isEmpty()) codes.add(code.trim());
     }
     return new ArrayList<>(codes);
    }
   } catch (SQLException e) {
    log.error("CustomerServiceImpl.findHandlingAgentCodesByGstin: SQLState={} ErrorCode={} stackTrace={}",
        e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
    throw new RuntimeException("Database error while looking up handling agent codes by GSTIN", e);
   }
  }

  @Override
  public java.util.List<com.cris.customerportal.dto.OldCustomerResponse> searchGlobalCustomersByCompanyName(String companyName) {
   String term = companyName == null ? "" : companyName.trim().toUpperCase(Locale.ROOT);
   if (term.isEmpty()) return Collections.emptyList();
   initDbColumns();
   String sql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVCUSTPANNUMB, "
       + glblCityCol + " AS MAVGNBLCUSTCITYNAME, MAVPCOCODE, MAVIMPLREMK, "
       + "NVL(MADEDMNDDATE, MADIMPLDATE) AS MAVVERIFICATIONDATE "
       + "FROM MEMGLBLCUST WHERE INSTR(UPPER(NVL(MAVGLBLCUSTNAME, '')), ?) > 0 "
       + "ORDER BY MAVGLBLCUSTNAME";
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, term);
    try (ResultSet rs = ps.executeQuery()) {
     List<com.cris.customerportal.dto.OldCustomerResponse> responses = new ArrayList<>();
     while (rs.next()) {
      com.cris.customerportal.dto.OldCustomerResponse response = new com.cris.customerportal.dto.OldCustomerResponse();
      response.setCustomerCode(rs.getString("MAVGLBLCUSTCODE"));
      response.setCompanyName(rs.getString("MAVGLBLCUSTNAME"));
      response.setAddress(rs.getString("MAVGLBLCUSTADDRTEXT"));
      response.setPanNumber(rs.getString("MAVCUSTPANNUMB"));
      response.setCity(rs.getString("MAVGNBLCUSTCITYNAME"));
      response.setPincode(rs.getString("MAVPCOCODE"));
      response.setDivision(rs.getString("MAVIMPLREMK"));
      response.setCreationDate(rs.getString("MAVVERIFICATIONDATE"));
      responses.add(response);
     }
     for (com.cris.customerportal.dto.OldCustomerResponse r : responses) {
      List<com.cris.customerportal.dto.PanGstinRecord> details = fetchGstinDetails(
          conn, "MEMGLBLCUSTDTLS", "MAVGLBLCUSTCODE", r.getCustomerCode(),
          "MAVGLBLCUSTADDRTEXT", glblDtlsCityCol);
      r.setGstins(details);
      r.setGstinNumbers(details.isEmpty() ? null : details.stream()
          .map(com.cris.customerportal.dto.PanGstinRecord::getGstin)
          .collect(Collectors.joining(",")));
     }
     return responses;
    }
   } catch (SQLException e) {
    log.error("CustomerServiceImpl.searchGlobalCustomersByCompanyName: SQLState={} ErrorCode={} stackTrace={}",
        e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
    throw new RuntimeException("Database error occurred while searching global customers by company name", e);
   }
  }

  @Override
  public java.util.List<com.cris.customerportal.dto.GlobalAgentResponse> searchHandlingAgents(String search) {
   return searchHandlingAgents(search, "ALL");
  }

  @Override
  public java.util.List<com.cris.customerportal.dto.GlobalAgentResponse> searchHandlingAgents(String search, String searchMode) {
   String term = search == null ? "" : search.trim().toUpperCase(Locale.ROOT);
   if (term.isEmpty()) return Collections.emptyList();
   initDbColumns();
   boolean isCodeOnly = "CODE".equalsIgnoreCase(searchMode);
   boolean isNameOnly = "NAME".equalsIgnoreCase(searchMode) || "COMPANY_NAME".equalsIgnoreCase(searchMode);

   String whereClause;
   if (isCodeOnly) {
    whereClause = "WHERE INSTR(UPPER(NVL(" + hndgCodeCol + ", '')), ?) > 0 ";
   } else if (isNameOnly) {
    whereClause = "WHERE INSTR(UPPER(NVL(" + hndgNameCol + ", '')), ?) > 0 ";
   } else {
    whereClause = "WHERE INSTR(UPPER(NVL(" + hndgCodeCol + ", '')), ?) > 0 OR INSTR(UPPER(NVL(" + hndgNameCol + ", '')), ?) > 0 ";
   }

   String sql = "SELECT " + hndgCodeCol + " AS MAVHNDAGNTCODE, "
       + hndgNameCol + " AS MAVHNDAGNTNAME, "
       + hndgAddrCol + " AS MAVHNDAGNTADDRTEXT, "
       + hndgCityCol + " AS MAVHNDAGNTCITYNAME, "
       + "MAVCUSTPANNUMB, MAVIMPLREMK, "
       + hndgDateCol + " AS MAVVERIFICATIONDATE "
       + "FROM MEMGLBLHNDGAGNT " + whereClause
       + "ORDER BY " + (isNameOnly ? hndgNameCol : hndgCodeCol);
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, term);
    if (!isCodeOnly && !isNameOnly) {
     ps.setString(2, term);
    }
    try (ResultSet rs = ps.executeQuery()) {
     List<com.cris.customerportal.dto.GlobalAgentResponse> responses = new ArrayList<>();
     while (rs.next()) {
      com.cris.customerportal.dto.GlobalAgentResponse response = new com.cris.customerportal.dto.GlobalAgentResponse();
      response.setCode(rs.getString("MAVHNDAGNTCODE"));
      response.setCompanyName(rs.getString("MAVHNDAGNTNAME"));
      response.setAddress(rs.getString("MAVHNDAGNTADDRTEXT"));
      response.setCity(rs.getString("MAVHNDAGNTCITYNAME"));
      response.setPanNumber(rs.getString("MAVCUSTPANNUMB"));
      response.setDivision(rs.getString("MAVIMPLREMK"));
      response.setCreationDate(rs.getString("MAVVERIFICATIONDATE"));
      responses.add(response);
     }
     for (com.cris.customerportal.dto.GlobalAgentResponse r : responses) {
      List<com.cris.customerportal.dto.PanGstinRecord> details = fetchGstinDetails(
          conn, "MEMGLBLHNDGAGNTDTLS", "MAVHNDGAGNTCODE", r.getCode(),
          "MAVHNDGAGNTADDRTEXT", "MAVHNDGAGNTCITYNAME");
      r.setGstins(details);
      r.setGstinNumbers(details.isEmpty() ? null : details.stream()
          .map(com.cris.customerportal.dto.PanGstinRecord::getGstin)
          .collect(Collectors.joining(",")));
     }
     return responses;
    }
   } catch (SQLException e) {
    log.error("CustomerServiceImpl.searchHandlingAgents: SQLState={} ErrorCode={} stackTrace={}",
        e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
    throw new RuntimeException("Database error while searching handling agent codes", e);
   }
  }

 @Override
 public List<Map<String, String>> searchOwnershipCodes(String search) {
  return searchOwnershipCodes(search, "ALL");
 }

 @Override
 public List<Map<String, String>> searchOwnershipCodes(String search, String searchMode) {
  String term = search == null ? "" : search.trim().toUpperCase(Locale.ROOT);
  if (term.isEmpty()) return Collections.emptyList();
  boolean isCodeOnly = "CODE".equalsIgnoreCase(searchMode);
  boolean isNameOnly = "NAME".equalsIgnoreCase(searchMode) || "COMPANY_NAME".equalsIgnoreCase(searchMode);

  String whereClause;
  if (isCodeOnly) {
   whereClause = "WHERE INSTR(UPPER(NVL(MAVWGONOWNRSHIPCODE, '')), ?) > 0 ";
  } else if (isNameOnly) {
   whereClause = "WHERE INSTR(UPPER(NVL(MAVWGONOWNRSHIPDESC, '')), ?) > 0 ";
  } else {
   whereClause = "WHERE INSTR(UPPER(NVL(MAVWGONOWNRSHIPCODE, '')), ?) > 0 OR INSTR(UPPER(NVL(MAVWGONOWNRSHIPDESC, '')), ?) > 0 ";
  }

  String sql = "SELECT MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC FROM MEMWGONOWNRSHIP "
      + whereClause
      + "ORDER BY " + (isNameOnly ? "MAVWGONOWNRSHIPDESC" : "MAVWGONOWNRSHIPCODE");
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, term);
   if (!isCodeOnly && !isNameOnly) {
    ps.setString(2, term);
   }
   try (ResultSet rs = ps.executeQuery()) {
    List<Map<String, String>> responses = new ArrayList<>();
    while (rs.next()) {
     Map<String, String> response = new LinkedHashMap<>();
     response.put("ownershipCode", rs.getString("MAVWGONOWNRSHIPCODE"));
     response.put("companyName", rs.getString("MAVWGONOWNRSHIPDESC"));
     responses.add(response);
    }
    return responses;
   }
  } catch (SQLException e) {
   log.error("CustomerServiceImpl.searchOwnershipCodes: SQLState={} ErrorCode={} stackTrace={}",
       e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
   throw new RuntimeException("Database error while searching ownership codes", e);
  }
 }

 private static final Set<String> ALLOWED_CONTENT_TYPES;
 static {
  ALLOWED_CONTENT_TYPES = new HashSet<>();
  ALLOWED_CONTENT_TYPES.add("application/pdf");
 }

 private void validateFile(MultipartFile f) {
  if(f==null||f.isEmpty())throw new IllegalArgumentException("GSTIN file is required");
  if(f.getSize()>5*1024*1024)throw new IllegalArgumentException("File size must not exceed 5MB");
  String type = f.getContentType() != null ? f.getContentType() : "";
  String originalFilename = f.getOriginalFilename();
  if (originalFilename != null) {
   if (originalFilename.contains("..") || originalFilename.contains("/") || originalFilename.contains("\\") || originalFilename.contains("\0")) {
    throw new IllegalArgumentException("Invalid filename. Path traversal sequences are not allowed.");
   }
   if (!originalFilename.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
    throw new IllegalArgumentException("Only PDF files are allowed");
   }
  }
  if(!ALLOWED_CONTENT_TYPES.contains(type))throw new IllegalArgumentException("Only PDF files are allowed");
  try (InputStream is = f.getInputStream()) {
   byte[] header = new byte[4];
   int bytesRead = is.read(header);
   if (bytesRead < 4 || header[0] != 0x25 || header[1] != 0x50 || header[2] != 0x44 || header[3] != 0x46) {
    throw new IllegalArgumentException("Invalid file format. File must be a valid PDF document.");
   }
  } catch (IOException e) {
    log.error("CustomerServiceImpl.validateFile: failed reading PDF header stackTrace={}",
            DataMaskingUtil.formatThrowable(e));
   throw new IllegalArgumentException("Unable to read file content for validation: " + e.getMessage(), e);
  }
 }

 public String generateUniqueCodeJDBC(String companyName, String type) {
  validateCompanyNameLength(companyName);
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
    log.error("CustomerServiceImpl.generateUniqueCodeJDBC: SQLState={} ErrorCode={} stackTrace={}",
            e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
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
   if (value != null && !value.trim().isEmpty()) return value;
  }
  return null;
 }

 @Override
 public com.cris.customerportal.dto.GstinDuplicateCheckResult checkGstinDuplicate(String gstin, String currentCode) {
  if (gstin == null || gstin.trim().isEmpty()) {
   return new com.cris.customerportal.dto.GstinDuplicateCheckResult(false, "AVAILABLE", "GSTIN is empty", Collections.emptyList());
  }
  String cleanGstin = gstin.trim().toUpperCase(Locale.ROOT);
  initDbColumns();
  List<com.cris.customerportal.dto.GstinDuplicateRecord> records = new ArrayList<>();

  String sqlCustDtls = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, "
      + glblDtlsCityCol + " AS CITY, MANPINCODE, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, "
      + "TO_CHAR(MADDATEEFCTFROM, 'YYYY-MM-DD') AS EFFECTIVE_FROM, "
      + "TO_CHAR(MADDATEEFCTTO, 'YYYY-MM-DD') AS EFFECTIVE_TO "
      + "FROM MEMGLBLCUSTDTLS WHERE MAVCUSTGSTNUMB = ?";

  String sqlHndgDtls = "SELECT MAVHNDGAGNTCODE, MAVHNDGAGNTNAME, MAVHNDGAGNTADDRTEXT, "
      + "MAVHNDGAGNTCITYNAME AS CITY, MANPINCODE, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, "
      + "TO_CHAR(MADDATEEFCTFROM, 'YYYY-MM-DD') AS EFFECTIVE_FROM, "
      + "TO_CHAR(MADDATEEFCTTO, 'YYYY-MM-DD') AS EFFECTIVE_TO "
      + "FROM MEMGLBLHNDGAGNTDTLS WHERE MAVCUSTGSTNUMB = ?";

  try (Connection conn = dataSource.getConnection()) {
   if (conn != null) {
    try (PreparedStatement ps = conn.prepareStatement(sqlCustDtls)) {
     if (ps != null) {
      ps.setString(1, cleanGstin);
      try (ResultSet rs = ps.executeQuery()) {
       if (rs != null) {
        int count = 0;
        while (rs.next() && ++count <= 50) {
         com.cris.customerportal.dto.GstinDuplicateRecord rec = new com.cris.customerportal.dto.GstinDuplicateRecord(
             "Global Customer",
             rs.getString("MAVGLBLCUSTCODE"),
             rs.getString("MAVGLBLCUSTNAME"),
             rs.getString("MAVCUSTGSTNUMB"),
             rs.getString("MAVCUSTPANNUMB"),
             rs.getString("MAVGLBLCUSTADDRTEXT"),
             rs.getString("CITY"),
             rs.getString("MANPINCODE"),
             rs.getString("EFFECTIVE_FROM"),
             rs.getString("EFFECTIVE_TO")
         );
         records.add(rec);
        }
       }
      }
     }
    }
    try (PreparedStatement ps = conn.prepareStatement(sqlHndgDtls)) {
     if (ps != null) {
      ps.setString(1, cleanGstin);
      try (ResultSet rs = ps.executeQuery()) {
       if (rs != null) {
        int count = 0;
        while (rs.next() && ++count <= 50) {
         com.cris.customerportal.dto.GstinDuplicateRecord rec = new com.cris.customerportal.dto.GstinDuplicateRecord(
             "Handling Agent",
             rs.getString("MAVHNDGAGNTCODE"),
             rs.getString("MAVHNDGAGNTNAME"),
             rs.getString("MAVCUSTGSTNUMB"),
             rs.getString("MAVCUSTPANNUMB"),
             rs.getString("MAVHNDGAGNTADDRTEXT"),
             rs.getString("CITY"),
             rs.getString("MANPINCODE"),
             rs.getString("EFFECTIVE_FROM"),
             rs.getString("EFFECTIVE_TO")
         );
         records.add(rec);
        }
       }
      }
     }
    }
   }
  } catch (SQLException e) {
   log.error("CustomerServiceImpl.checkGstinDuplicate: error checking GSTIN {}: {}",
       cleanGstin, e.getMessage(), e);
   return new com.cris.customerportal.dto.GstinDuplicateCheckResult(false, "UNAVAILABLE",
       "Duplicate Check Unavailable – Unable to verify this GSTIN.", Collections.emptyList());
  }

  boolean foundInCust = records.stream().anyMatch(r -> "Global Customer".equals(r.getRecordType()));
  boolean foundInHndg = records.stream().anyMatch(r -> "Handling Agent".equals(r.getRecordType()));
  if (foundInCust && foundInHndg) {
   for (com.cris.customerportal.dto.GstinDuplicateRecord r : records) {
    r.setFlaggedInconsistent(true);
   }
  }

  boolean isDuplicate = false;
  if (currentCode != null && !currentCode.trim().isEmpty()) {
   String normCode = currentCode.trim().toUpperCase(Locale.ROOT);
   for (com.cris.customerportal.dto.GstinDuplicateRecord r : records) {
    if (r.getExistingCode() != null && !normCode.equalsIgnoreCase(r.getExistingCode().trim())) {
     isDuplicate = true;
     break;
    }
   }
  } else {
   isDuplicate = !records.isEmpty();
  }

  if (isDuplicate) {
   return new com.cris.customerportal.dto.GstinDuplicateCheckResult(true, "DUPLICATE",
       "Duplicate GSTIN Found – This GSTIN is already registered in the database. A new code cannot be generated for this GSTIN.",
       records);
  } else {
   return new com.cris.customerportal.dto.GstinDuplicateCheckResult(false, "AVAILABLE",
       "GSTIN is available", records);
  }
 }

  @Override
  public com.cris.customerportal.dto.PanDuplicateCheckResult checkPanDuplicate(String pan) {
   if (pan == null || pan.trim().isEmpty()) {
    return new com.cris.customerportal.dto.PanDuplicateCheckResult(false, "AVAILABLE", "PAN is empty", Collections.emptyList());
   }
   String cleanPan = pan.trim().toUpperCase(Locale.ROOT);
   if (!cleanPan.matches("^[A-Z]{5}[0-9]{4}[A-Z]$")) {
    return new com.cris.customerportal.dto.PanDuplicateCheckResult(false, "AVAILABLE", "Invalid PAN format", Collections.emptyList());
   }

   initDbColumns();
   List<com.cris.customerportal.dto.PanCompanyRecord> companies = new ArrayList<>();

   try (Connection conn = dataSource.getConnection()) {
    if (conn == null) {
     return new com.cris.customerportal.dto.PanDuplicateCheckResult(false, "UNAVAILABLE", "Duplicate Check Unavailable – Database connection failed", Collections.emptyList());
    }

    // 1. Check Global Customer
    Set<String> glblCodes = new LinkedHashSet<>();
    Map<String, com.cris.customerportal.dto.PanCompanyRecord> glblMap = new LinkedHashMap<>();

    String glblParentSql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, "
        + glblCityCol + " AS CITY, MAVPCOCODE, MAVCUSTPANNUMB "
        + "FROM MEMGLBLCUST WHERE UPPER(TRIM(MAVCUSTPANNUMB)) = ?";
    try (PreparedStatement ps = conn.prepareStatement(glblParentSql)) {
     if (ps != null) {
      ps.setString(1, cleanPan);
      try (ResultSet rs = ps.executeQuery()) {
       int count = 0;
       while (rs != null && rs.next() && ++count <= 50) {
        String code = rs.getString("MAVGLBLCUSTCODE");
        if (code != null && !code.trim().isEmpty()) {
         String c = code.trim().toUpperCase(Locale.ROOT);
         glblCodes.add(c);
         com.cris.customerportal.dto.PanCompanyRecord rec = new com.cris.customerportal.dto.PanCompanyRecord(
             "Global Customer", "global", c,
             rs.getString("MAVGLBLCUSTNAME"),
             rs.getString("MAVCUSTPANNUMB"),
             rs.getString("MAVGLBLCUSTADDRTEXT"),
             rs.getString("CITY"),
             rs.getString("MAVPCOCODE")
         );
         glblMap.put(c, rec);
        }
       }
      }
     }
    }

    String glblDtlsSql = "SELECT DISTINCT MAVGLBLCUSTCODE FROM MEMGLBLCUSTDTLS WHERE UPPER(TRIM(MAVCUSTPANNUMB)) = ? AND MAVGLBLCUSTCODE IS NOT NULL";
    try (PreparedStatement ps = conn.prepareStatement(glblDtlsSql)) {
     if (ps != null) {
      ps.setString(1, cleanPan);
      try (ResultSet rs = ps.executeQuery()) {
       int count = 0;
       while (rs != null && rs.next() && ++count <= 50) {
        String code = rs.getString("MAVGLBLCUSTCODE");
        if (code != null && !code.trim().isEmpty()) {
         glblCodes.add(code.trim().toUpperCase(Locale.ROOT));
        }
       }
      }
     }
    }

    for (String c : glblCodes) {
     com.cris.customerportal.dto.PanCompanyRecord company = glblMap.get(c);
     if (company == null) {
      String lookupSql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, "
          + glblCityCol + " AS CITY, MAVPCOCODE, MAVCUSTPANNUMB "
          + "FROM MEMGLBLCUST WHERE UPPER(TRIM(MAVGLBLCUSTCODE)) = ?";
      try (PreparedStatement ps = conn.prepareStatement(lookupSql)) {
       if (ps != null) {
        ps.setString(1, c);
        try (ResultSet rs = ps.executeQuery()) {
         if (rs != null && rs.next()) {
          company = new com.cris.customerportal.dto.PanCompanyRecord(
              "Global Customer", "global", c,
              rs.getString("MAVGLBLCUSTNAME"),
              rs.getString("MAVCUSTPANNUMB"),
              rs.getString("MAVGLBLCUSTADDRTEXT"),
              rs.getString("CITY"),
              rs.getString("MAVPCOCODE")
          );
         } else {
          company = new com.cris.customerportal.dto.PanCompanyRecord("Global Customer", "global", c, null, cleanPan, null, null, null);
         }
        }
       }
      }
      if (company == null) {
       company = new com.cris.customerportal.dto.PanCompanyRecord("Global Customer", "global", c, null, cleanPan, null, null, null);
      }
      glblMap.put(c, company);
     }

     if (company != null) {
      String gstSql = "SELECT MAVCUSTGSTNUMB, MAVGLBLCUSTADDRTEXT, "
          + glblDtlsCityCol + " AS CITY, MANPINCODE, "
          + "TO_CHAR(MADDATEEFCTFROM, 'YYYY-MM-DD') AS EFFECTIVE_FROM, "
          + "TO_CHAR(MADDATEEFCTTO, 'YYYY-MM-DD') AS EFFECTIVE_TO "
          + "FROM MEMGLBLCUSTDTLS WHERE UPPER(TRIM(MAVGLBLCUSTCODE)) = ? ORDER BY MADDATEEFCTFROM DESC, MAVCUSTGSTNUMB";
      try (PreparedStatement ps = conn.prepareStatement(gstSql)) {
       if (ps != null) {
        ps.setString(1, c);
        try (ResultSet rs = ps.executeQuery()) {
         int count = 0;
         while (rs != null && rs.next() && ++count <= 50) {
          String g = rs.getString("MAVCUSTGSTNUMB");
          if (g != null && !g.trim().isEmpty()) {
           company.getGstins().add(new com.cris.customerportal.dto.PanGstinRecord(
               g.trim(),
               rs.getString("MAVGLBLCUSTADDRTEXT"),
               rs.getString("CITY"),
               rs.getString("MANPINCODE"),
               rs.getString("EFFECTIVE_FROM"),
               rs.getString("EFFECTIVE_TO")
           ));
          }
         }
        }
       }
      }
      companies.add(company);
     }
    }

    // 2. Check Handling Agent
    Set<String> hndgCodes = new LinkedHashSet<>();
    Map<String, com.cris.customerportal.dto.PanCompanyRecord> hndgMap = new LinkedHashMap<>();

    String hndgParentSql = "SELECT " + hndgCodeCol + " AS CODE, " + hndgNameCol + " AS NAME, "
        + hndgAddrCol + " AS ADDR, " + hndgCityCol + " AS CITY, MAVPCOCODE, MAVCUSTPANNUMB "
        + "FROM MEMGLBLHNDGAGNT WHERE UPPER(TRIM(MAVCUSTPANNUMB)) = ?";
    try (PreparedStatement ps = conn.prepareStatement(hndgParentSql)) {
     if (ps != null) {
      ps.setString(1, cleanPan);
      try (ResultSet rs = ps.executeQuery()) {
       int count = 0;
       while (rs != null && rs.next() && ++count <= 50) {
        String code = rs.getString("CODE");
        if (code != null && !code.trim().isEmpty()) {
         String c = code.trim().toUpperCase(Locale.ROOT);
         hndgCodes.add(c);
         com.cris.customerportal.dto.PanCompanyRecord rec = new com.cris.customerportal.dto.PanCompanyRecord(
             "Handling Agent", "handling_agent", c,
             rs.getString("NAME"),
             rs.getString("MAVCUSTPANNUMB"),
             rs.getString("ADDR"),
             rs.getString("CITY"),
             rs.getString("MAVPCOCODE")
         );
         hndgMap.put(c, rec);
        }
       }
      }
     }
    }

    String hndgDtlsSql = "SELECT DISTINCT MAVHNDGAGNTCODE FROM MEMGLBLHNDGAGNTDTLS WHERE UPPER(TRIM(MAVCUSTPANNUMB)) = ? AND MAVHNDGAGNTCODE IS NOT NULL";
    try (PreparedStatement ps = conn.prepareStatement(hndgDtlsSql)) {
     if (ps != null) {
      ps.setString(1, cleanPan);
      try (ResultSet rs = ps.executeQuery()) {
       int count = 0;
       while (rs != null && rs.next() && ++count <= 50) {
        String code = rs.getString("MAVHNDGAGNTCODE");
        if (code != null && !code.trim().isEmpty()) {
         hndgCodes.add(code.trim().toUpperCase(Locale.ROOT));
        }
       }
      }
     }
    }

    for (String c : hndgCodes) {
     com.cris.customerportal.dto.PanCompanyRecord company = hndgMap.get(c);
     if (company == null) {
      String lookupSql = "SELECT " + hndgCodeCol + " AS CODE, " + hndgNameCol + " AS NAME, "
          + hndgAddrCol + " AS ADDR, " + hndgCityCol + " AS CITY, MAVPCOCODE, MAVCUSTPANNUMB "
          + "FROM MEMGLBLHNDGAGNT WHERE UPPER(TRIM(" + hndgCodeCol + ")) = ?";
      try (PreparedStatement ps = conn.prepareStatement(lookupSql)) {
       if (ps != null) {
        ps.setString(1, c);
        try (ResultSet rs = ps.executeQuery()) {
         if (rs != null && rs.next()) {
          company = new com.cris.customerportal.dto.PanCompanyRecord(
              "Handling Agent", "handling_agent", c,
              rs.getString("NAME"),
              rs.getString("MAVCUSTPANNUMB"),
              rs.getString("ADDR"),
              rs.getString("CITY"),
              rs.getString("MAVPCOCODE")
          );
         } else {
          company = new com.cris.customerportal.dto.PanCompanyRecord("Handling Agent", "handling_agent", c, null, cleanPan, null, null, null);
         }
        }
       }
      }
      if (company == null) {
       company = new com.cris.customerportal.dto.PanCompanyRecord("Handling Agent", "handling_agent", c, null, cleanPan, null, null, null);
      }
      hndgMap.put(c, company);
     }

     if (company != null) {
      String gstSql = "SELECT MAVCUSTGSTNUMB, MAVHNDGAGNTADDRTEXT, "
          + "MAVHNDGAGNTCITYNAME AS CITY, MANPINCODE, "
          + "TO_CHAR(MADDATEEFCTFROM, 'YYYY-MM-DD') AS EFFECTIVE_FROM, "
          + "TO_CHAR(MADDATEEFCTTO, 'YYYY-MM-DD') AS EFFECTIVE_TO "
          + "FROM MEMGLBLHNDGAGNTDTLS WHERE UPPER(TRIM(MAVHNDGAGNTCODE)) = ? ORDER BY MADDATEEFCTFROM DESC, MAVCUSTGSTNUMB";
      try (PreparedStatement ps = conn.prepareStatement(gstSql)) {
       if (ps != null) {
        ps.setString(1, c);
        try (ResultSet rs = ps.executeQuery()) {
         int count = 0;
         while (rs != null && rs.next() && ++count <= 50) {
          String g = rs.getString("MAVCUSTGSTNUMB");
          if (g != null && !g.trim().isEmpty()) {
           company.getGstins().add(new com.cris.customerportal.dto.PanGstinRecord(
               g.trim(),
               rs.getString("MAVHNDGAGNTADDRTEXT"),
               rs.getString("CITY"),
               rs.getString("MANPINCODE"),
               rs.getString("EFFECTIVE_FROM"),
               rs.getString("EFFECTIVE_TO")
           ));
          }
         }
        }
       }
      }
      companies.add(company);
     }
    }

   } catch (SQLException e) {
    log.error("CustomerServiceImpl.checkPanDuplicate: SQLState={} ErrorCode={} error={}",
        e.getSQLState(), e.getErrorCode(), e.getMessage());
    return new com.cris.customerportal.dto.PanDuplicateCheckResult(false, "UNAVAILABLE", "Duplicate Check Unavailable – Database connection failed", Collections.emptyList());
   }

   if (companies.isEmpty()) {
    return new com.cris.customerportal.dto.PanDuplicateCheckResult(false, "AVAILABLE", "Available – No duplicate company record found for this PAN.", Collections.emptyList());
   }

   return new com.cris.customerportal.dto.PanDuplicateCheckResult(true, "DUPLICATE", "Company Already Exists – This PAN is already registered in Freight Customer Code.", companies);
  }

 public static String normalizeAddress(String address) {
  if (address == null) return null;
  return address.replaceAll(",\\s+", ",").trim();
 }

 public String registerNewEntryJDBC(java.util.Map<String, String> formData) {
  String type = formData.get("codeType");
  if (type != null) type = type.trim().toLowerCase(Locale.ROOT);
  if ("handling_agent".equals(type)) type = "handling";
  if (!"global".equals(type) && !"handling".equals(type)) throw new IllegalArgumentException("Invalid codeType: " + type);

  List<String> requiredFields = Arrays.asList("companyName", "address", "operatingDivision", "zone", "panNumber", "gstinNumbers");
  for (String field : requiredFields) {
   if (firstValue(formData, field) == null) {
    throw new IllegalArgumentException(field + " is required");
   }
  }
  validateCompanyNameLength(firstValue(formData, "companyName", "customerName"));
  String rawAddress = firstValue(formData, "address");
  String address = normalizeAddress(rawAddress);
  String city = normalizeNullableValue(formData.get("city"));
  if (address == null || address.isEmpty()) {
   throw new IllegalArgumentException("address is required");
  }
  if (address.length() > 100) {
   throw new IllegalArgumentException("Address cannot exceed 100 characters.");
  }
  String pincode = firstValue(formData, "pincode");
  if (pincode != null && !pincode.trim().isEmpty() && !pincode.trim().matches("^[1-9][0-9]{5}$")) {
   throw new IllegalArgumentException("Invalid pincode");
  }
  String rawPan = formData.get("panNumber");
  if (rawPan == null || !rawPan.replaceAll("\\s+", "").toUpperCase(Locale.ROOT).matches("^[A-Z]{5}[0-9]{4}[A-Z]$")) {
   throw new IllegalArgumentException("Enter a valid PAN number.");
  }
  String pan = rawPan.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);

  String rawGstins = formData.get("gstinNumbers");
  if (rawGstins == null || rawGstins.trim().isEmpty()) {
   throw new IllegalArgumentException("Enter valid 15-character GSTIN numbers.");
  }
  List<String> gstinNumbers = new ArrayList<>();
  for (String g : rawGstins.split(",")) {
   String trimmed = g.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
   if (!trimmed.isEmpty()) gstinNumbers.add(trimmed);
  }
  if (gstinNumbers.isEmpty()) {
   throw new IllegalArgumentException("Enter valid 15-character GSTIN numbers.");
  }
  Pattern gstinPattern = Pattern.compile("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$");
  for (String g : gstinNumbers) {
   if (!gstinPattern.matcher(g).matches()) {
    throw new IllegalArgumentException("Enter valid 15-character GSTIN numbers: " + g);
   }
   String gstinPan = g.substring(2, 12);
   if (!gstinPan.equals(pan)) {
    throw new IllegalArgumentException("GSTIN " + g + " does not match PAN number " + pan);
   }
  }
  String email = formData.get("email");
  if (email != null && !email.trim().isEmpty() && !email.trim().matches("^\\S+@\\S+\\.\\S+$")) {
   throw new IllegalArgumentException("Invalid email");
  }
  String mobile = formData.get("mobile");
  if (mobile != null && !mobile.trim().isEmpty() && !mobile.trim().matches("^[6-9][0-9]{9}$")) {
   throw new IllegalArgumentException("Enter a valid 10-digit Indian mobile number.");
  }

  if (pan != null && !pan.trim().isEmpty()) {
   com.cris.customerportal.dto.PanDuplicateCheckResult panCheck = checkPanDuplicate(pan);
   if ("UNAVAILABLE".equals(panCheck.getStatus())) {
    throw new IllegalStateException("Duplicate Check Unavailable – Unable to verify PAN. Registration cannot proceed.");
   }
   if (panCheck.isDuplicate()) {
    String requestedType = "global".equals(type) ? "global" : "handling_agent";
    for (com.cris.customerportal.dto.PanCompanyRecord comp : panCheck.getCompanies()) {
     if (requestedType.equalsIgnoreCase(comp.getCodeType())) {
      throw new ResourceAlreadyExistsException(
          "Company Already Exists – A " + comp.getRecordType() + " code (" + comp.getCompanyCode()
          + ") is already registered for PAN " + pan.trim().toUpperCase(Locale.ROOT)
          + ". You cannot generate another code for the same company.");
     }
    }
   }
  }

  for (String g : gstinNumbers) {
   com.cris.customerportal.dto.GstinDuplicateCheckResult check = checkGstinDuplicate(g, null);
   if ("UNAVAILABLE".equals(check.getStatus())) {
    throw new IllegalStateException("Duplicate Check Unavailable – Unable to verify this GSTIN.");
   }
   if (check.isDuplicate()) {
    throw new ResourceAlreadyExistsException("Duplicate GSTIN Found – This GSTIN is already registered in the database. A new code cannot be generated for this GSTIN: " + g);
   }
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
   companyName = withCompanyNamePrefix(companyName);
  }
    String providedCode = firstValue(formData, "customerCode", "globalCustomerCode", "handlingAgentCode");



  String divisionDesignation = DivisionDesignationResolver.resolve(formData.get("operatingDivision"));
  String firstGstin = (gstinNumbers != null && !gstinNumbers.isEmpty()) ? gstinNumbers.get(0) : null;
  sql = "global".equals(type)
      ? "INSERT INTO MEMGLBLCUST (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, " + glblCityCol + ", MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, " + glblDateCol + ", " + glblGstCol + ", MAVCUSTPANNUMB) VALUES (?, ?, ?, ?, ?, ?, ?, SYSDATE, ?, NULL, ?, ?)"
      : "INSERT INTO " + tableName + " (" + colName + ", " + nameCol + ", " + addrCol + ", " + cityCol + ", MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, " + hndgDateCol + ", " + hndgGstCol + ", MAVCUSTPANNUMB) VALUES (?, ?, ?, ?, ?, ?, ?, SYSDATE, ?, NULL, ?, ?)";

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
    log.error("CustomerServiceImpl.registerNewEntryJDBC: duplicate check error SQLState={} ErrorCode={} stackTrace={}",
            e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
   throw new RuntimeException("Database error while checking customer code availability: " + e.getMessage(), e);
  }

    List<String> insertParameters = new ArrayList<>();
    insertParameters.add(finalCode);
    insertParameters.add(companyName);
    insertParameters.add(address);
    insertParameters.add(city);
    insertParameters.add(null);
    insertParameters.add(null);
    insertParameters.add(null);
    insertParameters.add(divisionDesignation);
    insertParameters.add(firstGstin);
    insertParameters.add(formData.get("panNumber"));
   String executableSql = formatBoundSql(sql, insertParameters) + ";";
   List<DbaEmailService.SqlRequest> emailRequests = new ArrayList<>();
   String userId = DivisionDesignationResolver.resolve(formData.get("operatingDivision"));
   String emailId = formData.get("email");
   emailRequests.add(new DbaEmailService.SqlRequest("INSERT", tableName, finalCode, executableSql, userId, emailId));

   Map<String, Map<String, String>> detailsMap = parseGstinDetails(formData.get("gstinDetails"), gstinNumbers);
   String dtlsTable = "global".equals(type) ? "MEMGLBLCUSTDTLS" : "MEMGLBLHNDGAGNTDTLS";
   String dtlsCodeCol = "global".equals(type) ? "MAVGLBLCUSTCODE" : "MAVHNDGAGNTCODE";
   String dtlsNameCol = "global".equals(type) ? "MAVGLBLCUSTNAME" : "MAVHNDGAGNTNAME";
   String dtlsAddrCol = "global".equals(type) ? "MAVGLBLCUSTADDRTEXT" : "MAVHNDGAGNTADDRTEXT";
   String dtlsCityCol = "global".equals(type) ? glblDtlsCityCol : "MAVHNDGAGNTCITYNAME";

   for (String g : gstinNumbers) {
    Map<String, String> gDetail = detailsMap.get(g);
    String gAddr = gDetail != null && gDetail.get("address") != null && !gDetail.get("address").trim().isEmpty()
        ? normalizeAddress(gDetail.get("address"))
        : address;
    if (gAddr != null && gAddr.length() > 100) {
     throw new IllegalArgumentException("Address for GSTIN " + g + " cannot exceed 100 characters.");
    }
    String gCity = gDetail != null && gDetail.get("city") != null && !gDetail.get("city").trim().isEmpty()
        ? normalizeNullableValue(gDetail.get("city"))
        : city;
    String gPin = gDetail != null && gDetail.get("pincode") != null && !gDetail.get("pincode").trim().isEmpty()
        ? gDetail.get("pincode")
        : pincode;
    gPin = normalizeRegistrationPincode(gPin);

    String dtlsSql = "INSERT INTO " + dtlsTable + " ("
        + dtlsCodeCol + ", " + dtlsNameCol + ", " + dtlsAddrCol + ", " + dtlsCityCol
        + ", MANPINCODE, MADIMPLDATE, MAVRMRK, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, MADDATEEFCTFROM, MADDATEEFCTTO) "
        + "VALUES (?, ?, ?, ?, " + (gPin == null ? "NULL" : gPin) + ", SYSDATE, NULL, ?, ?, SYSDATE, NULL)";
    String detailName = withCompanyNamePrefix(companyName);
    List<String> dtlsParams = Arrays.asList(finalCode, detailName, gAddr, gCity, g, pan);
    String dtlsExecSql = formatBoundSql(dtlsSql, dtlsParams) + ";";
    emailRequests.add(new DbaEmailService.SqlRequest("INSERT", dtlsTable, finalCode, dtlsExecSql, userId, emailId));
   }
   if (emailRequests.size() != gstinNumbers.size() + 1) {
    log.error("CustomerServiceImpl.registerNewEntryJDBC: required GSTIN detail SQL count mismatch for table={} code={} expected={} actual={}",
        tableName, finalCode, gstinNumbers.size(), emailRequests.size() - 1);
    throw new IllegalStateException("Could not generate all required GSTIN detail queries. Registration email was not sent.");
   }
   dbaEmailService.sendDbaRegistrationSqlEmail(emailRequests);
   return finalCode;
 }

 private Map<String, Map<String, String>> parseGstinDetails(String rawDetails, List<String> gstinNumbers) {
  Map<String, Map<String, String>> detailsMap = new HashMap<>();
  if (rawDetails == null || rawDetails.trim().isEmpty()) {
   return detailsMap;
  }

  final List<Map<String, Object>> details;
  try {
   com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
   details = mapper.readValue(rawDetails,
       new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() {});
  } catch (Exception e) {
   log.error("CustomerServiceImpl.registerNewEntryJDBC: unable to parse GSTIN details ({}): {}; registration email not sent",
       e.getClass().getSimpleName(), DataMaskingUtil.maskSensitive(e.getMessage()));
   throw new IllegalArgumentException("GSTIN details could not be processed. Please resubmit the registration.", e);
  }
  if (details == null) {
   throw new IllegalArgumentException("GSTIN details could not be processed. Please resubmit the registration.");
  }

  Set<String> requestedGstins = new HashSet<>(gstinNumbers);
  for (Map<String, Object> item : details) {
   if (item == null || item.get("gstin") == null) {
    throw new IllegalArgumentException("Each GSTIN detail must identify its GSTIN.");
   }
   String gstin = item.get("gstin").toString().replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
   if (!requestedGstins.contains(gstin)) {
    throw new IllegalArgumentException("GSTIN details do not match the submitted GSTIN list.");
   }
   Map<String, String> itemDetails = new HashMap<>();
   if (item.get("address") != null) itemDetails.put("address", item.get("address").toString());
   if (item.get("city") != null) itemDetails.put("city", item.get("city").toString());
   if (item.get("pincode") != null) itemDetails.put("pincode", item.get("pincode").toString());
   if (detailsMap.putIfAbsent(gstin, itemDetails) != null) {
    throw new IllegalArgumentException("Duplicate GSTIN details were submitted.");
   }
  }
  if (!detailsMap.keySet().containsAll(requestedGstins)) {
   throw new IllegalArgumentException("GSTIN details are missing for one or more submitted GSTINs.");
  }
  return detailsMap;
 }

 private String normalizeRegistrationPincode(String pincode) {
  if (pincode == null || pincode.trim().isEmpty()) return null;
  String normalized = pincode.trim();
  if (!normalized.matches("^[1-9][0-9]{5}$")) {
   throw new IllegalArgumentException("Invalid pincode for GSTIN detail.");
  }
  return normalized;
 }

 private String withCompanyNamePrefix(String companyName) {
  String normalized = companyName.trim();
  if (hasCompanyNamePrefix(normalized)) {
   if (normalized.length() == 3) {
    return "M/S";
   }
   if (Character.isWhitespace(normalized.charAt(3))) {
    return "M/S " + normalized.substring(3).trim();
   }
   return normalized;
  }
  return "M/S " + normalized;
 }

 private boolean hasCompanyNamePrefix(String companyName) {
  return companyName.length() >= 3
      && companyName.regionMatches(true, 0, "M/S", 0, 3)
      && (companyName.length() == 3 || !Character.isLetterOrDigit(companyName.charAt(3)));
 }

 public void updateOldCustomerJDBC(java.util.Map<String, String> formData) {
 String type = formData.get("codeType");
 if (type != null) type = type.trim().toLowerCase(Locale.ROOT);
 if ("handling_agent".equals(type)) type = "handling";
 if (!"global".equals(type) && !"handling".equals(type)) throw new IllegalArgumentException("Invalid codeType: " + type);
 validateCompanyNameLength(formData.get("companyName"));
 boolean isGlobal = "global".equals(type);
 String customerCode = firstValue(formData, "customerCode");
 if (customerCode == null) throw new IllegalArgumentException("Customer code is required");
 if (!customerCode.trim().matches("(?i)[a-z0-9]+")) {
  throw new IllegalArgumentException("Enter a valid Customer Code.");
 }
 String expectedCode = firstValue(formData, "expectedCustomerCode");
 if (expectedCode != null && !expectedCode.trim().isEmpty()) {
  if (!customerCode.trim().equalsIgnoreCase(expectedCode.trim())) {
   throw new IllegalArgumentException("Customer code mismatch: submitted code does not match original code " + expectedCode.trim());
  }
 }

  initDbColumns();
  String table = isGlobal ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
  com.cris.customerportal.dto.OldCustomerResponse oldCustomer;
  String keyColumn;
  String nameColumn;
  String addressColumn;
  String cityColumn;
  String panColumn = "MAVCUSTPANNUMB";
  String pincodeColumn = "MAVPCOCODE";
  String divisionColumn = "MAVIMPLREMK";
  if (isGlobal) {
   oldCustomer = lookupOldCustomerByCode(customerCode);
   if (oldCustomer.getCustomerCode() != null && !oldCustomer.getCustomerCode().trim().isEmpty()) {
    customerCode = oldCustomer.getCustomerCode();
   }
   keyColumn = "MAVGLBLCUSTCODE";
   nameColumn = "MAVGLBLCUSTNAME";
   addressColumn = "MAVGLBLCUSTADDRTEXT";
   cityColumn = glblCityCol;
  } else {
   com.cris.customerportal.dto.GlobalAgentResponse agent = lookupHandlingAgentByCode(customerCode);
   if (agent.getCode() != null && !agent.getCode().trim().isEmpty()) {
    customerCode = agent.getCode();
   }
   oldCustomer = new com.cris.customerportal.dto.OldCustomerResponse();
   oldCustomer.setCompanyName(agent.getCompanyName());
   oldCustomer.setAddress(agent.getAddress());
   oldCustomer.setCity(agent.getCity());
   oldCustomer.setPanNumber(agent.getPanNumber());
   oldCustomer.setGstinNumbers(agent.getGstinNumbers());
   oldCustomer.setPincode(agent.getPcoCode());
   oldCustomer.setDivision(agent.getDivision());
   oldCustomer.setGstins(agent.getGstins());
   keyColumn = hndgCodeCol;
   nameColumn = hndgNameCol;
   addressColumn = hndgAddrCol;
   cityColumn = hndgCityCol;
  }

  Map<String, String> current = new LinkedHashMap<>();
  current.put(nameColumn, oldCustomer.getCompanyName());
  current.put(addressColumn, oldCustomer.getAddress());
  current.put(cityColumn, oldCustomer.getCity());
  current.put(panColumn, oldCustomer.getPanNumber());
  Map<String, String> requested = new LinkedHashMap<>();
  requested.put(nameColumn, normalizeNullableValue(formData.get("companyName")));
  String rawAddress = formData.get("address");
  String updateAddress = normalizeAddress(rawAddress);
  if (updateAddress != null && updateAddress.length() > 100) {
   throw new IllegalArgumentException("Address cannot exceed 100 characters.");
  }
  requested.put(addressColumn, updateAddress);
  requested.put(cityColumn, normalizeNullableValue(formData.get("city")));

  String existingPan = normalizeNullableValue(oldCustomer.getPanNumber());
  if (existingPan != null) {
   existingPan = existingPan.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
   if ("NULL".equalsIgnoreCase(existingPan) || "UNDEFINED".equalsIgnoreCase(existingPan)) {
    existingPan = null;
   }
  }
  boolean panAlreadyExists = (existingPan != null && !existingPan.isEmpty());

  String rawPan = formData.get("panNumber");
  String panVal = normalizeNullableValue(rawPan);
  if (panVal != null) {
   panVal = panVal.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
   if ("NULL".equalsIgnoreCase(panVal) || "UNDEFINED".equalsIgnoreCase(panVal)) {
    panVal = null;
   } else if (!panVal.matches("^[A-Z]{5}[0-9]{4}[A-Z]$")) {
    throw new IllegalArgumentException("Enter a valid PAN number.");
   }
  }

  // Prevent accidental overwrite: if PAN already exists in DB and incoming value is null/empty/undefined, retain existing PAN
  if (panAlreadyExists && (panVal == null || panVal.isEmpty())) {
   requested.put(panColumn, existingPan);
  } else {
   requested.put(panColumn, panVal);
  }

  String rawGst = formData.get("gstinNumbers");
  String gstVal = normalizeNullableValue(rawGst);
  if (gstVal != null) {
   String cleaned = gstVal.replaceAll("[\\[\\]\"'\\s]", "");
   if (cleaned.isEmpty() || "NULL".equalsIgnoreCase(cleaned) || "UNDEFINED".equalsIgnoreCase(cleaned)) {
    gstVal = null;
   }
  }
  if (gstVal != null && !gstVal.isEmpty()) {
   Pattern gstinPattern = Pattern.compile("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$");
   String activePan = panVal != null ? panVal : (existingPan != null ? existingPan : null);
   for (String g : gstVal.split(",")) {
    String trimmed = g.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
    if (!trimmed.isEmpty()) continue;
    if (!gstinPattern.matcher(trimmed).matches()) {
     throw new IllegalArgumentException("Enter valid 15-character GSTIN numbers: " + trimmed);
    }
    if (activePan != null && activePan.matches("^[A-Z]{5}[0-9]{4}[A-Z]$")) {
     String gstinPan = trimmed.substring(2, 12);
     if (!gstinPan.equals(activePan)) {
      throw new IllegalArgumentException("GSTIN " + trimmed + " does not match PAN number " + activePan);
     }
    }
   }
  }

  if (formData.containsKey("pincode")) {
   current.put(pincodeColumn, oldCustomer.getPincode());
   requested.put(pincodeColumn, null);
  }
  if (formData.containsKey("operatingDivision")) {
   current.put(divisionColumn, oldCustomer.getDivision());
   requested.put(divisionColumn, DivisionDesignationResolver.resolve(formData.get("operatingDivision")));
  }

  if (formData.containsKey("gstinDetails")) {
   requested.remove(addressColumn);
   requested.remove(cityColumn);
  }

  List<String> assignments = new ArrayList<>();
  for (Map.Entry<String, String> entry : requested.entrySet()) {
   if (!Objects.equals(
       normalizeUpdateComparisonValue(entry.getKey(), current.get(entry.getKey())),
       normalizeUpdateComparisonValue(entry.getKey(), entry.getValue()))) {
    assignments.add(entry.getKey() + " = " + formatSqlValue(entry.getValue()));
   }
  }
  boolean onlyPincodeChangeInRemovalRequest = formData.containsKey("gstinRemovals")
      && assignments.size() == 1
      && assignments.get(0).regionMatches(true, 0, pincodeColumn + " = ", 0, pincodeColumn.length() + 3);
   List<DbaEmailService.SqlRequest> emailRequests = new ArrayList<>();
   if (!assignments.isEmpty() && !onlyPincodeChangeInRemovalRequest) {
    String executableSql = "UPDATE " + table + " SET " + String.join(", ", assignments)
        + " WHERE " + keyColumn + " = " + formatSqlValue(customerCode.trim()) + ";";
    emailRequests.add(new DbaEmailService.SqlRequest("UPDATE", table, customerCode.trim(), executableSql));
   }

   String dtlsTable = isGlobal ? "MEMGLBLCUSTDTLS" : "MEMGLBLHNDGAGNTDTLS";
   String dtlsCodeCol = isGlobal ? "MAVGLBLCUSTCODE" : "MAVHNDGAGNTCODE";
   String dtlsNameCol = isGlobal ? "MAVGLBLCUSTNAME" : "MAVHNDGAGNTNAME";
   String dtlsAddrCol = isGlobal ? "MAVGLBLCUSTADDRTEXT" : "MAVHNDGAGNTADDRTEXT";
   String dtlsCityCol = isGlobal ? glblDtlsCityCol : "MAVHNDGAGNTCITYNAME";

   // Existing GSTINs in detail table
   Map<String, String> existingDtls = new LinkedHashMap<>();
   List<ExistingGstinDetail> existingGstinDetails = new ArrayList<>();
   int existingGstinRecordCount = 0;
   List<Map<String, Object>> requestedGstinRemovals = parseGstinRemovals(
       formData.get("gstinRemovals"));
   if (formData.containsKey("gstinDetails")
       || formData.containsKey("gstinNumbers")
       || formData.containsKey("gstinRemovals")) {
    String queryDtls = "SELECT MAVCUSTGSTNUMB, " + dtlsAddrCol
        + ", TO_CHAR(MADDATEEFCTFROM, 'YYYY-MM-DD HH24:MI:SS') AS EFFECTIVE_FROM "
        + "FROM " + dtlsTable + " WHERE " + dtlsCodeCol + " = ?";
    try (Connection conn = dataSource.getConnection();
         PreparedStatement ps = conn.prepareStatement(queryDtls)) {
     if (ps != null) {
      ps.setString(1, customerCode.trim());
      try (ResultSet rs = ps.executeQuery()) {
       if (rs != null) {
        while (rs.next()) {
         String g = rs.getString("MAVCUSTGSTNUMB");
         String a = rs.getString(dtlsAddrCol);
         if (g != null && !g.trim().isEmpty()) {
          String normalizedGstin = g.trim().toUpperCase(Locale.ROOT);
          String effectiveFrom = rs.getString("EFFECTIVE_FROM");
          existingDtls.putIfAbsent(normalizedGstin, a);
          existingGstinRecordCount++;
          ExistingGstinDetail existingDetail = findGstinDetail(
              existingGstinDetails, normalizedGstin, effectiveFrom);
          if (existingDetail == null) {
           existingGstinDetails.add(new ExistingGstinDetail(
               normalizedGstin, a, effectiveFrom));
          } else {
           existingDetail.duplicateCount++;
          }
         }
        }
       }
      }
     }
    } catch (SQLException e) {
     if (!requestedGstinRemovals.isEmpty()) {
      log.error("CustomerServiceImpl.updateOldCustomerJDBC: cannot verify GSTIN removal rows: {}",
          DataMaskingUtil.formatThrowable(e));
      throw new DatabaseUnavailableException(
          "Unable to verify the selected GSTIN detail records. No request email was sent.", e);
     }
     log.warn("CustomerServiceImpl.updateOldCustomerJDBC: dtls query error: {}", e.getMessage());
    }
   }

   // Handle GSTIN details / additions / removals
   Set<String> submittedGstins = new LinkedHashSet<>();
   if (formData.containsKey("gstinDetails")
       || formData.containsKey("gstinNumbers")
       || formData.containsKey("gstinRemovals")) {
    List<Map<String, Object>> list = new ArrayList<>();
    String rawDetails = formData.get("gstinDetails");
    if (rawDetails != null && !rawDetails.trim().isEmpty()) {
     try {
      com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
      List<Map<String, Object>> parsed = mapper.readValue(rawDetails, new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() {});
      if (parsed != null) list.addAll(parsed);
     } catch (Exception e) {
      log.warn("CustomerServiceImpl.updateOldCustomerJDBC: failed to parse gstinDetails: {}", e.getMessage());
     }
    } else if (formData.containsKey("gstinNumbers") && formData.get("gstinNumbers") != null) {
     for (String g : formData.get("gstinNumbers").split(",")) {
      String trimmed = g.replaceAll("[\\[\\]\"'\\s]", "").toUpperCase(Locale.ROOT);
      if (!trimmed.isEmpty() && !"NULL".equals(trimmed)) {
       Map<String, Object> item = new HashMap<>();
       item.put("gstin", trimmed);
       list.add(item);
      }
     }
    }

    Pattern gstinPattern = Pattern.compile("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$");
    String activePan = requested.get(panColumn) != null ? requested.get(panColumn) : current.get(panColumn);

    for (Map<String, Object> item : list) {
     Object gVal = item.get("gstin");
     if (gVal == null) continue;
     String g = gVal.toString().trim().toUpperCase(Locale.ROOT);
     if (g.isEmpty()) continue;
     if (!gstinPattern.matcher(g).matches()) {
      throw new IllegalArgumentException("Enter valid 15-character GSTIN numbers: " + g);
     }
     if (!submittedGstins.add(g)) {
      throw new IllegalArgumentException("Duplicate GSTIN Found – The same GSTIN cannot be entered more than once: " + g);
     }

     String gAddr = item.get("address") != null ? normalizeAddress(item.get("address").toString()) : updateAddress;
     if (gAddr != null && gAddr.length() > 100) {
      throw new IllegalArgumentException("Address for GSTIN " + g + " cannot exceed 100 characters.");
     }
     String gCity = item.get("city") != null ? normalizeNullableValue(item.get("city").toString()) : normalizeNullableValue(formData.get("city"));
     String gPin = item.get("pincode") != null ? normalizeNullableValue(item.get("pincode").toString()) : normalizeNullableValue(formData.get("pincode"));

     if (!existingDtls.containsKey(g)) {
      if (activePan != null && activePan.matches("^[A-Z]{5}[0-9]{4}[A-Z]$")) {
       String gstinPan = g.substring(2, 12);
       if (!gstinPan.equals(activePan)) {
        throw new IllegalArgumentException("GSTIN " + g + " does not match PAN number " + activePan);
       }
      }
      com.cris.customerportal.dto.GstinDuplicateCheckResult check = checkGstinDuplicate(g, customerCode.trim());
      if ("UNAVAILABLE".equals(check.getStatus())) {
       throw new IllegalStateException("Duplicate Check Unavailable – Unable to verify this GSTIN.");
      }
      if (check.isDuplicate() || !check.getRecords().isEmpty()) {
       throw new ResourceAlreadyExistsException("Duplicate GSTIN Found – This GSTIN is already registered in the database: " + g);
      }
      String dtlsInsSql = "INSERT INTO " + dtlsTable + " ("
          + dtlsCodeCol + ", " + dtlsNameCol + ", " + dtlsAddrCol + ", " + dtlsCityCol
          + ", MANPINCODE, MADIMPLDATE, MAVRMRK, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, MADDATEEFCTFROM, MADDATEEFCTTO) "
          + "VALUES (?, ?, ?, ?, " + (gPin != null && gPin.matches("^[0-9]+$") ? gPin : "NULL") + ", SYSDATE, NULL, ?, ?, SYSDATE, NULL)";
      List<String> dtlsParams = new ArrayList<>();
      dtlsParams.add(customerCode.trim());
      dtlsParams.add(requested.get(nameColumn) != null ? requested.get(nameColumn) : current.get(nameColumn));
      dtlsParams.add(gAddr);
      dtlsParams.add(gCity);
      dtlsParams.add(g);
      dtlsParams.add(activePan);
      String dtlsExecSql = formatBoundSql(dtlsInsSql, dtlsParams) + ";";
      emailRequests.add(new DbaEmailService.SqlRequest("INSERT", dtlsTable, customerCode.trim(), dtlsExecSql));
     } else {
      if (item.containsKey("address") && item.get("address") != null
          && !isGstinMarkedForRemoval(requestedGstinRemovals, g)) {
       String existingDtlsAddr = existingDtls.get(g);
       if (gAddr != null && !Objects.equals(normalizeAddress(existingDtlsAddr), gAddr)) {
        String dtlsUpdSql = "UPDATE " + dtlsTable + " SET " + dtlsAddrCol + " = " + formatSqlValue(gAddr)
            + " WHERE " + dtlsCodeCol + " = " + formatSqlValue(customerCode.trim())
            + " AND MAVCUSTGSTNUMB = " + formatSqlValue(g) + ";";
        emailRequests.add(new DbaEmailService.SqlRequest("UPDATE", dtlsTable, customerCode.trim(), dtlsUpdSql));
       }
      }
     }
    }

    List<ExistingGstinDetail> removalTargets = new ArrayList<>();
    if (formData.containsKey("gstinRemovals")) {
     removalTargets.addAll(resolveRequestedGstinRemovals(
         requestedGstinRemovals, existingGstinDetails));
    } else if (!submittedGstins.isEmpty()) {
     for (ExistingGstinDetail existing : existingGstinDetails) {
      if (!submittedGstins.contains(existing.gstin)) {
       removalTargets.add(existing);
      }
     }
    }

    int newlyAddedGstinCount = (int) submittedGstins.stream()
        .filter(gstin -> !existingDtls.containsKey(gstin))
        .count();
    validateGstinRemovalCount(existingGstinRecordCount + newlyAddedGstinCount, removalTargets);
    for (ExistingGstinDetail removal : removalTargets) {
     String dtlsDelSql = buildGstinRemovalSql(
         dtlsTable, dtlsCodeCol, customerCode.trim(), removal);
     emailRequests.add(new DbaEmailService.SqlRequest(
         "UPDATE", dtlsTable, customerCode.trim(), oldCustomer.getCompanyName(), dtlsDelSql));
    }
   }
   if (emailRequests.isEmpty()) {
    throw new IllegalArgumentException("No changes detected for this record.");
   }
   dbaEmailService.sendDbaSqlEmail(emailRequests);
 }

 private List<Map<String, Object>> parseGstinRemovals(String rawRemovals) {
  if (rawRemovals == null || rawRemovals.trim().isEmpty()) {
   return Collections.emptyList();
  }
  try {
   List<Map<String, Object>> removals = new com.fasterxml.jackson.databind.ObjectMapper()
       .readValue(rawRemovals,
           new com.fasterxml.jackson.core.type.TypeReference<List<Map<String, Object>>>() {});
   return removals == null ? Collections.emptyList() : removals;
  } catch (Exception e) {
   throw new IllegalArgumentException("The selected GSTIN removal list is invalid.", e);
  }
 }

 private boolean isGstinMarkedForRemoval(
     List<Map<String, Object>> requestedRemovals, String gstin) {
  for (Map<String, Object> removal : requestedRemovals) {
   if (removal != null && removal.get("gstin") != null
       && gstin.equalsIgnoreCase(removal.get("gstin").toString().replaceAll("\\s+", ""))) {
    return true;
   }
  }
  return false;
 }

 private List<ExistingGstinDetail> resolveRequestedGstinRemovals(
     List<Map<String, Object>> requestedRemovals,
     List<ExistingGstinDetail> existingDetails) {
  List<ExistingGstinDetail> targets = new ArrayList<>();
  Set<String> selectedRows = new HashSet<>();
  Pattern gstinPattern = Pattern.compile("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$");

  for (Map<String, Object> request : requestedRemovals) {
   if (request == null || request.get("gstin") == null) {
    throw new IllegalArgumentException("Each GSTIN removal must identify a GSTIN.");
   }
   String gstin = request.get("gstin").toString().replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
   if (!gstinPattern.matcher(gstin).matches()) {
    throw new IllegalArgumentException("The selected GSTIN is invalid.");
   }

   String requestedDate = request.get("effectiveFrom") == null
       ? null : request.get("effectiveFrom").toString().trim();
   if (requestedDate != null && requestedDate.isEmpty()) {
    requestedDate = null;
   }
   if (requestedDate != null) {
    validateEffectiveFromFormat(requestedDate);
   }

   List<ExistingGstinDetail> matches = new ArrayList<>();
   for (ExistingGstinDetail detail : existingDetails) {
    if (!gstin.equals(detail.gstin)) {
     continue;
    }
    if (requestedDate == null
        || requestedDate.equals(detail.effectiveFrom)
        || (requestedDate.length() == 10 && detail.effectiveFrom != null
            && detail.effectiveFrom.startsWith(requestedDate + " "))) {
     matches.add(detail);
    }
   }
   if (matches.size() != 1) {
    throw new IllegalArgumentException(matches.isEmpty()
        ? "The selected GSTIN detail record was not found for this code."
        : "The selected GSTIN matches multiple detail records. Select its effective-from date.");
   }

   ExistingGstinDetail target = matches.get(0);
   if (target.duplicateCount > 1) {
    throw new IllegalArgumentException(
        "The selected GSTIN detail row is not uniquely identifiable by code, GSTIN, and effective-from date.");
   }
   String rowKey = target.gstin + "\u0000" + (target.effectiveFrom == null ? "" : target.effectiveFrom);
   if (!selectedRows.add(rowKey)) {
    throw new IllegalArgumentException("The same GSTIN detail record cannot be selected more than once.");
   }
   targets.add(target);
  }
  return targets;
 }

 private void validateEffectiveFromFormat(String effectiveFrom) {
  try {
   if (effectiveFrom.matches("\\d{4}-\\d{2}-\\d{2}")) {
    java.time.LocalDate.parse(effectiveFrom);
   } else if (effectiveFrom.matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}")) {
    java.time.LocalDateTime.parse(effectiveFrom,
        java.time.format.DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss")
            .withResolverStyle(java.time.format.ResolverStyle.STRICT));
   } else {
    throw new IllegalArgumentException("The selected GSTIN effective-from date is invalid.");
   }
  } catch (java.time.DateTimeException e) {
   throw new IllegalArgumentException("The selected GSTIN effective-from date is invalid.", e);
  }
 }

 private void validateGstinRemovalCount(int existingCount, List<ExistingGstinDetail> targets) {
  int rowsToRemove = targets.stream().mapToInt(detail -> detail.duplicateCount).sum();
  if (!targets.isEmpty() && existingCount - rowsToRemove < 1) {
   throw new IllegalArgumentException("At least one GSTIN must remain associated with the company code.");
  }
 }

 private ExistingGstinDetail findGstinDetail(
     List<ExistingGstinDetail> details, String gstin, String effectiveFrom) {
  for (ExistingGstinDetail detail : details) {
   if (detail.gstin.equals(gstin) && Objects.equals(detail.effectiveFrom, effectiveFrom)) {
    return detail;
   }
  }
  return null;
 }

 private String buildGstinRemovalSql(
     String table, String codeColumn, String code, ExistingGstinDetail detail) {
  StringBuilder sql = new StringBuilder("UPDATE ").append(table)
      .append(" SET MADDATEEFCTTO = TRUNC(SYSDATE)")
      .append(" WHERE ").append(codeColumn).append(" = ").append(formatSqlValue(code))
      .append(" AND MAVCUSTGSTNUMB = ").append(formatSqlValue(detail.gstin));
  if (detail.effectiveFrom != null) {
   sql.append(" AND MADDATEEFCTFROM = TO_DATE(")
       .append(formatSqlValue(detail.effectiveFrom))
       .append(", 'YYYY-MM-DD HH24:MI:SS')");
  }
  sql.append(" AND MADDATEEFCTTO IS NULL;");
  return sql.toString();
 }

 private static final class ExistingGstinDetail {
  private final String gstin;
  private final String address;
  private final String effectiveFrom;
  private int duplicateCount = 1;

  private ExistingGstinDetail(String gstin, String address, String effectiveFrom) {
   this.gstin = gstin;
   this.address = address;
   this.effectiveFrom = effectiveFrom;
  }
 }

 private void validateCompanyNameLength(String companyName) {
  if (companyName != null && companyName.length() > MAX_COMPANY_NAME_LENGTH) {
   throw new IllegalArgumentException("Company name cannot exceed 40 characters.");
  }
 }

 private String normalizeNullableValue(String value) {
   if (value == null) return null;
   String trimmed = value.trim();
   return trimmed.isEmpty() || "null".equalsIgnoreCase(trimmed) ? null : trimmed;
 }

 private String normalizeUpdateComparisonValue(String column, String value) {
  String normalized = normalizeNullableValue(value);
  if (normalized == null) return null;
  if (column.equalsIgnoreCase("MAVGLBLCUSTNAME") || column.equalsIgnoreCase("MAVHNDGAGNTNAME")
      || column.equalsIgnoreCase("MAVHNDAGNTNAME")) {
   normalized = withCompanyNamePrefix(normalized);
  } else if (column.equalsIgnoreCase("MAVGLBLCUSTADDRTEXT")
      || column.equalsIgnoreCase("MAVHNDGAGNTADDRTEXT")
      || column.equalsIgnoreCase("MAVHNDAGNTADDRTEXT")) {
   normalized = normalizeAddress(normalized);
  } else if (column.equalsIgnoreCase(glblGstCol) || column.equalsIgnoreCase(hndgGstCol)) {
   normalized = normalized.replaceAll("[\\[\\]\"\\s]", "");
  }
  return normalized.trim().toUpperCase(Locale.ROOT);
 }

 public com.cris.customerportal.dto.GlobalAgentResponse lookupHandlingAgentByCode(String handlingCode) {
     initDbColumns();
     String sql = "SELECT " + hndgCodeCol + " AS MAVHNDAGNTCODE, "
         + hndgNameCol + " AS MAVHNDAGNTNAME, "
         + hndgAddrCol + " AS MAVHNDAGNTADDRTEXT, "
         + hndgCityCol + " AS MAVHNDAGNTCITYNAME,"
         + " MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, "
         + "MAVIMPLREMK, "
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
       response.setDivision(rs.getString("MAVIMPLREMK"));
       response.setPanNumber(rs.getString("MAVCUSTPANNUMB"));
       response.setStatus("Active");

       List<com.cris.customerportal.dto.PanGstinRecord> details = fetchGstinDetails(
           conn, "MEMGLBLHNDGAGNTDTLS", "MAVHNDGAGNTCODE", response.getCode(),
           "MAVHNDGAGNTADDRTEXT", "MAVHNDGAGNTCITYNAME");
       response.setGstins(details);
       response.setGstinNumbers(details.isEmpty() ? null : details.stream()
           .map(com.cris.customerportal.dto.PanGstinRecord::getGstin)
           .collect(Collectors.joining(",")));
       return response;
      } else {
       throw new ResourceNotFoundException("Handling agent code not found.");
      }
     }
    } catch (SQLException e) {
     log.error("CustomerServiceImpl.lookupHandlingAgentByCode: SQLState={} ErrorCode={} stackTrace={}",
             e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
     throw new RuntimeException("Database error occurred while fetching handling agent data", e);
    }
  }


 // ===== Ownership: MEMWGONOWNRSHIP =====

 public java.util.Map<String, String> lookupGlobalCustomerForOwnership(String ownershipCode) {
   initDbColumns();
   String sql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, "
       + "MAVCUSTPANNUMB, "
       + glblCityCol + " AS MAVGNBLCUSTCITYNAME, MAVPCOCODE "
       + "FROM MEMGLBLCUST WHERE UPPER(TRIM(MAVGLBLCUSTCODE)) = ?";
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, ownershipCode == null ? null : ownershipCode.trim().toUpperCase(Locale.ROOT));
    try (ResultSet rs = ps.executeQuery()) {
     if (rs.next()) {
      java.util.Map<String, String> result = new java.util.LinkedHashMap<>();
      result.put("ownershipCode", rs.getString("MAVGLBLCUSTCODE"));
      result.put("ownershipDesc", rs.getString("MAVGLBLCUSTNAME"));
      result.put("address", rs.getString("MAVGLBLCUSTADDRTEXT"));
      result.put("panNumber", rs.getString("MAVCUSTPANNUMB"));
      result.put("city", rs.getString("MAVGNBLCUSTCITYNAME"));
      result.put("pincode", rs.getString("MAVPCOCODE"));

      List<String> gstins = fetchGstinsForGlobalCustomer(conn, rs.getString("MAVGLBLCUSTCODE"));
      result.put("gstinNumbers", gstins.isEmpty() ? null : String.join(",", gstins));
      return result;
     }
     return null;
    }
   } catch (SQLException e) {
    log.error("CustomerServiceImpl.lookupGlobalCustomerForOwnership: SQLState={} ErrorCode={} stackTrace={}",
            e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
    throw new RuntimeException("Database error while looking up global customer code: " + e.getMessage(), e);
   }
  }

 public java.util.Map<String, String> lookupOwnershipJDBC(String ownershipCode) {
  String normalizedCode = normalizeOwnershipCode(ownershipCode);
  Map<String, String> existing = lookupExistingOwnershipRecord(normalizedCode);
  Map<String, String> globalCustomer = lookupGlobalCustomerForOwnership(normalizedCode);

  if (globalCustomer != null) {
   globalCustomer.put("recordSource", existing != null ? "EXISTING_OWNERSHIP_RECORD" : "NEW_RECORD_FROM_GLOBAL_CUSTOMER");
   if (existing != null) {
    globalCustomer.put("existingOwnershipDesc", existing.get("ownershipDesc"));
   }
   return globalCustomer;
  }

  return null;
 }

 public void saveOwnershipJDBC(String ownershipCode, String ownershipDesc) {
  submitOwnershipJDBC(ownershipCode, ownershipDesc, null, null);
 }

 public boolean checkOwnershipDuplicate(String ownershipCode) {
  if (ownershipCode == null || ownershipCode.trim().isEmpty()) return false;
  String sql = "SELECT COUNT(*) FROM MEMWGONOWNRSHIP WHERE UPPER(TRIM(MAVWGONOWNRSHIPCODE)) = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, ownershipCode.trim().toUpperCase(Locale.ROOT));
   try (ResultSet rs = ps.executeQuery()) {
    return rs.next() && rs.getInt(1) > 0;
   }
  } catch (SQLException e) {
   log.error("CustomerServiceImpl.checkOwnershipDuplicate: SQLState={} ErrorCode={} stackTrace={}",
           e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
   throw new RuntimeException("Database error while checking ownership code: " + e.getMessage(), e);
  }
 }

 public void submitOwnershipJDBC(String ownershipCode, String ownershipDesc, String partyCode, String partyDesc) {
  boolean hasOwnership = ownershipCode != null && !ownershipCode.trim().isEmpty();
  boolean hasParty = partyCode != null && !partyCode.trim().isEmpty();
  log.info("CustomerServiceImpl.submitOwnershipJDBC: Ownership request received ownershipCodePresent={} partyCodePresent={}",
      hasOwnership, hasParty);
  if (!hasOwnership && !hasParty) throw new IllegalArgumentException("At least one ownership code is required.");

  String normalizedOwnershipCode = hasOwnership ? normalizeOwnershipCode(ownershipCode) : null;
  String normalizedPartyCode = hasParty ? normalizeOwnershipCode(partyCode) : null;
  if (hasOwnership) {
   Map<String, String> globalCustomer = lookupGlobalCustomerForOwnership(normalizedOwnershipCode);
   if (globalCustomer == null) throw invalidOwnershipCode();
   ownershipDesc = globalCustomer.get("ownershipDesc");
  }
  if (hasParty) {
   if (hasOwnership && normalizedOwnershipCode.equals(normalizedPartyCode)) {
    partyDesc = ownershipDesc;
   } else {
    Map<String, String> globalCustomer = lookupGlobalCustomerForOwnershipParty(normalizedPartyCode);
    if (globalCustomer == null) throw invalidOwnershipCode();
    partyDesc = globalCustomer.get("partyDesc");
   }
  }

  List<DbaEmailService.SqlRequest> statements = new ArrayList<>();
  String ownershipSql = null;
  if (hasOwnership) {
   ownershipSql = generateOwnershipSql(ownershipCode, ownershipDesc);
   logGeneratedOwnershipSql("MEMWGONOWNRSHIP", ownershipSql);
   if (ownershipSql != null) {
    statements.add(new DbaEmailService.SqlRequest(
        ownershipSql.startsWith("INSERT") ? "INSERT" : "UPDATE",
        "MEMWGONOWNRSHIP",
        ownershipCode.trim().toUpperCase(Locale.ROOT),
        ownershipSql));
   }
  }
  if (hasParty || (ownershipSql != null && ownershipSql.startsWith("INSERT"))) {
   String resolvedPartyCode = hasParty ? partyCode : ownershipCode;
   String resolvedPartyDesc = hasParty ? partyDesc : ownershipDesc;
   String sql = generateOwnershipPartySql(resolvedPartyCode, resolvedPartyDesc);
   logGeneratedOwnershipSql("MEMWGONOWNRPRTY", sql);
   if (sql != null) {
    statements.add(new DbaEmailService.SqlRequest(
        sql.startsWith("INSERT") ? "INSERT" : "UPDATE",
        "MEMWGONOWNRPRTY",
        resolvedPartyCode.trim().toUpperCase(Locale.ROOT),
        sql));
   }
  }

  if (statements.isEmpty()) throw new IllegalArgumentException("No changes detected for the ownership records.");
  String tables = statements.stream()
      .map(DbaEmailService.SqlRequest::table)
      .collect(java.util.stream.Collectors.joining(", "));
  String sqlForLog = statements.stream()
      .map(statement -> DataMaskingUtil.maskSqlLiteralsForLog(statement.sql()))
      .collect(java.util.stream.Collectors.joining("\n"));
  log.info("CustomerServiceImpl.submitOwnershipJDBC: Combined SQL passed to email utility statements={} tables={}\n{}",
      statements.size(), tables, sqlForLog);
  dbaEmailService.sendDbaSqlEmail(statements);
 }

 private void logGeneratedOwnershipSql(String table, String sql) {
  log.info("CustomerServiceImpl.submitOwnershipJDBC: {} query generated operation={} sql={}",
      table, sql == null ? "NONE" : sql.startsWith("INSERT") ? "INSERT" : "UPDATE",
      DataMaskingUtil.maskSqlLiteralsForLog(sql));
 }

 private String generateOwnershipSql(String ownershipCode, String ownershipDesc) {
  String normalizedCode = normalizeOwnershipCode(ownershipCode);
  Map<String, String> existing = lookupExistingOwnershipRecord(normalizedCode);
  if (existing != null) {
   if (!isCompanyNameDifferent(existing.get("ownershipDesc"), ownershipDesc)) return null;
   return generateOwnershipUpdateSql(normalizedCode, ownershipDesc);
  }
  return "INSERT INTO MEMWGONOWNRSHIP VALUES("
      + formatSqlValue(normalizedCode) + ","
      + formatSqlValue(withOwnershipDescriptionPrefix(ownershipDesc))
      + ",NULL,'Y',SYSDATE,NULL);";
 }

 private String generateOwnershipUpdateSql(String ownershipCode, String ownershipDesc) {
  return "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = " + formatSqlValue(withOwnershipDescriptionPrefix(ownershipDesc))
      + " WHERE MAVWGONOWNRSHIPCODE = " + formatSqlValue(normalizeOwnershipCode(ownershipCode)) + ";";
 }

 private boolean isCompanyNameDifferent(String currentDesc, String newDesc) {
  if (currentDesc == null && newDesc == null) return false;
  if (currentDesc == null || newDesc == null) return true;
  String norm1 = stripMsPrefix(currentDesc).trim().toUpperCase(Locale.ROOT);
  String norm2 = stripMsPrefix(newDesc).trim().toUpperCase(Locale.ROOT);
  return !norm1.equals(norm2);
 }

 private String stripMsPrefix(String desc) {
  if (desc == null) return "";
  String trimmed = desc.trim();
  if (trimmed.length() >= 3 && trimmed.regionMatches(true, 0, "M/S", 0, 3)) {
   int idx = 3;
   while (idx < trimmed.length() && (trimmed.charAt(idx) == '.' || Character.isWhitespace(trimmed.charAt(idx)))) {
    idx++;
   }
   return trimmed.substring(idx).trim();
  }
  return trimmed;
 }

 private Map<String, String> lookupExistingOwnershipRecord(String ownershipCode) {
  String sql = "SELECT MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC FROM MEMWGONOWNRSHIP "
      + "WHERE UPPER(TRIM(MAVWGONOWNRSHIPCODE)) = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, ownershipCode);
   try (ResultSet rs = ps.executeQuery()) {
    if (!rs.next()) return null;
    Map<String, String> result = new LinkedHashMap<>();
    result.put("ownershipCode", rs.getString("MAVWGONOWNRSHIPCODE"));
    result.put("ownershipDesc", rs.getString("MAVWGONOWNRSHIPDESC"));
    return result;
   }
  } catch (SQLException e) {
   log.error("CustomerServiceImpl.lookupOwnershipJDBC: SQLState={} ErrorCode={} stackTrace={}",
           e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
   throw new RuntimeException("Database error while looking up ownership code: " + e.getMessage(), e);
  }
 }

 // ===== Ownership Party: MEMWGONOWNRPRTY =====

 public java.util.Map<String, String> lookupGlobalCustomerForOwnershipParty(String partyCode) {
   initDbColumns();
   String sql = "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, "
       + "MAVCUSTPANNUMB, "
       + glblCityCol + " AS MAVGNBLCUSTCITYNAME, MAVPCOCODE "
       + "FROM MEMGLBLCUST WHERE UPPER(TRIM(MAVGLBLCUSTCODE)) = ?";
   try (Connection conn = dataSource.getConnection();
        PreparedStatement ps = conn.prepareStatement(sql)) {
    ps.setString(1, partyCode == null ? null : partyCode.trim().toUpperCase(Locale.ROOT));
    try (ResultSet rs = ps.executeQuery()) {
     if (rs.next()) {
      java.util.Map<String, String> result = new java.util.LinkedHashMap<>();
      result.put("partyCode", rs.getString("MAVGLBLCUSTCODE"));
      result.put("partyDesc", rs.getString("MAVGLBLCUSTNAME"));
      result.put("address", rs.getString("MAVGLBLCUSTADDRTEXT"));
      result.put("panNumber", rs.getString("MAVCUSTPANNUMB"));
      result.put("city", rs.getString("MAVGNBLCUSTCITYNAME"));
      result.put("pincode", rs.getString("MAVPCOCODE"));

      List<String> gstins = fetchGstinsForGlobalCustomer(conn, rs.getString("MAVGLBLCUSTCODE"));
      result.put("gstinNumbers", gstins.isEmpty() ? null : String.join(",", gstins));
      return result;
     }
     return null;
    }
   } catch (SQLException e) {
    log.error("CustomerServiceImpl.lookupGlobalCustomerForOwnershipParty: SQLState={} ErrorCode={} stackTrace={}",
            e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
    throw new RuntimeException("Database error while looking up global customer code: " + e.getMessage(), e);
   }
  }

 public java.util.Map<String, String> lookupOwnershipPartyJDBC(String partyCode) {
  String normalizedCode = normalizeOwnershipCode(partyCode);
  Map<String, String> existingParty = lookupExistingOwnershipPartyRecord(normalizedCode);
  Map<String, String> globalCustomer = lookupGlobalCustomerForOwnershipParty(normalizedCode);

  if (globalCustomer != null) {
   globalCustomer.put("recordSource", existingParty != null ? "EXISTING_OWNERSHIP_RECORD" : "NEW_RECORD_FROM_GLOBAL_CUSTOMER");
   if (existingParty != null) {
    globalCustomer.put("existingPartyDesc", existingParty.get("partyDesc"));
   }
   return globalCustomer;
  }

  return null;
 }

 public void saveOwnershipPartyJDBC(String partyCode, String partyDesc) {
  String normalizedCode = normalizeOwnershipCode(partyCode);
  if (lookupExistingOwnershipRecord(normalizedCode) == null) {
   submitOwnershipJDBC(normalizedCode, partyDesc, normalizedCode, partyDesc);
   return;
  }
  submitOwnershipJDBC(null, null, partyCode, partyDesc);
 }

 public boolean checkOwnershipPartyDuplicate(String partyCode) {
  if (partyCode == null || partyCode.trim().isEmpty()) return false;
  String sql = "SELECT COUNT(*) FROM MEMWGONOWNRPRTY WHERE UPPER(TRIM(MAVWGONOWNRPRTYCODE)) = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, partyCode.trim().toUpperCase(Locale.ROOT));
   try (ResultSet rs = ps.executeQuery()) {
    return rs.next() && rs.getInt(1) > 0;
   }
  } catch (SQLException e) {
   log.error("CustomerServiceImpl.checkOwnershipPartyDuplicate: SQLState={} ErrorCode={} stackTrace={}",
           e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
   throw new RuntimeException("Database error while checking ownership party code: " + e.getMessage(), e);
  }
 }

 private String generateOwnershipPartySql(String partyCode, String partyDesc) {
  String normalizedCode = normalizeOwnershipCode(partyCode);
  Map<String, String> existing = lookupExistingOwnershipPartyRecord(normalizedCode);
  if (existing != null) {
   if (Objects.equals(normalizeOracleValue(existing.get("partyDesc")), normalizeOracleValue(partyDesc))) return null;
   return "UPDATE MEMWGONOWNRPRTY SET MAVWGONOWNRPRTYDESC = " + formatSqlValue(partyDesc)
       + " WHERE MAVWGONOWNRPRTYCODE = " + formatSqlValue(normalizedCode) + ";";
  }
  return "INSERT INTO MEMWGONOWNRPRTY VALUES("
      + formatSqlValue(normalizedCode) + ","
      + formatSqlValue(withOwnershipDescriptionPrefix(partyDesc)) + ");";
 }

 private String generateOwnershipPartyUpdateSql(String partyCode, String partyDesc) {
  return "UPDATE MEMWGONOWNRPRTY SET MAVWGONOWNRPRTYDESC = " + formatSqlValue(withOwnershipDescriptionPrefix(partyDesc))
      + " WHERE MAVWGONOWNRPRTYCODE = " + formatSqlValue(normalizeOwnershipCode(partyCode)) + ";";
 }

 private String withOwnershipDescriptionPrefix(String description) {
  String normalized = description == null ? "" : description.trim();
  if (hasCompanyNamePrefix(normalized)) {
   if (normalized.length() == 3) {
    return "M/S";
   }
   if (Character.isWhitespace(normalized.charAt(3))) {
    return "M/S " + normalized.substring(3).trim();
   }
   return normalized;
  }
  return "M/S " + normalized;
 }

 private Map<String, String> lookupExistingOwnershipPartyRecord(String partyCode) {
  String sql = "SELECT MAVWGONOWNRPRTYCODE, MAVWGONOWNRPRTYDESC FROM MEMWGONOWNRPRTY "
      + "WHERE UPPER(TRIM(MAVWGONOWNRPRTYCODE)) = ?";
  try (Connection conn = dataSource.getConnection();
       PreparedStatement ps = conn.prepareStatement(sql)) {
   ps.setString(1, partyCode);
   try (ResultSet rs = ps.executeQuery()) {
    if (!rs.next()) return null;
    Map<String, String> result = new LinkedHashMap<>();
    result.put("partyCode", rs.getString("MAVWGONOWNRPRTYCODE"));
    result.put("partyDesc", rs.getString("MAVWGONOWNRPRTYDESC"));
    return result;
   }
  } catch (SQLException e) {
   log.error("CustomerServiceImpl.lookupOwnershipPartyJDBC: SQLState={} ErrorCode={} stackTrace={}",
           e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
   throw new RuntimeException("Database error while looking up ownership party code: " + e.getMessage(), e);
  }
 }

 private String normalizeOwnershipCode(String code) {
  if (code == null || !code.trim().matches("(?i)[a-z0-9]+")) {
   throw new IllegalArgumentException(
       "This code does not exist in the Ownership table or Global Customer table. Please enter a valid Global Customer Code.");
  }
  return code.trim().toUpperCase(Locale.ROOT);
 }

 private IllegalArgumentException invalidOwnershipCode() {
  return new IllegalArgumentException(
      "This code does not exist in the Ownership table or Global Customer table. Please enter a valid Global Customer Code.");
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
     log.error("CustomerServiceImpl.lookupOwnershipCustomerByCode: SQLState={} ErrorCode={} stackTrace={}",
             e.getSQLState(), e.getErrorCode(), DataMaskingUtil.formatThrowable(e));
   throw new RuntimeException("Database mapping error: Ownership columns must be mapped in SQL before this function can execute.", e);
  }
 }

 public void updateOwnershipCustomerJDBC(java.util.Map<String, String> formData) {
  throw new IllegalStateException("The legacy ownership update has no valid Oracle column mapping. Use the ownership request workflow.");
 }
}
