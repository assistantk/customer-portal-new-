package com.cris.customerportal.repository;

import com.cris.customerportal.exception.InvalidCredentialsException;
import com.cris.customerportal.service.AemUserLookupResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.*;

class JdbcAemUserLookupRepositoryTest {

    private DataSource dataSource;
    private Connection connection;
    private PreparedStatement statement;
    private ResultSet resultSet;
    private JdbcAemUserLookupRepository repository;

    @BeforeEach
    void setUp() throws SQLException {
        dataSource = mock(DataSource.class);
        connection = mock(Connection.class);
        statement = mock(PreparedStatement.class);
        resultSet = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(resultSet);
        repository = new JdbcAemUserLookupRepository(dataSource);
    }

    @Test
    void looksUpByEitherIdentifierAndReadsOnlyConfirmedAemColumns() throws SQLException {
        when(resultSet.next()).thenReturn(true, false);
        when(resultSet.getString("AAVUSERID")).thenReturn("RAILUSER");
        when(resultSet.getString("AAVEMAILID")).thenReturn("rail.user@example.org");
        when(resultSet.getString("AAVPSWD")).thenReturn("stored-value");

        Optional<AemUserLookupResult> result = repository.findByIdentifier("rail.user@example.org");

        assertTrue(result.isPresent());
        assertEquals("RAILUSER", result.get().userId());
        assertEquals("rail.user@example.org", result.get().email());
        assertEquals("stored-value", result.get().storedPassword());
        verify(statement).setString(1, "rail.user@example.org");
        verify(statement).setString(2, "rail.user@example.org");
        verify(connection).prepareStatement(argThat(sql ->
        sql.replaceAll("\\s+", " ").trim().equals(
                "SELECT AAVUSERID, AAVEMAILID, AAVPSWD FROM TMS3T.AEM_USER WHERE AAVUSERID = ? OR AAVEMAILID = ?")));
        verify(connection, never()).prepareStatement(contains("AAVOLDPSWD"));
    }

    @Test
    void returnsEmptyWhenNoUserMatches() throws SQLException {
        when(resultSet.next()).thenReturn(false);

        assertFalse(repository.findByIdentifier("missing").isPresent());
    }

    @Test
    void rejectsAnIdentifierMatchingMultipleUsers() throws SQLException {
        when(resultSet.next()).thenReturn(true, true);
        when(resultSet.getString("AAVUSERID")).thenReturn("RAILUSER");
        when(resultSet.getString("AAVEMAILID")).thenReturn("shared@example.org");

        assertThrows(InvalidCredentialsException.class,
                () -> repository.findByIdentifier("shared@example.org"));
    }
}
