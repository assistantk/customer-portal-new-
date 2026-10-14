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
    void registerNewGlobalCustomer_shouldUseMappedDivisionDesignationInAuditInsert() throws SQLException {
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
        ReflectionTestUtils.setField(service, "mailSender", mailSender);
        ReflectionTestUtils.setField(service, "auditFromEmail", "audit@example.com");
        service.registerNewEntryJDBC(Map.of(
            "codeType", "global",
            "customerCode", "ABCD",
            "companyName", "Acme Ltd",
            "address", "Address",
            "city", "Nagpur",
            "operatingDivision", "Nagpur (NGP)",
            "gstinNumbers", "27AAECR3577NLZE",
            "panNumber", "AAECR3577N"
        ));

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(2000)).send(messageCaptor.capture());
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("audit@example.com"));
        String emailBody = messageCaptor.getValue().getText();
        assertTrue(emailBody.contains(
            "INSERT INTO MEMGLBLCUST VALUES ('ABCD', 'Acme Ltd', 'Address', 'Nagpur', " +
                "NULL, NULL, SYSDATE, 'SR.DCM/NCP', NULL, '27AAECR3577NLZE', 'AAECR3577N', SYSDATE);"
        ));
        assertFalse(emailBody.contains("SR.DCM/NGP"));
        assertFalse(emailBody.contains("Nagpur (NGP)"));
    }

    @Test
    void registerNewGlobalCustomer_shouldNotGuessDivisionCodeForUnmappedLocation() throws SQLException {
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
        ReflectionTestUtils.setField(service, "mailSender", mailSender);
        ReflectionTestUtils.setField(service, "auditFromEmail", "audit@example.com");
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
        String emailBody = messageCaptor.getValue().getText();
        assertTrue(emailBody.contains(
            "INSERT INTO MEMGLBLCUST VALUES ('EFGH', 'Example Ltd', 'Address', 'Dhanbad', " +
                "NULL, NULL, SYSDATE, NULL, NULL, '20AAECR3577NLZE', 'AAECR3577N', SYSDATE);"
        ));
        assertFalse(emailBody.contains("SR.DCM/DHN"));
        assertFalse(emailBody.contains("Dhanbad (DHN)"));
    }

    @Test
    void dbaAuditEmail_shouldCopyConfiguredSenderMailbox() {
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService service = new DbaEmailService(mailSender, "audit@example.com", "dba@example.com");
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType("INSERT");
        audit.setTableName("MEMGLBLCUST");
        audit.setCustomerCode("ABCD");
        audit.setSqlStatement("INSERT INTO MEMGLBLCUST VALUES (...);");

        service.sendDbaAuditEmail(audit);

        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getTo()).contains("dba@example.com"));
        assertTrue(java.util.Arrays.asList(messageCaptor.getValue().getCc()).contains("audit@example.com"));
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
        service.saveOwnershipJDBC("AB12", "Test ownership");

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(connection, atLeastOnce()).prepareStatement(sqlCaptor.capture());

        assertTrue(sqlCaptor.getAllValues().stream().anyMatch(sql ->
            sql.equals("INSERT INTO MEMWGONOWNRSHIP (MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC) VALUES (?, ?)")
        ));
    }
}
