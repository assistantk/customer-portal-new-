package com.cris.customerportal.service;

import com.cris.customerportal.dto.SemGstinVerificationResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.*;
import java.time.LocalDate;

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
        when(resultSet.getString("SAVCUSTADDR")).thenReturn("PLOT NO 12, CONNAUGHT PLACE, NEW DELHI 110001");
        when(resultSet.getString("SAVCVALDFLAG")).thenReturn("Y");
        when(resultSet.getDate("SADEFFCFROM")).thenReturn(Date.valueOf(LocalDate.now().minusDays(10)));
        when(resultSet.getDate("SADEFFCTO")).thenReturn(null);

        SemGstinVerificationResponse res = service.verifyGstin(
                "07AAAAA0000A1Z4", "ACME LOGISTICS", "12, CONNAUGHT PLACE, NEW DELHI, 110001"
        );

        assertNotNull(res);
        assertTrue(res.isVerified());
        assertEquals("VERIFIED", res.getStatus());
        assertEquals("✓ Verified – Details matched with office database.", res.getMessage());
        assertEquals("07AAAAA0000A1Z4", res.getGstin());
        assertEquals("ACME LOGISTICS PRIVATE LIMITED", res.getDbCompanyName());
    }

    @Test
    void testVerifyGstin_companyNameMismatch_returnsMismatch() throws SQLException {
        when(resultSet.next()).thenReturn(true, false);
        when(resultSet.getString("SAVCUSTGSTIN")).thenReturn("07AAAAA0000A1Z4");
        when(resultSet.getString("SAVCUSTNAME")).thenReturn("SILIGURI BARDANA COMPANY");
        when(resultSet.getString("SAVCUSTADDR")).thenReturn("KANPUR NAGAR 208001");
        when(resultSet.getString("SAVCVALDFLAG")).thenReturn("Y");
        when(resultSet.getDate("SADEFFCFROM")).thenReturn(null);
        when(resultSet.getDate("SADEFFCTO")).thenReturn(null);

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
    void testVerifyGstin_addressPinConflict_returnsMismatch() throws SQLException {
        when(resultSet.next()).thenReturn(true, false);
        when(resultSet.getString("SAVCUSTGSTIN")).thenReturn("07AAAAA0000A1Z4");
        when(resultSet.getString("SAVCUSTNAME")).thenReturn("ACME LOGISTICS");
        when(resultSet.getString("SAVCUSTADDR")).thenReturn("DELHI 110001");
        when(resultSet.getString("SAVCVALDFLAG")).thenReturn("Y");
        when(resultSet.getDate("SADEFFCFROM")).thenReturn(null);
        when(resultSet.getDate("SADEFFCTO")).thenReturn(null);

        // Entered address has PIN 700001 (Kolkata) vs DB 110001 (Delhi)
        SemGstinVerificationResponse res = service.verifyGstin(
                "07AAAAA0000A1Z4", "ACME LOGISTICS", "KOLKATA 700001"
        );

        assertNotNull(res);
        assertFalse(res.isVerified());
        assertEquals("MISMATCH", res.getStatus());
        assertEquals("⚠ Verification Failed – Entered details do not match office database.", res.getMessage());
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

    @Test
    void testIsRecordCurrentlyValid_inactiveFlag() {
        SemGstinVerificationServiceImpl.GstinDbRecord rec = new SemGstinVerificationServiceImpl.GstinDbRecord();
        rec.valdFlag = "N";
        assertFalse(service.isRecordCurrentlyValid(rec, LocalDate.now()));

        rec.valdFlag = "Y";
        assertTrue(service.isRecordCurrentlyValid(rec, LocalDate.now()));
    }

    @Test
    void testIsRecordCurrentlyValid_dateRanges() {
        SemGstinVerificationServiceImpl.GstinDbRecord rec = new SemGstinVerificationServiceImpl.GstinDbRecord();
        rec.valdFlag = "Y";
        rec.effcFrom = LocalDate.now().plusDays(5); // future effective date
        assertFalse(service.isRecordCurrentlyValid(rec, LocalDate.now()));

        rec.effcFrom = LocalDate.now().minusDays(5);
        rec.effcTo = LocalDate.now().minusDays(1); // past expiry
        assertFalse(service.isRecordCurrentlyValid(rec, LocalDate.now()));

        rec.effcTo = LocalDate.now().plusDays(10);
        assertTrue(service.isRecordCurrentlyValid(rec, LocalDate.now()));
    }
}

