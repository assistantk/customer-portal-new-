package com.cris.customerportal.service;

import com.cris.customerportal.repository.CustomerGstinRepository;
import com.cris.customerportal.repository.CustomerRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class CustomerServiceImplTest {

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
