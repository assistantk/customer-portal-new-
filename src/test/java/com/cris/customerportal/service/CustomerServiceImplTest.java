package com.cris.customerportal.service;

import com.cris.customerportal.audit.DatabaseOperationAudit;
import com.cris.customerportal.repository.CustomerRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class CustomerServiceImplTest {

    @Test
    void registerNewGlobalCustomer_emailsExecutableInsertWithoutExecutingIt() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement existsPs = mock(PreparedStatement.class);
        ResultSet existsRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement("SELECT 1 FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?")).thenReturn(existsPs);
        when(existsPs.executeQuery()).thenReturn(existsRs);
        when(existsRs.next()).thenReturn(false);

        service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
            "codeType", "global",
            "customerCode", "MSBC",
            "companyName", " M/S BALAJI ENTERPRISES ",
            "address", "O'Brien Road",
            "city", "Dhanbad",
            "pincode", "440001",
            "zone", "Central Railway",
            "operatingDivision", "Dhanbad (DHN)",
            "gstinNumbers", "20APEPA6196G1Z9",
            "panNumber", "APEPA6196G"
        ));

        String body = emailedBody(mailSender);
        assertTrue(body.startsWith("Dear DBA Team,\n"
            + "Kindly execute attached/below script on rfrn3t and training.\n\n"
            + "Operation: INSERT\n"
            + "Table: MEMGLBLCUST\n"
            + "Code: MSBC\n\n"
            + "SQL QUERY:\n"
            + "----------------------------------------1 INSERT---------------------------\n\n"));
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUST VALUES ('MSBC', 'M/S BALAJI ENTERPRISES', 'O''BRIEN ROAD', 'DHANBAD', NULL, NULL, NULL, SYSDATE, 'SR.DCM/DHN', NULL, '20APEPA6196G1Z9', 'APEPA6196G');"
        ));
        assertTrue(body.contains("\n\n----------------------------------------\n\nPrasanta Mondal\n"
            + "Chief Manager / FOIS\n"
            + "Centre for Railway information systems\n"
            + "Mob:-8130797454"));
        verify(existsPs, never()).executeUpdate();
        verify(connection, never()).prepareStatement(startsWith("INSERT"));
    }

    @Test
    void registerNewGlobalCustomer_shouldNotDuplicateExistingCompanyPrefixInEmail() throws SQLException {
        CustomerRepository customerRepository = mock(CustomerRepository.class);
        CustomerGstinRepository gstinRepository = mock(CustomerGstinRepository.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement existsPs = mock(PreparedStatement.class);
        ResultSet existsRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement("SELECT 1 FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?")).thenReturn(existsPs);
        when(existsPs.executeQuery()).thenReturn(existsRs);
        when(existsRs.next()).thenReturn(false);

        service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
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
    void registerAnotherGlobalCustomer_emailsValuesOnlyInDatabaseColumnOrder() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement existsPs = mock(PreparedStatement.class);
        ResultSet existsRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement("SELECT 1 FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?")).thenReturn(existsPs);
        when(existsPs.executeQuery()).thenReturn(existsRs);
        when(existsRs.next()).thenReturn(false);

        service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
            "codeType", "global",
            "customerCode", "ASEB",
            "companyName", "AVANTIKA SOLAR ENERGY PRIVATE LIMITED",
            "address", "FLAT NO. -301, RAMAGRIHAM APTT, VIJAY NAGAR, PATNA, BIHAR, 800014",
            "city", "PATNA",
            "pincode", "800014",
            "zone", "East Central Railway",
            "operatingDivision", "Danapur (DNR)",
            "gstinNumbers", "10ABACA6462C1ZD",
            "panNumber", "ABACA6462C"
        ));

        String body = emailedBody(mailSender);
        assertTrue(body.contains("Operation: INSERT\nTable: MEMGLBLCUST\nCode: ASEB"));
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUST VALUES ('ASEB', 'M/S AVANTIKA SOLAR ENERGY PRIVATE LIMITED', "
                + "'FLAT NO. -301, RAMAGRIHAM APTT, VIJAY NAGAR, PATNA, BIHAR, 800014', 'PATNA', "
                + "NULL, NULL, NULL, SYSDATE, 'SR.DCM/DNR', NULL, '10ABACA6462C1ZD', 'ABACA6462C');"
        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(2000)).send(messageCaptor.capture());
        String emailBody = java.util.Objects.requireNonNull(messageCaptor.getValue().getText());
        assertTrue(emailBody.contains("----------------------------------------1 INSERT---------------------------"));
        assertTrue(emailBody.contains(
            "'EFGH', 'M/S EXAMPLE LTD', 'ADDRESS', 'DHANBAD', NULL, NULL, NULL, SYSDATE, 'SR.DCM/DHN', NULL, '20AAECR3577NLZE', 'AAECR3577N')"
        ));
        assertFalse(body.contains("INSERT INTO MEMGLBLCUST ("));
        verify(existsPs, never()).executeUpdate();
        verify(connection, never()).prepareStatement(startsWith("INSERT"));
    }

    @Test
    void registerGlobalCustomer_doesNotDuplicateCaseInsensitiveCompanyPrefix() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement existsPs = mock(PreparedStatement.class);
        ResultSet existsRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement("SELECT 1 FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?")).thenReturn(existsPs);
        when(existsPs.executeQuery()).thenReturn(existsRs);
        when(existsRs.next()).thenReturn(false);

        service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
            "codeType", "global",
            "customerCode", "ASEB",
            "companyName", "  m/s AVANTIKA SOLAR ENERGY PRIVATE LIMITED  ",
            "address", "Patna Road",
            "city", "Patna",
            "pincode", "800014",
            "zone", "East Central Railway",
            "operatingDivision", "Danapur (DNR)",
            "gstinNumbers", "10ABACA6462C1ZD",
            "panNumber", "ABACA6462C"
        ));

        assertTrue(emailedBody(mailSender).contains(
            "INSERT INTO MEMGLBLCUST VALUES ('ASEB', 'M/S AVANTIKA SOLAR ENERGY PRIVATE LIMITED', "
                + "'PATNA ROAD', 'PATNA', NULL, NULL, NULL, SYSDATE, 'SR.DCM/DNR', NULL, "
                + "'10ABACA6462C1ZD', 'ABACA6462C');"
        ));
    }

    @Test
    void registerHandlingAgent_emailsInsertUsingExistingColumnMappings() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement existsPs = mock(PreparedStatement.class);
        ResultSet existsRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement("SELECT 1 FROM MEMGLBLHNDGAGNT WHERE MAVHNDGAGNTCODE = ?")).thenReturn(existsPs);
        when(existsPs.executeQuery()).thenReturn(existsRs);
        when(existsRs.next()).thenReturn(false);

        service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
            "codeType", "handling_agent",
            "customerCode", "H001",
            "companyName", "Cargo Co",
            "address", "Port Road",
            "city", "Mumbai",
            "pincode", "400001",
            "zone", "Western Railway",
            "operatingDivision", "Mumbai Central",
            "gstinNumbers", "27AAAAA1111A1Z5",
            "panNumber", "AAAAA1111A"
        ));

        assertTrue(emailedBody(mailSender).contains(
            "INSERT INTO MEMGLBLHNDGAGNT (MAVHNDGAGNTCODE, MAVHNDGAGNTNAME, MAVHNDGAGNTADDRTEXT, MAVHNDGAGNTCITYNAME, MADEDMNDDATE) " +
                "VALUES ('H001', 'CARGO CO', 'PORT ROAD', 'MUMBAI', SYSDATE);"
        DbaEmailService service = new DbaEmailService(mailSender, "audit@example.com", "dba@example.com");
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType("INSERT");
        audit.setTableName("MEMGLBLCUST");
        audit.setCustomerCode("ABCD");
        audit.setSqlStatement("INSERT INTO RailTable (MixedColumn, created_date) VALUES ('rail & co', SYSDATE);");

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
        verify(existsPs, never()).executeUpdate();
    }

    @Test
    void updateOldGlobalCustomer_emailsOnlyChangedFieldsWithoutExecutingUpdate() throws SQLException {
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
        ResultSet lookupRs = mock(ResultSet.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        PreparedStatement updatePs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true);
        when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("Old Name");
        when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("Old Address");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("AAECR3577N");
        when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("27AAECR3577NLZE");
        when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("Nagpur");

        service(dataSource, mailSender).updateOldCustomerJDBC(Map.of(
            "codeType", "global",
            "customerCode", "AB12",
            "companyName", "New Name",
            "address", "O'Brien Street",
            "city", "Nagpur",
            "panNumber", "AAECR3577N",
            "gstinNumbers", "27AAECR3577NLZE"
        ));
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

        assertTrue(emailedBody(mailSender).contains(
            "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = 'NEW NAME', MAVGLBLCUSTADDRTEXT = 'O''BRIEN STREET' WHERE MAVGLBLCUSTCODE = 'AB12';"
        ));
        verify(connection).prepareStatement(contains("FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?"));
        verify(lookupPs, never()).executeUpdate();
        verify(connection, never()).prepareStatement(startsWith("UPDATE"));
    }

    @Test
    void updateOldHandlingAgent_emailsUpdateUsingHandlingAgentKey() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true);
        when(lookupRs.getString("MAVHNDAGNTNAME")).thenReturn("Old Cargo");
        when(lookupRs.getString("MAVHNDAGNTADDRTEXT")).thenReturn("Port Road");
        when(lookupRs.getString("MAVHNDAGNTCITYNAME")).thenReturn("Mumbai");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("AAAAA1111A");
        when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("27AAAAA1111A1Z5");

        service(dataSource, mailSender).updateOldCustomerJDBC(Map.of(
            "codeType", "HANDLING_AGENT",
            "customerCode", "H001",
            "companyName", "New Cargo",
            "address", "Port Road",
            "city", "Mumbai",
            "panNumber", "AAAAA1111A",
            "gstinNumbers", "27AAAAA1111A1Z5"
        ));

        assertTrue(emailedBody(mailSender).contains(
            "UPDATE MEMGLBLHNDGAGNT SET MAVHNDGAGNTNAME = 'NEW CARGO' WHERE MAVHNDGAGNTCODE = 'H001';"
        ));
        verify(lookupPs, never()).executeUpdate();
        verify(connection, never()).prepareStatement(startsWith("UPDATE"));
    }

    @Test
    void ownershipSubmission_emailsBothTableStatementsTogetherWithoutWrites() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ownershipLookup = mock(PreparedStatement.class);
        PreparedStatement partyLookup = mock(PreparedStatement.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet partyRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(ownershipLookup, partyLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(partyLookup.executeQuery()).thenReturn(partyRs);
        when(ownershipRs.next()).thenReturn(false);
        when(partyRs.next()).thenReturn(false);

        service(dataSource, mailSender).submitOwnershipJDBC("AB12", "O'Brien ownership", "PT34", "Party & Co");

        String body = emailedBody(mailSender);
        assertTrue(body.contains(
            "INSERT INTO MEMWGONOWNRSHIP (MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC, MACPRVTPRTYCODE) VALUES ('AB12', 'O''BRIEN OWNERSHIP', 'Y');"
        ));
        assertTrue(body.contains(
            "INSERT INTO MEMWGONOWNRPRTY (MAVWGONOWNRPRTYCODE, MAVWGONOWNRPRTYDESC) VALUES ('PT34', 'PARTY & CO');"
        ));
        assertTrue(body.contains("Operation: INSERT\nTable: MEMWGONOWNRSHIP\nCode: AB12\n\nSQL QUERY:\n"
            + "----------------------------------------1 INSERT---------------------------"));
        assertTrue(body.contains("Operation: INSERT\nTable: MEMWGONOWNRPRTY\nCode: PT34\n\nSQL QUERY:\n"
            + "----------------------------------------2 INSERT---------------------------"));
        assertTrue(body.indexOf("MEMWGONOWNRSHIP") < body.indexOf("MEMWGONOWNRPRTY"));
        verify(ownershipLookup, never()).executeUpdate();
        verify(partyLookup, never()).executeUpdate();
    }

    @Test
    void ownershipUpdate_emailsUpdateWhenRecordAlreadyExists() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true);
        when(lookupRs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("Existing description");

        service(dataSource, mailSender).submitOwnershipJDBC("AB12", "Updated description", null, null);

        assertTrue(emailedBody(mailSender).contains(
            "Operation: UPDATE\nTable: MEMWGONOWNRSHIP\nCode: AB12\n\nSQL QUERY:\n"
                + "----------------------------------------1 UPDATE---------------------------\n\n"
                + "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = 'UPDATED DESCRIPTION' WHERE MAVWGONOWNRSHIPCODE = 'AB12';"
        ));
        verify(lookupPs, never()).executeUpdate();
        verify(connection, never()).prepareStatement(startsWith("UPDATE"));
    }

    @Test
    void emailFailurePropagatesAndDoesNotWriteToOperationalTables() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement existsPs = mock(PreparedStatement.class);
        ResultSet existsRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(existsPs);
        when(existsPs.executeQuery()).thenReturn(existsRs);
        when(existsRs.next()).thenReturn(false);
        doThrow(new MailSendException("SMTP unavailable")).when(mailSender).send(any(SimpleMailMessage.class));

        assertThrows(MailSendException.class, () -> service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
            "codeType", "global",
            "customerCode", "ABCD",
            "companyName", "Acme Ltd",
            "address", "Main Road",
            "city", "Nagpur",
            "pincode", "440001",
            "zone", "Central Railway",
            "operatingDivision", "Nagpur (NGP)",
            "gstinNumbers", "27AAECR3577NLZE",
            "panNumber", "AAECR3577N"
        )));
        verify(existsPs, never()).executeUpdate();
    }

    @Test
    void dbaAuditEmailRetainsExistingAuditBehavior() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "audit@example.com", "dba@example.com");
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType("INSERT");
        audit.setTableName("MEMGLBLCUST");
        audit.setSqlStatement("INSERT INTO RailTable (MixedColumn) VALUES ('rail & co');");

        emailService.sendDbaAuditEmail(audit);

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertTrue(message.getValue().getText().contains("INSERT INTO RailTable (MixedColumn) VALUES ('RAIL AND CO');"));
    }

    @Test
    void dbaSqlEmailDoesNotSetCcRecipients() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");

        emailService.sendDbaSqlEmail("INSERT", "INSERT INTO TEST_TABLE VALUES ('A');");

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertNull(message.getValue().getCc());
    }

    private CustomerServiceImpl service(DataSource dataSource, JavaMailSender mailSender) {
        CustomerServiceImpl service = new CustomerServiceImpl(
            mock(CustomerRepository.class),
            dataSource);
        ReflectionTestUtils.setField(service, "dbaEmailService",
            new DbaEmailService(mailSender, "portal@example.com", "dba@example.com"));
        return service;
    }

    private String emailedBody(JavaMailSender mailSender) {
        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        return message.getValue().getText();
    }
}
