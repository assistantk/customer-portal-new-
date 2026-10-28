package com.cris.customerportal.service;

import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class DeleteRequestServiceTest {

    @Test
    void verifyGlobalCustomerUsesParameterizedLookup() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet results = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(
                "SELECT MAVGLBLCUSTCODE, MAVGLBLCUSTNAME FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?"))
                .thenReturn(statement);
        when(statement.executeQuery()).thenReturn(results);
        when(results.next()).thenReturn(true, false);
        when(results.getString(1)).thenReturn("AEIP");
        when(results.getString(2)).thenReturn("Example Company");

        DeleteRequestService service = new DeleteRequestService(dataSource, mock(DbaEmailService.class));
        DeleteRequestService.VerifiedRecord record = service.verify("GLOBAL_CUSTOMER", " aeip ");

        assertEquals("AEIP", record.getCode());
        assertEquals("Example Company", record.getCompanyName());
        verify(statement).setString(1, "AEIP");
        verify(statement).executeQuery();
        verify(statement, never()).executeUpdate();
        verify(connection, never()).createStatement();
    }

    @Test
    void verifyHandlingAgentUsesItsOwnTableAndColumns() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet results = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(
                "SELECT MAVHNDGAGNTCODE, MAVHNDGAGNTNAME FROM MEMGLBLHNDGAGNT WHERE MAVHNDGAGNTCODE = ?"))
                .thenReturn(statement);
        when(statement.executeQuery()).thenReturn(results);
        when(results.next()).thenReturn(true, false);
        when(results.getString(1)).thenReturn("VAIS");
        when(results.getString(2)).thenReturn("Handling Company");

        DeleteRequestService.VerifiedRecord record =
                new DeleteRequestService(dataSource, mock(DbaEmailService.class))
                        .verify("HANDLING_AGENT", "VAIS");

        assertEquals("VAIS", record.getCode());
        assertEquals("Handling Company", record.getCompanyName());
        verify(statement).setString(1, "VAIS");
        verify(statement, never()).executeUpdate();
    }

    @Test
    void missingCodeCannotProduceDeleteEmail() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet results = mock(ResultSet.class);
        DbaEmailService emailService = mock(DbaEmailService.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(results);
        when(results.next()).thenReturn(false);

        DeleteRequestService service = new DeleteRequestService(dataSource, emailService);
        assertNull(service.verify("GLOBAL_CUSTOMER", "NOPE"));
        assertThrows(IllegalArgumentException.class,
                () -> service.sendRequest("GLOBAL_CUSTOMER", "NOPE", "Example Company"));
        verifyNoInteractions(emailService);
        verify(statement, never()).executeUpdate();
    }

    @Test
    void missingHandlingAgentCannotProduceDeleteEmail() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet results = mock(ResultSet.class);
        DbaEmailService emailService = mock(DbaEmailService.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(results);
        when(results.next()).thenReturn(false);

        assertNull(new DeleteRequestService(dataSource, emailService)
                .verify("HANDLING_AGENT", "UNKNOWN"));
        verifyNoInteractions(emailService);
    }

    @Test
    void incorrectCompanyNameCannotProduceDeleteEmail() throws Exception {
        DataSource dataSource = dataSourceWithRecord("AEIP", "Actual Company");
        DbaEmailService emailService = mock(DbaEmailService.class);

        DeleteRequestService service = new DeleteRequestService(dataSource, emailService);
        assertThrows(IllegalArgumentException.class,
                () -> service.sendRequest("GLOBAL_CUSTOMER", "AEIP", "Different Company"));

        verifyNoInteractions(emailService);
    }

    @Test
    void matchingCompanyEmailsCodeOnlyDeleteSqlForGlobalCustomer() throws Exception {
        DataSource dataSource = dataSourceWithRecord("CSPL", "M/S CHAITANYA SOLVEX PVT. LTD.");
        DbaEmailService emailService = mock(DbaEmailService.class);

        new DeleteRequestService(dataSource, emailService)
                .sendRequest("GLOBAL_CUSTOMER", "CSPL", "M/S CHAITANYA SOLVEX PVT. LTD.");

        verify(emailService).sendDbaQueryEmail(
                "DELETE",
                "MEMGLBLCUST",
                "CSPL",
                "M/S CHAITANYA SOLVEX PVT. LTD.",
                "DELETE FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = 'CSPL';");
    }

    @Test
    void matchingAgentEmailsCodeOnlyDeleteSqlUsingHandlingAgentCodeColumn() throws Exception {
        DataSource dataSource = dataSourceWithRecord("VAIS", "Handling Company");
        DbaEmailService emailService = mock(DbaEmailService.class);

        new DeleteRequestService(dataSource, emailService)
                .sendRequest("HANDLING_AGENT", "VAIS", "Handling Company");

        verify(emailService).sendDbaQueryEmail(
                "DELETE",
                "MEMGLBLHNDGAGNT",
                "VAIS",
                "Handling Company",
                "DELETE FROM MEMGLBLHNDGAGNT WHERE MAVHNDGAGNTCODE = 'VAIS';");
    }

    @Test
    void matchingCompanyEmailsEscapedDeleteSqlWithoutExecutingIt() throws Exception {
        DataSource dataSource = dataSourceWithRecord("O'NEIL", "O'Neil Company");
        DbaEmailService emailService = mock(DbaEmailService.class);

        new DeleteRequestService(dataSource, emailService)
                .sendRequest("GLOBAL_CUSTOMER", "O'NEIL", "  o'neil company  ");

        verify(emailService).sendDbaQueryEmail(
                "DELETE",
                "MEMGLBLCUST",
                "O'NEIL",
                "O'Neil Company",
                "DELETE FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = 'O''NEIL';");
    }

    @Test
    void lookupFailureDoesNotBecomeNotFoundOrSendEmail() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        DbaEmailService emailService = mock(DbaEmailService.class);
        when(dataSource.getConnection()).thenThrow(new java.sql.SQLException("database offline"));

        assertThrows(com.cris.customerportal.exception.DatabaseUnavailableException.class,
                () -> new DeleteRequestService(dataSource, emailService)
                        .sendRequest("GLOBAL_CUSTOMER", "AEIP", "Example Company"));
        verifyNoInteractions(emailService);
    }

    @Test
    void emailFailureIsPropagatedAndDoesNotTriggerDatabaseMutation() throws Exception {
        DataSource dataSource = dataSourceWithRecord("AEIP", "Example Company");
        DbaEmailService emailService = mock(DbaEmailService.class);
        doThrow(new MailSendException("SMTP unavailable"))
                .when(emailService).sendDbaQueryEmail(
                        anyString(), anyString(), anyString(), anyString(), anyString());

        assertThrows(MailSendException.class,
                () -> new DeleteRequestService(dataSource, emailService)
                        .sendRequest("GLOBAL_CUSTOMER", "AEIP", "Example Company"));
        verify(emailService).sendDbaQueryEmail(
                anyString(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void rejectsAnyCodeTypeOutsideTheExplicitAllowlist() {
        DeleteRequestService service =
                new DeleteRequestService(mock(DataSource.class), mock(DbaEmailService.class));

        assertThrows(IllegalArgumentException.class, () -> service.verify("MEMGLBLCUST", "AEIP"));
    }

    private DataSource dataSourceWithRecord(String code, String companyName) throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet results = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(results);
        when(results.next()).thenReturn(true, false);
        when(results.getString(1)).thenReturn(code);
        when(results.getString(2)).thenReturn(companyName);
        return dataSource;
    }
}
