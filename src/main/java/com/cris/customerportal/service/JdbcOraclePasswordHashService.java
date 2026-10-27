package com.cris.customerportal.service;

import com.cris.customerportal.exception.DatabaseUnavailableException;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

@Service
public class JdbcOraclePasswordHashService implements OraclePasswordHashService {

    public static final String ORACLE_HASH_SQL =
            "SELECT LTRIM(" +
            "    TO_CHAR(" +
            "        DBMS_UTILITY.GET_HASH_VALUE(" +
            "            UPPER(?) || '/' || UPPER(?)," +
            "            1000000000," +
            "            POWER(2, 30)" +
            "        )," +
            "        RPAD('X', 29, 'X') || 'X'" +
            "    )" +
            ") AS CALCULATED_PASSWORD FROM DUAL";

    private final DataSource dataSource;

    public JdbcOraclePasswordHashService(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public String calculatePasswordHash(String username, String password) {
        if (username == null || password == null) {
            return null;
        }

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(ORACLE_HASH_SQL)) {
            statement.setString(1, username);
            statement.setString(2, password);

            try (ResultSet resultSet = statement.executeQuery()) {
                if (resultSet.next()) {
                    return resultSet.getString("CALCULATED_PASSWORD");
                }
                throw new DatabaseUnavailableException(
                        "Unable to calculate password hash from Oracle database.", null);
            }
        } catch (SQLException exception) {
            System.err.printf("[ORACLE AUTH HASH ERROR] Password hash calculation failed. SQLState=%s ErrorCode=%d%n",
                    exception.getSQLState(), exception.getErrorCode());
            throw new DatabaseUnavailableException(
                    "Unable to authenticate at this time. Please try again later.", exception);
        }
    }
}
