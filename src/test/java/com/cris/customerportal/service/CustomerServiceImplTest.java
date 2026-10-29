package com.cris.customerportal.service;

import com.cris.customerportal.audit.DatabaseOperationAudit;
import com.cris.customerportal.controller.AuthController;
import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.repository.CustomerRepository;
import com.cris.customerportal.repository.JdbcPortalUserLookupRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class CustomerServiceImplTest {

    @Test
    void registerNewEntry_rejectsCompanyNameLongerThanFortyCharactersBeforeDatabaseOrEmail() {
        DataSource dataSource = mock(DataSource.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
            () -> service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
                "codeType", "global",
                "companyName", "A".repeat(41),
                "address", "Address",
                "city", "City",
                "operatingDivision", "Division",
                "zone", "Zone",
                "panNumber", "ABCDE1234F",
                "gstinNumbers", "07ABCDE1234F1Z5"
            )));

        assertEquals("Company name cannot exceed 40 characters.", error.getMessage());
        verifyNoInteractions(dataSource, mailSender);
    }

    @Test
    void generateUniqueCode_rejectsCompanyNameLongerThanFortyCharactersBeforeDatabaseLookup() {
        DataSource dataSource = mock(DataSource.class);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
            () -> service(dataSource, mock(JavaMailSender.class))
                .generateUniqueCodeJDBC("A".repeat(41), "global"));

        assertEquals("Company name cannot exceed 40 characters.", error.getMessage());
        verifyNoInteractions(dataSource);
    }

    @Test
    void lookupOldGlobalCustomer_fetchesFormFieldsWithoutDependingOnOptionalAmendmentDateColumn() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true);
        when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("SAEB");
        when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S SAMPLE COMPANY");
        when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("RAILWAY ROAD");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("ABCDE1234F");
        when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("07ABCDE1234F1Z5");
        when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("DELHI");
        when(lookupRs.getString("MAVPCOCODE")).thenReturn("110001");

        com.cris.customerportal.dto.OldCustomerResponse result =
                service(dataSource, mailSender).lookupOldCustomerByCode("saeb");

        assertEquals("M/S SAMPLE COMPANY", result.getCompanyName());
        assertEquals("RAILWAY ROAD", result.getAddress());
        assertEquals("DELHI", result.getCity());
        assertEquals("110001", result.getPincode());
        assertEquals("ABCDE1234F", result.getPanNumber());
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("MAVPCOCODE") && !sql.contains("TO_CHAR(")));
    }

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
        assertTrue(body.startsWith("Dear DBA Team,\n\n"
            + "Kindly execute the attached/below script on rfrn3t and training.\n\n"
            + "Operation: INSERT\n"
            + "Table: MEMGLBLCUST\n"
            + "Code: MSBC\n\n"
            + "SQL QUERY:\n"
            + "----------------------------------------1 INSERT---------------------------\n\n"));
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUST VALUES('MSBC','M/S BALAJI ENTERPRISES','O''BRIEN ROAD','DHANBAD',NULL,NULL,NULL,SYSDATE,'SR.DCM/DHN',NULL,'20APEPA6196G1Z9','APEPA6196G');"
        ));
        assertTrue(body.contains("Operation: INSERT\nTable: MEMGLBLCUST\nCode: MSBC\n\nSQL QUERY:\n"));
        assertFalse(body.contains("Prasanta Mondal"));
        assertFalse(body.contains("Chief Manager / FOIS"));
        assertFalse(body.contains("Centre for Railway"));
        assertFalse(body.contains("8130797454"));
        assertTrue(body.contains("UserID: Not available\nEmail ID: Not available"));
        verify(existsPs, never()).executeUpdate();
        verify(connection, never()).prepareStatement(startsWith("INSERT"));
    }

    @Test
    void registerNewGlobalCustomer_allowsBlankPincode() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement existsPs = mock(PreparedStatement.class);
        ResultSet existsRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement("SELECT 1 FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?")).thenReturn(existsPs);
        when(existsPs.executeQuery()).thenReturn(existsRs);
        when(existsRs.next()).thenReturn(false);

        assertDoesNotThrow(() -> service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
            "codeType", "global",
            "customerCode", "MSBC",
            "companyName", "M/S BALAJI ENTERPRISES",
            "address", "O'Brien Road",
            "city", "Dhanbad",
            "pincode", "",
            "zone", "Central Railway",
            "operatingDivision", "Dhanbad (DHN)",
            "gstinNumbers", "20APEPA6196G1Z9",
            "panNumber", "APEPA6196G"
        )));
        assertTrue(emailedBody(mailSender).contains("Operation: INSERT\nTable: MEMGLBLCUST\nCode: MSBC"));
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
            "INSERT INTO MEMGLBLCUST VALUES('ASEB','M/S AVANTIKA SOLAR ENERGY PRIVATE LIMITED',"
                + "'FLAT NO. -301, RAMAGRIHAM APTT, VIJAY NAGAR, PATNA, BIHAR, 800014','PATNA',"
                + "NULL,NULL,NULL,SYSDATE,'SR.DCM/DNR',NULL,'10ABACA6462C1ZD','ABACA6462C');"
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
            "companyName", "  m/s AVANTIKA SOLAR  ",
            "address", "Patna Road",
            "city", "Patna",
            "pincode", "800014",
            "zone", "East Central Railway",
            "operatingDivision", "Danapur (DNR)",
            "gstinNumbers", "10ABACA6462C1ZD",
            "panNumber", "ABACA6462C"
        ));

        assertTrue(emailedBody(mailSender).contains(
            "INSERT INTO MEMGLBLCUST VALUES('ASEB','M/S AVANTIKA SOLAR',"
                + "'PATNA ROAD','PATNA',NULL,NULL,NULL,SYSDATE,'SR.DCM/DNR',NULL,"
                + "'10ABACA6462C1ZD','ABACA6462C');"
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
            "customerCode", "JDPL",
            "companyName", "M/S JINDAL PIPES LIMITED",
            "address", "22ND MILE STONE, DELHI HAPUR ROAD",
            "city", "PARBHANI",
            "pincode", "431401",
            "zone", "South Central Railway",
            "operatingDivision", "Madurai (MDU)",
            "gstinNumbers", "09AAACJ2055K1ZJ",
            "panNumber", "AAACJ2055K"
        ));

        assertTrue(emailedBody(mailSender).contains(
            "INSERT INTO MEMGLBLHNDGAGNT VALUES ('JDPL', 'M/S JINDAL PIPES LIMITED', "
                + "'22ND MILE STONE, DELHI HAPUR ROAD', 'PARBHANI', NULL, NULL, NULL, SYSDATE, "
                + "'SR.DCM/MDU', NULL, '09AAACJ2055K1ZJ', 'AAACJ2055K');"
        ));
        assertFalse(emailedBody(mailSender).contains("INSERT INTO MEMGLBLHNDGAGNT ("));
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
                + "MAVGLBLCUSTNAME = 'M/S NEW NAME',\n"
                + "MAVGLBLCUSTADDRTEXT = 'O''BRIEN, STREET'\n"
                + "WHERE MAVGLBLCUSTCODE = 'AB12';"
        ));
        verify(connection).prepareStatement(contains("FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?"));
        verify(lookupPs, never()).executeUpdate();
        verify(connection, never()).prepareStatement(startsWith("UPDATE"));
    }

    @Test
    void updateOldGlobalCustomer_doesNotPrefixAnUnchangedCompanyNameWhenAnotherFieldChanges() throws SQLException {
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
        when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S ALPS MINING SERVICES");
        when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("Old Address");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("AAECR3577N");
        when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("27AAECR3577NLZE");
        when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("Nagpur");

        service(dataSource, mailSender).updateOldCustomerJDBC(Map.of(
            "codeType", "global",
            "customerCode", "AB12",
            "companyName", "M/S ALPS MINING SERVICES",
            "address", "New Address",
            "city", "Nagpur",
            "panNumber", "AAECR3577N",
            "gstinNumbers", "27AAECR3577NLZE"
        ));

        String body = emailedBody(mailSender);
        assertTrue(body.contains("UPDATE MEMGLBLCUST SET\nMAVGLBLCUSTADDRTEXT = 'NEW ADDRESS'\n"
            + "WHERE MAVGLBLCUSTCODE = 'AB12';"));
        assertFalse(body.contains("MAVGLBLCUSTNAME ="));
        assertFalse(body.contains("M/S NEW ADDRESS"));
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
                + "MAVHNDGAGNTNAME = 'M/S NEW CARGO'\n"
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
            "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = 'M/S SOUTH COAST RAILWAY' WHERE MAVWGONOWNRSHIPCODE = 'SCOR';"
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
            "UPDATE MEMWGONOWNRPRTY SET MAVWGONOWNRPRTYDESC = 'M/S SUSHILA TRANSPORT PVT LTD' "
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
        PreparedStatement ownershipGlobalLookup = mock(PreparedStatement.class);
        PreparedStatement partyLookup = mock(PreparedStatement.class);
        PreparedStatement partyGlobalLookup = mock(PreparedStatement.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet ownershipGlobalRs = mock(ResultSet.class);
        ResultSet partyRs = mock(ResultSet.class);
        ResultSet partyGlobalRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString()))
            .thenReturn(ownershipLookup, ownershipGlobalLookup, partyLookup, partyGlobalLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(ownershipGlobalLookup.executeQuery()).thenReturn(ownershipGlobalRs);
        when(partyLookup.executeQuery()).thenReturn(partyRs);
        when(partyGlobalLookup.executeQuery()).thenReturn(partyGlobalRs);
        when(ownershipRs.next()).thenReturn(false);
        when(ownershipGlobalRs.next()).thenReturn(true);
        when(ownershipGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(ownershipGlobalRs.getString("MAVGLBLCUSTNAME")).thenReturn("O'BRIEN OWNERSHIP");
        when(partyRs.next()).thenReturn(false);
        when(partyGlobalRs.next()).thenReturn(true);
        when(partyGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("PT34");
        when(partyGlobalRs.getString("MAVGLBLCUSTNAME")).thenReturn("PARTY & CO");

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
    void ownershipLookupsPreferExistingOwnershipTableRecord() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ownershipLookup = mock(PreparedStatement.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(ownershipLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(ownershipRs.next()).thenReturn(true);
        when(ownershipRs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("AB12");
        when(ownershipRs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("Existing ownership record");

        Map<String, String> result = service(dataSource, mailSender).lookupOwnershipJDBC("ab12");

        assertEquals("EXISTING_OWNERSHIP_RECORD", result.get("recordSource"));
        assertEquals("Existing ownership record", result.get("ownershipDesc"));
        verify(connection, times(1)).prepareStatement(anyString());
        verify(ownershipLookup).setString(1, "AB12");
    }

    @Test
    void ownershipLookupFallsBackToGlobalCustomerOnlyWhenOwnershipRecordIsAbsent() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ownershipLookup = mock(PreparedStatement.class);
        PreparedStatement globalLookup = mock(PreparedStatement.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet globalRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(ownershipLookup, globalLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(globalLookup.executeQuery()).thenReturn(globalRs);
        when(ownershipRs.next()).thenReturn(false);
        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("Global Customer Company");

        Map<String, String> result = service(dataSource, mailSender).lookupOwnershipJDBC("AB12");

        assertEquals("NEW_RECORD_FROM_GLOBAL_CUSTOMER", result.get("recordSource"));
        assertEquals("Global Customer Company", result.get("ownershipDesc"));
        verify(connection).prepareStatement(contains("FROM MEMWGONOWNRSHIP"));
        verify(connection).prepareStatement(contains("FROM MEMGLBLCUST"));
        verify(ownershipLookup).setString(1, "AB12");
        verify(globalLookup).setString(1, "AB12");
    }

    @Test
    void ownershipPartyLookupUsesItsOwnTableBeforeGlobalCustomerFallback() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement partyLookup = mock(PreparedStatement.class);
        PreparedStatement globalLookup = mock(PreparedStatement.class);
        ResultSet partyRs = mock(ResultSet.class);
        ResultSet globalRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(partyLookup, globalLookup);
        when(partyLookup.executeQuery()).thenReturn(partyRs);
        when(globalLookup.executeQuery()).thenReturn(globalRs);
        when(partyRs.next()).thenReturn(false);
        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTCODE")).thenReturn("PT34");
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("Global Party Company");

        Map<String, String> result = service(dataSource, mailSender).lookupOwnershipPartyJDBC("PT34");

        assertEquals("NEW_RECORD_FROM_GLOBAL_CUSTOMER", result.get("recordSource"));
        assertEquals("Global Party Company", result.get("partyDesc"));
        verify(connection).prepareStatement(contains("FROM MEMWGONOWNRPRTY"));
        verify(connection).prepareStatement(contains("FROM MEMGLBLCUST"));
        verify(partyLookup).setString(1, "PT34");
        verify(globalLookup).setString(1, "PT34");
    }

    @Test
    void invalidOwnershipCodeIsRejectedWithoutSendingEmail() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ownershipLookup = mock(PreparedStatement.class);
        PreparedStatement globalLookup = mock(PreparedStatement.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet globalRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(ownershipLookup, globalLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(globalLookup.executeQuery()).thenReturn(globalRs);
        when(ownershipRs.next()).thenReturn(false);
        when(globalRs.next()).thenReturn(false);
        CustomerServiceImpl customerService = service(dataSource, mailSender);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
            () -> customerService.submitOwnershipJDBC("ZZ99", "Unknown", null, null));

        assertEquals(
            "This code does not exist in the Ownership table or Global Customer table. Please enter a valid Global Customer Code.",
            error.getMessage());
        verify(connection).prepareStatement(contains("FROM MEMWGONOWNRSHIP"));
        verify(connection).prepareStatement(contains("FROM MEMGLBLCUST"));
        verify(mailSender, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void ownershipLookupDatabaseErrorBlocksDbaEmail() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenThrow(new SQLException("Oracle unavailable"));

        assertThrows(RuntimeException.class,
            () -> service(dataSource, mailSender).submitOwnershipJDBC("AB12", "Description", null, null));

        verify(mailSender, never()).send(any(SimpleMailMessage.class));
        verify(connection, never()).prepareStatement(contains("FROM MEMGLBLCUST"));
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
                + "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = 'M/S UPDATED DESCRIPTION' WHERE MAVWGONOWNRSHIPCODE = 'AB12';"
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
    void dbaSqlEmailDoesNotCopyPoonamOnCc() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");

        emailService.sendDbaSqlEmail("INSERT", "INSERT INTO TEST_TABLE VALUES ('A');");

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertNull(message.getValue().getCc());
    }

    @Test
    void dbaSqlEmailUsesAuthenticatedUserIdAndEmailInFooter() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        JdbcPortalUserLookupRepository userLookupRepository = mock(JdbcPortalUserLookupRepository.class);
        when(userLookupRepository.findUserId("RAILUSER")).thenReturn(java.util.Optional.of("DBUSER"));
        DbaEmailService emailService =
            new DbaEmailService(mailSender, "portal@example.com", "dba@example.com", userLookupRepository);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true).setAttribute(
            AuthController.AUTH_SESSION_KEY,
            new AuthUserDto("RAILUSER", "Rail User", "USER", "Y", "rail.user@example.org", "9771429950"));
        request.getSession(false).setAttribute("CURRENT_OPERATING_DIVISION", "Nagpur (NGP)");
        ServletRequestAttributes requestAttributes = new ServletRequestAttributes(request);
        RequestContextHolder.setRequestAttributes(requestAttributes);

        try {
            emailService.sendDbaSqlEmail("INSERT", "INSERT INTO TEST_TABLE VALUES ('A');");
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertTrue(message.getValue().getText().contains(
            "UserID: DBUSER\nEmail ID: rail.user@example.org\nPhone Number: 9771429950"));
        verify(userLookupRepository).findUserId("RAILUSER");
    }

    @Test
    void dbaSqlEmailUsesProfessionalDeleteTemplateWithoutSignature() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");

        emailService.sendDbaSqlEmail("DELETE", "DELETE FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = 'AB12';");

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertEquals("Request for DELETE – N/A – N/A", message.getValue().getSubject());
        String body = message.getValue().getText();
        assertTrue(body.contains("Dear DBA Team,\n\nKindly execute the attached/below script on rfrn3t and training.\n\n"));
        assertTrue(body.contains("Operation: DELETE\n"));
        assertTrue(body.contains("SQL QUERY:\n----------------------------------------1 DELETE---------------------------"));
        assertFalse(body.contains("Prasanta Mondal"));
        assertFalse(body.contains("Chief Manager / FOIS"));
        assertFalse(body.contains("8130797454"));
    }

    @Test
    void dbaDeleteRequestEmailPreservesVerifiedCodeLiteral() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        String sql = "DELETE FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = 'O''Neil' "
                + "AND MAVGLBLCUSTNAME = 'O''Neil Company';";

        emailService.sendDbaQueryEmail("DELETE", "MEMGLBLCUST", "O'Neil", "O'Neil Company", sql);

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertTrue(message.getValue().getText().contains(sql));
        assertTrue(message.getValue().getText().contains(
                "Table: MEMGLBLCUST\nCode: O'Neil\nCompany Name: O'Neil Company"));
    }

    @Test
    void dbaSqlEmailFormatsMemglblcustInsertWithoutUnnecessarySpaces() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");

        List<DbaEmailService.SqlRequest> requests = List.of(
            new DbaEmailService.SqlRequest(
                "INSERT",
                "MEMGLBLCUST",
                "JPPB",
                "INSERT INTO MEMGLBLCUST (COL1, COL2, COL3, COL4, COL5, COL6, COL7, COL8, COL9, COL10, COL11, COL12) VALUES ('JPPB', 'M/S JINDAL PARADIP PORT LIMITED', 'MADUBAN, MADHUBAN, MADHUBAN, PARADIP, JAGATSINGHAPUR, ODISHA, 754142', 'JAGATSINGHAPUR', NULL, NULL, NULL, SYSDATE, 'SR.DCM/CSTM', NULL, '21AAFCJ6524Q1ZA', 'AAFCJ6524Q');"
            )
        );

        emailService.sendDbaSqlEmail(requests);

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertTrue(message.getValue().getText().contains(
            "INSERT INTO MEMGLBLCUST VALUES('JPPB','M/S JINDAL PARADIP PORT LIMITED','MADUBAN, MADHUBAN, MADHUBAN, PARADIP, JAGATSINGHAPUR, ODISHA, 754142','JAGATSINGHAPUR',NULL,NULL,NULL,SYSDATE,'SR.DCM/CSTM',NULL,'21AAFCJ6524Q1ZA','AAFCJ6524Q');"
        ));
    }

    @Test
    void dbaUpdateEmailPrefixesAndNormalizesCompanyNamesWithoutChangingOtherAssignments() {
        assertUpdateEmailSql(
            "MEMGLBLCUST",
            "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = 'ALPS MINING SERVICES' "
                + "WHERE MAVGLBLCUSTCODE = 'ALPS';",
            "UPDATE MEMGLBLCUST SET\nMAVGLBLCUSTNAME = 'M/S ALPS MINING SERVICES'\n"
                + "WHERE MAVGLBLCUSTCODE = 'ALPS';");
        assertUpdateEmailSql(
            "MEMGLBLCUST",
            "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = 'M/S ALPS MINING SERVICES' "
                + "WHERE MAVGLBLCUSTCODE = 'ALPS';",
            "UPDATE MEMGLBLCUST SET\nMAVGLBLCUSTNAME = 'M/S ALPS MINING SERVICES'\n"
                + "WHERE MAVGLBLCUSTCODE = 'ALPS';");
        assertUpdateEmailSql(
            "MEMGLBLCUST",
            "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = '  m/S   Alps Mining Services  ' "
                + "WHERE MAVGLBLCUSTCODE = 'ALPS';",
            "UPDATE MEMGLBLCUST SET\nMAVGLBLCUSTNAME = 'M/S ALPS MINING SERVICES'\n"
                + "WHERE MAVGLBLCUSTCODE = 'ALPS';");
        assertUpdateEmailSql(
            "MEMGLBLCUST",
            "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = 'O''BRIEN MINING' "
                + "WHERE MAVGLBLCUSTCODE = 'ALPS';",
            "UPDATE MEMGLBLCUST SET\nMAVGLBLCUSTNAME = 'M/S O''BRIEN MINING'\n"
                + "WHERE MAVGLBLCUSTCODE = 'ALPS';");
        assertUpdateEmailSql(
            "MEMGLBLHNDGAGNT",
            "UPDATE MEMGLBLHNDGAGNT SET MAVHNDAGNTNAME = 'ALPS LOGISTICS' "
                + "WHERE MAVHNDAGNTCODE = 'ALPS';",
            "UPDATE MEMGLBLHNDGAGNT SET\nMAVHNDAGNTNAME = 'M/S ALPS LOGISTICS'\n"
                + "WHERE MAVHNDAGNTCODE = 'ALPS';");
        assertUpdateEmailSql(
            "MEMWGONOWNRSHIP",
            "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = 'ALPS LOGISTICS' "
                + "WHERE MAVWGONOWNRSHIPCODE = 'ALPS';",
            "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = 'M/S ALPS LOGISTICS' "
                + "WHERE MAVWGONOWNRSHIPCODE = 'ALPS';");
        assertUpdateEmailSql(
            "MEMGLBLCUST",
            "UPDATE MEMGLBLCUST SET MAVGLBLCUSTADDRTEXT = 'ALPS ROAD', MAVGNBLCUSTCITYNAME = 'ALPS' "
                + "WHERE MAVGLBLCUSTCODE = 'ALPS';",
            "UPDATE MEMGLBLCUST SET\nMAVGLBLCUSTADDRTEXT = 'ALPS ROAD',\n"
                + "MAVGNBLCUSTCITYNAME = 'ALPS'\nWHERE MAVGLBLCUSTCODE = 'ALPS';");
    }

    @Test
    void dbaAuditUpdateEmailAlsoPrefixesCompanyNameAssignments() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType("UPDATE");
        audit.setTableName("MEMGLBLCUST");
        audit.setCustomerCode("ALPS");
        audit.setSqlStatement("UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = ' alps mining ' "
            + "WHERE MAVGLBLCUSTCODE = 'ALPS';");

        emailService.sendDbaAuditEmail(audit);

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertTrue(message.getValue().getText().contains(
            "UPDATE MEMGLBLCUST SET\nMAVGLBLCUSTNAME = 'M/S ALPS MINING'\n"
                + "WHERE MAVGLBLCUSTCODE = 'ALPS';"));
    }

    private void assertUpdateEmailSql(String table, String sql, String expectedSql) {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        emailService.sendDbaSqlEmail(List.of(
            new DbaEmailService.SqlRequest("UPDATE", table, "ALPS", sql)
        ));

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertTrue(message.getValue().getText().contains(expectedSql),
            () -> "Expected email SQL:\n" + expectedSql + "\nEmail body:\n" + message.getValue().getText());
    }

    @Test
    void dbaSqlEmailUppercasesEveryMemglblcustInsertForMultipleCustomers() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        List<DbaEmailService.SqlRequest> requests = List.of(
            new DbaEmailService.SqlRequest(
                "INSERT", "memglblcust", "ab01",
                "insert into memglblcust (COL1, COL2, COL3, COL4, COL5, COL6, COL7, COL8, COL9, COL10, COL11, COL12) values ('ab01', 'm/s alpha & beta', "
                    + "'12 mixed Road, sector b', 'new town', null, null, null, sysdate, "
                    + "'sr.dcm/ab', null, 'gstinabc123', 'panabc');"
            ),
            new DbaEmailService.SqlRequest(
                "INSERT", "MEMGLBLCUST", "cd02",
                "insert into MEMGLBLCUST (COL1, COL2, COL3, COL4, COL5, COL6, COL7, COL8, COL9, COL10, COL11, COL12) values ('cd02', 'o''brien services', "
                    + "'main street, sector c', 'new delhi', null, null, null, sysdate, "
                    + "'sr.dcm/ndls', null, 'gstindef456', 'pandef');"
            )
        );

        emailService.sendDbaSqlEmail(requests);

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        String body = message.getValue().getText();
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUST VALUES('AB01','M/S ALPHA & BETA','12 MIXED ROAD, SECTOR B',"
                + "'NEW TOWN',NULL,NULL,NULL,SYSDATE,'SR.DCM/AB',NULL,'GSTINABC123','PANABC');"
        ));
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUST VALUES('CD02','O''BRIEN SERVICES','MAIN STREET, SECTOR C',"
                + "'NEW DELHI',NULL,NULL,NULL,SYSDATE,'SR.DCM/NDLS',NULL,'GSTINDEF456','PANDEF');"
        ));
    }

    @Test
    void dbaAuditEmailCompactsAndUppercasesMemglblcustInsertWithoutChangingValues() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "audit@example.com", "dba@example.com");
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType("INSERT");
        audit.setTableName("MEMGLBLCUST");
        audit.setSqlStatement(
            "insert into memglblcust (COL1, COL2, COL3, COL4, COL5, COL6, COL7, COL8, COL9, COL10, COL11, COL12) values ('ab01', 'rail & road', "
                + "'mixed case address', 'new town', null, null, null, sysdate, "
                + "'sr.dcm/ab', null, 'gstinabc123', 'panabc');"
        );

        emailService.sendDbaAuditEmail(audit);

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertTrue(message.getValue().getText().contains(
            "INSERT INTO MEMGLBLCUST VALUES('AB01','RAIL & ROAD','MIXED CASE ADDRESS','NEW TOWN',"
                + "NULL,NULL,NULL,SYSDATE,'SR.DCM/AB',NULL,'GSTINABC123','PANABC');"
        ));
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
