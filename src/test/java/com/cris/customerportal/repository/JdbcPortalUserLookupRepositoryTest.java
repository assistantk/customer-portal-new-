package com.cris.customerportal.repository;

import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class JdbcPortalUserLookupRepositoryTest {

    @Test
    void findsTheCanonicalUserIdFromTmsUserTable() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet resultSet = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(resultSet);
        when(resultSet.next()).thenReturn(true, false);
        when(resultSet.getString("AAVUSERID")).thenReturn("DBUSER");

        Optional<String> userId = new JdbcPortalUserLookupRepository(dataSource).findUserId("railuser");

        assertEquals(Optional.of("DBUSER"), userId);
        verify(connection).prepareStatement(
                "SELECT AAVUSERID FROM TMS3T.USER WHERE UPPER(TRIM(AAVUSERID)) = UPPER(TRIM(?))");
        verify(statement).setString(1, "railuser");
    }

    @Test
    void returnsEmptyWhenTheAuthenticatedUserIsNotInTmsUserTable() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement statement = mock(PreparedStatement.class);
        ResultSet resultSet = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(statement);
        when(statement.executeQuery()).thenReturn(resultSet);
        when(resultSet.next()).thenReturn(false);

        assertEquals(Optional.empty(), new JdbcPortalUserLookupRepository(dataSource).findUserId("railuser"));
    }

    @Test
    void reportsDatabaseLookupFailures() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        when(dataSource.getConnection()).thenThrow(new SQLException("Database unavailable"));

        assertThrows(IllegalStateException.class,
                () -> new JdbcPortalUserLookupRepository(dataSource).findUserId("railuser"));
    }
}
