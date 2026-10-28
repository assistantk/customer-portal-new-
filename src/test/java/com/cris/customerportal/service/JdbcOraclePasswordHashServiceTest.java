package com.cris.customerportal.service;

import com.cris.customerportal.exception.DatabaseUnavailableException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class JdbcOraclePasswordHashServiceTest {

    private DataSource dataSource;
    private Connection connection;
    private PreparedStatement statement;
    private ResultSet resultSet;
    private JdbcOraclePasswordHashService hashService;

    @BeforeEach
    void setUp() throws SQLException {
        dataSource = mock(DataSource.class);
        connection = mock(Connection.class);
        statement = mock(PreparedStatement.class);
        resultSet = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(resultSet);
        hashService = new JdbcOraclePasswordHashService(dataSource);
    }

    @Test
    void executesOracleDbmsUtilityQueryWithBindParameters() throws SQLException {
        when(resultSet.next()).thenReturn(true);
        when(resultSet.getString("CALCULATED_PASSWORD")).thenReturn("3C12F4B");

        String result = hashService.calculatePasswordHash("SREEJU", "test@1234");

        assertEquals("3C12F4B", result);
        verify(statement).setString(1, "SREEJU");
        verify(statement).setString(2, "test@1234");
        verify(connection).prepareStatement(argThat(sql ->
                sql.contains("DBMS_UTILITY.GET_HASH_VALUE") &&
                sql.contains("UPPER(?) || '/' || UPPER(?)") &&
                sql.contains("1000000000") &&
                sql.contains("POWER(2, 30)") &&
                sql.contains("FROM DUAL")
        ));
    }

    @Test
    void returnsNullWhenInputsAreNull() {
        assertNull(hashService.calculatePasswordHash(null, "password"));
        assertNull(hashService.calculatePasswordHash("user", null));
        verifyNoInteractions(dataSource);
    }

    @Test
    void wrapsSqlExceptionIntoDatabaseUnavailableException() throws SQLException {
        when(statement.executeQuery()).thenThrow(new SQLException("ORA-00904: invalid identifier", "42000", 904));

        DatabaseUnavailableException exception = assertThrows(DatabaseUnavailableException.class,
                () -> hashService.calculatePasswordHash("SREEJU", "test@1234"));

        assertTrue(exception.getMessage().contains("Unable to authenticate at this time"));
        assertEquals(904, ((SQLException) exception.getCause()).getErrorCode());
    }

    @Test
    void throwsDatabaseUnavailableExceptionWhenResultSetEmpty() throws SQLException {
        when(resultSet.next()).thenReturn(false);

        assertThrows(DatabaseUnavailableException.class,
                () -> hashService.calculatePasswordHash("SREEJU", "test@1234"));
    }
}
