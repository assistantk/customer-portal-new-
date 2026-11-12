package com.cris.customerportal.service;

import org.junit.jupiter.api.Test;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CustomerServiceGstinRemovalTest {

    private static final String[] GSTINS = {
            "27ABCDE1234F1Z5", "29ABCDE1234F1Z7",
            "06ABCDE1234F1Z3", "07ABCDE1234F1Z4"
    };

    @Test
    void removesOnlySelectedGlobalCustomerDetailAndKeepsParentUntouched() throws Exception {
        Fixture fixture = fixture(true, 4);

        service(fixture, "AB12", GSTINS, new String[] { "29ABCDE1234F1Z7" });

        String body = fixture.sentEmail();
        assertTrue(body.contains("UPDATE MEMGLBLCUSTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE)"));
        assertTrue(body.contains("MAVGLBLCUSTCODE = 'AB12'"));
        assertTrue(body.contains("MAVCUSTGSTNUMB = '29ABCDE1234F1Z7'"));
        assertTrue(body.contains("MADDATEEFCTFROM = TO_DATE('2025-01-02 10:00:00', 'YYYY-MM-DD HH24:MI:SS')"));
        assertTrue(body.contains("MADDATEEFCTTO IS NULL;"));
        assertFalse(body.contains("DELETE FROM"));
        assertFalse(body.contains("UPDATE MEMGLBLCUST "));
        assertFalse(body.contains("MAVCUSTGSTNUMB = '27ABCDE1234F1Z5'"));
        assertFalse(body.contains("MAVCUSTGSTNUMB = '06ABCDE1234F1Z3'"));
        assertFalse(body.contains("MAVCUSTGSTNUMB = '07ABCDE1234F1Z4'"));
        fixture.assertNoDatabaseMutation();
    }

    @Test
    void removesEachSelectedHandlingAgentDetailSeparately() throws Exception {
        Fixture fixture = fixture(false, 4);

        service(fixture, "AG12", GSTINS,
                new String[] { "29ABCDE1234F1Z7", "06ABCDE1234F1Z3" });

        String body = fixture.sentEmail();
        assertTrue(body.contains("UPDATE MEMGLBLHNDGAGNTDTLS SET MADDATEEFCTTO = TRUNC(SYSDATE)"));
        assertTrue(body.contains("MAVHNDGAGNTCODE = 'AG12'"));
        assertTrue(body.contains("MAVCUSTGSTNUMB = '29ABCDE1234F1Z7'"));
        assertTrue(body.contains("MAVCUSTGSTNUMB = '06ABCDE1234F1Z3'"));
        assertTrue(body.contains("MADDATEEFCTFROM = TO_DATE('2025-01-02 10:00:00', 'YYYY-MM-DD HH24:MI:SS')"));
        assertTrue(body.contains("MADDATEEFCTFROM = TO_DATE('2025-01-03 10:00:00', 'YYYY-MM-DD HH24:MI:SS')"));
        assertTrue(body.contains("MADDATEEFCTTO IS NULL;"));
        assertFalse(body.contains("DELETE FROM"));
        assertFalse(body.contains("UPDATE MEMGLBLHNDGAGNT "));
        assertFalse(body.contains("MAVCUSTGSTNUMB = '27ABCDE1234F1Z5'"));
        assertFalse(body.contains("MAVCUSTGSTNUMB = '07ABCDE1234F1Z4'"));
        fixture.assertNoDatabaseMutation();
    }

    @Test
    void refusesToRemoveLastRemainingGstin() throws Exception {
        Fixture fixture = fixture(true, 1);

        assertThrows(IllegalArgumentException.class,
                () -> service(fixture, "AB12", new String[] { GSTINS[0] },
                        new String[] { GSTINS[0] }));

        verify(fixture.mailSender, never()).send(any(SimpleMailMessage.class));
        fixture.assertNoDatabaseMutation();
    }

    @Test
    void refusesRepeatedGstinInUpdatePayload() throws Exception {
        Fixture fixture = fixture(true, 2);

        assertThrows(IllegalArgumentException.class,
                () -> service(fixture, "AB12", new String[] { GSTINS[0], GSTINS[0] },
                        new String[0]));

        verify(fixture.mailSender, never()).send(any(SimpleMailMessage.class));
        fixture.assertNoDatabaseMutation();
    }

    @Test
    void refusesGstinAlreadyRegisteredToAnotherRecordType() throws Exception {
        String newGstin = "29ABCDE1234F1Z7";
        for (boolean global : new boolean[] { true, false }) {
            Fixture fixture = fixture(global, 1, true);
            String code = global ? "AB12" : "AG12";

            assertThrows(com.cris.customerportal.exception.ResourceAlreadyExistsException.class,
                    () -> service(fixture, code, new String[] { GSTINS[0], newGstin },
                            new String[0]));

            verify(fixture.mailSender, never()).send(any(SimpleMailMessage.class));
            fixture.assertNoDatabaseMutation();
        }
    }

    private void service(Fixture fixture, String code, String[] allGstins, String[] removals) throws Exception {
        List<Map<String, String>> removalRecords = new ArrayList<>();
        for (String gstin : removals) {
            Map<String, String> removal = new HashMap<>();
            removal.put("gstin", gstin);
            removal.put("effectiveFrom", effectiveFrom(gstin));
            removalRecords.add(removal);
        }

        Map<String, String> payload = new HashMap<>();
        payload.put("codeType", fixture.global ? "global" : "handling");
        payload.put("customerCode", code);
        payload.put("companyName", "Example Company");
        payload.put("address", "Company Road");
        payload.put("city", "Delhi");
        payload.put("pincode", "110001");
        payload.put("panNumber", "ABCDE1234F");
        payload.put("gstinNumbers", String.join(",", allGstins));
        List<Map<String, String>> submittedDetails = new ArrayList<>();
        for (int i = 0; i < allGstins.length; i++) {
            Map<String, String> detail = new HashMap<>();
            detail.put("gstin", allGstins[i]);
            detail.put("address", contains(removals, allGstins[i])
                    ? "Changed address must not be updated" : "Address " + i);
            submittedDetails.add(detail);
        }
        payload.put("gstinDetails", new com.fasterxml.jackson.databind.ObjectMapper()
                .writeValueAsString(submittedDetails));
        payload.put("gstinRemovals", new com.fasterxml.jackson.databind.ObjectMapper()
                .valueToTree(removalRecords).toString());

        fixture.service.updateOldCustomerJDBC(payload);
    }

    private Fixture fixture(boolean global, int count) throws Exception {
        return fixture(global, count, false);
    }

    private Fixture fixture(boolean global, int count, boolean foreignDuplicate) throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        JavaMailSender mailSender = mock(JavaMailSender.class);
        List<String> preparedSql = new ArrayList<>();
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(null);
        when(connection.prepareStatement(anyString())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            preparedSql.add(sql);
            PreparedStatement statement = mock(PreparedStatement.class);
            when(statement.executeQuery()).thenAnswer(query ->
                    resultSetFor(sql, global, count, foreignDuplicate));
            return statement;
        });

        CustomerServiceImpl service = new CustomerServiceImpl(
                mock(com.cris.customerportal.repository.CustomerRepository.class), dataSource);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "dbaEmailService",
                new DbaEmailService(mailSender, "portal@example.com", "dba@example.com"));
        return new Fixture(global, service, mailSender, connection, preparedSql);
    }

    private ResultSet resultSetFor(
            String sql, boolean global, int count, boolean foreignDuplicate) throws Exception {
        String parentTable = global ? "MEMGLBLCUST" : "MEMGLBLHNDGAGNT";
        String detailTable = global ? "MEMGLBLCUSTDTLS" : "MEMGLBLHNDGAGNTDTLS";
        String codeColumn = global ? "MAVGLBLCUSTCODE" : "MAVHNDGAGNTCODE";
        String addressColumn = global ? "MAVGLBLCUSTADDRTEXT" : "MAVHNDGAGNTADDRTEXT";
        String cityColumn = global ? "MAVGNBLCUSTCITYNAME" : "MAVHNDGAGNTCITYNAME";
        if (sql.contains("WHERE MAVCUSTGSTNUMB = ?")) {
            List<Map<String, String>> rows = new ArrayList<>();
            boolean queriedForeignTable = global
                    ? sql.contains("FROM MEMGLBLHNDGAGNTDTLS")
                    : sql.contains("FROM MEMGLBLCUSTDTLS");
            if (foreignDuplicate && queriedForeignTable) {
                Map<String, String> duplicate = new HashMap<>();
                duplicate.put("MAVGLBLCUSTCODE", "OTHERGC");
                duplicate.put("MAVGLBLCUSTNAME", "Other Global Customer");
                duplicate.put("MAVGLBLCUSTADDRTEXT", "Other Global Address");
                duplicate.put("MAVGNBLCUSTCITYNAME", "Delhi");
                duplicate.put("MAVHNDGAGNTCODE", "OTHERHA");
                duplicate.put("MAVHNDGAGNTNAME", "Other Handling Agent");
                duplicate.put("MAVHNDGAGNTADDRTEXT", "Other Agent Address");
                duplicate.put("MAVHNDGAGNTCITYNAME", "Mumbai");
                duplicate.put("MANPINCODE", "110001");
                duplicate.put("MAVCUSTGSTNUMB", "29ABCDE1234F1Z7");
                duplicate.put("MAVCUSTPANNUMB", "ABCDE1234F");
                duplicate.put("EFFECTIVE_FROM", "2025-01-01");
                duplicate.put("EFFECTIVE_TO", null);
                rows.add(duplicate);
            }
            return resultSet(rows);
        }
        if (sql.contains("FROM " + parentTable + " WHERE")) {
            Map<String, String> parent = new HashMap<>();
            parent.put(global ? "MAVGLBLCUSTCODE" : "MAVHNDAGNTCODE", global ? "AB12" : "AG12");
            parent.put(global ? "MAVGLBLCUSTNAME" : "MAVHNDAGNTNAME", "Example Company");
            parent.put(global ? "MAVGLBLCUSTADDRTEXT" : "MAVHNDAGNTADDRTEXT", "Company Road");
            parent.put("MAVCUSTPANNUMB", "ABCDE1234F");
            parent.put(global ? cityColumn : "MAVHNDAGNTCITYNAME", "Delhi");
            parent.put("MAVPCOCODE", "110001");
            parent.put("MAVIMPLREMK", "");
            parent.put("MAVVERIFICATIONDATE", "2024-01-01");
            return resultSet(List.of(parent));
        }
        if (sql.contains("FROM " + detailTable)) {
            List<Map<String, String>> rows = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                Map<String, String> detail = new HashMap<>();
                detail.put("MAVCUSTGSTNUMB", GSTINS[i]);
                detail.put(addressColumn, "Address " + i);
                detail.put("REGISTERED_ADDRESS", "Address " + i);
                detail.put(cityColumn, "Delhi");
                detail.put("CITY", "Delhi");
                detail.put("MANPINCODE", "110001");
                detail.put("EFFECTIVE_FROM", String.format(
                        "2025-01-%02d 10:00:00", i + 1));
                detail.put("EFFECTIVE_TO", null);
                rows.add(detail);
            }
            return resultSet(rows);
        }
        throw new AssertionError("Unexpected query: " + sql);
    }

    private ResultSet resultSet(List<Map<String, String>> rows) throws Exception {
        ResultSet results = mock(ResultSet.class);
        int[] index = { -1 };
        when(results.next()).thenAnswer(invocation -> {
            index[0]++;
            return index[0] < rows.size();
        });
        when(results.getString(anyString())).thenAnswer(invocation -> {
            if (index[0] < 0 || index[0] >= rows.size()) {
                return null;
            }
            return rows.get(index[0]).get(invocation.getArgument(0));
        });
        return results;
    }

    private String effectiveFrom(String gstin) {
        for (int i = 0; i < GSTINS.length; i++) {
            if (GSTINS[i].equals(gstin)) {
                return String.format("2025-01-%02d 10:00:00", i + 1);
            }
        }
        throw new IllegalArgumentException("Unexpected test GSTIN");
    }

    private boolean contains(String[] values, String expected) {
        for (String value : values) {
            if (value.equals(expected)) {
                return true;
            }
        }
        return false;
    }

    private static final class Fixture {
        private final boolean global;
        private final CustomerServiceImpl service;
        private final JavaMailSender mailSender;
        private final Connection connection;
        private final List<String> preparedSql;

        private Fixture(boolean global, CustomerServiceImpl service, JavaMailSender mailSender,
                        Connection connection, List<String> preparedSql) {
            this.global = global;
            this.service = service;
            this.mailSender = mailSender;
            this.connection = connection;
            this.preparedSql = preparedSql;
        }

        private String sentEmail() {
            org.mockito.ArgumentCaptor<SimpleMailMessage> captor =
                    org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
            verify(mailSender).send(captor.capture());
            return captor.getValue().getText();
        }

        private void assertNoDatabaseMutation() throws Exception {
            assertTrue(preparedSql.stream().allMatch(sql ->
                    sql.trim().toUpperCase().startsWith("SELECT")));
            verify(connection, never()).createStatement();
        }
    }
}
