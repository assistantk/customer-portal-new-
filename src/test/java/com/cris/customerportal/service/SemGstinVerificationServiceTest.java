package com.cris.customerportal.service;

import com.cris.customerportal.dto.SemGstinVerificationResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class SemGstinVerificationServiceTest {

    private DataSource dataSource;
    private Connection connection;
    private PreparedStatement preparedStatement;
    private ResultSet resultSet;
    private SemGstinVerificationServiceImpl service;

    @BeforeEach
    void setUp() throws SQLException {
        dataSource = mock(DataSource.class);
        connection = mock(Connection.class);
        preparedStatement = mock(PreparedStatement.class);
        resultSet = mock(ResultSet.class);

        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.prepareStatement(anyString())).thenReturn(preparedStatement);
        when(preparedStatement.executeQuery()).thenReturn(resultSet);

        service = new SemGstinVerificationServiceImpl(dataSource);
    }

    @Test
    void testVerifyGstin_nullOrBlankGstin() {
        SemGstinVerificationResponse res = service.verifyGstin(null, "Acme Corp", "Delhi");
        assertNotNull(res);
        assertFalse(res.isVerified());
        assertEquals("NOT_FOUND", res.getStatus());
        assertTrue(res.getMessage().contains("GSTIN not found"));
    }

    @Test
    void testVerifyGstin_matchedDetails_returnsVerified() throws SQLException {
        when(resultSet.next()).thenReturn(true, false);
        when(resultSet.getString("SAVCUSTGSTIN")).thenReturn("07AAAAA0000A1Z4");
        when(resultSet.getString("SAVCUSTNAME")).thenReturn("ACME LOGISTICS PRIVATE LIMITED");

        SemGstinVerificationResponse res = service.verifyGstin(
                "07AAAAA0000A1Z4", "ACME LOGISTICS", "an unrelated address"
        );

        assertNotNull(res);
        assertTrue(res.isVerified());
        assertEquals("VERIFIED", res.getStatus());
        assertEquals("✓ Verified – Details matched with office database.", res.getMessage());
        assertEquals("07AAAAA0000A1Z4", res.getGstin());
        assertEquals("ACME LOGISTICS PRIVATE LIMITED", res.getDbCompanyName());
        assertNull(res.getDbAddress());
        assertNull(res.getAddressMatched());
        verify(connection).prepareStatement(
                "SELECT SAVCUSTGSTIN, SAVCUSTNAME FROM SEM_GSTIN WHERE UPPER(TRIM(SAVCUSTGSTIN)) = ?");
    }

    @Test
    void testVerifyGstin_companyNameMismatch_returnsMismatch() throws SQLException {
        when(resultSet.next()).thenReturn(true, false);
        when(resultSet.getString("SAVCUSTGSTIN")).thenReturn("07AAAAA0000A1Z4");
        when(resultSet.getString("SAVCUSTNAME")).thenReturn("SILIGURI BARDANA COMPANY");

        SemGstinVerificationResponse res = service.verifyGstin(
                "07AAAAA0000A1Z4", "COMPLETELY DIFFERENT ENTERPRISE", "KANPUR 208001"
        );

        assertNotNull(res);
        assertFalse(res.isVerified());
        assertEquals("MISMATCH", res.getStatus());
        assertEquals("⚠ Verification Failed – Entered details do not match office database.", res.getMessage());
        assertFalse(res.getCompanyNameMatched());
    }

    @Test
    void testVerifyGstin_matchingGstinAndName_ignoresAddress() throws SQLException {
        when(resultSet.next()).thenReturn(true, false);
        when(resultSet.getString("SAVCUSTGSTIN")).thenReturn("07AAAAA0000A1Z4");
        when(resultSet.getString("SAVCUSTNAME")).thenReturn("ACME LOGISTICS");

        SemGstinVerificationResponse res = service.verifyGstin(
                "07AAAAA0000A1Z4", "ACME LOGISTICS", "KOLKATA 700001"
        );

        assertNotNull(res);
        assertTrue(res.isVerified());
        assertEquals("VERIFIED", res.getStatus());
        assertNull(res.getAddressMatched());
    }

    @Test
    void testVerifyGstin_gstinNotFoundInDb_returnsNotFound() throws SQLException {
        when(resultSet.next()).thenReturn(false);

        SemGstinVerificationResponse res = service.verifyGstin(
                "07AAAAA0000A1Z4", "ACME LOGISTICS", "DELHI 110001"
        );

        assertNotNull(res);
        assertFalse(res.isVerified());
        assertEquals("NOT_FOUND", res.getStatus());
        assertEquals("ℹ Verification Unavailable – GSTIN not found in office database.", res.getMessage());
    }

    @Test
    void testVerifyGstin_databaseConnectionThrowsException_returnsUnavailableGracefully() throws SQLException {
        when(dataSource.getConnection()).thenThrow(new SQLException("ORA-12170: TNS:Connect timeout occurred"));

        SemGstinVerificationResponse res = service.verifyGstin(
                "07AAAAA0000A1Z4", "ACME LOGISTICS", "DELHI 110001"
        );

        assertNotNull(res);
        assertFalse(res.isVerified());
        assertEquals("UNAVAILABLE", res.getStatus());
        assertEquals("ℹ Verification Unavailable – Unable to connect to office database.", res.getMessage());
    }

    @Test
    void testVerifyGstin_nullDataSource_returnsUnavailableGracefully() {
        SemGstinVerificationServiceImpl nullService = new SemGstinVerificationServiceImpl(null);
        SemGstinVerificationResponse res = nullService.verifyGstin("07AAAAA0000A1Z4", "ACME", "DELHI");

        assertNotNull(res);
        assertFalse(res.isVerified());
        assertEquals("UNAVAILABLE", res.getStatus());
        assertEquals("ℹ Verification Unavailable – Unable to connect to office database.", res.getMessage());
    }
}
