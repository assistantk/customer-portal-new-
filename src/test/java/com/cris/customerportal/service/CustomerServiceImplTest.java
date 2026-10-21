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
        ));
        verify(existsPs, never()).executeUpdate();
    }

    @Test
    void updateOldGlobalCustomer_emailsOnlyChangedFieldsWithoutExecutingUpdate() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
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
            "address", "O'Brien, Street",
            "city", "Nagpur",
            "panNumber", "AAECR3577N",
            "gstinNumbers", "27AAECR3577NLZE"
        ));

        assertTrue(emailedBody(mailSender).contains(
            "UPDATE MEMGLBLCUST SET\n"
                + "MAVGLBLCUSTNAME = 'NEW NAME',\n"
                + "MAVGLBLCUSTADDRTEXT = 'O''BRIEN, STREET'\n"
                + "WHERE MAVGLBLCUSTCODE = 'AB12';"
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
            "UPDATE MEMGLBLHNDGAGNT SET\n"
                + "MAVHNDGAGNTNAME = 'NEW CARGO'\n"
                + "WHERE MAVHNDGAGNTCODE = 'H001';"
        ));
        verify(lookupPs, never()).executeUpdate();
        verify(connection, never()).prepareStatement(startsWith("UPDATE"));
    }

    @Test
    void ownershipSubmission_updatesExistingCodeInsteadOfInsertingIt() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true);
        when(lookupRs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("SCOR");
        when(lookupRs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("SOUTH COAST RAILWAYS");

        service(dataSource, mailSender).submitOwnershipJDBC("SCOR", "South Coast Railway", null, null);

        String body = emailedBody(mailSender);
        assertTrue(body.contains(
            "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = 'SOUTH COAST RAILWAY' WHERE MAVWGONOWNRSHIPCODE = 'SCOR';"
        ));
        assertFalse(body.contains("INSERT INTO MEMWGONOWNRSHIP"));
        verify(connection).prepareStatement(contains("UPPER(TRIM(MAVWGONOWNRSHIPCODE)) = ?"));
        verify(lookupPs).setString(1, "SCOR");
    }

    @Test
    void ownershipPartySubmission_updatesExistingCodeInsteadOfInsertingIt() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true);
        when(lookupRs.getString("MAVWGONOWNRPRTYCODE")).thenReturn("SHLA");
        when(lookupRs.getString("MAVWGONOWNRPRTYDESC")).thenReturn("M/S SUSHILA TRANSPORT PVT LTD");

        service(dataSource, mailSender).submitOwnershipJDBC(null, null, "SHLA", "Sushila Transport Pvt Ltd");

        String body = emailedBody(mailSender);
        assertTrue(body.contains(
            "UPDATE MEMWGONOWNRPRTY SET MAVWGONOWNRPRTYDESC = 'SUSHILA TRANSPORT PVT LTD' "
                + "WHERE MAVWGONOWNRPRTYCODE = 'SHLA';"
        ));
        assertFalse(body.contains("INSERT INTO MEMWGONOWNRPRTY"));
        verify(connection).prepareStatement(contains("UPPER(TRIM(MAVWGONOWNRPRTYCODE)) = ?"));
        verify(lookupPs).setString(1, "SHLA");
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
    void dbaSqlEmailCopiesPoonamOnCc() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");

        emailService.sendDbaSqlEmail("INSERT", "INSERT INTO TEST_TABLE VALUES ('A');");

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertArrayEquals(new String[]{"malhotra.poonam@cris.org.in"}, message.getValue().getCc());
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
