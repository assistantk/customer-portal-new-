package com.cris.customerportal.service;

import com.cris.customerportal.audit.DatabaseOperationAudit;
import com.cris.customerportal.controller.AuthController;
import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import com.cris.customerportal.dto.GstinDuplicateCheckResult;
import com.cris.customerportal.dto.GstinDuplicateRecord;
import com.cris.customerportal.dto.GstinRequest;
import com.cris.customerportal.exception.ResourceAlreadyExistsException;
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
import javax.validation.Validation;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
        when(lookupRs.next()).thenReturn(true, false);
        when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("SAEB");
        when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S SAMPLE COMPANY");
        when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("RAILWAY ROAD");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("ABCDE1234F");
        when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("07ABCDE1234F1Z5");
        when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("DELHI");
        when(lookupRs.getString("MAVPCOCODE")).thenReturn("110001");
        when(lookupRs.getString("MAVIMPLREMK")).thenReturn("SR.DCM/RNY");
        when(lookupRs.getString("MAVVERIFICATIONDATE")).thenReturn("2026-11-02");

        com.cris.customerportal.dto.OldCustomerResponse result =
                service(dataSource, mailSender).lookupOldCustomerByCode("saeb");

        assertEquals("M/S SAMPLE COMPANY", result.getCompanyName());
        assertEquals("RAILWAY ROAD", result.getAddress());
        assertEquals("DELHI", result.getCity());
        assertEquals("110001", result.getPincode());
        assertEquals("SR.DCM/RNY", result.getDivision());
        assertEquals("2026-11-02", result.getCreationDate());
        assertEquals("ABCDE1234F", result.getPanNumber());
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("MAVPCOCODE")
                    && sql.contains("MAVIMPLREMK")
                    && sql.contains("NVL(MADEDMNDDATE, MADIMPLDATE) AS MAVVERIFICATIONDATE")
                    && !sql.contains("TO_CHAR(")));
    }

    @Test
    void lookupOldGlobalCustomerReturnsEachGstinWithItsOwnDetailAddressAndDates() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement customerPs = mock(PreparedStatement.class);
        PreparedStatement detailsPs = mock(PreparedStatement.class);
        ResultSet customerRs = mock(ResultSet.class);
        ResultSet detailsRs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(customerPs, detailsPs);
        when(customerPs.executeQuery()).thenReturn(customerRs);
        when(detailsPs.executeQuery()).thenReturn(detailsRs);
        when(customerRs.next()).thenReturn(true, false);
        when(customerRs.getString("MAVGLBLCUSTCODE")).thenReturn("MSGG");
        when(customerRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S GREEN GLOBE TRADELINKS");
        when(customerRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("PARENT ADDRESS");
        when(detailsRs.next()).thenReturn(true, true, false);
        when(detailsRs.getString("MAVCUSTGSTNUMB")).thenReturn("07CBDPG4131J1ZS", "19CBDPG4131J1ZS");
        when(detailsRs.getString("REGISTERED_ADDRESS"))
                .thenReturn("18B LOCK GATE ROAD, DELHI", "18B LOCK GATE ROAD, KOLKATA");
        when(detailsRs.getString("CITY")).thenReturn("DELHI", "KOLKATA");
        when(detailsRs.getString("MANPINCODE")).thenReturn("110064", "700002");
        when(detailsRs.getString("IMPLEMENTATION_DATE")).thenReturn("2026-11-12", "2026-11-11");
        when(detailsRs.getString("EFFECTIVE_FROM")).thenReturn("2026-11-12", "2026-11-11");
        when(detailsRs.getString("EFFECTIVE_TO")).thenReturn(null, null);

        com.cris.customerportal.dto.OldCustomerResponse result =
                service(dataSource, mock(JavaMailSender.class)).lookupOldCustomerByCode("msgg");

        assertEquals(2, result.getGstins().size());
        assertEquals("07CBDPG4131J1ZS", result.getGstins().get(0).getGstin());
        assertEquals("18B LOCK GATE ROAD, DELHI", result.getGstins().get(0).getAddress());
        assertEquals("DELHI", result.getGstins().get(0).getCity());
        assertEquals("110064", result.getGstins().get(0).getPincode());
        assertEquals("2026-11-12", result.getGstins().get(0).getImplementationDate());
        assertEquals("2026-11-12", result.getGstins().get(0).getEffectiveFrom());
        assertNull(result.getGstins().get(0).getEffectiveTo());
        assertEquals("19CBDPG4131J1ZS", result.getGstins().get(1).getGstin());
        assertEquals("18B LOCK GATE ROAD, KOLKATA", result.getGstins().get(1).getAddress());
        assertEquals("KOLKATA", result.getGstins().get(1).getCity());
        assertEquals("700002", result.getGstins().get(1).getPincode());
        assertEquals("2026-11-11", result.getGstins().get(1).getImplementationDate());
        assertEquals("2026-11-11", result.getGstins().get(1).getEffectiveFrom());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(connection, times(2)).prepareStatement(sqlCaptor.capture());
        String detailsSql = sqlCaptor.getAllValues().get(1);
        assertTrue(detailsSql.contains("FROM MEMGLBLCUSTDTLS WHERE MAVGLBLCUSTCODE = ?"));
        assertTrue(detailsSql.contains("MAVGLBLCUSTADDRTEXT AS REGISTERED_ADDRESS"));
        assertTrue(detailsSql.contains("MADIMPLDATE"));
        assertTrue(detailsSql.contains("MADDATEEFCTFROM"));
        assertTrue(detailsSql.contains("MADDATEEFCTTO"));
        verify(detailsPs).setString(1, "MSGG");
    }

    @Test
    void handlingAgentSearchReturnsGstinSpecificDetailRows() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement agentPs = mock(PreparedStatement.class);
        PreparedStatement detailsPs = mock(PreparedStatement.class);
        ResultSet agentRs = mock(ResultSet.class);
        ResultSet detailsRs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(agentPs, detailsPs);
        when(agentPs.executeQuery()).thenReturn(agentRs);
        when(detailsPs.executeQuery()).thenReturn(detailsRs);
        when(agentRs.next()).thenReturn(true, false);
        when(agentRs.getString("MAVHNDAGNTCODE")).thenReturn("AG01");
        when(agentRs.getString("MAVHNDAGNTNAME")).thenReturn("SAMPLE AGENT");
        when(detailsRs.next()).thenReturn(true, false);
        when(detailsRs.getString("MAVCUSTGSTNUMB")).thenReturn("07CBDPG4131J1ZS");
        when(detailsRs.getString("REGISTERED_ADDRESS")).thenReturn("AGENT GSTIN ADDRESS");
        when(detailsRs.getString("CITY")).thenReturn("DELHI");
        when(detailsRs.getString("MANPINCODE")).thenReturn("110064");
        when(detailsRs.getString("IMPLEMENTATION_DATE")).thenReturn("2026-11-12");
        when(detailsRs.getString("EFFECTIVE_FROM")).thenReturn("2026-11-12");
        when(detailsRs.getString("EFFECTIVE_TO")).thenReturn("2027-11-11");

        List<com.cris.customerportal.dto.GlobalAgentResponse> results =
                service(dataSource, mock(JavaMailSender.class)).searchHandlingAgents("AG01", "CODE");

        assertEquals(1, results.size());
        assertEquals(1, results.get(0).getGstins().size());
        assertEquals("07CBDPG4131J1ZS", results.get(0).getGstins().get(0).getGstin());
        assertEquals("AGENT GSTIN ADDRESS", results.get(0).getGstins().get(0).getAddress());
        assertEquals("DELHI", results.get(0).getGstins().get(0).getCity());
        assertEquals("110064", results.get(0).getGstins().get(0).getPincode());
        assertEquals("2026-11-12", results.get(0).getGstins().get(0).getImplementationDate());
        assertEquals("2026-11-12", results.get(0).getGstins().get(0).getEffectiveFrom());
        assertEquals("2027-11-11", results.get(0).getGstins().get(0).getEffectiveTo());
        verify(detailsPs).setString(1, "AG01");
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("FROM MEMGLBLHNDGAGNTDTLS WHERE MAVHNDGAGNTCODE = ?")
                    && sql.contains("MAVHNDGAGNTADDRTEXT AS REGISTERED_ADDRESS")
                    && sql.contains("MADIMPLDATE")
                    && sql.contains("MADDATEEFCTFROM")
                    && sql.contains("MADDATEEFCTTO")));
    }

    @Test
    void lookupByGstinReturnsOnlyTheMatchingGlobalCustomerDetailRow() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection gstinConnection = mock(Connection.class);
        Connection metadataConnection = mock(Connection.class);
        Connection customerConnection = mock(Connection.class);
        Connection agentConnection = mock(Connection.class);
        PreparedStatement gstinPs = mock(PreparedStatement.class);
        PreparedStatement customerPs = mock(PreparedStatement.class);
        PreparedStatement detailsPs = mock(PreparedStatement.class);
        PreparedStatement agentPs = mock(PreparedStatement.class);
        ResultSet gstinRs = mock(ResultSet.class);
        ResultSet customerRs = mock(ResultSet.class);
        ResultSet detailsRs = mock(ResultSet.class);
        ResultSet agentRs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(
                metadataConnection, gstinConnection, customerConnection, agentConnection);
        when(metadataConnection.getMetaData()).thenReturn(null);
        when(gstinConnection.prepareStatement(anyString())).thenReturn(gstinPs);
        when(gstinPs.executeQuery()).thenReturn(gstinRs);
        when(gstinRs.next()).thenReturn(true, false);
        when(gstinRs.getString("MAVGLBLCUSTCODE")).thenReturn("MSGG");
        when(customerConnection.prepareStatement(anyString())).thenReturn(customerPs, detailsPs);
        when(customerPs.executeQuery()).thenReturn(customerRs);
        when(detailsPs.executeQuery()).thenReturn(detailsRs);
        when(customerRs.next()).thenReturn(true, false);
        when(customerRs.getString("MAVGLBLCUSTCODE")).thenReturn("MSGG");
        when(customerRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S GREEN GLOBE TRADELINKS");
        when(detailsRs.next()).thenReturn(true, true, false);
        when(detailsRs.getString("MAVCUSTGSTNUMB")).thenReturn("07CBDPG4131J1ZS", "19CBDPG4131J1ZS");
        when(detailsRs.getString("REGISTERED_ADDRESS"))
                .thenReturn("18B LOCK GATE ROAD, DELHI", "18B LOCK GATE ROAD, KOLKATA");
        when(detailsRs.getString("CITY")).thenReturn("DELHI", "KOLKATA");
        when(detailsRs.getString("MANPINCODE")).thenReturn("110064", "700002");
        when(agentConnection.prepareStatement(anyString())).thenReturn(agentPs);
        when(agentPs.executeQuery()).thenReturn(agentRs);
        when(agentRs.next()).thenReturn(false);

        List<com.cris.customerportal.dto.OldCustomerResponse> results =
                service(dataSource, mock(JavaMailSender.class)).lookupOldCustomerByGstin("07CBDPG4131J1ZS");

        assertEquals(1, results.size());
        assertEquals(1, results.get(0).getGstins().size());
        assertEquals("07CBDPG4131J1ZS", results.get(0).getGstinNumbers());
        assertEquals("18B LOCK GATE ROAD, DELHI", results.get(0).getGstins().get(0).getAddress());
        assertEquals("DELHI", results.get(0).getGstins().get(0).getCity());
        assertEquals("110064", results.get(0).getGstins().get(0).getPincode());
        verify(gstinPs).setString(1, "%07CBDPG4131J1ZS%");
    }

    @Test
    void gstinLookupReturnsDistinctHandlingAgentCodesFromTheirStoredGstinAssociation() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement customerLookup = mock(PreparedStatement.class);
        PreparedStatement agentLookup = mock(PreparedStatement.class);
        ResultSet customerRs = mock(ResultSet.class);
        ResultSet agentRs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(customerLookup, agentLookup);
        when(customerLookup.executeQuery()).thenReturn(customerRs);
        when(agentLookup.executeQuery()).thenReturn(agentRs);
        when(customerRs.next()).thenReturn(true, false);
        when(agentRs.next()).thenReturn(true, true, false);
        when(customerRs.getString("MAVGLBLCUSTCODE")).thenReturn("SAEB");
        when(customerRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S SAMPLE COMPANY");
        when(customerRs.getString("MAVCUSTGSTNUMB")).thenReturn("07ABCDE1234F1Z5");
        when(agentRs.getString(1)).thenReturn("HA01", "HA01");

        List<com.cris.customerportal.dto.OldCustomerResponse> results =
                service(dataSource, mock(JavaMailSender.class))
                    .lookupOldCustomerByGstin("07abcde1234f1z5");

        assertEquals(1, results.size());
        assertEquals(List.of("HA01"), results.get(0).getHandlingAgentCodes());
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("FROM MEMGLBLHNDGAGNTDTLS")
                    && sql.contains("MAVCUSTGSTNUMB = ?")
                    && sql.contains("SELECT DISTINCT MAVHNDGAGNTCODE")));
        verify(agentLookup).setString(1, "07ABCDE1234F1Z5");
    }

    @Test
    void gstinLookupReturnsAgentAssociationEvenWhenNoGlobalCustomerMatches() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement customerLookup = mock(PreparedStatement.class);
        PreparedStatement agentLookup = mock(PreparedStatement.class);
        ResultSet customerRs = mock(ResultSet.class);
        ResultSet agentRs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(customerLookup, agentLookup);
        when(customerLookup.executeQuery()).thenReturn(customerRs);
        when(agentLookup.executeQuery()).thenReturn(agentRs);
        when(customerRs.next()).thenReturn(false);
        when(agentRs.next()).thenReturn(true, false);
        when(agentRs.getString(1)).thenReturn("HA01");

        List<com.cris.customerportal.dto.OldCustomerResponse> results =
                service(dataSource, mock(JavaMailSender.class))
                    .lookupOldCustomerByGstin("07ABCDE1234F1Z5");

        assertEquals(1, results.size());
        assertNull(results.get(0).getCustomerCode());
        assertEquals("07ABCDE1234F1Z5", results.get(0).getGstinNumbers());
        assertEquals(List.of("HA01"), results.get(0).getHandlingAgentCodes());
    }

    @Test
    void ownershipSearchReturnsOnlyOwnershipCodeAndCompanyNameFromOwnershipMaster() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement search = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(search);
        when(search.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("ALPS");
        when(rs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("M/S ALPS MINING SERVICES PRIVATE LIMITED");

        List<Map<String, String>> results =
                service(dataSource, mock(JavaMailSender.class)).searchOwnershipCodes("alps");

        assertEquals(1, results.size());
        assertEquals(Map.of(
                "ownershipCode", "ALPS",
                "companyName", "M/S ALPS MINING SERVICES PRIVATE LIMITED"), results.get(0));
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("FROM MEMWGONOWNRSHIP")
                    && sql.contains("MAVWGONOWNRSHIPCODE")
                    && sql.contains("MAVWGONOWNRSHIPDESC")));
        verify(search).setString(1, "ALPS");
        verify(search).setString(2, "ALPS");
    }

    @Test
    void handlingAgentSearchMatchesCodeOrCompanyNameUsingMasterColumns() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement search = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(search);
        when(search.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString("MAVHNDAGNTCODE")).thenReturn("HA01");
        when(rs.getString("MAVHNDAGNTNAME")).thenReturn("M/S SAMPLE AGENT");
        when(rs.getString("MAVHNDAGNTADDRTEXT")).thenReturn("SAMPLE ROAD");
        when(rs.getString("MAVCUSTGSTNUMB")).thenReturn("07ABCDE1234F1Z5");

        List<com.cris.customerportal.dto.GlobalAgentResponse> results =
                service(dataSource, mock(JavaMailSender.class)).searchHandlingAgents("sample");

        assertEquals(1, results.size());
        assertEquals("HA01", results.get(0).getCode());
        assertEquals("M/S SAMPLE AGENT", results.get(0).getCompanyName());
        assertEquals("SAMPLE ROAD", results.get(0).getAddress());
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("FROM MEMGLBLHNDGAGNT")
                    && sql.contains("INSTR(UPPER(NVL(MAVHNDGAGNTCODE")
                    && sql.contains("INSTR(UPPER(NVL(MAVHNDGAGNTNAME")));
        verify(search).setString(1, "SAMPLE");
        verify(search).setString(2, "SAMPLE");
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
            "companyName", " M/S: BALAJI ENTERPRISES ",
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
            + "Table: MEMGLBLCUST, MEMGLBLCUSTDTLS\n"
            + "Code: MSBC\n\n"
            + "SQL QUERY:\n"
            + "----------------------------------------1 PARENT INSERT---------------------------\n\n"));
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUST VALUES('MSBC','M/S: BALAJI ENTERPRISES','O''BRIEN ROAD','DHANBAD',NULL,NULL,NULL,SYSDATE,'SR.DCM/DHN',NULL,'20APEPA6196G1Z9','APEPA6196G');"
        ));
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUSTDTLS (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME, MANPINCODE, MADIMPLDATE, MAVRMRK, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, MADDATEEFCTFROM, MADDATEEFCTTO) VALUES ('MSBC', 'M/S: BALAJI ENTERPRISES', 'O''BRIEN ROAD', 'DHANBAD', 440001, SYSDATE, NULL, '20APEPA6196G1Z9', 'APEPA6196G', SYSDATE, NULL);"
        ));
        assertTrue(body.contains("Operation: INSERT\nTable: MEMGLBLCUST, MEMGLBLCUSTDTLS\nCode: MSBC\n\nSQL QUERY:\n"));
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
        assertTrue(emailedBody(mailSender).contains(
            "Operation: INSERT\nTable: MEMGLBLCUST, MEMGLBLCUSTDTLS\nCode: MSBC"));
    }

    @Test
    void registerNewEntryJDBC_emailsSqlNullForEmptyCityInBothCustomerSections() throws SQLException {
        String[] cityValues = { null, "", "   ", "null" };
        for (String codeType : new String[] { "global", "handling_agent" }) {
            String table = "global".equals(codeType) ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
            for (String city : cityValues) {
                DataSource dataSource = mock(DataSource.class);
                Connection connection = mock(Connection.class);
                PreparedStatement existsPs = mock(PreparedStatement.class);
                ResultSet existsRs = mock(ResultSet.class);
                JavaMailSender mailSender = mock(JavaMailSender.class);
                when(dataSource.getConnection()).thenReturn(connection);
                when(connection.prepareStatement(anyString())).thenReturn(existsPs);
                when(existsPs.executeQuery()).thenReturn(existsRs);
                when(existsRs.next()).thenReturn(false);

                Map<String, String> formData = new HashMap<>(Map.of(
                    "codeType", codeType,
                    "customerCode", "ABCD",
                    "companyName", "Example Company",
                    "address", "Main Road",
                    "operatingDivision", "Dhanbad (DNR)",
                    "zone", "East Central Railway",
                    "gstinNumbers", "10ABACA6462C1ZD",
                    "panNumber", "ABACA6462C"
                ));
                if (city != null) formData.put("city", city);

                service(dataSource, mailSender).registerNewEntryJDBC(formData);

                String body = emailedBody(mailSender);
                assertTrue(body.contains("INSERT INTO " + table), body);
                String citySql = "global".equals(codeType)
                    ? "'MAIN ROAD',NULL,NULL,NULL,NULL,SYSDATE"
                    : "'MAIN ROAD',NULL,NULL,NULL,NULL,SYSDATE";
                assertTrue(body.contains(citySql), body);
                assertFalse(body.contains("'NULL'"), body);
                verify(connection, never()).prepareStatement(startsWith("INSERT"));
                verify(existsPs, never()).executeUpdate();
            }
        }
    }

    @Test
    void registerNewEntryJDBC_trimsAndPreservesProvidedCityInDbaInsert() throws SQLException {
        for (String codeType : new String[] { "global", "handling_agent" }) {
            DataSource dataSource = mock(DataSource.class);
            Connection connection = mock(Connection.class);
            PreparedStatement existsPs = mock(PreparedStatement.class);
            ResultSet existsRs = mock(ResultSet.class);
            JavaMailSender mailSender = mock(JavaMailSender.class);
            when(dataSource.getConnection()).thenReturn(connection);
            when(connection.prepareStatement(anyString())).thenReturn(existsPs);
            when(existsPs.executeQuery()).thenReturn(existsRs);
            when(existsRs.next()).thenReturn(false);

            service(dataSource, mailSender).registerNewEntryJDBC(new HashMap<>(Map.of(
                "codeType", codeType,
                "customerCode", "ABCD",
                "companyName", "Example Company",
                "address", "Main Road",
                "city", "  New Delhi  ",
                "operatingDivision", "Dhanbad (DNR)",
                "zone", "East Central Railway",
                "gstinNumbers", "10ABACA6462C1ZD",
                "panNumber", "ABACA6462C"
            )));

            String body = emailedBody(mailSender);
            String citySql = "global".equals(codeType)
                ? "'MAIN ROAD','NEW DELHI'"
                : "'MAIN ROAD','NEW DELHI'";
            assertTrue(body.contains(citySql), body);
            assertFalse(body.contains("'  NEW DELHI  '"), body);
        }
    }

    @Test
    void customerRegistrationRequest_allowsNullAndBlankCity() {
        try (javax.validation.ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            javax.validation.Validator validator = factory.getValidator();
            for (String city : new String[] { null, "", "   " }) {
                CustomerRegistrationRequest request = new CustomerRegistrationRequest(
                    "Example Company",
                    "ABCD",
                    "Main Road",
                    city,
                    "",
                    List.of(new GstinRequest("Delhi", "10ABACA6462C1ZD")),
                    "ABACA6462C",
                    "Dhanbad (DNR)",
                    "East Central Railway",
                    null,
                    null,
                    "GLOBAL"
                );

                assertTrue(validator.validate(request).stream()
                    .noneMatch(violation -> "city".equals(violation.getPropertyPath().toString())));
            }
        }
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
        assertTrue(body.contains("Operation: INSERT\nTable: MEMGLBLCUST, MEMGLBLCUSTDTLS\nCode: ASEB"));
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUST VALUES('ASEB','M/S AVANTIKA SOLAR ENERGY PRIVATE LIMITED',"
                + "'FLAT NO. -301,RAMAGRIHAM APTT,VIJAY NAGAR,PATNA,BIHAR,800014','PATNA',"
                + "NULL,NULL,NULL,SYSDATE,'SR.DCM/DNR',NULL,'10ABACA6462C1ZD','ABACA6462C');"
        ));
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUSTDTLS (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME, MANPINCODE, MADIMPLDATE, MAVRMRK, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, MADDATEEFCTFROM, MADDATEEFCTTO) VALUES ('ASEB', 'M/S AVANTIKA SOLAR ENERGY PRIVATE LIMITED', 'FLAT NO. -301,RAMAGRIHAM APTT,VIJAY NAGAR,PATNA,BIHAR,800014', 'PATNA', 800014, SYSDATE, NULL, '10ABACA6462C1ZD', 'ABACA6462C', SYSDATE, NULL);"
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
        assertTrue(emailedBody(mailSender).contains(
            "INSERT INTO MEMGLBLCUSTDTLS (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME, MANPINCODE, MADIMPLDATE, MAVRMRK, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, MADDATEEFCTFROM, MADDATEEFCTTO) VALUES ('ASEB', 'M/S AVANTIKA SOLAR', 'PATNA ROAD', 'PATNA', 800014, SYSDATE, NULL, '10ABACA6462C1ZD', 'ABACA6462C', SYSDATE, NULL);"
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
            "companyName", "JINDAL PIPES LIMITED",
            "address", "22ND MILE STONE, DELHI HAPUR ROAD",
            "city", "PARBHANI",
            "pincode", "431401",
            "zone", "South Central Railway",
            "operatingDivision", "Madurai (MDU)",
            "gstinNumbers", "09AAACJ2055K1ZJ",
            "panNumber", "AAACJ2055K"
        ));

        assertTrue(emailedBody(mailSender).contains(
            "INSERT INTO MEMGLBLHNDGAGNT VALUES('JDPL','M/S JINDAL PIPES LIMITED',"
                + "'22ND MILE STONE,DELHI HAPUR ROAD','PARBHANI',NULL,NULL,NULL,SYSDATE,"
                + "'SR.DCM/MDU',NULL,'09AAACJ2055K1ZJ','AAACJ2055K');"
        ));
        assertTrue(emailedBody(mailSender).contains(
            "INSERT INTO MEMGLBLHNDGAGNTDTLS (MAVHNDGAGNTCODE, MAVHNDGAGNTNAME, MAVHNDGAGNTADDRTEXT, MAVHNDGAGNTCITYNAME, MANPINCODE, MADIMPLDATE, MAVRMRK, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, MADDATEEFCTFROM, MADDATEEFCTTO) VALUES ('JDPL', 'M/S JINDAL PIPES LIMITED', '22ND MILE STONE,DELHI HAPUR ROAD', 'PARBHANI', 431401, SYSDATE, NULL, '09AAACJ2055K1ZJ', 'AAACJ2055K', SYSDATE, NULL);"
        ));
        assertFalse(emailedBody(mailSender).contains("INSERT INTO MEMGLBLHNDGAGNT ("));
        verify(existsPs, never()).executeUpdate();
    }

    @Test
    void dbaSqlEmailPrefixesHandlingAgentInsertNameWithoutChangingOtherValues() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        emailService.sendDbaSqlEmail(List.of(
            new DbaEmailService.SqlRequest(
                "INSERT",
                "MEMGLBLHNDGAGNT",
                "RINK",
                "INSERT INTO MEMGLBLHNDGAGNT (CODE, NAME, ADDRESS, CITY, COL5, COL6, COL7, COL8, COL9, COL10, GSTIN, PAN) "
                    + "VALUES ('RINK', 'RINKU BORUAH', 'NIL, PUTIKHATI DEKARGAON, TEZPUR, SONITPUR, ASSAM, 784501', "
                    + "'TEZPUR', NULL, NULL, NULL, SYSDATE, 'SR.DCM/RNY', NULL, '18AMKPB8046M2ZM', 'AMKPB8046M');"
            ),
            new DbaEmailService.SqlRequest(
                "INSERT",
                "MEMGLBLHNDGAGNT",
                "EXISTING",
                "INSERT INTO MEMGLBLHNDGAGNT (CODE, NAME) VALUES ('EXISTING', 'm/s Already Prefixed');"
            ),
            new DbaEmailService.SqlRequest(
                "INSERT",
                "MEMGLBLHNDGAGNT",
                "PUNCTUATED",
                "INSERT INTO MEMGLBLHNDGAGNT (CODE, NAME) VALUES ('PUNCTUATED', 'm/s: Already Prefixed');"
            )
        ));

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        String body = message.getValue().getText();
        assertTrue(body.contains(
            "VALUES('RINK','M/S RINKU BORUAH','NIL, PUTIKHATI DEKARGAON, TEZPUR, SONITPUR, ASSAM, 784501',"
                + "'TEZPUR',NULL,NULL,NULL,SYSDATE,'SR.DCM/RNY',NULL,'18AMKPB8046M2ZM','AMKPB8046M');"
        ));
        assertTrue(body.contains("VALUES('EXISTING','M/S ALREADY PREFIXED');"));
        assertTrue(body.contains("VALUES('PUNCTUATED','M/S: ALREADY PREFIXED');"));
        assertFalse(body.contains("'M/S M/S"));
    }

    @Test
    void dbaSqlEmailDoesNotDuplicatePunctuationSeparatedMsPrefixInCompanyNameUpdates() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");

        emailService.sendDbaSqlEmail(List.of(
            new DbaEmailService.SqlRequest(
                "UPDATE",
                "MEMGLBLCUST",
                "AB12",
                "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = 'M/S: GREEN GLOBE' "
                    + "WHERE MAVGLBLCUSTCODE = 'AB12';"
            )
        ));

        String body = emailedBody(mailSender);
        assertTrue(body.contains("MAVGLBLCUSTNAME = 'M/S: GREEN GLOBE'"));
        assertFalse(body.contains("M/S M/S"));
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
        when(lookupRs.next()).thenReturn(true, false);
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
                + "MAVGLBLCUSTADDRTEXT = 'O''BRIEN,STREET'\n"
                + "WHERE MAVGLBLCUSTCODE = 'AB12';"
        ));
        verify(connection).prepareStatement(contains("FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?"));
        verify(lookupPs, never()).executeUpdate();
        verify(connection, never()).prepareStatement(startsWith("UPDATE"));
    }

    @Test
    void updateOldCustomerJDBC_allowsOneCharacterCodeWithoutPadding() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true, false);
        when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("A");
        when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("Old Name");
        when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("Old Address");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("AAECR3577N");
        when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("27AAECR3577NLZE");
        when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("Nagpur");

        service(dataSource, mailSender).updateOldCustomerJDBC(Map.of(
            "codeType", "global",
            "customerCode", "A",
            "companyName", "New Name",
            "address", "Old Address",
            "city", "Nagpur",
            "panNumber", "AAECR3577N",
            "gstinNumbers", "27AAECR3577NLZE"
        ));

        assertTrue(emailedBody(mailSender).contains("WHERE MAVGLBLCUSTCODE = 'A';"));
        verify(lookupPs, atLeastOnce()).setString(1, "A");
        verify(lookupPs, never()).executeUpdate();
        verify(connection, never()).prepareStatement(startsWith("UPDATE"));
    }

    @Test
    void updateOldCustomerJDBC_emailsSqlNullForEmptyCityInBothCustomerSections() throws SQLException {
        String[] cityValues = { null, "", "   ", "null" };
        for (String codeType : new String[] { "global", "handling_agent" }) {
            String table = "global".equals(codeType) ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
            for (String city : cityValues) {
                DataSource dataSource = mock(DataSource.class);
                Connection connection = mock(Connection.class);
                PreparedStatement lookupPs = mock(PreparedStatement.class);
                ResultSet lookupRs = mock(ResultSet.class);
                JavaMailSender mailSender = mock(JavaMailSender.class);
                when(dataSource.getConnection()).thenReturn(connection);
                when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
                when(lookupPs.executeQuery()).thenReturn(lookupRs);
                when(lookupRs.next()).thenReturn(true, false);
                when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("ABCD");
                when(lookupRs.getString("MAVHNDAGNTCODE")).thenReturn("ABCD");
                when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S EXAMPLE COMPANY");
                when(lookupRs.getString("MAVHNDAGNTNAME")).thenReturn("M/S EXAMPLE COMPANY");
                when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("MAIN ROAD");
                when(lookupRs.getString("MAVHNDAGNTADDRTEXT")).thenReturn("MAIN ROAD");
                when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("ABACA6462C");
                when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("10ABACA6462C1ZD");
                when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("PATNA");
                when(lookupRs.getString("MAVHNDAGNTCITYNAME")).thenReturn("PATNA");

                Map<String, String> formData = new HashMap<>(Map.of(
                    "codeType", codeType,
                    "customerCode", "ABCD",
                    "companyName", "Example Company",
                    "address", "Main Road",
                    "panNumber", "ABACA6462C",
                    "gstinNumbers", "10ABACA6462C1ZD"
                ));
                if (city != null) formData.put("city", city);

                service(dataSource, mailSender).updateOldCustomerJDBC(formData);

                String body = emailedBody(mailSender);
                assertTrue(body.contains("UPDATE " + table), body);
                assertTrue(body.contains("CITYNAME = NULL"), body);
                assertFalse(body.contains("CITYNAME = 'NULL'"), body);
                verify(lookupPs, never()).executeUpdate();
                verify(connection, never()).prepareStatement(startsWith("UPDATE"));
            }
        }
    }

    @Test
    void updateOldCustomerJDBC_trimsAndPreservesProvidedCityInBothCustomerSections() throws SQLException {
        for (String codeType : new String[] { "global", "handling_agent" }) {
            String table = "global".equals(codeType) ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
            DataSource dataSource = mock(DataSource.class);
            Connection connection = mock(Connection.class);
            PreparedStatement lookupPs = mock(PreparedStatement.class);
            ResultSet lookupRs = mock(ResultSet.class);
            JavaMailSender mailSender = mock(JavaMailSender.class);
            when(dataSource.getConnection()).thenReturn(connection);
            when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
            when(lookupPs.executeQuery()).thenReturn(lookupRs);
            when(lookupRs.next()).thenReturn(true, false);
            when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("ABCD");
            when(lookupRs.getString("MAVHNDAGNTCODE")).thenReturn("ABCD");
            when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S EXAMPLE COMPANY");
            when(lookupRs.getString("MAVHNDAGNTNAME")).thenReturn("M/S EXAMPLE COMPANY");
            when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("MAIN ROAD");
            when(lookupRs.getString("MAVHNDAGNTADDRTEXT")).thenReturn("MAIN ROAD");
            when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("ABACA6462C");
            when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("10ABACA6462C1ZD");
            when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("PATNA");
            when(lookupRs.getString("MAVHNDAGNTCITYNAME")).thenReturn("PATNA");

            service(dataSource, mailSender).updateOldCustomerJDBC(Map.of(
                "codeType", codeType,
                "customerCode", "ABCD",
                "companyName", "Example Company",
                "address", "Main Road",
                "city", "  New Delhi  ",
                "panNumber", "ABACA6462C",
                "gstinNumbers", "10ABACA6462C1ZD"
            ));

            String body = emailedBody(mailSender);
            assertTrue(body.contains("UPDATE " + table), body);
            assertTrue(body.contains("CITYNAME = 'NEW DELHI'"), body);
            assertFalse(body.contains("CITYNAME = '  NEW DELHI  '"), body);
            verify(lookupPs, never()).executeUpdate();
            verify(connection, never()).prepareStatement(startsWith("UPDATE"));
        }
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
        when(lookupRs.next()).thenReturn(true, false);
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
        when(lookupRs.next()).thenReturn(true, false);
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
    void updateOldCustomerJDBC_includesOnlyChangedMappedFieldsForBothTables() throws SQLException {
        Map<String, Map<String, String>> cases = new LinkedHashMap<>();
        cases.put("company name", Map.of(
            "companyName", "M/S NEW COMPANY",
            "expected", "MAVGLBLCUSTNAME = 'M/S NEW COMPANY'"));
        cases.put("address", Map.of(
            "address", "NEW ROAD,MARKET AREA",
            "expected", "MAVGLBLCUSTADDRTEXT = 'NEW ROAD,MARKET AREA'"));
        cases.put("GSTIN", Map.of(
            "gstinNumbers", "29AAAAA1111A1Z5",
            "expected", "MAVCUSTGSTNUMB = '29AAAAA1111A1Z5'"));
        cases.put("PAN", Map.of(
            "panNumber", "BBBBB2222B",
            "expected", "MAVCUSTPANNUMB = 'BBBBB2222B'"));
        cases.put("city", Map.of(
            "city", "Mumbai",
            "expected", "CITYNAME = 'MUMBAI'"));
        cases.put("pincode", Map.of(
            "pincode", "400001",
            "expected", "MAVPCOCODE = NULL"));
        cases.put("division", Map.of(
            "operatingDivision", "Mumbai (CSTM)",
            "expected", "MAVIMPLREMK = 'SR.DCM/CSTM'"));
        cases.put("multiple fields", Map.of(
            "address", "NEW ROAD,MARKET AREA",
            "panNumber", "BBBBB2222B",
            "expected", "MAVGLBLCUSTADDRTEXT = 'NEW ROAD,MARKET AREA',\nMAVCUSTPANNUMB = 'BBBBB2222B'"));

        for (String codeType : Arrays.asList("global", "handling_agent")) {
            String table = "global".equals(codeType) ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
            String nameColumn = "global".equals(codeType) ? "MAVGLBLCUSTNAME" : "MAVHNDGAGNTNAME";
            String addressColumn = "global".equals(codeType) ? "MAVGLBLCUSTADDRTEXT" : "MAVHNDGAGNTADDRTEXT";
            for (Map.Entry<String, Map<String, String>> testCase : cases.entrySet()) {
                DataSource dataSource = mock(DataSource.class);
                Connection connection = mock(Connection.class);
                PreparedStatement lookupPs = mock(PreparedStatement.class);
                PreparedStatement lookupDetailsPs = mock(PreparedStatement.class);
                PreparedStatement updateDetailsPs = mock(PreparedStatement.class);
                ResultSet lookupRs = mock(ResultSet.class);
                ResultSet lookupDetailsRs = mock(ResultSet.class);
                ResultSet updateDetailsRs = mock(ResultSet.class);
                JavaMailSender mailSender = mock(JavaMailSender.class);
                when(dataSource.getConnection()).thenReturn(connection);
                when(connection.prepareStatement(anyString()))
                    .thenReturn(lookupPs, lookupDetailsPs, updateDetailsPs);
                when(lookupPs.executeQuery()).thenReturn(lookupRs);
                when(lookupDetailsPs.executeQuery()).thenReturn(lookupDetailsRs);
                when(updateDetailsPs.executeQuery()).thenReturn(updateDetailsRs);
                when(lookupRs.next()).thenReturn(true, false);
                Map<String, String> originalRecord = originalOldCustomerValues("OLD ROAD,MARKET AREA");
                when(lookupRs.getString(anyString()))
                    .thenAnswer(invocation -> originalRecord.get(invocation.getArgument(0)));
                stubSingleExistingGstinDetail(lookupDetailsRs);
                stubSingleExistingGstinDetail(updateDetailsRs);

                Map<String, String> formData = new HashMap<>(Map.of(
                    "codeType", codeType,
                    "customerCode", "AB12",
                    "companyName", "M/S OLD COMPANY",
                    "address", "OLD ROAD,MARKET AREA",
                    "city", "PATNA",
                    "panNumber", "AAAAA1111A",
                    "gstinNumbers", "27AAAAA1111A1Z5",
                    "operatingDivision", "Danapur (DNR)"
                ));
                formData.putAll(testCase.getValue());

                service(dataSource, mailSender).updateOldCustomerJDBC(formData);

                String body = emailedBody(mailSender);
                if ("GSTIN".equals(testCase.getKey())) {
                    String dtlsTable = "global".equals(codeType) ? "MEMGLBLCUSTDTLS" : "MEMGLBLHNDGAGNTDTLS";
                    assertTrue(body.contains("Table: " + dtlsTable), () -> codeType + " GSTIN table:\n" + body);
                    assertTrue(body.contains("INSERT INTO " + dtlsTable), () -> codeType + " GSTIN insert:\n" + body);
                    assertTrue(body.contains("UPDATE " + dtlsTable + " SET MADDATEEFCTTO = TRUNC(SYSDATE)"), () -> codeType + " GSTIN soft disable:\n" + body);
                    assertFalse(body.contains("DELETE FROM " + dtlsTable), () -> codeType + " GSTIN delete should not occur:\n" + body);
                    assertFalse(body.contains("UPDATE " + table + " SET"), () -> codeType + " parent should not be updated on GSTIN change:\n" + body);
                } else if ("pincode".equals(testCase.getKey())) {
                    assertTrue(body.contains("MAVPCOCODE = NULL"), () -> codeType + " pincode should always be NULL:\n" + body);
                } else {
                    String expectedAssignments = testCase.getValue().get("expected")
                        .replace("MAVGLBLCUSTNAME", nameColumn)
                        .replace("MAVGLBLCUSTADDRTEXT", addressColumn)
                        .replace("MAVCUSTGSTNUMB", "MAVCUSTGSTNUMB")
                        .replace("CITYNAME", "global".equals(codeType) ? "MAVGNBLCUSTCITYNAME" : "MAVHNDGAGNTCITYNAME");
                    assertTrue(body.contains("UPDATE " + table + " SET\n" + expectedAssignments
                        + "\nWHERE "), () -> codeType + " " + testCase.getKey() + ":\n" + body);
                }
                verify(lookupPs, never()).executeUpdate();
                verify(connection, never()).prepareStatement(startsWith("UPDATE"));
            }
        }
    }

    @Test
    void updateOldCustomerJDBC_rejectsNoChangeAndRestoredValuesForBothTables() throws SQLException {
        for (String codeType : Arrays.asList("global", "handling_agent")) {
            for (boolean restoreOriginal : Arrays.asList(false, true)) {
                DataSource dataSource = mock(DataSource.class);
                Connection connection = mock(Connection.class);
                PreparedStatement lookupPs = mock(PreparedStatement.class);
                PreparedStatement lookupDetailsPs = mock(PreparedStatement.class);
                PreparedStatement updateDetailsPs = mock(PreparedStatement.class);
                ResultSet lookupRs = mock(ResultSet.class);
                ResultSet lookupDetailsRs = mock(ResultSet.class);
                ResultSet updateDetailsRs = mock(ResultSet.class);
                JavaMailSender mailSender = mock(JavaMailSender.class);
                when(dataSource.getConnection()).thenReturn(connection);
                when(connection.prepareStatement(anyString()))
                    .thenReturn(lookupPs, lookupDetailsPs, updateDetailsPs);
                when(lookupPs.executeQuery()).thenReturn(lookupRs);
                when(lookupDetailsPs.executeQuery()).thenReturn(lookupDetailsRs);
                when(updateDetailsPs.executeQuery()).thenReturn(updateDetailsRs);
                when(lookupRs.next()).thenReturn(true, false);
                Map<String, String> originalRecord = originalOldCustomerValues("OLD ROAD, MARKET AREA");
                when(lookupRs.getString(anyString()))
                    .thenAnswer(invocation -> originalRecord.get(invocation.getArgument(0)));
                stubSingleExistingGstinDetail(lookupDetailsRs);
                stubSingleExistingGstinDetail(updateDetailsRs);

                Map<String, String> unchanged = Map.of(
                    "codeType", codeType,
                    "customerCode", "AB12",
                    "companyName", restoreOriginal ? "TEMP COMPANY" : "  m/s old company ",
                    "address", restoreOriginal ? "TEMP ROAD" : " old road, market area ",
                    "city", " patna ",
                    "pincode", " 800001 ",
                    "panNumber", " aaaaa1111a ",
                    "gstinNumbers", "27 AAA AA1111A1Z5",
                    "operatingDivision", "Danapur (DNR)"
                );
                Map<String, String> submitted = new HashMap<>(unchanged);
                if (restoreOriginal) {
                    submitted.put("companyName", "M/S OLD COMPANY");
                    submitted.put("address", "OLD ROAD, MARKET AREA");
                }

                assertDoesNotThrow(() -> service(dataSource, mailSender).updateOldCustomerJDBC(submitted));
                String body = emailedBody(mailSender);
                assertTrue(body.contains("MAVPCOCODE = NULL"), () -> codeType + " pincode should be reset to NULL for every update:\n" + body);
                verify(mailSender).send(any(SimpleMailMessage.class));
            }
        }
    }

    @Test
    void updateOldCustomerJDBC_forcesParentTablePcoCodeToNullInGeneratedSql() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        PreparedStatement lookupDetailsPs = mock(PreparedStatement.class);
        PreparedStatement updateDetailsPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        ResultSet lookupDetailsRs = mock(ResultSet.class);
        ResultSet updateDetailsRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs, lookupDetailsPs, updateDetailsPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupDetailsPs.executeQuery()).thenReturn(lookupDetailsRs);
        when(updateDetailsPs.executeQuery()).thenReturn(updateDetailsRs);
        when(lookupRs.next()).thenReturn(true, false);
        when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S OLD COMPANY");
        when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("OLD ROAD");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("AAECR3577N");
        when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("27AAECR3577NLZE");
        when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("Nagpur");
        when(lookupRs.getString("MAVPCOCODE")).thenReturn("110001");
        stubSingleExistingGstinDetail(lookupDetailsRs);
        stubSingleExistingGstinDetail(updateDetailsRs);

        service(dataSource, mailSender).updateOldCustomerJDBC(Map.of(
            "codeType", "global",
            "customerCode", "AB12",
            "companyName", "M/S NEW COMPANY",
            "address", "NEW ROAD",
            "city", "Nagpur",
            "pincode", "400001",
            "panNumber", "AAECR3577N",
            "gstinNumbers", "27AAECR3577NLZE"
        ));

        String body = emailedBody(mailSender);
        assertTrue(body.contains("MAVPCOCODE = NULL"), body);
        assertFalse(body.contains("MAVPCOCODE = '400001'"), body);
        assertFalse(body.contains("MAVPCOCODE = '110001'"), body);
    }

    @Test
    void ownershipSubmission_updatesExistingCodeInsteadOfInsertingIt() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        PreparedStatement globalPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        ResultSet globalRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(lookupPs);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(globalPs.executeQuery()).thenReturn(globalRs);
        when(lookupRs.next()).thenReturn(true, false);
        when(lookupRs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("SCOR");
        when(lookupRs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("SOUTH COAST RAILWAYS");
        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("SOUTH COAST RAILWAY");

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
        PreparedStatement globalPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        ResultSet globalRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(lookupPs);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(globalPs.executeQuery()).thenReturn(globalRs);
        when(lookupRs.next()).thenReturn(true, false);
        when(lookupRs.getString("MAVWGONOWNRPRTYCODE")).thenReturn("SHLA");
        when(lookupRs.getString("MAVWGONOWNRPRTYDESC")).thenReturn("M/S SUSHILA TRANSPORT PVT LTD");
        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("SUSHILA TRANSPORT PVT LTD");

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
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST")))
            .thenReturn(ownershipGlobalLookup, ownershipGlobalLookup, partyGlobalLookup);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipLookup);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(partyLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(ownershipGlobalLookup.executeQuery()).thenReturn(ownershipGlobalRs);
        when(partyLookup.executeQuery()).thenReturn(partyRs);
        when(partyGlobalLookup.executeQuery()).thenReturn(partyGlobalRs);
        when(ownershipRs.next()).thenReturn(false);
        when(ownershipGlobalRs.next()).thenReturn(true, true);
        when(ownershipGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(ownershipGlobalRs.getString("MAVGLBLCUSTNAME")).thenReturn("O'BRIEN OWNERSHIP");
        when(partyRs.next()).thenReturn(false);
        when(partyGlobalRs.next()).thenReturn(true);
        when(partyGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(partyGlobalRs.getString("MAVGLBLCUSTNAME")).thenReturn("O'BRIEN OWNERSHIP");

        service(dataSource, mailSender).submitOwnershipJDBC(
            "AB12", "Client-supplied name is ignored", "AB12", "Client-supplied name is ignored");

        String body = emailedBody(mailSender);
        assertTrue(body.contains(
            "INSERT INTO MEMWGONOWNRSHIP VALUES('AB12','M/S O''BRIEN OWNERSHIP',NULL,'Y',SYSDATE,NULL);"
        ));
        assertTrue(body.contains(
            "INSERT INTO MEMWGONOWNRPRTY VALUES('AB12','M/S O''BRIEN OWNERSHIP');"
        ));
        assertFalse(body.contains("INSERT INTO MEMWGONOWNRSHIP ("));
        assertFalse(body.contains("INSERT INTO MEMWGONOWNRPRTY ("));
        assertTrue(body.contains(
            "Operation: INSERT\nTable: MEMWGONOWNRSHIP, MEMWGONOWNRPRTY\nCode: AB12\n\nSQL QUERY:\n"
                + "----------------------------------------1 INSERT---------------------------\n\n"
                + "INSERT INTO MEMWGONOWNRSHIP VALUES('AB12','M/S O''BRIEN OWNERSHIP',NULL,'Y',SYSDATE,NULL);\n\n"
                + "----------------------------------------2 INSERT---------------------------\n\n"
                + "INSERT INTO MEMWGONOWNRPRTY VALUES('AB12','M/S O''BRIEN OWNERSHIP');\n\n"
        ));
        assertTrue(body.indexOf("MEMWGONOWNRSHIP") < body.indexOf("MEMWGONOWNRPRTY"));
        verify(ownershipLookup, never()).executeUpdate();
        verify(partyLookup, never()).executeUpdate();
    }

    @Test
    void saveOwnership_emailsBothInsertStatementsUsingOwnershipValues() throws SQLException {
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
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST")))
            .thenReturn(ownershipGlobalLookup, ownershipGlobalLookup, partyGlobalLookup);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipLookup);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(partyLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(ownershipGlobalLookup.executeQuery()).thenReturn(ownershipGlobalRs);
        when(partyLookup.executeQuery()).thenReturn(partyRs);
        when(partyGlobalLookup.executeQuery()).thenReturn(partyGlobalRs);
        when(ownershipRs.next()).thenReturn(false);
        when(ownershipGlobalRs.next()).thenReturn(true, true);
        when(ownershipGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("ALPS");
        when(ownershipGlobalRs.getString("MAVGLBLCUSTNAME"))
            .thenReturn("ALPS MINING SERVICES PRIVATE LIMITED");
        when(partyRs.next()).thenReturn(false);
        when(partyGlobalRs.next()).thenReturn(true);
        when(partyGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("ALPS");
        when(partyGlobalRs.getString("MAVGLBLCUSTNAME"))
            .thenReturn("ALPS MINING SERVICES PRIVATE LIMITED");

        service(dataSource, mailSender).saveOwnershipJDBC(
            "ALPS", "ALPS MINING SERVICES PRIVATE LIMITED");

        String body = emailedBody(mailSender);
        assertTrue(body.contains(
            "Operation: INSERT\nTable: MEMWGONOWNRSHIP, MEMWGONOWNRPRTY\nCode: ALPS\n\nSQL QUERY:\n"
                + "----------------------------------------1 INSERT---------------------------\n\n"
                + "INSERT INTO MEMWGONOWNRSHIP VALUES('ALPS','M/S ALPS MINING SERVICES PRIVATE LIMITED',NULL,'Y',SYSDATE,NULL);\n\n"
                + "----------------------------------------2 INSERT---------------------------\n\n"
                + "INSERT INTO MEMWGONOWNRPRTY VALUES('ALPS','M/S ALPS MINING SERVICES PRIVATE LIMITED');\n\n"));
        verify(mailSender, times(1)).send(any(SimpleMailMessage.class));
        verify(ownershipLookup, never()).executeUpdate();
        verify(partyLookup, never()).executeUpdate();
    }

    @Test
    void submitOwnership_emailsOwnershipUpdateAndPartyInsertWhenOwnershipAlreadyMatches() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ownershipLookup = mock(PreparedStatement.class);
        PreparedStatement partyLookup = mock(PreparedStatement.class);
        PreparedStatement partyGlobalLookup = mock(PreparedStatement.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet partyRs = mock(ResultSet.class);
        ResultSet partyGlobalRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        PreparedStatement ownershipGlobalLookup = mock(PreparedStatement.class);
        ResultSet ownershipGlobalRs = mock(ResultSet.class);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST")))
            .thenReturn(ownershipGlobalLookup, partyGlobalLookup);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipLookup);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(partyLookup);
        when(ownershipGlobalLookup.executeQuery()).thenReturn(ownershipGlobalRs);
        when(ownershipGlobalRs.next()).thenReturn(true);
        when(ownershipGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("ALPS");
        when(ownershipGlobalRs.getString("MAVGLBLCUSTNAME"))
            .thenReturn("ALPS MINING SERVICES PRIVATE LIMITED");
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(partyLookup.executeQuery()).thenReturn(partyRs);
        when(partyGlobalLookup.executeQuery()).thenReturn(partyGlobalRs);
        when(ownershipRs.next()).thenReturn(true);
        when(ownershipRs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("ALPS");
        when(ownershipRs.getString("MAVWGONOWNRSHIPDESC"))
            .thenReturn("M/S ALPS MINING SERVICES PRIVATE LIMITED");
        when(partyRs.next()).thenReturn(false);
        when(partyGlobalRs.next()).thenReturn(true);
        when(partyGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("ALPS");
        when(partyGlobalRs.getString("MAVGLBLCUSTNAME"))
            .thenReturn("ALPS MINING SERVICES PRIVATE LIMITED");

        service(dataSource, mailSender).submitOwnershipJDBC(
            "ALPS", "M/S ALPS MINING SERVICES PRIVATE LIMITED",
            "ALPS", "M/S ALPS MINING SERVICES PRIVATE LIMITED");

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, times(1)).send(message.capture());
        String body = message.getValue().getText();
        assertFalse(body.contains("UPDATE MEMWGONOWNRSHIP"));
        assertTrue(body.contains(
            "INSERT INTO MEMWGONOWNRPRTY VALUES('ALPS','M/S ALPS MINING SERVICES PRIVATE LIMITED');"));
        assertTrue(body.contains("Operation: INSERT\nTable: MEMWGONOWNRPRTY"));
        assertEquals(0, body.split("UPDATE MEMWGONOWNRSHIP", -1).length - 1);
        assertEquals(1, body.split("INSERT INTO MEMWGONOWNRPRTY", -1).length - 1);
    }

    @Test
    void lookupOwnershipJDBC_fetchesCompanyNameAndDetailsFromGlobalCustomer() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement globalPs = mock(PreparedStatement.class);
        PreparedStatement ownershipPs = mock(PreparedStatement.class);
        PreparedStatement partyPs = mock(PreparedStatement.class);
        ResultSet globalRs = mock(ResultSet.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet partyRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalPs);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipPs);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(partyPs);

        when(globalPs.executeQuery()).thenReturn(globalRs);
        when(ownershipPs.executeQuery()).thenReturn(ownershipRs);
        when(partyPs.executeQuery()).thenReturn(partyRs);

        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTCODE")).thenReturn("A");
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("ABC PRIVATE LIMITED");
        when(globalRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("RAILWAY ROAD");
        when(globalRs.getString("MAVCUSTPANNUMB")).thenReturn("ABCDE1234F");
        when(globalRs.getString("MAVCUSTGSTNUMB")).thenReturn("07ABCDE1234F1Z5");
        when(globalRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("DELHI");
        when(globalRs.getString("MAVPCOCODE")).thenReturn("110001");

        when(ownershipRs.next()).thenReturn(false);
        when(partyRs.next()).thenReturn(false);

        Map<String, String> result = service(dataSource, mailSender).lookupOwnershipJDBC("A");

        assertNotNull(result);
        assertEquals("A", result.get("ownershipCode"));
        assertEquals("ABC PRIVATE LIMITED", result.get("ownershipDesc"));
        assertEquals("RAILWAY ROAD", result.get("address"));
        assertEquals("ABCDE1234F", result.get("panNumber"));
        assertEquals("07ABCDE1234F1Z5", result.get("gstinNumbers"));
        assertEquals("DELHI", result.get("city"));
        assertEquals("110001", result.get("pincode"));
        assertEquals("NEW_RECORD_FROM_GLOBAL_CUSTOMER", result.get("recordSource"));
    }

    @Test
    void lookupOwnershipJDBC_returnsUpdatedGlobalCustomerCompanyNameEvenWhenOwnershipAlreadyExists() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement globalPs = mock(PreparedStatement.class);
        PreparedStatement ownershipPs = mock(PreparedStatement.class);
        PreparedStatement partyPs = mock(PreparedStatement.class);
        ResultSet globalRs = mock(ResultSet.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet partyRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalPs);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipPs);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(partyPs);

        when(globalPs.executeQuery()).thenReturn(globalRs);
        when(ownershipPs.executeQuery()).thenReturn(ownershipRs);
        when(partyPs.executeQuery()).thenReturn(partyRs);

        // Global Customer has the latest updated company name
        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTCODE")).thenReturn("ABC1");
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("ABC TECHNOLOGIES PRIVATE LIMITED");
        when(globalRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("TECH PARK");
        when(globalRs.getString("MAVCUSTPANNUMB")).thenReturn("ABCDE1234F");

        // Existing ownership record contains the older name
        when(ownershipRs.next()).thenReturn(true);
        when(ownershipRs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("ABC1");
        when(ownershipRs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("M/S ABC PRIVATE LIMITED");

        when(partyRs.next()).thenReturn(true);
        when(partyRs.getString("MAVWGONOWNRPRTYCODE")).thenReturn("ABC1");
        when(partyRs.getString("MAVWGONOWNRPRTYDESC")).thenReturn("M/S ABC PRIVATE LIMITED");

        Map<String, String> result = service(dataSource, mailSender).lookupOwnershipJDBC("ABC1");

        assertNotNull(result);
        assertEquals("ABC1", result.get("ownershipCode"));
        // Company name is fetched from MEMGLBLCUST (source of truth), not the older ownership description
        assertEquals("ABC TECHNOLOGIES PRIVATE LIMITED", result.get("ownershipDesc"));
        assertEquals("EXISTING_OWNERSHIP_RECORD", result.get("recordSource"));
    }

    @Test
    void submitOwnershipJDBC_caseA_generatesIndependentUpdateQueriesForBothTablesWhenGlobalCompanyNameChanged() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement globalPs = mock(PreparedStatement.class);
        PreparedStatement ownershipPs = mock(PreparedStatement.class);
        PreparedStatement partyPs = mock(PreparedStatement.class);
        ResultSet globalRs = mock(ResultSet.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet partyRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalPs);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipPs);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(partyPs);

        when(globalPs.executeQuery()).thenReturn(globalRs);
        when(ownershipPs.executeQuery()).thenReturn(ownershipRs);
        when(partyPs.executeQuery()).thenReturn(partyRs);

        // Global Customer has updated company name
        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTCODE")).thenReturn("ABC1");
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("ABC TECHNOLOGIES PRIVATE LIMITED");

        // Both Ownership records exist with old name
        when(ownershipRs.next()).thenReturn(true);
        when(ownershipRs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("ABC1");
        when(ownershipRs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("M/S ABC PRIVATE LIMITED");

        when(partyRs.next()).thenReturn(true);
        when(partyRs.getString("MAVWGONOWNRPRTYCODE")).thenReturn("ABC1");
        when(partyRs.getString("MAVWGONOWNRPRTYDESC")).thenReturn("M/S ABC PRIVATE LIMITED");

        service(dataSource, mailSender).submitOwnershipJDBC(
            "ABC1", "ABC TECHNOLOGIES PRIVATE LIMITED",
            "ABC1", "ABC TECHNOLOGIES PRIVATE LIMITED");

        String body = emailedBody(mailSender);
        // Verify UPDATE for MEMWGONOWNRSHIP
        assertTrue(body.contains(
            "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = 'M/S ABC TECHNOLOGIES PRIVATE LIMITED' WHERE MAVWGONOWNRSHIPCODE = 'ABC1';"
        ));
        // Verify UPDATE for MEMWGONOWNRPRTY
        assertTrue(body.contains(
            "UPDATE MEMWGONOWNRPRTY SET MAVWGONOWNRPRTYDESC = 'M/S ABC TECHNOLOGIES PRIVATE LIMITED' WHERE MAVWGONOWNRPRTYCODE = 'ABC1';"
        ));
        // Verify no INSERT statements generated for existing records
        assertFalse(body.contains("INSERT INTO MEMWGONOWNRSHIP"));
        assertFalse(body.contains("INSERT INTO MEMWGONOWNRPRTY"));

        // Verify original DBA email structure and ordering preserved
        assertTrue(body.contains(
            "----------------------------------------1 UPDATE---------------------------\n\n"
            + "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = 'M/S ABC TECHNOLOGIES PRIVATE LIMITED' WHERE MAVWGONOWNRSHIPCODE = 'ABC1';"));
        assertTrue(body.contains(
            "----------------------------------------2 UPDATE---------------------------\n\n"
            + "UPDATE MEMWGONOWNRPRTY SET MAVWGONOWNRPRTYDESC = 'M/S ABC TECHNOLOGIES PRIVATE LIMITED' WHERE MAVWGONOWNRPRTYCODE = 'ABC1';"));
        assertTrue(body.indexOf("----------------------------------------1 UPDATE") < body.indexOf("----------------------------------------2 UPDATE"));
    }

    @Test
    void submitOwnershipJDBC_caseB_generatesUpdateForExistingAndInsertForMissing() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement globalPs = mock(PreparedStatement.class);
        PreparedStatement ownershipPs = mock(PreparedStatement.class);
        PreparedStatement partyPs = mock(PreparedStatement.class);
        ResultSet globalRs = mock(ResultSet.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet partyRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalPs);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipPs);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(partyPs);

        when(globalPs.executeQuery()).thenReturn(globalRs);
        when(ownershipPs.executeQuery()).thenReturn(ownershipRs);
        when(partyPs.executeQuery()).thenReturn(partyRs);

        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTCODE")).thenReturn("ABC1");
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("ABC TECHNOLOGIES PRIVATE LIMITED");

        // Ownership record exists with older name
        when(ownershipRs.next()).thenReturn(true);
        when(ownershipRs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("ABC1");
        when(ownershipRs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("M/S ABC PRIVATE LIMITED");

        // Party record is missing
        when(partyRs.next()).thenReturn(false);

        service(dataSource, mailSender).submitOwnershipJDBC(
            "ABC1", "ABC TECHNOLOGIES PRIVATE LIMITED",
            "ABC1", "ABC TECHNOLOGIES PRIVATE LIMITED");

        String body = emailedBody(mailSender);
        assertTrue(body.contains(
            "UPDATE MEMWGONOWNRSHIP SET MAVWGONOWNRSHIPDESC = 'M/S ABC TECHNOLOGIES PRIVATE LIMITED' WHERE MAVWGONOWNRSHIPCODE = 'ABC1';"
        ));
        assertTrue(body.contains(
            "INSERT INTO MEMWGONOWNRPRTY VALUES('ABC1','M/S ABC TECHNOLOGIES PRIVATE LIMITED');"
        ));
        assertFalse(body.contains("INSERT INTO MEMWGONOWNRSHIP"));
        assertTrue(body.indexOf("UPDATE MEMWGONOWNRSHIP") < body.indexOf("INSERT INTO MEMWGONOWNRPRTY"));
    }

    @Test
    void submitOwnershipJDBC_generatesInsertForMissingOwnershipAndUpdateForExistingParty() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement globalPs = mock(PreparedStatement.class);
        PreparedStatement ownershipPs = mock(PreparedStatement.class);
        PreparedStatement partyPs = mock(PreparedStatement.class);
        ResultSet globalRs = mock(ResultSet.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet partyRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalPs);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipPs);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(partyPs);
        when(globalPs.executeQuery()).thenReturn(globalRs);
        when(ownershipPs.executeQuery()).thenReturn(ownershipRs);
        when(partyPs.executeQuery()).thenReturn(partyRs);

        when(globalRs.next()).thenReturn(true, true);
        when(globalRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("LATEST COMPANY NAME");
        when(ownershipRs.next()).thenReturn(false);
        when(partyRs.next()).thenReturn(true);
        when(partyRs.getString("MAVWGONOWNRPRTYCODE")).thenReturn("AB12");
        when(partyRs.getString("MAVWGONOWNRPRTYDESC")).thenReturn("OLD COMPANY NAME");

        service(dataSource, mailSender).submitOwnershipJDBC(
            "AB12", "Untrusted submitted name", "AB12", "Untrusted submitted name");

        String body = emailedBody(mailSender);
        assertTrue(body.contains(
            "INSERT INTO MEMWGONOWNRSHIP VALUES('AB12','M/S LATEST COMPANY NAME',NULL,'Y',SYSDATE,NULL);"));
        assertTrue(body.contains(
            "UPDATE MEMWGONOWNRPRTY SET MAVWGONOWNRPRTYDESC = 'M/S LATEST COMPANY NAME' WHERE MAVWGONOWNRPRTYCODE = 'AB12';"));
        assertFalse(body.contains("INSERT INTO MEMWGONOWNRPRTY"));
        assertTrue(body.indexOf("INSERT INTO MEMWGONOWNRSHIP")
            < body.indexOf("UPDATE MEMWGONOWNRPRTY"));
    }

    @Test
    void submitOwnershipJDBC_caseC_invalidGlobalCustomerCodePreventsSubmissionAndEmail() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement globalPs = mock(PreparedStatement.class);
        PreparedStatement ownershipPs = mock(PreparedStatement.class);
        ResultSet globalRs = mock(ResultSet.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipPs);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalPs);
        when(ownershipPs.executeQuery()).thenReturn(ownershipRs);
        when(ownershipRs.next()).thenReturn(false);
        when(globalPs.executeQuery()).thenReturn(globalRs);
        when(globalRs.next()).thenReturn(false);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
            service(dataSource, mailSender).submitOwnershipJDBC(
                "MISS", "ABC TECHNOLOGIES PRIVATE LIMITED",
                "MISS", "ABC TECHNOLOGIES PRIVATE LIMITED")
        );

        assertTrue(ex.getMessage().contains("does not exist in the Ownership table or Global Customer table"));
        verify(mailSender, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void lookupOwnershipJDBC_doesNotUseStaleOwnershipRecordWithoutGlobalCustomer() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ownershipPs = mock(PreparedStatement.class);
        PreparedStatement globalPs = mock(PreparedStatement.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet globalRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipPs);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalPs);
        when(ownershipPs.executeQuery()).thenReturn(ownershipRs);
        when(globalPs.executeQuery()).thenReturn(globalRs);
        when(ownershipRs.next()).thenReturn(true);
        when(ownershipRs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("AB12");
        when(ownershipRs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("Stale Company Name");
        when(globalRs.next()).thenReturn(false);

        assertNull(service(dataSource, mailSender).lookupOwnershipJDBC("AB12"));
    }

    @Test
    void dbaEmailServiceSendsOneOrderedCombinedOwnershipInsertEmail() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        JdbcPortalUserLookupRepository userLookupRepository = mock(JdbcPortalUserLookupRepository.class);
        when(userLookupRepository.findUserContactDetails("SREEJU")).thenReturn(java.util.Optional.of(
            new JdbcPortalUserLookupRepository.UserContactDetails(
                "SREEJU", "krishnan.sreeju@gmail.com", "9910303868")));
        DbaEmailService emailService =
            new DbaEmailService(mailSender, "portal@example.com", "dba@example.com", userLookupRepository);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true).setAttribute(
            AuthController.AUTH_SESSION_KEY,
            new AuthUserDto("SREEJU", "Sreeju", "USER", "Y", "stale@example.org", "9000000000"));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));

        try {
            emailService.sendDbaSqlEmail(List.of(
                new DbaEmailService.SqlRequest(
                    "INSERT", "MEMWGONOWNRPRTY", "ALPS",
                    "INSERT INTO MEMWGONOWNRPRTY VALUES('ALPS','M/S ALPS MINING SERVICES PRIVATE LIMITED');"),
                new DbaEmailService.SqlRequest(
                    "INSERT", "MEMWGONOWNRSHIP", "ALPS",
                    "INSERT INTO MEMWGONOWNRSHIP VALUES('ALPS','M/S ALPS MINING SERVICES PRIVATE LIMITED',NULL,'Y',SYSDATE,NULL);")
            ));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, times(1)).send(message.capture());
        SimpleMailMessage sentMessage = message.getValue();
        assertArrayEquals(new String[] { "dba@example.com" }, sentMessage.getTo());
        assertEquals("Request for INSERT – MEMWGONOWNRSHIP, MEMWGONOWNRPRTY – ALPS", sentMessage.getSubject());
        assertEquals("Dear DBA Team,\n\n"
                + "Kindly execute the attached/below script on rfrn3t and training.\n\n"
                + "Operation: INSERT\n"
                + "Table: MEMWGONOWNRSHIP, MEMWGONOWNRPRTY\n"
                + "Code: ALPS\n\n"
                + "SQL QUERY:\n"
                + "----------------------------------------1 INSERT---------------------------\n\n"
                + "INSERT INTO MEMWGONOWNRSHIP VALUES('ALPS','M/S ALPS MINING SERVICES PRIVATE LIMITED',NULL,'Y',SYSDATE,NULL);\n\n"
                + "----------------------------------------2 INSERT---------------------------\n\n"
                + "INSERT INTO MEMWGONOWNRPRTY VALUES('ALPS','M/S ALPS MINING SERVICES PRIVATE LIMITED');\n\n"
                + "UserID: SREEJU\n"
                + "Email ID: krishnan.sreeju@gmail.com\n"
                + "Phone Number: 9910303868",
            sentMessage.getText());
        verify(userLookupRepository).findUserContactDetails("SREEJU");
    }

    @Test
    void saveOwnershipParty_emailsBothInsertsWhenOwnershipRecordIsNew() throws SQLException {
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
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST")))
            .thenReturn(ownershipGlobalLookup, partyGlobalLookup);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipLookup);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(partyLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(ownershipGlobalLookup.executeQuery()).thenReturn(ownershipGlobalRs);
        when(partyLookup.executeQuery()).thenReturn(partyRs);
        when(partyGlobalLookup.executeQuery()).thenReturn(partyGlobalRs);
        when(ownershipRs.next()).thenReturn(false);
        when(ownershipGlobalRs.next()).thenReturn(true);
        when(ownershipGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("ALPS");
        when(ownershipGlobalRs.getString("MAVGLBLCUSTNAME"))
            .thenReturn("ALPS MINING SERVICES PRIVATE LIMITED");
        when(partyRs.next()).thenReturn(false);
        when(partyGlobalRs.next()).thenReturn(true);
        when(partyGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("ALPS");
        when(partyGlobalRs.getString("MAVGLBLCUSTNAME"))
            .thenReturn("ALPS MINING SERVICES PRIVATE LIMITED");

        service(dataSource, mailSender).saveOwnershipPartyJDBC(
            "ALPS", "ALPS MINING SERVICES PRIVATE LIMITED");

        String body = emailedBody(mailSender);
        assertTrue(body.contains("Table: MEMWGONOWNRSHIP, MEMWGONOWNRPRTY"));
        assertTrue(body.indexOf("INSERT INTO MEMWGONOWNRSHIP")
            < body.indexOf("INSERT INTO MEMWGONOWNRPRTY"));
        verify(mailSender, times(1)).send(any(SimpleMailMessage.class));
    }

    @Test
    void ownershipSubmission_doesNotSendPartialInsertWhenPartyRecordAlreadyExists() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ownershipLookup = mock(PreparedStatement.class);
        PreparedStatement ownershipGlobalLookup = mock(PreparedStatement.class);
        PreparedStatement partyLookup = mock(PreparedStatement.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet ownershipGlobalRs = mock(ResultSet.class);
        ResultSet partyRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString()))
            .thenReturn(ownershipLookup, ownershipGlobalLookup, partyLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(ownershipGlobalLookup.executeQuery()).thenReturn(ownershipGlobalRs);
        when(partyLookup.executeQuery()).thenReturn(partyRs);
        when(ownershipRs.next()).thenReturn(false);
        when(ownershipGlobalRs.next()).thenReturn(true);
        when(ownershipGlobalRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(ownershipGlobalRs.getString("MAVGLBLCUSTNAME")).thenReturn("ALPS");
        when(partyRs.next()).thenReturn(true);
        when(partyRs.getString("MAVWGONOWNRPRTYCODE")).thenReturn("AB12");
        when(partyRs.getString("MAVWGONOWNRPRTYDESC")).thenReturn("M/S ALPS");

        assertThrows(IllegalArgumentException.class,
            () -> service(dataSource, mailSender).submitOwnershipJDBC(
                "AB12", "ALPS", "OTHER", "Other Description"));

        verify(mailSender, never()).send(any(SimpleMailMessage.class));
    }

    @Test
    void ownershipLookupsPreferExistingOwnershipTableRecord() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ownershipLookup = mock(PreparedStatement.class);
        PreparedStatement globalLookup = mock(PreparedStatement.class);
        ResultSet ownershipRs = mock(ResultSet.class);
        ResultSet globalRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipLookup);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST WHERE"))).thenReturn(globalLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(globalLookup.executeQuery()).thenReturn(globalRs);
        when(ownershipRs.next()).thenReturn(true);
        when(ownershipRs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("AB12");
        when(ownershipRs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("Existing ownership record");
        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("Global Customer Company");

        Map<String, String> result = service(dataSource, mailSender).lookupOwnershipJDBC("ab12");

        assertEquals("EXISTING_OWNERSHIP_RECORD", result.get("recordSource"));
        assertEquals("Global Customer Company", result.get("ownershipDesc"));
        verify(ownershipLookup).setString(1, "AB12");
        verify(globalLookup).setString(1, "AB12");
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
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(ownershipLookup);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST WHERE"))).thenReturn(globalLookup);
        when(ownershipLookup.executeQuery()).thenReturn(ownershipRs);
        when(globalLookup.executeQuery()).thenReturn(globalRs);
        when(ownershipRs.next()).thenReturn(false);
        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("Global Customer Company");

        Map<String, String> result = service(dataSource, mailSender).lookupOwnershipJDBC("AB12");

        assertEquals("NEW_RECORD_FROM_GLOBAL_CUSTOMER", result.get("recordSource"));
        assertEquals("Global Customer Company", result.get("ownershipDesc"));
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
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRPRTY"))).thenReturn(partyLookup);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST WHERE"))).thenReturn(globalLookup);
        when(partyLookup.executeQuery()).thenReturn(partyRs);
        when(globalLookup.executeQuery()).thenReturn(globalRs);
        when(partyRs.next()).thenReturn(false);
        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTCODE")).thenReturn("PT34");
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("Global Party Company");

        Map<String, String> result = service(dataSource, mailSender).lookupOwnershipPartyJDBC("PT34");

        assertEquals("NEW_RECORD_FROM_GLOBAL_CUSTOMER", result.get("recordSource"));
        assertEquals("Global Party Company", result.get("partyDesc"));
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
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalLookup);
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
        verify(connection, never()).prepareStatement(contains("FROM MEMWGONOWNRSHIP"));
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
        verify(connection).prepareStatement(contains("FROM MEMGLBLCUST"));
    }

    @Test
    void ownershipUpdate_emailsUpdateWhenRecordAlreadyExists() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        PreparedStatement globalPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        ResultSet globalRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("FROM MEMWGONOWNRSHIP"))).thenReturn(lookupPs);
        when(connection.prepareStatement(contains("FROM MEMGLBLCUST"))).thenReturn(globalPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(globalPs.executeQuery()).thenReturn(globalRs);
        when(lookupRs.next()).thenReturn(true, false);
        when(lookupRs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("Existing description");
        when(globalRs.next()).thenReturn(true);
        when(globalRs.getString("MAVGLBLCUSTNAME")).thenReturn("Updated description");

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
        assertTrue(message.getValue().getText().contains("INSERT INTO RailTable (MixedColumn) VALUES ('RAIL - CO');"));
    }

    @Test
    void dbaRegistrationEmailReplacesAmpersandsInParentAndEveryGstinDetailInsert() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        List<DbaEmailService.SqlRequest> requests = List.of(
                new DbaEmailService.SqlRequest(
                        "INSERT", "MEMGLBLCUST", "ABCD",
                        "INSERT INTO MEMGLBLCUST (CODE, NAME, ADDRESS, CITY) "
                                + "VALUES ('ABCD', 'M/S ABC & XYZ', 'R&D Services', 'Delhi & NCR');"),
                new DbaEmailService.SqlRequest(
                        "INSERT", "MEMGLBLCUSTDTLS", "ABCD",
                        "INSERT INTO MEMGLBLCUSTDTLS (CODE, NAME, ADDRESS, CITY, GSTIN, PAN) "
                                + "VALUES ('ABCD', 'M/S ABC & XYZ', 'Road & Lane', 'Delhi & NCR', 'GST&1', 'PAN&1');"),
                new DbaEmailService.SqlRequest(
                        "INSERT", "MEMGLBLCUSTDTLS", "ABCD",
                        "INSERT INTO MEMGLBLCUSTDTLS (CODE, NAME, ADDRESS, CITY, GSTIN, PAN) "
                                + "VALUES ('ABCD', 'M/S ABC & XYZ', 'Plain Road', 'Delhi', 'GST&2', 'PAN&2');"));

        emailService.sendDbaRegistrationSqlEmail(requests);

        String body = emailedBody(mailSender);
        assertTrue(body.contains("'M/S ABC - XYZ'"));
        assertTrue(body.contains("'R-D SERVICES'"));
        assertTrue(body.contains("'DELHI - NCR'"));
        assertTrue(body.contains("'ROAD - LANE'"));
        assertTrue(body.contains("'GST-1', 'PAN-1'"));
        assertTrue(body.contains("'GST-2', 'PAN-2'"));
        assertTrue(body.contains("'PLAIN ROAD'"));
        assertFalse(body.contains("&"));
    }

    @Test
    void dbaHandlingAgentRegistrationEmailReplacesAmpersandsInParentAndDetailInserts() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        emailService.sendDbaRegistrationSqlEmail(List.of(
                new DbaEmailService.SqlRequest(
                        "INSERT", "MEMGLBLHNDGAGNT", "AG01",
                        "INSERT INTO MEMGLBLHNDGAGNT (CODE, NAME, ADDRESS, CITY) "
                                + "VALUES ('AG01', 'A&B Handling', 'R&D Road', 'Delhi & NCR');"),
                new DbaEmailService.SqlRequest(
                        "INSERT", "MEMGLBLHNDGAGNTDTLS", "AG01",
                        "INSERT INTO MEMGLBLHNDGAGNTDTLS (CODE, NAME, ADDRESS, CITY, GSTIN, PAN) "
                                + "VALUES ('AG01', 'A&B Handling', 'Address & Lane', 'Delhi & NCR', 'GST&1', 'PAN&1');")));

        String body = emailedBody(mailSender);

        assertTrue(body.contains("'M/S A-B HANDLING'"));
        assertTrue(body.contains("'R-D ROAD'"));
        assertTrue(body.contains("'DELHI - NCR'"));
        assertTrue(body.contains("'ADDRESS - LANE'"));
        assertTrue(body.contains("'GST-1', 'PAN-1'"));
        assertFalse(body.contains("&"));
    }

    @Test
    void dbaUpdateAndOwnershipSqlReplaceAmpersandsWithoutChangingNullOrOtherText() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        emailService.sendDbaSqlEmail(List.of(
                new DbaEmailService.SqlRequest(
                        "UPDATE", "MEMGLBLCUST", "ABCD",
                        "UPDATE MEMGLBLCUST SET MAVGLBLCUSTNAME = 'M/S ABC & XYZ', "
                                + "MAVGLBLCUSTADDRTEXT = 'R&D Services', MAVGNBLCUSTCITYNAME = 'Delhi & NCR' "
                                + "WHERE MAVGLBLCUSTCODE = 'ABCD';"),
                new DbaEmailService.SqlRequest(
                        "UPDATE", "MEMGLBLHNDGAGNT", "AG01",
                        "UPDATE MEMGLBLHNDGAGNT SET MAVHNDGAGNTNAME = 'A&B Handling', "
                                + "MAVHNDGAGNTADDRTEXT = 'Plain Road', MAVHNDGAGNTCITYNAME = NULL "
                                + "WHERE MAVHNDGAGNTCODE = 'AG01';"),
                new DbaEmailService.SqlRequest(
                        "UPDATE", "MEMGLBLCUSTDTLS", "ABCD",
                        "UPDATE MEMGLBLCUSTDTLS SET MAVGLBLCUSTADDRTEXT = 'Research & Development', "
                                + "MAVCUSTGSTNUMB = 'GST&123' WHERE MAVGLBLCUSTCODE = 'ABCD';"),
                new DbaEmailService.SqlRequest(
                        "INSERT", "MEMWGONOWNRSHIP", "ABCD",
                        "INSERT INTO MEMWGONOWNRSHIP VALUES ('ABCD', 'M/S A&B Enterprises', NULL, 'Y');")));

        String body = emailedBody(mailSender);

        assertTrue(body.contains("'M/S ABC - XYZ'"));
        assertTrue(body.contains("'R-D SERVICES'"));
        assertTrue(body.contains("'DELHI - NCR'"));
        assertTrue(body.contains("'M/S A-B HANDLING'"));
        assertTrue(body.contains("'PLAIN ROAD'"));
        assertTrue(body.contains("MAVHNDGAGNTCITYNAME = NULL"));
        assertTrue(body.contains("'RESEARCH - DEVELOPMENT'"));
        assertTrue(body.contains("'GST-123'"));
        assertTrue(body.contains("'M/S A-B ENTERPRISES'"));
        assertFalse(body.contains("&"));
    }

    @Test
    void dbaSqlEmailIncludesPoonamOnCc() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");

        emailService.sendDbaSqlEmail("INSERT", "INSERT INTO TEST_TABLE VALUES ('A');");

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertNotNull(message.getValue().getCc());
        assertTrue(Arrays.asList(message.getValue().getCc()).contains("malhotra.poonam@cris.org.in"));
    }

    @Test
    void dbaSqlEmailUsesDatabaseContactDetailsForAuthenticatedUserInFooter() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        JdbcPortalUserLookupRepository userLookupRepository = mock(JdbcPortalUserLookupRepository.class);
        when(userLookupRepository.findUserContactDetails("RAILUSER")).thenReturn(java.util.Optional.of(
            new JdbcPortalUserLookupRepository.UserContactDetails(
                "DBUSER", "database.user@example.org", "9910303868")));
        DbaEmailService emailService =
            new DbaEmailService(mailSender, "portal@example.com", "dba@example.com", userLookupRepository);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.getSession(true).setAttribute(
            AuthController.AUTH_SESSION_KEY,
            new AuthUserDto("RAILUSER", "Rail User", "USER", "Y", "stale@example.org", "9000000000"));
        request.getSession(false).setAttribute("CURRENT_OPERATING_DIVISION", "Nagpur (NGP)");
        ServletRequestAttributes requestAttributes = new ServletRequestAttributes(request);
        RequestContextHolder.setRequestAttributes(requestAttributes);

        try {
            emailService.sendDbaSqlEmail(List.of(
                new DbaEmailService.SqlRequest(
                    "INSERT", "TEST_TABLE", "A", "INSERT INTO TEST_TABLE VALUES ('A');",
                    "RAILUSER", "submitted@example.org")
            ));
        } finally {
            RequestContextHolder.resetRequestAttributes();
        }

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertTrue(message.getValue().getText().contains(
            "UserID: DBUSER\nEmail ID: database.user@example.org\nPhone Number: 9910303868"));
        verify(userLookupRepository).findUserContactDetails("RAILUSER");
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
    void dbaSqlEmailFormatsHandlingAgentInsertWithoutChangingQuotedWhitespace() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        String sql = "INSERT INTO MEMGLBLHNDGAGNT (COL1, COL2, COL3, COL4, COL5, COL6, COL7, COL8, COL9, COL10, COL11, COL12) "
            + "VALUES ('JPPL', 'M/S JINDAL PARADIP PORT LIMITED', "
            + "'MADHUBAN SUB POST OFFICE,HOUSING BOARD COLONY,HIG - 50 HOUSING BOARD COLONY PARADIP,ODISHA,754142', "
            + "'JAGATSINGHAPUR', NULL, NULL, NULL, SYSDATE, 'SR.DCM/CSTM', NULL, '21AAFCJ6524Q1ZA', 'AAFCJ6524Q');";

        emailService.sendDbaSqlEmail(List.of(
            new DbaEmailService.SqlRequest("INSERT", "MEMGLBLHNDGAGNT", "JPPL", sql)
        ));

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertTrue(message.getValue().getText().contains(
            "INSERT INTO MEMGLBLHNDGAGNT VALUES('JPPL','M/S JINDAL PARADIP PORT LIMITED',"
                + "'MADHUBAN SUB POST OFFICE,HOUSING BOARD COLONY,HIG - 50 HOUSING BOARD COLONY PARADIP,ODISHA,754142',"
                + "'JAGATSINGHAPUR',NULL,NULL,NULL,SYSDATE,'SR.DCM/CSTM',NULL,'21AAFCJ6524Q1ZA','AAFCJ6524Q');"
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
            "MEMGLBLHNDGAGNT",
            "UPDATE MEMGLBLHNDGAGNT SET MAVHNDAGNTNAME = 'm/s ALPS LOGISTICS' "
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

    @Test
    void dbaAuditInsertEmailPrefixesHandlingAgentName() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType("INSERT");
        audit.setTableName("MEMGLBLHNDGAGNT");
        audit.setCustomerCode("RINK");
        audit.setSqlStatement("INSERT INTO MEMGLBLHNDGAGNT (CODE, NAME) VALUES ('RINK', 'RINKU BORUAH');");

        emailService.sendDbaAuditEmail(audit);

        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        assertTrue(message.getValue().getText().contains(
            "INSERT INTO MEMGLBLHNDGAGNT VALUES('RINK','M/S RINKU BORUAH');"));
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
            "INSERT INTO MEMGLBLCUST VALUES('AB01','M/S ALPHA - BETA','12 MIXED ROAD, SECTOR B',"
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
            "INSERT INTO MEMGLBLCUST VALUES('AB01','RAIL - ROAD','MIXED CASE ADDRESS','NEW TOWN',"
                + "NULL,NULL,NULL,SYSDATE,'SR.DCM/AB',NULL,'GSTINABC123','PANABC');"
        ));
    }

    @Test
    void register_validatesFileUploadSecurity() {
        DataSource dataSource = mock(DataSource.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        CustomerServiceImpl service = service(dataSource, mailSender);

        com.cris.customerportal.dto.CustomerRegistrationRequest request =
            new com.cris.customerportal.dto.CustomerRegistrationRequest(
                "TEST CORP", "TEST", "ADDR", "CITY", "110001",
                java.util.Collections.singletonList(new com.cris.customerportal.dto.GstinRequest("07", "07AAAAA0000A1Z5")),
                "AAAAA0000A", "DIV", "ZONE", "a@b.com", "9999999999", "GLOBAL"
            );

        // Path traversal rejection
        org.springframework.mock.web.MockMultipartFile traversalFile =
            new org.springframework.mock.web.MockMultipartFile(
                "gstinFiles", "../bad.pdf", "application/pdf", "%PDF-1.4 test".getBytes()
            );
        assertThrows(IllegalArgumentException.class, () -> service.register(request, java.util.Collections.singletonList(traversalFile)));

        // Non-PDF mime type
        org.springframework.mock.web.MockMultipartFile nonPdfFile =
            new org.springframework.mock.web.MockMultipartFile(
                "gstinFiles", "test.txt", "text/plain", "hello".getBytes()
            );
        assertThrows(IllegalArgumentException.class, () -> service.register(request, java.util.Collections.singletonList(nonPdfFile)));

        // Invalid magic bytes (spoofed .pdf)
        org.springframework.mock.web.MockMultipartFile spoofedFile =
            new org.springframework.mock.web.MockMultipartFile(
                "gstinFiles", "fake.pdf", "application/pdf", "MZexecutable".getBytes()
            );
        assertThrows(IllegalArgumentException.class, () -> service.register(request, java.util.Collections.singletonList(spoofedFile)));
    }

    @Test
    void normalizeAddress_removesSpacesAfterCommasPreservingWordSpaces() {
        String input = "SHOP NO 209, EDGE COMMERCIAL COMPLEX, VIDHANSHABHA ROAD, MOWA, RAIPUR, CHHATTISGARH, 492004";
        String expected = "SHOP NO 209,EDGE COMMERCIAL COMPLEX,VIDHANSHABHA ROAD,MOWA,RAIPUR,CHHATTISGARH,492004";
        assertEquals(expected, CustomerServiceImpl.normalizeAddress(input));
    }

    @Test
    void normalizeAddress_handlesMultipleSpacesAndNull() {
        assertNull(CustomerServiceImpl.normalizeAddress(null));
        assertEquals("A,B,C", CustomerServiceImpl.normalizeAddress("  A,   B,  C  "));
        assertEquals("123 MAIN ST,APT 4B", CustomerServiceImpl.normalizeAddress("123 MAIN ST, APT 4B"));
    }

    @Test
    void registerNewEntryJDBC_allowsAddressUnder100CharsAfterRemovingCommaSpaces() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement checkCodePs = mock(PreparedStatement.class);
        ResultSet checkCodeRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("WHERE MAVGLBLCUSTCODE = ?"))).thenReturn(checkCodePs);
        when(checkCodePs.executeQuery()).thenReturn(checkCodeRs);
        when(checkCodeRs.next()).thenReturn(false);

        String addressWithSpaces = "SHOP NO 209, EDGE COMMERCIAL COMPLEX, VIDHANSHABHA ROAD, MOWA, RAIPUR, CHHATTISGARH, 492004, SUITE 101";
        assertTrue(addressWithSpaces.length() > 100);
        assertTrue(CustomerServiceImpl.normalizeAddress(addressWithSpaces).length() <= 100);

        String code = service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
            "codeType", "global",
            "customerCode", "G100",
            "companyName", "TEST CO",
            "address", addressWithSpaces,
            "city", "RAIPUR",
            "operatingDivision", "RAIPUR",
            "zone", "SECR",
            "panNumber", "ABCDE1234F",
            "gstinNumbers", "22ABCDE1234F1Z5"
        ));

        assertEquals("G100", code);
        String body = emailedBody(mailSender);
        assertTrue(body.contains(CustomerServiceImpl.normalizeAddress(addressWithSpaces).toUpperCase(java.util.Locale.ROOT)));
    }

    @Test
    void registerNewEntryJDBC_rejectsAddressExceeding100CharsEvenAfterRemovingCommaSpaces() {
        DataSource dataSource = mock(DataSource.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        String excessiveAddress = "A".repeat(101);
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
            service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
                "codeType", "global",
                "customerCode", "G101",
                "companyName", "TEST CO",
                "address", excessiveAddress,
                "city", "RAIPUR",
                "operatingDivision", "RAIPUR",
                "zone", "SECR",
                "panNumber", "ABCDE1234F",
                "gstinNumbers", "22ABCDE1234F1Z5"
            ))
        );
        assertEquals("Address cannot exceed 100 characters.", ex.getMessage());
    }

    @Test
    void dbaEmailService_normalizesAddressInUpdateSqlAutomatically() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");

        String rawSql = "UPDATE MEMGLBLCUST SET MAVGLBLCUSTADDRTEXT = 'SHOP NO 209, EDGE COMMERCIAL COMPLEX, VIDHANSHABHA ROAD, MOWA, RAIPUR, CHHATTISGARH, 492004' WHERE MAVGLBLCUSTCODE = 'AB12';";
        emailService.sendDbaSqlEmail("UPDATE", rawSql);

        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(captor.capture());
        String body = captor.getValue().getText();
        assertTrue(body.contains("MAVGLBLCUSTADDRTEXT = 'SHOP NO 209,EDGE COMMERCIAL COMPLEX,VIDHANSHABHA ROAD,MOWA,RAIPUR,CHHATTISGARH,492004'"));
        assertFalse(body.contains("SHOP NO 209, EDGE"));
    }

    @Test
    void registerNewEntryJDBC_rejectsMismatchedPanAndGstin() {
        DataSource dataSource = mock(DataSource.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
            service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
                "codeType", "global",
                "customerCode", "G101",
                "companyName", "TEST CO",
                "address", "Valid Address",
                "city", "RAIPUR",
                "operatingDivision", "RAIPUR",
                "zone", "SECR",
                "panNumber", "ABCDE1234F",
                "gstinNumbers", "22XYZAB9999K1Z5"
            ))
        );
        assertTrue(ex.getMessage().contains("does not match PAN number"));
    }

    @Test
    void registerNewEntryJDBC_rejectsInvalidGstinFormat() {
        DataSource dataSource = mock(DataSource.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
            service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
                "codeType", "global",
                "customerCode", "G101",
                "companyName", "TEST CO",
                "address", "Valid Address",
                "city", "RAIPUR",
                "operatingDivision", "RAIPUR",
                "zone", "SECR",
                "panNumber", "ABCDE1234F",
                "gstinNumbers", "INVALIDGSTIN"
            ))
        );
        assertTrue(ex.getMessage().contains("valid 15-character GSTIN numbers"));
    }

    @Test
    void registerNewEntryJDBC_rejectsInvalidPanFormat() {
        DataSource dataSource = mock(DataSource.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
            service(dataSource, mailSender).registerNewEntryJDBC(Map.of(
                "codeType", "global",
                "customerCode", "G101",
                "companyName", "TEST CO",
                "address", "Valid Address",
                "city", "RAIPUR",
                "operatingDivision", "RAIPUR",
                "zone", "SECR",
                "panNumber", "INVALIDPAN",
                "gstinNumbers", "22ABCDE1234F1Z5"
            ))
        );
        assertTrue(ex.getMessage().contains("valid PAN number"));
    }

    @Test
    void updateOldCustomerJDBC_rejectsMismatchedPanAndGstinWhenGstinChanged() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true, false);
        Map<String, String> originalRecord = originalOldCustomerValues("OLD ROAD,MARKET AREA");
        when(lookupRs.getString(anyString())).thenAnswer(inv -> originalRecord.get(inv.getArgument(0)));

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
            service(dataSource, mailSender).updateOldCustomerJDBC(Map.of(
                "codeType", "global",
                "customerCode", "AB12",
                "companyName", "M/S OLD COMPANY",
                "address", "OLD ROAD,MARKET AREA",
                "city", "PATNA",
                "pincode", "800001",
                "panNumber", "AAAAA1111A",
                "gstinNumbers", "27XYZAB9999K1Z5"
            ))
        );
        assertTrue(ex.getMessage().contains("does not match PAN number"));
    }

    @Test
    void updateOldCustomerJDBC_normalizesAddressWithCommaSpacesBeforeSqlGenerationAndEmail() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true, false);
        when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S TEST CO");
        when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("OLD ADDR");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("AAECR3577N");
        when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("27AAECR3577NLZE");
        when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("RAIPUR");

        String enteredAddress = "SHOP NO 209, EDGE COMMERCIAL COMPLEX, VIDHANSHABHA ROAD, MOWA, RAIPUR, CHHATTISGARH, 492004";
        service(dataSource, mailSender).updateOldCustomerJDBC(Map.of(
            "codeType", "global",
            "customerCode", "AB12",
            "companyName", "M/S TEST CO",
            "address", enteredAddress,
            "city", "RAIPUR",
            "panNumber", "AAECR3577N",
            "gstinNumbers", "27AAECR3577NLZE"
        ));

        String body = emailedBody(mailSender);
        assertTrue(body.contains("MAVGLBLCUSTADDRTEXT = 'SHOP NO 209,EDGE COMMERCIAL COMPLEX,VIDHANSHABHA ROAD,MOWA,RAIPUR,CHHATTISGARH,492004'"));
        assertFalse(body.contains("SHOP NO 209, EDGE"));
    }

    @Test
    void updateOldCustomerJDBC_savesNewlyEnteredMissingPanAndGstin() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true, false);
        when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S OLD COMPANY");
        when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("OLD ROAD");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn(null);
        when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn(null);
        when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("PATNA");

        service(dataSource, mailSender).updateOldCustomerJDBC(Map.of(
            "codeType", "global",
            "customerCode", "AB12",
            "companyName", "M/S OLD COMPANY",
            "address", "OLD ROAD",
            "panNumber", "AAECR3577N",
            "gstinNumbers", "27AAECR3577NLZE"
        ));

        String body = emailedBody(mailSender);
        assertTrue(body.contains("MAVCUSTPANNUMB = 'AAECR3577N'"));
        assertTrue(body.contains("INSERT INTO MEMGLBLCUSTDTLS"));
        assertTrue(body.contains("'27AAECR3577NLZE'"));
    }

    @Test
    void updateOldCustomerJDBC_preventsAccidentalOverwriteOfExistingPanAndGstinWhenEmptyOrNullSupplied() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true, false);
        when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("AB12");
        when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("M/S OLD COMPANY");
        when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("OLD ROAD");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("AAECR3577N");
        when(lookupRs.getString("MAVCUSTGSTNUMB")).thenReturn("27AAECR3577NLZE");
        when(lookupRs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("PATNA");

        Map<String, String> payload = new HashMap<>();
        payload.put("codeType", "global");
        payload.put("customerCode", "AB12");
        payload.put("companyName", "M/S OLD COMPANY");
        payload.put("address", "NEW ROAD");
        payload.put("panNumber", "");
        payload.put("gstinNumbers", "null");

        service(dataSource, mailSender).updateOldCustomerJDBC(payload);

        String body = emailedBody(mailSender);
        assertTrue(body.contains("MAVGLBLCUSTADDRTEXT = 'NEW ROAD'"));
        assertFalse(body.contains("MAVCUSTPANNUMB = NULL"));
        assertFalse(body.contains("MAVCUSTGSTNUMB = NULL"));
    }

    @Test
    void searchGlobalCustomersByCompanyName_searchesByNameUsingInstr() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString("MAVGLBLCUSTCODE")).thenReturn("TISCO");
        when(rs.getString("MAVGLBLCUSTNAME")).thenReturn("TATA STEEL LTD");
        when(rs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("JAMSHEDPUR");
        when(rs.getString("MAVCUSTPANNUMB")).thenReturn("AAACT2727Q");
        when(rs.getString("MAVCUSTGSTNUMB")).thenReturn("20AAACT2727Q1Z5");
        when(rs.getString("MAVGNBLCUSTCITYNAME")).thenReturn("JAMSHEDPUR");
        when(rs.getString("MAVPCOCODE")).thenReturn("831001");
        when(rs.getString("MAVIMPLREMK")).thenReturn("SR.DCM/CKP");
        when(rs.getString("MAVVERIFICATIONDATE")).thenReturn("2026-11-10");

        List<com.cris.customerportal.dto.OldCustomerResponse> results =
                service(dataSource, mock(JavaMailSender.class))
                    .searchGlobalCustomersByCompanyName("tata");

        assertEquals(1, results.size());
        assertEquals("TISCO", results.get(0).getCustomerCode());
        assertEquals("TATA STEEL LTD", results.get(0).getCompanyName());
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("FROM MEMGLBLCUST WHERE INSTR(UPPER(NVL(MAVGLBLCUSTNAME, '')), ?) > 0")));
        verify(ps).setString(1, "TATA");
    }

    @Test
    void searchHandlingAgents_modeCode_searchesOnlyCodeColumn() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString("MAVHNDAGNTCODE")).thenReturn("AG01");
        when(rs.getString("MAVHNDAGNTNAME")).thenReturn("AGENT ONE");

        List<com.cris.customerportal.dto.GlobalAgentResponse> results =
                service(dataSource, mock(JavaMailSender.class))
                    .searchHandlingAgents("AG", "CODE");

        assertEquals(1, results.size());
        assertEquals("AG01", results.get(0).getCode());
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("WHERE INSTR(UPPER(NVL(MAVHNDGAGNTCODE, '')), ?) > 0")
                && !sql.contains("OR INSTR(UPPER(NVL(MAVHNDGAGNTNAME, '')), ?) > 0")));
        verify(ps).setString(1, "AG");
    }

    @Test
    void searchHandlingAgents_modeName_searchesOnlyNameColumn() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString("MAVHNDAGNTCODE")).thenReturn("AG01");
        when(rs.getString("MAVHNDAGNTNAME")).thenReturn("LOGISTICS INC");

        List<com.cris.customerportal.dto.GlobalAgentResponse> results =
                service(dataSource, mock(JavaMailSender.class))
                    .searchHandlingAgents("LOGISTICS", "NAME");

        assertEquals(1, results.size());
        assertEquals("AG01", results.get(0).getCode());
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("WHERE INSTR(UPPER(NVL(MAVHNDGAGNTNAME, '')), ?) > 0")
                && !sql.contains("OR INSTR(UPPER(NVL(MAVHNDGAGNTCODE, '')), ?) > 0")));
        verify(ps).setString(1, "LOGISTICS");
    }

    @Test
    void searchOwnershipCodes_modeCode_searchesOnlyCodeColumn() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("OWN1");
        when(rs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("OWNER ONE");

        List<Map<String, String>> results =
                service(dataSource, mock(JavaMailSender.class))
                    .searchOwnershipCodes("OWN1", "CODE");

        assertEquals(1, results.size());
        assertEquals("OWN1", results.get(0).get("ownershipCode"));
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("WHERE INSTR(UPPER(NVL(MAVWGONOWNRSHIPCODE, '')), ?) > 0")
                && !sql.contains("OR INSTR(UPPER(NVL(MAVWGONOWNRSHIPDESC, '')), ?) > 0")));
        verify(ps).setString(1, "OWN1");
    }

    @Test
    void searchOwnershipCodes_modeName_searchesOnlyDescColumn() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString("MAVWGONOWNRSHIPCODE")).thenReturn("OWN1");
        when(rs.getString("MAVWGONOWNRSHIPDESC")).thenReturn("FREIGHT CORP");

        List<Map<String, String>> results =
                service(dataSource, mock(JavaMailSender.class))
                    .searchOwnershipCodes("FREIGHT", "NAME");

        assertEquals(1, results.size());
        assertEquals("FREIGHT CORP", results.get(0).get("companyName"));
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("WHERE INSTR(UPPER(NVL(MAVWGONOWNRSHIPDESC, '')), ?) > 0")
                && !sql.contains("OR INSTR(UPPER(NVL(MAVWGONOWNRSHIPCODE, '')), ?) > 0")));
        verify(ps).setString(1, "FREIGHT");
    }

    private void stubSingleExistingGstinDetail(ResultSet details) throws SQLException {
        when(details.next()).thenReturn(true, false);
        when(details.getString("MAVCUSTGSTNUMB")).thenReturn("27AAAAA1111A1Z5");
        when(details.getString("REGISTERED_ADDRESS")).thenReturn("OLD ROAD");
        when(details.getString("CITY")).thenReturn("PATNA");
        when(details.getString("MANPINCODE")).thenReturn("800001");
        when(details.getString("IMPLEMENTATION_DATE")).thenReturn("2026-01-01 00:00:00");
        when(details.getString("EFFECTIVE_FROM")).thenReturn("2026-01-01 00:00:00");
        when(details.getString("EFFECTIVE_TO")).thenReturn(null);
    }

    private CustomerServiceImpl service(DataSource dataSource, JavaMailSender mailSender) {
        CustomerServiceImpl service = new CustomerServiceImpl(
            mock(CustomerRepository.class),
            dataSource);
        ReflectionTestUtils.setField(service, "dbaEmailService",
            new DbaEmailService(mailSender, "portal@example.com", "dba@example.com"));
        return service;
    }

    private String sendRegistrationAndCaptureEmail(String codeType, String gstinNumbers, String gstinDetails)
            throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet resultSet = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(resultSet);
        when(resultSet.next()).thenReturn(false);

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", codeType);
        formData.put("customerCode", "ABCD");
        formData.put("companyName", "Example Company");
        formData.put("address", "Shop 1, Delhi");
        formData.put("city", "Delhi");
        formData.put("pincode", "110001");
        formData.put("zone", "Northern Railway");
        formData.put("operatingDivision", "Delhi (DLI)");
        formData.put("panNumber", "APEPA6196G");
        formData.put("gstinNumbers", gstinNumbers);
        if (gstinDetails != null) {
            formData.put("gstinDetails", gstinDetails);
        }

        service(dataSource, mailSender).registerNewEntryJDBC(formData);
        return emailedBody(mailSender);
    }

    private void assertRegistrationEmail(
            String body, String parentTable, String detailTable, String... gstins) {
        assertTrue(body.contains("Operation: INSERT\nTable: " + parentTable + ", " + detailTable
                + "\nCode: ABCD\n\nSQL QUERY:\n"));
        assertTrue(body.contains("----------------------------------------1 PARENT INSERT"));
        assertEquals(1, countOccurrences(body, "INSERT INTO " + parentTable + " "));
        assertEquals(gstins.length, countOccurrences(body, "INSERT INTO " + detailTable + " "));
        assertEquals(gstins.length + 1, countOccurrences(body, "'M/S EXAMPLE COMPANY'"));
        assertTrue(body.contains("----------------------------------------2 GSTIN DETAIL INSERT"));
        assertTrue(body.contains("UserID: Not available"));
        assertTrue(body.contains("Email ID: Not available"));
        assertTrue(body.contains("Phone Number: Not available"));
        for (String gstin : gstins) {
            assertTrue(body.contains("'" + gstin + "'"), "Missing GSTIN " + gstin);
        }
    }

    private int countOccurrences(String value, String target) {
        int count = 0;
        int offset = 0;
        while ((offset = value.indexOf(target, offset)) >= 0) {
            count++;
            offset += target.length();
        }
        return count;
    }

    private Map<String, String> originalOldCustomerValues(String address) {
        Map<String, String> values = new HashMap<>();
        values.put("MAVGLBLCUSTCODE", "AB12");
        values.put("MAVHNDAGNTCODE", "AB12");
        values.put("MAVHNDGAGNTCODE", "AB12");
        values.put("MAVGLBLCUSTNAME", "M/S OLD COMPANY");
        values.put("MAVHNDAGNTNAME", "M/S OLD COMPANY");
        values.put("MAVGLBLCUSTADDRTEXT", address);
        values.put("MAVHNDAGNTADDRTEXT", address);
        values.put("MAVGNBLCUSTCITYNAME", "PATNA");
        values.put("MAVHNDAGNTCITYNAME", "PATNA");
        values.put("MAVCUSTPANNUMB", "AAAAA1111A");
        values.put("MAVCUSTGSTNUMB", "27AAAAA1111A1Z5");
        values.put("MAVPCOCODE", "800001");
        values.put("MAVIMPLREMK", "SR.DCM/DNR");
        return values;
    }

    private String emailedBody(JavaMailSender mailSender) {
        ArgumentCaptor<SimpleMailMessage> message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(message.capture());
        return message.getValue().getText();
    }

    @Test
    void checkGstinDuplicate_returnsDuplicateWhenFoundInGlobalCustomerDetailTable() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement psCust = mock(PreparedStatement.class);
        ResultSet rsCust = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(conn);
        when(conn.prepareStatement(contains("MEMGLBLCUSTDTLS"))).thenReturn(psCust);
        when(psCust.executeQuery()).thenReturn(rsCust);
        when(rsCust.next()).thenReturn(true, false);
        when(rsCust.getString("MAVGLBLCUSTCODE")).thenReturn("ABCD");
        when(rsCust.getString("MAVGLBLCUSTNAME")).thenReturn("ABC INDUSTRIES");
        when(rsCust.getString("MAVCUSTGSTNUMB")).thenReturn("20APEPA6196G1Z9");
        when(rsCust.getString("MAVCUSTPANNUMB")).thenReturn("APEPA6196G");
        when(rsCust.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("123 RAILWAY ROAD");
        when(rsCust.getString("CITY")).thenReturn("DELHI");
        when(rsCust.getString("MANPINCODE")).thenReturn("110001");
        when(rsCust.getString("EFFECTIVE_FROM")).thenReturn("2026-01-01");
        when(rsCust.getString("EFFECTIVE_TO")).thenReturn(null);

        CustomerServiceImpl service = service(dataSource, mailSender);
        GstinDuplicateCheckResult result = service.checkGstinDuplicate("20APEPA6196G1Z9");

        assertTrue(result.isDuplicate());
        assertEquals("DUPLICATE", result.getStatus());
        assertEquals(1, result.getRecords().size());
        GstinDuplicateRecord rec = result.getRecords().get(0);
        assertEquals("Global Customer", rec.getRecordType());
        assertEquals("ABCD", rec.getExistingCode());
        assertEquals("ABC INDUSTRIES", rec.getCompanyName());
        assertEquals("20APEPA6196G1Z9", rec.getGstin());
        assertFalse(rec.isFlaggedInconsistent());
    }

    @Test
    void checkGstinDuplicate_returnsDuplicateWhenFoundInHandlingAgentDetailTable() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement psHndg = mock(PreparedStatement.class);
        ResultSet rsHndg = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(conn);
        when(conn.prepareStatement(contains("MEMGLBLHNDGAGNTDTLS"))).thenReturn(psHndg);
        when(psHndg.executeQuery()).thenReturn(rsHndg);
        when(rsHndg.next()).thenReturn(true, false);
        when(rsHndg.getString("MAVHNDGAGNTCODE")).thenReturn("H123");
        when(rsHndg.getString("MAVHNDGAGNTNAME")).thenReturn("FAST LOGISTICS");
        when(rsHndg.getString("MAVCUSTGSTNUMB")).thenReturn("20APEPA6196G1Z9");
        when(rsHndg.getString("MAVCUSTPANNUMB")).thenReturn("APEPA6196G");
        when(rsHndg.getString("MAVHNDGAGNTADDRTEXT")).thenReturn("456 PORT ROAD");
        when(rsHndg.getString("CITY")).thenReturn("MUMBAI");
        when(rsHndg.getString("MANPINCODE")).thenReturn("400001");
        when(rsHndg.getString("EFFECTIVE_FROM")).thenReturn("2026-02-01");

        CustomerServiceImpl service = service(dataSource, mailSender);
        GstinDuplicateCheckResult result = service.checkGstinDuplicate("20APEPA6196G1Z9");

        assertTrue(result.isDuplicate());
        assertEquals("DUPLICATE", result.getStatus());
        assertEquals(1, result.getRecords().size());
        GstinDuplicateRecord rec = result.getRecords().get(0);
        assertEquals("Handling Agent", rec.getRecordType());
        assertEquals("H123", rec.getExistingCode());
        assertEquals("FAST LOGISTICS", rec.getCompanyName());
        assertFalse(rec.isFlaggedInconsistent());
    }

    @Test
    void checkGstinDuplicate_flagsInconsistencyWhenFoundInBothDetailTables() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement psCust = mock(PreparedStatement.class);
        ResultSet rsCust = mock(ResultSet.class);
        PreparedStatement psHndg = mock(PreparedStatement.class);
        ResultSet rsHndg = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(conn);
        when(conn.prepareStatement(contains("MEMGLBLCUSTDTLS"))).thenReturn(psCust);
        when(psCust.executeQuery()).thenReturn(rsCust);
        when(rsCust.next()).thenReturn(true, false);
        when(rsCust.getString("MAVGLBLCUSTCODE")).thenReturn("ABCD");
        when(rsCust.getString("MAVGLBLCUSTNAME")).thenReturn("ABC INDUSTRIES");
        when(rsCust.getString("MAVCUSTGSTNUMB")).thenReturn("20APEPA6196G1Z9");

        when(conn.prepareStatement(contains("MEMGLBLHNDGAGNTDTLS"))).thenReturn(psHndg);
        when(psHndg.executeQuery()).thenReturn(rsHndg);
        when(rsHndg.next()).thenReturn(true, false);
        when(rsHndg.getString("MAVHNDGAGNTCODE")).thenReturn("H123");
        when(rsHndg.getString("MAVHNDGAGNTNAME")).thenReturn("FAST LOGISTICS");
        when(rsHndg.getString("MAVCUSTGSTNUMB")).thenReturn("20APEPA6196G1Z9");

        CustomerServiceImpl service = service(dataSource, mailSender);
        GstinDuplicateCheckResult result = service.checkGstinDuplicate("20APEPA6196G1Z9");

        assertTrue(result.isDuplicate());
        assertEquals(2, result.getRecords().size());
        assertTrue(result.getRecords().get(0).isFlaggedInconsistent());
        assertTrue(result.getRecords().get(1).isFlaggedInconsistent());
    }

    @Test
    void checkGstinDuplicate_returnsAvailableWhenInNeitherTable() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(conn);

        CustomerServiceImpl service = service(dataSource, mailSender);
        GstinDuplicateCheckResult result = service.checkGstinDuplicate("20APEPA6196G1Z9");

        assertFalse(result.isDuplicate());
        assertEquals("AVAILABLE", result.getStatus());
        assertTrue(result.getRecords().isEmpty());
    }

    @Test
    void checkGstinDuplicate_returnsUnavailableOnDatabaseError() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(conn);
        when(conn.prepareStatement(anyString())).thenThrow(new SQLException("Connection lost"));

        CustomerServiceImpl service = service(dataSource, mailSender);
        GstinDuplicateCheckResult result = service.checkGstinDuplicate("20APEPA6196G1Z9");

        assertFalse(result.isDuplicate());
        assertEquals("UNAVAILABLE", result.getStatus());
        assertTrue(result.getMessage().contains("Unavailable"));
    }

    @Test
    void registerNewEntryJDBC_multipleGstins_generatesParentAndAllDetailInserts() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement psExists = mock(PreparedStatement.class);
        ResultSet rsExists = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(conn);
        when(conn.prepareStatement("SELECT 1 FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?")).thenReturn(psExists);
        when(psExists.executeQuery()).thenReturn(rsExists);
        when(rsExists.next()).thenReturn(false);

        DbaEmailService dbaEmailService = mock(DbaEmailService.class);
        CustomerServiceImpl service = service(dataSource, mailSender);
        ReflectionTestUtils.setField(service, "dbaEmailService", dbaEmailService);

        String gstinDetailsJson = "[{\"gstin\":\"20APEPA6196G1Z9\",\"address\":\"Shop 1, Delhi\",\"city\":\"Delhi\",\"pincode\":\"110001\"},"
            + "{\"gstin\":\"20APEPA6196G2Z8\",\"address\":\"Warehouse 2, Haryana\",\"city\":\"Gurgaon\",\"pincode\":\"122001\"}]";

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", "global");
        formData.put("customerCode", "ABCD");
        formData.put("companyName", "ABC INDUSTRIES");
        formData.put("address", "Shop 1, Delhi");
        formData.put("city", "Delhi");
        formData.put("pincode", "110001");
        formData.put("zone", "Northern Railway");
        formData.put("operatingDivision", "Delhi (DLI)");
        formData.put("panNumber", "APEPA6196G");
        formData.put("gstinNumbers", "20APEPA6196G1Z9,20APEPA6196G2Z8");
        formData.put("gstinDetails", gstinDetailsJson);

        String code = service.registerNewEntryJDBC(formData);
        assertEquals("ABCD", code);

        ArgumentCaptor<List<DbaEmailService.SqlRequest>> captor = ArgumentCaptor.forClass(List.class);
        verify(dbaEmailService).sendDbaRegistrationSqlEmail(captor.capture());
        List<DbaEmailService.SqlRequest> requests = captor.getValue();

        // 1 Parent INSERT + 2 Detail INSERTs = 3 total requests
        assertEquals(3, requests.size());
        assertEquals("MEMGLBLCUST", requests.get(0).table());
        assertEquals("MEMGLBLCUSTDTLS", requests.get(1).table());
        assertEquals("MEMGLBLCUSTDTLS", requests.get(2).table());
        assertTrue(requests.get(1).sql().contains("20APEPA6196G1Z9"));
        assertTrue(requests.get(1).sql().contains("Shop 1,Delhi"));
        assertTrue(requests.get(2).sql().contains("20APEPA6196G2Z8"));
        assertTrue(requests.get(2).sql().contains("Warehouse 2,Haryana"));
    }

    @Test
    void registerNewEntryJDBC_singleGstin_generatesParentAndDetailInserts() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement psExists = mock(PreparedStatement.class);
        ResultSet rsExists = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(conn);
        when(conn.prepareStatement("SELECT 1 FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?")).thenReturn(psExists);
        when(psExists.executeQuery()).thenReturn(rsExists);
        when(rsExists.next()).thenReturn(false);

        DbaEmailService dbaEmailService = mock(DbaEmailService.class);
        CustomerServiceImpl service = service(dataSource, mailSender);
        ReflectionTestUtils.setField(service, "dbaEmailService", dbaEmailService);

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", "global");
        formData.put("customerCode", "ABCD");
        formData.put("companyName", "ABC INDUSTRIES");
        formData.put("address", "Shop 1, Delhi");
        formData.put("city", "Delhi");
        formData.put("pincode", "110001");
        formData.put("zone", "Northern Railway");
        formData.put("operatingDivision", "Delhi (DLI)");
        formData.put("panNumber", "APEPA6196G");
        formData.put("gstinNumbers", "20APEPA6196G1Z9");

        String code = service.registerNewEntryJDBC(formData);
        assertEquals("ABCD", code);

        ArgumentCaptor<List<DbaEmailService.SqlRequest>> captor = ArgumentCaptor.forClass(List.class);
        verify(dbaEmailService).sendDbaRegistrationSqlEmail(captor.capture());
        List<DbaEmailService.SqlRequest> requests = captor.getValue();

        assertEquals(2, requests.size());
        assertEquals("MEMGLBLCUST", requests.get(0).table());
        assertEquals("MEMGLBLCUSTDTLS", requests.get(1).table());
        assertTrue(requests.get(1).sql().contains("20APEPA6196G1Z9"));
        assertTrue(requests.get(1).sql().contains("'Shop 1,Delhi'"));
    }

    @Test
    void registrationEmail_containsGlobalParentAndSingleGstinDetailInsert() throws SQLException {
        String gstin = "20APEPA6196G1Z9";
        String body = sendRegistrationAndCaptureEmail("global", gstin, null);

        assertRegistrationEmail(body, "MEMGLBLCUST", "MEMGLBLCUSTDTLS", gstin);
        assertTrue(body.contains("'SHOP 1,DELHI'"));
        assertTrue(body.contains("'DELHI', 110001, SYSDATE"));
    }

    @Test
    void registrationEmail_containsGlobalParentAndEveryMultipleGstinDetailInsert() throws SQLException {
        String gstins = "20APEPA6196G1Z9,20APEPA6196G2Z8";
        String details = "[{\"gstin\":\"20APEPA6196G1Z9\",\"address\":\"Shop 1, Delhi\",\"city\":\"Delhi\",\"pincode\":\"110001\"},"
                + "{\"gstin\":\"20APEPA6196G2Z8\",\"address\":\"Warehouse 2, Haryana\",\"city\":\"Gurgaon\",\"pincode\":\"122001\"}]";
        String body = sendRegistrationAndCaptureEmail("global", gstins, details);

        assertRegistrationEmail(body, "MEMGLBLCUST", "MEMGLBLCUSTDTLS",
                "20APEPA6196G1Z9", "20APEPA6196G2Z8");
        assertTrue(body.contains("'SHOP 1,DELHI'"));
        assertTrue(body.contains("'WAREHOUSE 2,HARYANA'"));
        assertTrue(body.contains("'GURGAON', 122001, SYSDATE"));
    }

    @Test
    void registrationEmail_containsHandlingAgentParentAndSingleGstinDetailInsert() throws SQLException {
        String gstin = "09APEPA6196G1ZJ";
        String body = sendRegistrationAndCaptureEmail("handling_agent", gstin, null);

        assertRegistrationEmail(body, "MEMGLBLHNDGAGNT", "MEMGLBLHNDGAGNTDTLS", gstin);
        assertTrue(body.contains("'SHOP 1,DELHI'"));
        assertTrue(body.contains("'DELHI', 110001, SYSDATE"));
    }

    @Test
    void registrationEmail_containsHandlingAgentParentAndEveryMultipleGstinDetailInsert() throws SQLException {
        String gstins = "09APEPA6196G1ZJ,20APEPA6196G2Z8";
        String details = "[{\"gstin\":\"09APEPA6196G1ZJ\",\"address\":\"Shop 1, Delhi\",\"city\":\"Delhi\",\"pincode\":\"110001\"},"
                + "{\"gstin\":\"20APEPA6196G2Z8\",\"address\":\"Warehouse 2, Haryana\",\"city\":\"Gurgaon\",\"pincode\":\"122001\"}]";
        String body = sendRegistrationAndCaptureEmail("handling_agent", gstins, details);

        assertRegistrationEmail(body, "MEMGLBLHNDGAGNT", "MEMGLBLHNDGAGNTDTLS",
                "09APEPA6196G1ZJ", "20APEPA6196G2Z8");
        assertTrue(body.contains("'SHOP 1,DELHI'"));
        assertTrue(body.contains("'WAREHOUSE 2,HARYANA'"));
        assertTrue(body.contains("'GURGAON', 122001, SYSDATE"));
    }

    @Test
    void registrationEmail_doesNotSendWhenRequiredDetailInsertIsMissing() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");
        List<DbaEmailService.SqlRequest> requests = List.of(new DbaEmailService.SqlRequest(
                "INSERT", "MEMGLBLCUST", "ABCD", "INSERT INTO MEMGLBLCUST VALUES ('ABCD');"));

        assertThrows(IllegalArgumentException.class, () -> emailService.sendDbaRegistrationSqlEmail(requests));
        assertThrows(IllegalArgumentException.class, () -> emailService.sendDbaRegistrationSqlEmail(List.of(
                new DbaEmailService.SqlRequest(
                        "INSERT", "MEMGLBLCUSTDTLS", "ABCD", "INSERT INTO MEMGLBLCUSTDTLS VALUES ('ABCD');"))));
        verifyNoInteractions(mailSender);
    }

    @Test
    void registerNewEntryJDBC_doesNotSendEmailWhenGstinDetailsAreMalformed() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet resultSet = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(resultSet);
        when(resultSet.next()).thenReturn(false);

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", "global");
        formData.put("customerCode", "ABCD");
        formData.put("companyName", "ABC INDUSTRIES");
        formData.put("address", "Shop 1, Delhi");
        formData.put("city", "Delhi");
        formData.put("pincode", "110001");
        formData.put("zone", "Northern Railway");
        formData.put("operatingDivision", "Delhi (DLI)");
        formData.put("panNumber", "APEPA6196G");
        formData.put("gstinNumbers", "20APEPA6196G1Z9");
        formData.put("gstinDetails", "{malformed");

        assertThrows(IllegalArgumentException.class,
                () -> service(dataSource, mailSender).registerNewEntryJDBC(formData));
        verifyNoInteractions(mailSender);
    }

    @Test
    void registerNewEntryJDBC_blocksWhenAnyGstinIsDuplicate() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement psCust = mock(PreparedStatement.class);
        ResultSet rsCust = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(conn);
        when(conn.prepareStatement(contains("MEMGLBLCUSTDTLS"))).thenReturn(psCust);
        when(psCust.executeQuery()).thenReturn(rsCust);
        when(rsCust.next()).thenReturn(true, false);
        when(rsCust.getString("MAVGLBLCUSTCODE")).thenReturn("EXIST");
        when(rsCust.getString("MAVGLBLCUSTNAME")).thenReturn("EXISTING CORP");
        when(rsCust.getString("MAVCUSTGSTNUMB")).thenReturn("20APEPA6196G1Z9");

        CustomerServiceImpl service = service(dataSource, mailSender);

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", "global");
        formData.put("customerCode", "ABCD");
        formData.put("companyName", "ABC INDUSTRIES");
        formData.put("address", "Shop 1, Delhi");
        formData.put("zone", "Northern Railway");
        formData.put("operatingDivision", "Delhi (DLI)");
        formData.put("panNumber", "APEPA6196G");
        formData.put("gstinNumbers", "20APEPA6196G1Z9");

        assertThrows(ResourceAlreadyExistsException.class, () -> service.registerNewEntryJDBC(formData));
    }

    @Test
    void checkPanDuplicate_returnsAvailableWhenPanNotFound() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        ResultSet rs = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(conn);
        when(conn.prepareStatement(anyString())).thenReturn(ps);
        when(ps.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(false);

        CustomerServiceImpl service = service(dataSource, mock(JavaMailSender.class));

        // Blank or invalid
        assertEquals("AVAILABLE", service.checkPanDuplicate("").getStatus());
        assertEquals("AVAILABLE", service.checkPanDuplicate(null).getStatus());
        assertEquals("AVAILABLE", service.checkPanDuplicate("INVALID123").getStatus());

        // Valid but not in DB
        com.cris.customerportal.dto.PanDuplicateCheckResult res = service.checkPanDuplicate("ABCDE1234F");
        assertFalse(res.isDuplicate());
        assertEquals("AVAILABLE", res.getStatus());
        assertTrue(res.getCompanies().isEmpty());
    }

    @Test
    void checkPanDuplicate_returnsDuplicateWhenFoundInGlobalCustomer() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement psParent = mock(PreparedStatement.class);
        ResultSet rsParent = mock(ResultSet.class);
        PreparedStatement psDtls = mock(PreparedStatement.class);
        ResultSet rsDtls = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(conn);

        when(conn.prepareStatement(contains("FROM MEMGLBLCUST WHERE UPPER(TRIM(MAVCUSTPANNUMB))"))).thenReturn(psParent);
        when(psParent.executeQuery()).thenReturn(rsParent);
        when(rsParent.next()).thenReturn(true, false);
        when(rsParent.getString("MAVGLBLCUSTCODE")).thenReturn("ABPC");
        when(rsParent.getString("MAVGLBLCUSTNAME")).thenReturn("ABP PRIVATE LIMITED");
        when(rsParent.getString("MAVCUSTPANNUMB")).thenReturn("ABCDE1234F");
        when(rsParent.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("123 DELHI ROAD");
        when(rsParent.getString("CITY")).thenReturn("DELHI");
        when(rsParent.getString("MAVPCOCODE")).thenReturn("110001");

        when(conn.prepareStatement(contains("FROM MEMGLBLCUSTDTLS WHERE UPPER(TRIM(MAVGLBLCUSTCODE))"))).thenReturn(psDtls);
        when(psDtls.executeQuery()).thenReturn(rsDtls);
        when(rsDtls.next()).thenReturn(true, false);
        when(rsDtls.getString("MAVCUSTGSTNUMB")).thenReturn("07ABCDE1234F1Z5");
        when(rsDtls.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("123 DELHI ROAD");
        when(rsDtls.getString("CITY")).thenReturn("DELHI");
        when(rsDtls.getString("MANPINCODE")).thenReturn("110001");

        CustomerServiceImpl service = service(dataSource, mock(JavaMailSender.class));
        com.cris.customerportal.dto.PanDuplicateCheckResult res = service.checkPanDuplicate("ABCDE1234F");

        assertTrue(res.isDuplicate());
        assertEquals("DUPLICATE", res.getStatus());
        assertEquals(1, res.getCompanies().size());

        com.cris.customerportal.dto.PanCompanyRecord comp = res.getCompanies().get(0);
        assertEquals("ABPC", comp.getCompanyCode());
        assertEquals("ABP PRIVATE LIMITED", comp.getCompanyName());
        assertEquals("ABCDE1234F", comp.getPan());
        assertEquals("Global Customer", comp.getRecordType());
        assertEquals(1, comp.getGstins().size());
        assertEquals("07ABCDE1234F1Z5", comp.getGstins().get(0).getGstin());
    }

    @Test
    void checkPanDuplicate_returnsDuplicateWhenFoundInHandlingAgent() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement psParent = mock(PreparedStatement.class);
        ResultSet rsParent = mock(ResultSet.class);
        PreparedStatement psDtls = mock(PreparedStatement.class);
        ResultSet rsDtls = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(conn);

        when(conn.prepareStatement(contains("FROM MEMGLBLHNDGAGNT WHERE UPPER(TRIM(MAVCUSTPANNUMB))"))).thenReturn(psParent);
        when(psParent.executeQuery()).thenReturn(rsParent);
        when(rsParent.next()).thenReturn(true, false);
        when(rsParent.getString("CODE")).thenReturn("HA01");
        when(rsParent.getString("NAME")).thenReturn("HA AGENT CORP");
        when(rsParent.getString("MAVCUSTPANNUMB")).thenReturn("ABCDE1234F");
        when(rsParent.getString("ADDR")).thenReturn("STATION ROAD");
        when(rsParent.getString("CITY")).thenReturn("MUMBAI");
        when(rsParent.getString("MAVPCOCODE")).thenReturn("400001");

        when(conn.prepareStatement(contains("FROM MEMGLBLHNDGAGNTDTLS WHERE UPPER(TRIM(MAVHNDGAGNTCODE))"))).thenReturn(psDtls);
        when(psDtls.executeQuery()).thenReturn(rsDtls);
        when(rsDtls.next()).thenReturn(true, false);
        when(rsDtls.getString("MAVCUSTGSTNUMB")).thenReturn("27ABCDE1234F1Z8");
        when(rsDtls.getString("MAVHNDGAGNTADDRTEXT")).thenReturn("STATION ROAD");
        when(rsDtls.getString("CITY")).thenReturn("MUMBAI");
        when(rsDtls.getString("MANPINCODE")).thenReturn("400001");

        CustomerServiceImpl service = service(dataSource, mock(JavaMailSender.class));
        com.cris.customerportal.dto.PanDuplicateCheckResult res = service.checkPanDuplicate("ABCDE1234F");

        assertTrue(res.isDuplicate());
        assertEquals("DUPLICATE", res.getStatus());
        assertEquals(1, res.getCompanies().size());

        com.cris.customerportal.dto.PanCompanyRecord comp = res.getCompanies().get(0);
        assertEquals("HA01", comp.getCompanyCode());
        assertEquals("Handling Agent", comp.getRecordType());
        assertEquals(1, comp.getGstins().size());
        assertEquals("27ABCDE1234F1Z8", comp.getGstins().get(0).getGstin());
    }

    @Test
    void checkPanDuplicate_returnsUnavailableOnSQLException() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        when(dataSource.getConnection()).thenThrow(new SQLException("Connection refused"));

        CustomerServiceImpl service = service(dataSource, mock(JavaMailSender.class));
        com.cris.customerportal.dto.PanDuplicateCheckResult res = service.checkPanDuplicate("ABCDE1234F");

        assertFalse(res.isDuplicate());
        assertEquals("UNAVAILABLE", res.getStatus());
        assertTrue(res.getMessage().contains("Unavailable"));
    }

    @Test
    void registerNewEntryJDBC_blocksWhenPanAlreadyExistsInSameRecordType() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection conn = mock(Connection.class);
        PreparedStatement psParent = mock(PreparedStatement.class);
        ResultSet rsParent = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(conn);

        when(conn.prepareStatement(contains("FROM MEMGLBLCUST WHERE UPPER(TRIM(MAVCUSTPANNUMB))"))).thenReturn(psParent);
        when(psParent.executeQuery()).thenReturn(rsParent);
        when(rsParent.next()).thenReturn(true, false);
        when(rsParent.getString("MAVGLBLCUSTCODE")).thenReturn("ABPC");
        when(rsParent.getString("MAVGLBLCUSTNAME")).thenReturn("ABP PRIVATE LIMITED");
        when(rsParent.getString("MAVCUSTPANNUMB")).thenReturn("ABCDE1234F");

        CustomerServiceImpl service = service(dataSource, mock(JavaMailSender.class));

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", "global");
        formData.put("customerCode", "NEWC");
        formData.put("companyName", "ABP BRANCH");
        formData.put("address", "Haryana Road");
        formData.put("zone", "Northern Railway");
        formData.put("operatingDivision", "Delhi (DLI)");
        formData.put("panNumber", "ABCDE1234F");
        formData.put("gstinNumbers", "06ABCDE1234F1Z2");

        ResourceAlreadyExistsException ex = assertThrows(
            ResourceAlreadyExistsException.class,
            () -> service.registerNewEntryJDBC(formData)
        );
        assertTrue(ex.getMessage().contains("Company Already Exists"));
        assertTrue(ex.getMessage().contains("ABPC"));
    }

    @Test
    void updateOldCustomerJDBC_rejectsWhenCustomerCodeDoesNotMatchExpectedCustomerCode() {
        DataSource dataSource = mock(DataSource.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        CustomerServiceImpl service = service(dataSource, mailSender);

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", "global");
        formData.put("customerCode", "WRONG");
        formData.put("expectedCustomerCode", "ABPC");
        formData.put("companyName", "ABP Branch");
        formData.put("address", "Haryana Road");
        formData.put("panNumber", "ABCDE1234F");

        IllegalArgumentException ex = assertThrows(
            IllegalArgumentException.class,
            () -> service.updateOldCustomerJDBC(formData)
        );
        assertTrue(ex.getMessage().contains("Customer code mismatch"));
        assertTrue(ex.getMessage().contains("ABPC"));
    }

    @Test
    void updateOldCustomerJDBC_acceptsWhenCustomerCodeMatchesExpectedCustomerCode() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement lookupPs = mock(PreparedStatement.class);
        ResultSet lookupRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(lookupPs);
        when(lookupPs.executeQuery()).thenReturn(lookupRs);
        when(lookupRs.next()).thenReturn(true, false);
        when(lookupRs.getString("MAVGLBLCUSTCODE")).thenReturn("ABPC");
        when(lookupRs.getString("MAVGLBLCUSTNAME")).thenReturn("ABP Private Limited");
        when(lookupRs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("Old Address");
        when(lookupRs.getString("MAVCUSTPANNUMB")).thenReturn("ABCDE1234F");

        CustomerServiceImpl service = service(dataSource, mailSender);

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", "global");
        formData.put("customerCode", "ABPC");
        formData.put("expectedCustomerCode", "ABPC");
        formData.put("companyName", "ABP Private Limited");
        formData.put("address", "New Address");
        formData.put("panNumber", "ABCDE1234F");

        assertDoesNotThrow(() -> service.updateOldCustomerJDBC(formData));
    }

    @Test
    void registerNewEntryJDBC_includesOnlyFirstGstinInParentInsert_andSavesAllGstinsInDetailTable() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement existsPs = mock(PreparedStatement.class);
        ResultSet existsRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("WHERE MAVGLBLCUSTCODE = ?"))).thenReturn(existsPs);
        when(existsPs.executeQuery()).thenReturn(existsRs);
        when(existsRs.next()).thenReturn(false);

        CustomerServiceImpl service = service(dataSource, mailSender);

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", "global");
        formData.put("customerCode", "ABPC");
        formData.put("companyName", "ABP Private Limited");
        formData.put("address", "Delhi Road");
        formData.put("city", "Delhi");
        formData.put("pincode", "110001");
        formData.put("zone", "Northern Railway");
        formData.put("operatingDivision", "Delhi (DLI)");
        formData.put("panNumber", "ABCDE1234F");
        formData.put("gstinNumbers", "07ABCDE1234F1Z1,27ABCDE1234F1Z2");

        service.registerNewEntryJDBC(formData);

        String body = emailedBody(mailSender);

        // 1. Parent INSERT must contain the first GSTIN right before PAN
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUST VALUES('ABPC','M/S ABP PRIVATE LIMITED','DELHI ROAD','DELHI',NULL,NULL,NULL,SYSDATE,'SR.DCM/DLI',NULL,'07ABCDE1234F1Z1','ABCDE1234F');"
        ));

        // 2. Parent INSERT must NOT contain the second GSTIN
        assertFalse(body.contains("INSERT INTO MEMGLBLCUST VALUES(" + ".*" + "27ABCDE1234F1Z2"));

        // 3. Both GSTINs must have detail table INSERTs
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUSTDTLS (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME, MANPINCODE, MADIMPLDATE, MAVRMRK, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, MADDATEEFCTFROM, MADDATEEFCTTO) VALUES ('ABPC', 'M/S ABP PRIVATE LIMITED', 'DELHI ROAD', 'DELHI', 110001, SYSDATE, NULL, '07ABCDE1234F1Z1', 'ABCDE1234F', SYSDATE, NULL);"
        ));
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLCUSTDTLS (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME, MANPINCODE, MADIMPLDATE, MAVRMRK, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, MADDATEEFCTFROM, MADDATEEFCTTO) VALUES ('ABPC', 'M/S ABP PRIVATE LIMITED', 'DELHI ROAD', 'DELHI', 110001, SYSDATE, NULL, '27ABCDE1234F1Z2', 'ABCDE1234F', SYSDATE, NULL);"
        ));
    }

    @Test
    void registerNewHandlingAgent_includesOnlyFirstGstinInParentInsert_andSavesAllGstinsInDetailTable() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement existsPs = mock(PreparedStatement.class);
        ResultSet existsRs = mock(ResultSet.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(contains("WHERE MAVHNDGAGNTCODE = ?"))).thenReturn(existsPs);
        when(existsPs.executeQuery()).thenReturn(existsRs);
        when(existsRs.next()).thenReturn(false);

        CustomerServiceImpl service = service(dataSource, mailSender);

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", "handling_agent");
        formData.put("customerCode", "JDPL");
        formData.put("companyName", "JINDAL PIPES LIMITED");
        formData.put("address", "22ND MILE STONE, DELHI HAPUR ROAD");
        formData.put("city", "PARBHANI");
        formData.put("pincode", "431401");
        formData.put("zone", "South Central Railway");
        formData.put("operatingDivision", "Madurai (MDU)");
        formData.put("panNumber", "AAACJ2055K");
        formData.put("gstinNumbers", "09AAACJ2055K1Z1,27AAACJ2055K1Z2");

        service.registerNewEntryJDBC(formData);

        String body = emailedBody(mailSender);

        // 1. Parent INSERT must contain the first GSTIN right before PAN
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLHNDGAGNT VALUES('JDPL','M/S JINDAL PIPES LIMITED','22ND MILE STONE,DELHI HAPUR ROAD','PARBHANI',NULL,NULL,NULL,SYSDATE,'SR.DCM/MDU',NULL,'09AAACJ2055K1Z1','AAACJ2055K');"
        ));

        // 2. Both GSTINs must have detail table INSERTs
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLHNDGAGNTDTLS (MAVHNDGAGNTCODE, MAVHNDGAGNTNAME, MAVHNDGAGNTADDRTEXT, MAVHNDGAGNTCITYNAME, MANPINCODE, MADIMPLDATE, MAVRMRK, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, MADDATEEFCTFROM, MADDATEEFCTTO) VALUES ('JDPL', 'M/S JINDAL PIPES LIMITED', '22ND MILE STONE,DELHI HAPUR ROAD', 'PARBHANI', 431401, SYSDATE, NULL, '09AAACJ2055K1Z1', 'AAACJ2055K', SYSDATE, NULL);"
        ));
        assertTrue(body.contains(
            "INSERT INTO MEMGLBLHNDGAGNTDTLS (MAVHNDGAGNTCODE, MAVHNDGAGNTNAME, MAVHNDGAGNTADDRTEXT, MAVHNDGAGNTCITYNAME, MANPINCODE, MADIMPLDATE, MAVRMRK, MAVCUSTGSTNUMB, MAVCUSTPANNUMB, MADDATEEFCTFROM, MADDATEEFCTTO) VALUES ('JDPL', 'M/S JINDAL PIPES LIMITED', '22ND MILE STONE,DELHI HAPUR ROAD', 'PARBHANI', 431401, SYSDATE, NULL, '27AAACJ2055K1Z2', 'AAACJ2055K', SYSDATE, NULL);"
        ));
    }

    @Test
    void updateOldCustomerJDBC_additionalGstinForExistingPan_generatesOnlyDetailInsert_neverParentInsert() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        when(dataSource.getConnection()).thenReturn(connection);

        when(connection.prepareStatement(anyString())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            PreparedStatement ps = mock(PreparedStatement.class);
            ResultSet rs = mock(ResultSet.class);
            when(ps.executeQuery()).thenReturn(rs);

            if (sql.contains("FROM MEMGLBLCUST WHERE")) {
                when(rs.next()).thenReturn(true, false);
                when(rs.getString("MAVGLBLCUSTCODE")).thenReturn("ABPC");
                when(rs.getString("MAVGLBLCUSTNAME")).thenReturn("ABP Private Limited");
                when(rs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("Delhi Road");
                when(rs.getString("MAVCUSTPANNUMB")).thenReturn("ABCDE1234F");
            } else if (sql.contains("FROM MEMGLBLCUSTDTLS WHERE") && sql.contains("MAVGLBLCUSTCODE = ?")) {
                when(rs.next()).thenReturn(true, false);
                when(rs.getString("MAVCUSTGSTNUMB")).thenReturn("07ABCDE1234F1Z1");
                when(rs.getString("MAVGLBLCUSTADDRTEXT")).thenReturn("Delhi Road");
                when(rs.getString("REGISTERED_ADDRESS")).thenReturn("Delhi Road");
            } else {
                when(rs.next()).thenReturn(false);
            }
            return ps;
        });

        CustomerServiceImpl service = service(dataSource, mailSender);

        Map<String, String> formData = new HashMap<>();
        formData.put("codeType", "global");
        formData.put("customerCode", "ABPC");
        formData.put("expectedCustomerCode", "ABPC");
        formData.put("companyName", "ABP Private Limited");
        formData.put("address", "Delhi Road");
        formData.put("panNumber", "ABCDE1234F");
        formData.put("gstinDetails", "[{\"gstin\":\"07ABCDE1234F1Z1\",\"address\":\"Delhi Road\"},{\"gstin\":\"27ABCDE1234F1Z2\",\"address\":\"Mumbai Road\",\"city\":\"Mumbai\",\"pincode\":\"400001\"}]");

        service.updateOldCustomerJDBC(formData);

        String body = emailedBody(mailSender);

        // Must NOT contain any parent INSERT or parent GSTIN update
        assertFalse(body.contains("INSERT INTO MEMGLBLCUST "));
        assertFalse(body.contains("MAVCUSTGSTNUMB ="));

        // Must contain detail table INSERT for the new GSTIN
        assertTrue(body.contains("INSERT INTO MEMGLBLCUSTDTLS"));
        assertTrue(body.contains("27ABCDE1234F1Z2"));
    }
}
