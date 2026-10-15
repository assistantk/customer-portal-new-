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
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getTo()).contains("dba@example.com"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("sharma.ashish@cris.org.in"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("rajeevsiloiya@cris.org.in"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("audit@example.com"));
        String emailBody = java.util.Objects.requireNonNull(messageCaptor.getValue().getText());
        assertTrue(emailBody.startsWith(
            "Dear DBA Team,\n\nKindly execute attached/below script on rfrn3t and training.\n\nSQL QUERY:\n" +
                "----------------------------------------1 INSERT---------------------------\n\n"
        ));
        assertTrue(emailBody.contains(
            "INSERT INTO MEMGLBLCUST (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME, MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, MADEDMNDDATE, MAVCUSTGSTNUMB, MAVCUSTPANNUMB) " +
                "VALUES ('ABCD', 'ACME AND SONS LTD', 'ADDRESS', 'NAGPUR', NULL, NULL, NULL, SYSDATE, 'SR.DCM/NCP', NULL, '27AAECR3577NLZE', 'AAECR3577N')"
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
            "'EFGH', 'EXAMPLE LTD', 'ADDRESS', 'DHANBAD', NULL, NULL, NULL, SYSDATE, 'SR.DCM/DHN', NULL, '20AAECR3577NLZE', 'AAECR3577N')"
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
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("sharma.ashish@cris.org.in"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("rajeevsiloiya@cris.org.in"));
        assertTrue(messageCaptor.getValue().getText().contains(
            "INSERT INTO RailTable (MixedColumn, created_date) VALUES ('RAIL AND CO', SYSDATE);"
        ));
        assertTrue(messageCaptor.getValue().getText().contains(
            "----------------------------------------1 INSERT---------------------------"
        ));
        assertTrue(messageCaptor.getValue().getText().contains("Mob:-8130797454"));
    }

    @Test
    void updateOldCustomer_shouldEmailSuccessfulUpdateAndOriginalWhereClause() throws SQLException {
        CustomerRepository customerRepository = mock(CustomerRepository.class);
        CustomerGstinRepository gstinRepository = mock(CustomerGstinRepository.class);
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement updatePs = mock(PreparedStatement.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(updatePs);
        when(updatePs.executeUpdate()).thenReturn(1);

        CustomerServiceImpl service = new CustomerServiceImpl(customerRepository, gstinRepository, "uploads", dataSource);
        ReflectionTestUtils.setField(service, "dbaEmailService",
            new DbaEmailService(mailSender, "audit@example.com", "dba@example.com"));
        service.updateOldCustomerJDBC(Map.of(
            "codeType", "global",
            "customerCode", "AB12",
            "companyName", "Rail & Road",
            "address", "O'Brien Street",
            "city", "Pune",
            "panNumber", "abcde1234f",
            "gstinNumbers", "27abcde1234f1z9"
        ));

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(2000)).send(messageCaptor.capture());
        String emailBody = java.util.Objects.requireNonNull(messageCaptor.getValue().getText());
        assertTrue(emailBody.contains("----------------------------------------1 UPDATE---------------------------"));
        assertTrue(emailBody.contains("MAVGLBLCUSTNAME = 'RAIL AND ROAD'"));
        assertTrue(emailBody.contains("MAVGLBLCUSTADDRTEXT = 'O''BRIEN STREET'"));
        assertTrue(emailBody.contains("MAVCUSTPANNUMB = 'ABCDE1234F'"));
        assertTrue(emailBody.contains("WHERE MAVGLBLCUSTCODE = 'AB12'"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("sharma.ashish@cris.org.in"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("rajeevsiloiya@cris.org.in"));
        verify(updatePs).setString(2, "O'Brien Street");
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
