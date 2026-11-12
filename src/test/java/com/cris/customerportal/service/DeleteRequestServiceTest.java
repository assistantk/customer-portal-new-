package com.cris.customerportal.service;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
        DataSource dataSource = dataSourceWithRecords(
                "MEMGLBLCUST", "MAVGLBLCUSTCODE", "MAVGLBLCUSTNAME",
                "MEMGLBLCUSTDTLS", "MAVGLBLCUSTCODE", "MAVGLBLCUSTADDRTEXT",
                "CSPL", "M/S CHAITANYA SOLVEX PVT. LTD.",
                new String[][] { { "27ABCDE1234F1Z5", "Main Road, Delhi", "110001", "ABCDE1234F" } });
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");

        new DeleteRequestService(dataSource, emailService)
                .sendRequest("GLOBAL_CUSTOMER", "CSPL", "M/S CHAITANYA SOLVEX PVT. LTD.");

        String body = sentBody(mailSender);
        assertTrue(body.contains("Table: MEMGLBLCUST, MEMGLBLCUSTDTLS"));
        assertTrue(body.contains("GSTIN=27ABCDE1234F1Z5, Address=Main Road, Delhi, Pincode=110001, PAN=ABCDE1234F"));
        assertTrue(body.contains("UPDATE MEMGLBLCUSTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE) WHERE MAVGLBLCUSTCODE = 'CSPL' AND MADDATEEFCTTO IS NULL;"));
        assertFalse(body.contains("DELETE FROM"));
        verify(mailSender, times(1)).send(any(SimpleMailMessage.class));
    }

    @Test
    void matchingAgentEmailsCodeOnlyDeleteSqlUsingHandlingAgentCodeColumn() throws Exception {
        DataSource dataSource = dataSourceWithRecords(
                "MEMGLBLHNDGAGNT", "MAVHNDGAGNTCODE", "MAVHNDGAGNTNAME",
                "MEMGLBLHNDGAGNTDTLS", "MAVHNDGAGNTCODE", "MAVHNDGAGNTADDRTEXT",
                "VAIS", "Handling Company",
                new String[][] { { "27ABCDE1234F1Z5", "Chennai address", "600001", "ABCDE1234F" } });
        JavaMailSender mailSender = mock(JavaMailSender.class);
        DbaEmailService emailService = new DbaEmailService(mailSender, "portal@example.com", "dba@example.com");

        new DeleteRequestService(dataSource, emailService)
                .sendRequest("HANDLING_AGENT", "VAIS", "Handling Company");

        String body = sentBody(mailSender);
        assertTrue(body.contains("Table: MEMGLBLHNDGAGNT, MEMGLBLHNDGAGNTDTLS"));
        assertTrue(body.contains("GSTIN=27ABCDE1234F1Z5, Address=Chennai address, Pincode=600001, PAN=ABCDE1234F"));
        assertTrue(body.contains("UPDATE MEMGLBLHNDGAGNTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE) WHERE MAVHNDGAGNTCODE = 'VAIS' AND MADDATEEFCTTO IS NULL;"));
        assertFalse(body.contains("DELETE FROM"));
        verify(mailSender, times(1)).send(any(SimpleMailMessage.class));
    }

    @Test
    void includesGlobalCustomerDeleteForCodeWithNoDetailRecords() throws Exception {
        DataSource dataSource = dataSourceWithRecords(
                "MEMGLBLCUST", "MAVGLBLCUSTCODE", "MAVGLBLCUSTNAME",
                "MEMGLBLCUSTDTLS", "MAVGLBLCUSTCODE", "MAVGLBLCUSTADDRTEXT",
                "CSPL", "Global Company", new String[0][]);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        new DeleteRequestService(dataSource,
                new DbaEmailService(mailSender, "portal@example.com", "dba@example.com"))
                .sendRequest("GLOBAL_CUSTOMER", "CSPL", "Global Company");

        String body = sentBody(mailSender);
        assertTrue(body.contains("Related detail records identified: 0"));
        assertTrue(body.contains("No detail records were found for this code"));
        assertTrue(body.contains("UPDATE MEMGLBLCUSTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE) WHERE MAVGLBLCUSTCODE = 'CSPL' AND MADDATEEFCTTO IS NULL;"));
        assertFalse(body.contains("DELETE FROM"));
    }

    @Test
    void includesHandlingAgentDeleteForCodeWithNoDetailRecords() throws Exception {
        DataSource dataSource = dataSourceWithRecords(
                "MEMGLBLHNDGAGNT", "MAVHNDGAGNTCODE", "MAVHNDGAGNTNAME",
                "MEMGLBLHNDGAGNTDTLS", "MAVHNDGAGNTCODE", "MAVHNDGAGNTADDRTEXT",
                "VAIS", "Handling Company", new String[0][]);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        new DeleteRequestService(dataSource,
                new DbaEmailService(mailSender, "portal@example.com", "dba@example.com"))
                .sendRequest("HANDLING_AGENT", "VAIS", "Handling Company");

        String body = sentBody(mailSender);
        assertTrue(body.contains("Related detail records identified: 0"));
        assertTrue(body.contains("No detail records were found for this code"));
        assertTrue(body.contains("UPDATE MEMGLBLHNDGAGNTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE) WHERE MAVHNDGAGNTCODE = 'VAIS' AND MADDATEEFCTTO IS NULL;"));
        assertFalse(body.contains("DELETE FROM"));
    }

    @Test
    void includesEveryGlobalCustomerDetailRecordInOneEmail() throws Exception {
        DataSource dataSource = dataSourceWithRecords(
                "MEMGLBLCUST", "MAVGLBLCUSTCODE", "MAVGLBLCUSTNAME",
                "MEMGLBLCUSTDTLS", "MAVGLBLCUSTCODE", "MAVGLBLCUSTADDRTEXT",
                "CSPL", "Global Company",
                new String[][] {
                        { "27AAAAA1111A1Z1", "Delhi address", "110001", "AAAAA1111A" },
                        { "29BBBBB2222B1Z2", "Karnataka address", "560001", "BBBBB2222B" }
                });
        JavaMailSender mailSender = mock(JavaMailSender.class);

        new DeleteRequestService(dataSource,
                new DbaEmailService(mailSender, "portal@example.com", "dba@example.com"))
                .sendRequest("GLOBAL_CUSTOMER", "CSPL", "Global Company");

        String body = sentBody(mailSender);
        assertTrue(body.contains("Related detail records identified: 2"));
        assertTrue(body.contains("GSTIN=27AAAAA1111A1Z1, Address=Delhi address, Pincode=110001, PAN=AAAAA1111A"));
        assertTrue(body.contains("GSTIN=29BBBBB2222B1Z2, Address=Karnataka address, Pincode=560001, PAN=BBBBB2222B"));
        assertEquals(1, countOccurrences(body, "UPDATE MEMGLBLCUSTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE)"));
        assertFalse(body.contains("DELETE FROM"));
    }

    @Test
    void includesEveryHandlingAgentDetailRecordInOneEmail() throws Exception {
        DataSource dataSource = dataSourceWithRecords(
                "MEMGLBLHNDGAGNT", "MAVHNDGAGNTCODE", "MAVHNDGAGNTNAME",
                "MEMGLBLHNDGAGNTDTLS", "MAVHNDGAGNTCODE", "MAVHNDGAGNTADDRTEXT",
                "VAIS", "Handling Company",
                new String[][] {
                        { "27CCCCC3333C1Z3", "Mumbai address", "400001", "CCCCC3333C" },
                        { "29DDDDD4444D1Z4", "Bengaluru address", "560002", "DDDDD4444D" }
                });
        JavaMailSender mailSender = mock(JavaMailSender.class);

        new DeleteRequestService(dataSource,
                new DbaEmailService(mailSender, "portal@example.com", "dba@example.com"))
                .sendRequest("HANDLING_AGENT", "VAIS", "Handling Company");

        String body = sentBody(mailSender);
        assertTrue(body.contains("Related detail records identified: 2"));
        assertTrue(body.contains("GSTIN=27CCCCC3333C1Z3, Address=Mumbai address, Pincode=400001, PAN=CCCCC3333C"));
        assertTrue(body.contains("GSTIN=29DDDDD4444D1Z4, Address=Bengaluru address, Pincode=560002, PAN=DDDDD4444D"));
        assertEquals(1, countOccurrences(body, "UPDATE MEMGLBLHNDGAGNTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE)"));
        assertFalse(body.contains("DELETE FROM"));
    }

    @Test
    void matchingCompanyEmailsEscapedDeleteSqlWithoutExecutingIt() throws Exception {
        DataSource dataSource = dataSourceWithRecords(
                "MEMGLBLCUST", "MAVGLBLCUSTCODE", "MAVGLBLCUSTNAME",
                "MEMGLBLCUSTDTLS", "MAVGLBLCUSTCODE", "MAVGLBLCUSTADDRTEXT",
                "O'NEIL", "O'Neil Company", new String[0][]);
        JavaMailSender mailSender = mock(JavaMailSender.class);

        new DeleteRequestService(dataSource,
                new DbaEmailService(mailSender, "portal@example.com", "dba@example.com"))
                .sendRequest("GLOBAL_CUSTOMER", "O'NEIL", "  o'neil company  ");

        String body = sentBody(mailSender);
        assertTrue(body.contains("UPDATE MEMGLBLCUSTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE) WHERE MAVGLBLCUSTCODE = 'O''NEIL' AND MADDATEEFCTTO IS NULL;"));
        assertFalse(body.contains("DELETE FROM"));
    }

    @Test
    void disablesSelectedGstinsIndependentlyLeavingOthersAndCompanyActive() throws Exception {
        DataSource dataSource = dataSourceWithRecords(
                "MEMGLBLCUST", "MAVGLBLCUSTCODE", "MAVGLBLCUSTNAME",
                "MEMGLBLCUSTDTLS", "MAVGLBLCUSTCODE", "MAVGLBLCUSTADDRTEXT",
                "ABPC", "ABP Private Limited",
                new String[][] {
                        { "27ABCDE1234F1Z1", "Mumbai address", "400001", "ABCDE1234F" },
                        { "07ABCDE1234F1Z2", "Delhi address", "110001", "ABCDE1234F" },
                        { "06ABCDE1234F1Z3", "Haryana address", "122001", "ABCDE1234F" },
                        { "29ABCDE1234F1Z4", "Bangalore address", "560001", "ABCDE1234F" }
                });
        JavaMailSender mailSender = mock(JavaMailSender.class);

        new DeleteRequestService(dataSource,
                new DbaEmailService(mailSender, "portal@example.com", "dba@example.com"))
                .sendRequest("GLOBAL_CUSTOMER", "ABPC", "ABP Private Limited", "GSTIN",
                        java.util.List.of("07ABCDE1234F1Z2"));

        String body = sentBody(mailSender);
        assertTrue(body.contains("Related detail records identified: 1"));
        assertTrue(body.contains("GSTIN=07ABCDE1234F1Z2"));
        assertTrue(body.contains("UPDATE MEMGLBLCUSTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE) WHERE MAVGLBLCUSTCODE = 'ABPC' AND MAVCUSTGSTNUMB = '07ABCDE1234F1Z2' AND MADDATEEFCTTO IS NULL;"));
        assertFalse(body.contains("MAVCUSTGSTNUMB = '27ABCDE1234F1Z1'"));
        assertFalse(body.contains("MAVCUSTGSTNUMB = '06ABCDE1234F1Z3'"));
        assertFalse(body.contains("MAVCUSTGSTNUMB = '29ABCDE1234F1Z4'"));
        assertFalse(body.contains("DELETE FROM"));
    }

    @Test
    void disablesMultipleSelectedGstinsEachWithDedicatedUpdate() throws Exception {
        DataSource dataSource = dataSourceWithRecords(
                "MEMGLBLCUST", "MAVGLBLCUSTCODE", "MAVGLBLCUSTNAME",
                "MEMGLBLCUSTDTLS", "MAVGLBLCUSTCODE", "MAVGLBLCUSTADDRTEXT",
                "ABPC", "ABP Private Limited",
                new String[][] {
                        { "27ABCDE1234F1Z1", "Mumbai address", "400001", "ABCDE1234F" },
                        { "07ABCDE1234F1Z2", "Delhi address", "110001", "ABCDE1234F" },
                        { "06ABCDE1234F1Z3", "Haryana address", "122001", "ABCDE1234F" }
                });
        JavaMailSender mailSender = mock(JavaMailSender.class);

        new DeleteRequestService(dataSource,
                new DbaEmailService(mailSender, "portal@example.com", "dba@example.com"))
                .sendRequest("GLOBAL_CUSTOMER", "ABPC", "ABP Private Limited", "GSTIN",
                        java.util.List.of("07ABCDE1234F1Z2", "06ABCDE1234F1Z3"));

        String body = sentBody(mailSender);
        assertTrue(body.contains("Related detail records identified: 2"));
        assertTrue(body.contains("UPDATE MEMGLBLCUSTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE) WHERE MAVGLBLCUSTCODE = 'ABPC' AND MAVCUSTGSTNUMB = '07ABCDE1234F1Z2' AND MADDATEEFCTTO IS NULL;"));
        assertTrue(body.contains("UPDATE MEMGLBLCUSTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE) WHERE MAVGLBLCUSTCODE = 'ABPC' AND MAVCUSTGSTNUMB = '06ABCDE1234F1Z3' AND MADDATEEFCTTO IS NULL;"));
        assertFalse(body.contains("MAVCUSTGSTNUMB = '27ABCDE1234F1Z1'"));
        assertFalse(body.contains("DELETE FROM"));
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
    void detailLookupFailureDoesNotSendIncompleteEmail() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement parentStatement = mock(PreparedStatement.class);
        PreparedStatement detailStatement = mock(PreparedStatement.class);
        ResultSet parentResults = mock(ResultSet.class);
        DbaEmailService emailService = mock(DbaEmailService.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            return sql.contains("FROM MEMGLBLCUSTDTLS WHERE") ? detailStatement : parentStatement;
        });
        when(parentStatement.executeQuery()).thenReturn(parentResults);
        when(parentResults.next()).thenReturn(true, false);
        when(parentResults.getString(1)).thenReturn("AEIP");
        when(parentResults.getString(2)).thenReturn("Example Company");
        when(detailStatement.executeQuery()).thenThrow(new java.sql.SQLException("detail lookup unavailable"));

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
                .when(emailService).sendDbaDeleteRequestEmail(
                        anyString(), anyString(), anyString(), anyString(), anyString(),
                        anyList(), anyString(), anyString());

        assertThrows(MailSendException.class,
                () -> new DeleteRequestService(dataSource, emailService)
                        .sendRequest("GLOBAL_CUSTOMER", "AEIP", "Example Company"));
        verify(emailService).sendDbaDeleteRequestEmail(
                anyString(), anyString(), anyString(), anyString(), anyString(),
                anyList(), anyString(), anyString());
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

    private DataSource dataSourceWithRecords(
            String parentTable,
            String parentCodeColumn,
            String parentNameColumn,
            String detailTable,
            String detailCodeColumn,
            String detailAddressColumn,
            String code,
            String companyName,
            String[][] details) throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement parentStatement = mock(PreparedStatement.class);
        PreparedStatement detailStatement = mock(PreparedStatement.class);
        ResultSet parentResults = mock(ResultSet.class);
        ResultSet detailResults = mock(ResultSet.class);

        when(dataSource.getConnection()).thenReturn(connection);
        String expectedParentSql = "SELECT " + parentCodeColumn + ", " + parentNameColumn
                + " FROM " + parentTable + " WHERE " + parentCodeColumn + " = ?";
        String expectedDetailSql = "SELECT MAVCUSTGSTNUMB, " + detailAddressColumn
                + ", MANPINCODE, MAVCUSTPANNUMB, "
                + "TO_CHAR(MADDATEEFCTFROM, 'YYYY-MM-DD') AS EFFECTIVE_FROM, "
                + "TO_CHAR(MADDATEEFCTTO, 'YYYY-MM-DD') AS EFFECTIVE_TO FROM " + detailTable
                + " WHERE " + detailCodeColumn + " = ? ORDER BY MADDATEEFCTFROM, MAVCUSTGSTNUMB";
        when(connection.prepareStatement(anyString())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains(detailTable)) {
                return detailStatement;
            }
            if (sql.contains(parentTable)) {
                return parentStatement;
            }
            throw new AssertionError("Unexpected SQL query: " + sql);
        });

        when(parentStatement.executeQuery()).thenReturn(parentResults);
        when(parentResults.next()).thenReturn(true, false);
        when(parentResults.getString(1)).thenReturn(code);
        when(parentResults.getString(2)).thenReturn(companyName);

        when(detailStatement.executeQuery()).thenReturn(detailResults);
        int[] rowIndex = { -1 };
        when(detailResults.next()).thenAnswer(invocation -> {
            rowIndex[0]++;
            return rowIndex[0] < details.length;
        });
        when(detailResults.getString(anyInt())).thenAnswer(invocation -> {
            int column = invocation.getArgument(0);
            if (column - 1 < details[rowIndex[0]].length) {
                return details[rowIndex[0]][column - 1];
            }
            return null;
        });

        return dataSource;
    }

    private String sentBody(JavaMailSender mailSender) {
        ArgumentCaptor<SimpleMailMessage> messageCaptor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender).send(messageCaptor.capture());
        return messageCaptor.getValue().getText();
    }

    private int countOccurrences(String text, String value) {
        int count = 0;
        int index = 0;
        while ((index = text.indexOf(value, index)) >= 0) {
            count++;
            index += value.length();
        }
        return count;
    }
}
