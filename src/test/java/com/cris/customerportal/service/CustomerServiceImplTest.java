package com.cris.customerportal.service;

import com.cris.customerportal.repository.CustomerGstinRepository;
import com.cris.customerportal.repository.CustomerRepository;
import com.cris.customerportal.audit.DatabaseOperationAudit;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class CustomerServiceImplTest {

    @Test
    void registerNewGlobalCustomer_shouldEmailExecutedInsertWithFormattedStringValues() throws SQLException {
        CustomerRepository customerRepository = mock(CustomerRepository.class);
        CustomerGstinRepository gstinRepository = mock(CustomerGstinRepository.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement insertPs = mock(PreparedStatement.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(insertPs);
        when(insertPs.executeUpdate()).thenReturn(1);

        CustomerServiceImpl service = new CustomerServiceImpl(customerRepository, gstinRepository, "uploads", dataSource);
        ReflectionTestUtils.setField(service, "dbaEmailService",
            new DbaEmailService(mailSender, "audit@example.com", "dba@example.com"));
        service.registerNewEntryJDBC(Map.of(
            "codeType", "global",
            "customerCode", "ABCD",
            "companyName", " Acme & Sons Ltd ",
            "address", "Address",
            "city", "Nagpur",
            "pincode", "828112",
            "operatingDivision", "Nagpur (NGP)",
            "gstinNumbers", "27AAECR3577NLZE",
            "panNumber", "AAECR3577N"
        ));

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(2000)).send(messageCaptor.capture());
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getTo()).containsAll(
            java.util.List.of("dba@example.com", "mondal.prasanta@cris.org.in")
        ));
        assertFalse(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("sharma.ashish@cris.org.in"));
        assertFalse(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("rajeevsiloiya@cris.org.in"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("audit@example.com"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("malhotra.poonam@cris.org.in"));
        String emailBody = java.util.Objects.requireNonNull(messageCaptor.getValue().getText());
        assertTrue(emailBody.startsWith(
            "Dear DBA Team,\n\nKindly execute attached/below script on rfrn3t and training.\n\nSQL QUERY:\n" +
                "----------------------------------------1 INSERT---------------------------\n\n"
        ));
        assertTrue(emailBody.contains(
            "INSERT INTO MEMGLBLCUST VALUES ('ABCD', 'M/S ACME AND SONS LTD', 'ADDRESS', 'NAGPUR', NULL, NULL, NULL, SYSDATE, 'SR.DCM/NCP', NULL, '27AAECR3577NLZE', 'AAECR3577N');"
        ));
        assertTrue(emailBody.endsWith(
            "---\n\nPrasanta Mondal\nChief Manager / FOIS\nCentre for Railway Information Systems\nMob:-8130797454"
        ));
        verify(insertPs).setString(2, "Acme & Sons Ltd");
        verify(insertPs).setString(6, null);
        verify(insertPs).setString(8, "SR.DCM/NCP");
        verify(connection).prepareStatement(
            "INSERT INTO MEMGLBLCUST (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME, MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, MADEDMNDDATE, MAVCUSTGSTNUMB, MAVCUSTPANNUMB) VALUES (?, ?, ?, ?, ?, ?, ?, SYSDATE, ?, NULL, ?, ?)"
        );
        assertFalse(emailBody.contains("Nagpur (NGP)"));
    }

    @Test
    void registerNewGlobalCustomer_shouldNotDuplicateExistingCompanyPrefixInEmail() throws SQLException {
        CustomerRepository customerRepository = mock(CustomerRepository.class);
        CustomerGstinRepository gstinRepository = mock(CustomerGstinRepository.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement insertPs = mock(PreparedStatement.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(insertPs);
        when(insertPs.executeUpdate()).thenReturn(1);

        CustomerServiceImpl service = new CustomerServiceImpl(customerRepository, gstinRepository, "uploads", dataSource);
        ReflectionTestUtils.setField(service, "dbaEmailService",
            new DbaEmailService(mailSender, "audit@example.com", "dba@example.com"));
        service.registerNewEntryJDBC(Map.of(
            "codeType", "global",
            "customerCode", "RAOT",
            "companyName", "  m/s RAO TRADERS ",
            "address", "Address",
            "city", "Nagpur",
            "operatingDivision", "Nagpur (NGP)",
            "gstinNumbers", "27AAECR3577NLZE",
            "panNumber", "AAECR3577N"
        ));

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(2000)).send(messageCaptor.capture());
        String emailBody = java.util.Objects.requireNonNull(messageCaptor.getValue().getText());
        assertTrue(emailBody.contains("'M/S RAO TRADERS'"));
        assertFalse(emailBody.contains("'M/S M/S RAO TRADERS'"));
        verify(insertPs).setString(2, "m/s RAO TRADERS");
    }

    @Test
    void registerNewGlobalCustomer_shouldUseDivisionCodeFromSelectedDivision() throws SQLException {
        CustomerRepository customerRepository = mock(CustomerRepository.class);
        CustomerGstinRepository gstinRepository = mock(CustomerGstinRepository.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement insertPs = mock(PreparedStatement.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(insertPs);
        when(insertPs.executeUpdate()).thenReturn(1);

        CustomerServiceImpl service = new CustomerServiceImpl(customerRepository, gstinRepository, "uploads", dataSource);
        ReflectionTestUtils.setField(service, "dbaEmailService",
            new DbaEmailService(mailSender, "audit@example.com", "dba@example.com"));
        service.registerNewEntryJDBC(Map.of(
            "codeType", "global",
            "customerCode", "EFGH",
            "companyName", "Example Ltd",
            "address", "Address",
            "city", "Dhanbad",
            "operatingDivision", "Dhanbad (DHN)",
            "gstinNumbers", "20AAECR3577NLZE",
            "panNumber", "AAECR3577N"
        ));

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(2000)).send(messageCaptor.capture());
        String emailBody = java.util.Objects.requireNonNull(messageCaptor.getValue().getText());
        assertTrue(emailBody.contains("----------------------------------------1 INSERT---------------------------"));
        assertTrue(emailBody.contains(
            "'EFGH', 'M/S EXAMPLE LTD', 'ADDRESS', 'DHANBAD', NULL, NULL, NULL, SYSDATE, 'SR.DCM/DHN', NULL, '20AAECR3577NLZE', 'AAECR3577N')"
        ));
        verify(insertPs).setString(6, null);
        verify(insertPs).setString(8, "SR.DCM/DHN");
        assertFalse(emailBody.contains("Dhanbad (DHN)"));
    }

    @Test
    void divisionDesignationResolver_shouldUseSelectedDivisionCode() {
        assertTrue("SR.DCM/SDAH".equals(DivisionDesignationResolver.resolve("Sealdah (SDAH)")));
    }

    @Test
    void dbaAuditEmail_shouldCopyConfiguredSenderMailbox() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService service = new DbaEmailService(mailSender, "audit@example.com", "dba@example.com");
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType("INSERT");
        audit.setTableName("MEMGLBLCUST");
        audit.setCustomerCode("ABCD");
        audit.setSqlStatement("INSERT INTO RailTable (MixedColumn, created_date) VALUES ('rail&co', SYSDATE);");

        service.sendDbaAuditEmail(audit);

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getTo()).contains("dba@example.com"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("audit@example.com"));
        assertFalse(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("sharma.ashish@cris.org.in"));
        assertFalse(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("rajeevsiloiya@cris.org.in"));
        assertTrue(messageCaptor.getValue().getText().contains(
            "INSERT INTO RailTable (MixedColumn, created_date) VALUES ('RAIL AND CO', SYSDATE);"
        ));
        assertTrue(messageCaptor.getValue().getText().contains(
            "----------------------------------------1 INSERT---------------------------"
        ));
        assertTrue(messageCaptor.getValue().getText().contains("Mob:-8130797454"));
    }

    @Test
    void dbaAuditEmail_shouldRemoveColumnListFromGlobalCustomerInsert() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService service = new DbaEmailService(mailSender, "audit@example.com", "dba@example.com");
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType("INSERT");
        audit.setTableName("MEMGLBLCUST");
        audit.setSqlStatement(
            "INSERT INTO MEMGLBLCUST (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME, MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, MADEDMNDDATE, MAVCUSTGSTNUMB, MAVCUSTPANNUMB) " +
                "VALUES ('MAHA', 'Maharashtra Transport Company', '14/8117, Shiv Colony, Pachora, Jalgaon. Maharashtra, 424201', 'Jalgaon', NULL, NULL, NULL, SYSDATE, 'SR.DCM/BSL', NULL, '27AAKFM6847M1ZI', 'AAKFM6847M')"
        );

        service.sendDbaAuditEmail(audit);

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        String emailBody = java.util.Objects.requireNonNull(messageCaptor.getValue().getText());
        assertTrue(emailBody.contains(
            "INSERT INTO MEMGLBLCUST VALUES ('MAHA', 'MAHARASHTRA TRANSPORT COMPANY', '14/8117, SHIV COLONY, PACHORA, JALGAON. MAHARASHTRA, 424201', 'JALGAON', NULL, NULL, NULL, SYSDATE, 'SR.DCM/BSL', NULL, '27AAKFM6847M1ZI', 'AAKFM6847M')"
        ));
        assertFalse(emailBody.contains("INSERT INTO MEMGLBLCUST ("));
    }

    @Test
    void dbaAuditEmail_shouldRemoveColumnListFromHandlingAgentInsert() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService service = new DbaEmailService(mailSender, "audit@example.com", "dba@example.com");
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType("INSERT");
        audit.setTableName("MEMGLBLHNDGAGNT");
        audit.setSqlStatement(
            "INSERT INTO MEMGLBLHNDGAGNT (MAVHNDGAGNTCODE, MAVHNDGAGNTNAME, MAVHNDGAGNTADDRTEXT, MAVHNDGAGNTCITYNAME, MADEDMNDDATE) " +
                "VALUES ('MSBE', 'M/s Balaji Enterprises', 'NA, Jangalpur, Govindpur, Dhanbad, Jharkhand, 828112', 'Dhanbad', SYSDATE)"
        );

        service.sendDbaAuditEmail(audit);

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        String emailBody = java.util.Objects.requireNonNull(messageCaptor.getValue().getText());
        assertTrue(emailBody.contains(
            "INSERT INTO MEMGLBLHNDGAGNT VALUES ('MSBE', 'M/S BALAJI ENTERPRISES', 'NA, JANGALPUR, GOVINDPUR, DHANBAD, JHARKHAND, 828112', 'DHANBAD', SYSDATE)"
        ));
        assertFalse(emailBody.contains("INSERT INTO MEMGLBLHNDGAGNT ("));
    }

    @Test
    void updateOldCustomer_shouldEmailOnlyChangedCompanyName() throws SQLException {
        String emailBody = updateAndCaptureEmail(
            Map.of(
                "codeType", "global",
                "customerCode", "TRIS",
                "companyName", "TRISHA MINERALS AND LOGISTIC"
            ),
            Map.of(
                "MAVGLBLCUSTNAME", "Previous Name",
                "MAVGLBLCUSTADDRTEXT", "Previous Address",
                "MAVGNBLCUSTCITYNAME", "Bilaspur",
                "MAVCUSTPANNUMB", "DDCPS2730D",
                "MAVCUSTGSTNUMB", "22DDCPS2730D1Z1"
            )
        );

        assertTrue(emailBody.contains(
            "UPDATE MEMGLBLCUST\nSET MAVGLBLCUSTNAME = 'TRISHA MINERALS AND LOGISTIC'\nWHERE MAVGLBLCUSTCODE = 'TRIS';"
        ));
        assertFalse(emailBody.contains("MAVGLBLCUSTADDRTEXT"));
        assertFalse(emailBody.contains("MAVGNBLCUSTCITYNAME"));
        assertFalse(emailBody.contains("MAVCUSTPANNUMB"));
        assertFalse(emailBody.contains("MAVCUSTGSTNUMB"));
        assertFalse(emailBody.contains(", WHERE"));
    }

    @Test
    void updateOldCustomer_shouldEmailOnlyChangedAddress() throws SQLException {
        String emailBody = updateAndCaptureEmail(
            Map.of("address", "1,Azad Nagar, Masanganj Road, Masanganj, Telipara, Bilaspur, Chhattisgarh"),
            existingGlobalValues()
        );

        assertTrue(emailBody.contains(
            "UPDATE MEMGLBLCUST\nSET MAVGLBLCUSTADDRTEXT = '1,AZAD NAGAR, MASANGANJ ROAD, MASANGANJ, TELIPARA, BILASPUR, CHHATTISGARH'\nWHERE MAVGLBLCUSTCODE = 'TRIS';"
        ));
        assertFalse(emailBody.contains("MAVGLBLCUSTNAME ="));
        assertFalse(emailBody.contains(",\nWHERE"));
    }

    @Test
    void updateOldCustomer_shouldEmailOnlyChangedCompanyNameAndAddress() throws SQLException {
        String emailBody = updateAndCaptureEmail(
            Map.of(
                "companyName", "Trisha & Minerals and Logistic",
                "address", "1,Azad Nagar, Masanganj Road, Masanganj, Telipara, Bilaspur, Chhattisgarh"
            ),
            existingGlobalValues()
        );

        assertTrue(emailBody.contains(
            "UPDATE MEMGLBLCUST\nSET MAVGLBLCUSTNAME = 'TRISHA AND MINERALS AND LOGISTIC',\n"
                + "    MAVGLBLCUSTADDRTEXT = '1,AZAD NAGAR, MASANGANJ ROAD, MASANGANJ, TELIPARA, BILASPUR, CHHATTISGARH'\n"
                + "WHERE MAVGLBLCUSTCODE = 'TRIS';"
        ));
        assertFalse(emailBody.contains(",\nWHERE"));
    }

    @Test
    void updateOldCustomer_shouldEmailOnlyChangedPan() throws SQLException {
        String emailBody = updateAndCaptureEmail(
            Map.of(
                "codeType", "global",
                "customerCode", "TRIS",
                "panNumber", "ABCDE1234F"
            ),
            Map.of(
                "MAVGLBLCUSTNAME", "TRISHA MINERALS AND LOGISTIC",
                "MAVGLBLCUSTADDRTEXT", "Existing Address",
                "MAVGNBLCUSTCITYNAME", "Bilaspur",
                "MAVCUSTPANNUMB", "DDCPS2730D",
                "MAVCUSTGSTNUMB", "22DDCPS2730D1Z1"
            )
        );

        assertTrue(emailBody.contains(
            "UPDATE MEMGLBLCUST\nSET MAVCUSTPANNUMB = 'ABCDE1234F'\nWHERE MAVGLBLCUSTCODE = 'TRIS';"
        ));
        assertFalse(emailBody.contains("MAVGLBLCUSTNAME ="));
        assertFalse(emailBody.contains("MAVCUSTGSTNUMB"));
        assertFalse(emailBody.contains(", WHERE"));
    }

    @Test
    void updateOldCustomer_shouldEmailOnlyChangedCity() throws SQLException {
        String emailBody = updateAndCaptureEmail(
            Map.of("city", "Raipur"),
            existingGlobalValues()
        );

        assertTrue(emailBody.contains(
            "UPDATE MEMGLBLCUST\nSET MAVGNBLCUSTCITYNAME = 'RAIPUR'\nWHERE MAVGLBLCUSTCODE = 'TRIS';"
        ));
        assertFalse(emailBody.contains("MAVGLBLCUSTNAME ="));
        assertFalse(emailBody.contains("MAVCUSTPANNUMB"));
    }

    @Test
    void updateOldCustomer_shouldEmailOnlyChangedGstin() throws SQLException {
        String emailBody = updateAndCaptureEmail(
            Map.of(
                "codeType", "global",
                "customerCode", "TRIS",
                "gstinNumbers", "22ABCDE1234F1Z1"
            ),
            Map.of(
                "MAVGLBLCUSTNAME", "TRISHA MINERALS AND LOGISTIC",
                "MAVGLBLCUSTADDRTEXT", "Existing Address",
                "MAVGNBLCUSTCITYNAME", "Bilaspur",
                "MAVCUSTPANNUMB", "DDCPS2730D",
                "MAVCUSTGSTNUMB", "22DDCPS2730D1Z1"
            )
        );

        assertTrue(emailBody.contains(
            "UPDATE MEMGLBLCUST\nSET MAVCUSTGSTNUMB = '22ABCDE1234F1Z1'\nWHERE MAVGLBLCUSTCODE = 'TRIS';"
        ));
        assertFalse(emailBody.contains("MAVGLBLCUSTNAME ="));
        assertFalse(emailBody.contains("MAVCUSTPANNUMB"));
        assertFalse(emailBody.contains(", WHERE"));
    }

    @Test
    void updateOldCustomer_shouldEmailOnlyChangedPanAndGstin() throws SQLException {
        String emailBody = updateAndCaptureEmail(
            Map.of(
                "codeType", "global",
                "customerCode", "TRIS",
                "panNumber", "ABCDE1234F",
                "gstinNumbers", "22ABCDE1234F1Z1"
            ),
            Map.of(
                "MAVGLBLCUSTNAME", "TRISHA MINERALS AND LOGISTIC",
                "MAVGLBLCUSTADDRTEXT", "Existing Address",
                "MAVGNBLCUSTCITYNAME", "Bilaspur",
                "MAVCUSTPANNUMB", "DDCPS2730D",
                "MAVCUSTGSTNUMB", "22DDCPS2730D1Z1"
            )
        );

        assertTrue(emailBody.contains(
            "UPDATE MEMGLBLCUST\nSET MAVCUSTPANNUMB = 'ABCDE1234F',\n"
                + "    MAVCUSTGSTNUMB = '22ABCDE1234F1Z1'\nWHERE MAVGLBLCUSTCODE = 'TRIS';"
        ));
        assertFalse(emailBody.contains("MAVGLBLCUSTNAME ="));
        assertFalse(emailBody.contains("MAVGLBLCUSTADDRTEXT"));
        assertFalse(emailBody.contains("MAVGNBLCUSTCITYNAME"));
        assertFalse(emailBody.contains(", WHERE"));
    }

    @Test
    void updateOldCustomer_shouldNotEmailWhenSubmittedValuesAreUnchanged() throws SQLException {
        runUpdate(
            Map.of(),
            existingGlobalValues(),
            false,
            false
        );
    }

    @Test
    void updateOldCustomer_shouldNotEmailWhenDatabaseUpdateFails() throws SQLException {
        runUpdate(Map.of("companyName", "Changed Name"), existingGlobalValues(), true, false);
    }

    private String updateAndCaptureEmail(Map<String, String> submittedValues, Map<String, String> existingValues)
            throws SQLException {
        return runUpdate(submittedValues, existingValues, false, true);
    }

    private Map<String, String> existingGlobalValues() {
        return Map.of(
            "MAVGLBLCUSTNAME", "Previous Name",
            "MAVGLBLCUSTADDRTEXT", "Previous Address",
            "MAVGNBLCUSTCITYNAME", "Bilaspur",
            "MAVCUSTPANNUMB", "DDCPS2730D",
            "MAVCUSTGSTNUMB", "22DDCPS2730D1Z1"
        );
    }

    private String runUpdate(
            Map<String, String> changes,
            Map<String, String> existingValues,
            boolean updateFails,
            boolean expectEmail) throws SQLException {
        CustomerRepository customerRepository = mock(CustomerRepository.class);
        CustomerGstinRepository gstinRepository = mock(CustomerGstinRepository.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        PreparedStatement updatePs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs).thenReturn(updatePs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true);
        for (Map.Entry<String, String> existingValue : existingValues.entrySet()) {
            when(lookupRs.getString(existingValue.getKey())).thenReturn(existingValue.getValue());
        }
        if (updateFails) {
            when(updatePs.executeUpdate()).thenThrow(new SQLException("Update failed"));
        } else {
            when(updatePs.executeUpdate()).thenReturn(1);
        }

        CustomerServiceImpl service = new CustomerServiceImpl(customerRepository, gstinRepository, "uploads", dataSource);
        ReflectionTestUtils.setField(service, "dbaEmailService",
            new DbaEmailService(mailSender, "audit@example.com", "dba@example.com"));

        Map<String, String> submittedValues = new java.util.LinkedHashMap<>();
        submittedValues.put("codeType", "global");
        submittedValues.put("customerCode", "TRIS");
        existingValues.forEach((column, value) -> submittedValues.put(switch (column) {
            case "MAVGLBLCUSTNAME" -> "companyName";
            case "MAVGLBLCUSTADDRTEXT" -> "address";
            case "MAVGNBLCUSTCITYNAME" -> "city";
            case "MAVCUSTPANNUMB" -> "panNumber";
            case "MAVCUSTGSTNUMB" -> "gstinNumbers";
            default -> throw new IllegalArgumentException("Unexpected test column: " + column);
        }, value));
        submittedValues.putAll(changes);
        if (updateFails) {
            org.junit.jupiter.api.Assertions.assertThrows(
                RuntimeException.class,
                () -> service.updateOldCustomerJDBC(submittedValues)
            );
        } else {
            service.updateOldCustomerJDBC(submittedValues);
        }

        verify(updatePs).executeUpdate();
        verify(connection).prepareStatement(
            "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = ?, MAVGLBLCUSTADDRTEXT = ?, MAVGNBLCUSTCITYNAME = ?, MAVCUSTPANNUMB = ?, MAVCUSTGSTNUMB = ? WHERE MAVGLBLCUSTCODE = ?"
        );
        verify(updatePs).setString(1, submittedValues.get("companyName"));
        verify(updatePs).setString(2, submittedValues.get("address"));
        verify(updatePs).setString(3, submittedValues.get("city"));
        verify(updatePs).setString(4, submittedValues.get("panNumber"));
        verify(updatePs).setString(5, submittedValues.get("gstinNumbers"));
        verify(updatePs).setString(6, "TRIS");
        if (updateFails || !expectEmail) {
            verify(mailSender, never()).send(any(SimpleMailMessage.class));
            return null;
        }

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(2000)).send(messageCaptor.capture());
        String emailBody = java.util.Objects.requireNonNull(messageCaptor.getValue().getText());
        assertTrue(emailBody.startsWith(
            "Dear DBA Team,\n\nKindly execute attached/below script on rfrn3t and training.\n\nSQL QUERY:\n"
        ));
        assertTrue(emailBody.contains("----------------------------------------1 UPDATE---------------------------"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("mondal.prasanta@cris.org.in"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("malhotra.poonam@cris.org.in"));
        assertFalse(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("sharma.ashish@cris.org.in"));
        assertFalse(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("rajeevsiloiya@cris.org.in"));
        assertTrue(emailBody.endsWith(
            "---\n\nPrasanta Mondal\nChief Manager / FOIS\nCentre for Railway Information Systems\nMob:-8130797454\nNOTE: THIS IS TEST EMAIL. PLEASE DO NOT REPLY TO THIS EMAIL.\n THANK YOU\n"
        ));
        return emailBody;
    }

    @Test
    void saveOwnershipJDBC_shouldInsertOnlyOwnershipFields() throws SQLException {
        CustomerRepository customerRepository = mock(CustomerRepository.class);
        CustomerGstinRepository gstinRepository = mock(CustomerGstinRepository.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        PreparedStatement insertPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs).thenReturn(insertPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(false);
        when(insertPs.executeUpdate()).thenReturn(1);

        CustomerServiceImpl service = new CustomerServiceImpl(customerRepository, gstinRepository, "uploads", dataSource);
        ReflectionTestUtils.setField(service, "dbaEmailService",
            new DbaEmailService(mock(JavaMailSender.class), "audit@example.com", "dba@example.com"));
        service.saveOwnershipJDBC("AB12", "Test ownership");

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(connection, atLeastOnce()).prepareStatement(sqlCaptor.capture());

        assertTrue(sqlCaptor.getAllValues().stream().anyMatch(sql ->
            sql.equals("INSERT INTO MEMWGONOWNRSHIP (MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC) VALUES (?, ?)")
        ));
    }
}
