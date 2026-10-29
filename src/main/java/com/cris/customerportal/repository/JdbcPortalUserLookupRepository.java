package com.cris.customerportal.repository;

import org.springframework.stereotype.Repository;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

@Repository
public class JdbcPortalUserLookupRepository {

    private static final String FIND_USER_ID_SQL =
            "SELECT AAVUSERID FROM TMS3T.USER WHERE UPPER(TRIM(AAVUSERID)) = UPPER(TRIM(?))";

    private final DataSource dataSource;

    public JdbcPortalUserLookupRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public Optional<String> findUserId(String authenticatedUserId) {
        if (authenticatedUserId == null || authenticatedUserId.trim().isEmpty()) {
            return Optional.empty();
        }

        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(FIND_USER_ID_SQL)) {
            statement.setString(1, authenticatedUserId.trim());
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) {
                    return Optional.empty();
                }
                String userId = resultSet.getString("AAVUSERID");
                if (resultSet.next()) {
                    throw new IllegalStateException("Multiple TMS3T.USER rows matched the authenticated user ID.");
                }
                return Optional.ofNullable(userId)
                        .map(String::trim)
                        .filter(value -> !value.isEmpty());
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Unable to resolve authenticated user ID from TMS3T.USER.", exception);
        }
    }
}
