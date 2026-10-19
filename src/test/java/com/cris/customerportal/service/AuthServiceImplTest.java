package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.exception.AccountInactiveException;
import com.cris.customerportal.exception.DatabaseUnavailableException;
import com.cris.customerportal.exception.InvalidCredentialsException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCrypt;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class AuthServiceImplTest {

    private DataSource dataSource;
    private Connection connection;
    private PreparedStatement preparedStatement;
    private ResultSet resultSet;
    private AuthServiceImpl authService;

    @BeforeEach
    void setUp() throws SQLException {
        dataSource = mock(DataSource.class);
        connection = mock(Connection.class);
        preparedStatement = mock(PreparedStatement.class);
        resultSet = mock(ResultSet.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(preparedStatement);
        when(preparedStatement.executeQuery()).thenReturn(resultSet);

        authService = new AuthServiceImpl(dataSource);
    }

    @Test
    void test1_correctCredentialsAndActiveUser_loginSucceeds() throws SQLException {
        String rawPassword = "ValidPassword123!";
        String hashedPassword = BCrypt.hashpw(rawPassword, BCrypt.gensalt(10));

        when(resultSet.next()).thenReturn(true);
        when(resultSet.getString("USER_ID")).thenReturn("ADMIN_USER");
        when(resultSet.getString("PASSWORD")).thenReturn(hashedPassword);
        when(resultSet.getString("USER_NAME")).thenReturn("Test Administrator");
        when(resultSet.getString("USER_ROLE")).thenReturn("ADMIN");
        when(resultSet.getString("IS_ACTIVE")).thenReturn("Y");

        AuthUserDto result = authService.authenticate("ADMIN_USER", rawPassword);

        assertNotNull(result);
        assertEquals("ADMIN_USER", result.getUserId());
        assertEquals("Test Administrator", result.getUserName());
        assertEquals("ADMIN", result.getUserRole());
        assertEquals("Y", result.getIsActive());
        verify(preparedStatement).setString(1, "ADMIN_USER");
    }

    @Test
    void test2_correctUserIdIncorrectPassword_loginDenied() throws SQLException {
        String hashedPassword = BCrypt.hashpw("CorrectPassword123!", BCrypt.gensalt(10));

        when(resultSet.next()).thenReturn(true);
        when(resultSet.getString("USER_ID")).thenReturn("USER01");
        when(resultSet.getString("PASSWORD")).thenReturn(hashedPassword);
        when(resultSet.getString("USER_NAME")).thenReturn("Standard User");
        when(resultSet.getString("USER_ROLE")).thenReturn("USER");
        when(resultSet.getString("IS_ACTIVE")).thenReturn("Y");

        InvalidCredentialsException ex = assertThrows(InvalidCredentialsException.class, () ->
                authService.authenticate("USER01", "WrongPassword!")
        );

        assertEquals("Invalid User ID or Password.", ex.getMessage());
    }

    @Test
    void test3_unknownUserId_loginDenied() throws SQLException {
        when(resultSet.next()).thenReturn(false);

        InvalidCredentialsException ex = assertThrows(InvalidCredentialsException.class, () ->
                authService.authenticate("NON_EXISTENT", "AnyPassword123")
        );

        assertEquals("Invalid User ID or Password.", ex.getMessage());
    }

    @Test
    void test4_correctCredentialsInactiveUser_loginDenied() throws SQLException {
        String rawPassword = "SecretPassword123";
        String hashedPassword = BCrypt.hashpw(rawPassword, BCrypt.gensalt(10));

        when(resultSet.next()).thenReturn(true);
        when(resultSet.getString("USER_ID")).thenReturn("INACTIVE_USER");
        when(resultSet.getString("PASSWORD")).thenReturn(hashedPassword);
        when(resultSet.getString("USER_NAME")).thenReturn("Inactive User");
        when(resultSet.getString("USER_ROLE")).thenReturn("USER");
        when(resultSet.getString("IS_ACTIVE")).thenReturn("N");

        AccountInactiveException ex = assertThrows(AccountInactiveException.class, () ->
                authService.authenticate("INACTIVE_USER", rawPassword)
        );

        assertEquals("Your account is inactive. Please contact the administrator.", ex.getMessage());
    }

    @Test
    void test5_emptyUserIdOrPassword_loginDeniedWithValidationMessage() {
        IllegalArgumentException ex1 = assertThrows(IllegalArgumentException.class, () ->
                authService.authenticate("", "Password123")
        );
        assertEquals("User ID and Password are required.", ex1.getMessage());

        IllegalArgumentException ex2 = assertThrows(IllegalArgumentException.class, () ->
                authService.authenticate("User1", "")
        );
        assertEquals("User ID and Password are required.", ex2.getMessage());

        IllegalArgumentException ex3 = assertThrows(IllegalArgumentException.class, () ->
                authService.authenticate(null, "Password123")
        );
        assertEquals("User ID and Password are required.", ex3.getMessage());
    }

    @Test
    void test6_oracleDatabaseUnavailable_loginDeniedNoBypass() throws SQLException {
        when(dataSource.getConnection()).thenThrow(new SQLException("ORA-12541: Cannot connect. No listener", "08006", 12541));

        DatabaseUnavailableException ex = assertThrows(DatabaseUnavailableException.class, () ->
                authService.authenticate("ANY_USER", "ANY_PASS")
        );

        assertEquals("Unable to authenticate at this time. Please try again later.", ex.getMessage());
    }

    @Test
    void test7_plaintextLegacyPassword_migratesToBcryptOnSuccessfulLogin() throws SQLException {
        String plaintextPassword = "LegacyPlaintext123";
        PreparedStatement updatePs = mock(PreparedStatement.class);
        when(connection.prepareStatement(contains("UPDATE PORTAL_AUTH_USERS SET PASSWORD"))).thenReturn(updatePs);

        when(resultSet.next()).thenReturn(true);
        when(resultSet.getString("USER_ID")).thenReturn("LEGACY_USER");
        when(resultSet.getString("PASSWORD")).thenReturn(plaintextPassword);
        when(resultSet.getString("USER_NAME")).thenReturn("Legacy User");
        when(resultSet.getString("USER_ROLE")).thenReturn("USER");
        when(resultSet.getString("IS_ACTIVE")).thenReturn("Y");

        AuthUserDto result = authService.authenticate("LEGACY_USER", plaintextPassword);

        assertNotNull(result);
        assertEquals("LEGACY_USER", result.getUserId());
        // Verify that the update query was executed with a newly generated BCrypt hash
        verify(updatePs).setString(eq(2), eq("LEGACY_USER"));
        verify(updatePs).executeUpdate();
    }
}
