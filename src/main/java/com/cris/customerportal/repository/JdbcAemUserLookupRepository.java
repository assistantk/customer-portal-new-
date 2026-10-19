package com.cris.customerportal.repository;

import com.cris.customerportal.exception.DatabaseUnavailableException;
import com.cris.customerportal.exception.InvalidCredentialsException;
import com.cris.customerportal.service.AemUserLookupResult;
import org.springframework.stereotype.Repository;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

@Repository
public class JdbcAemUserLookupRepository implements AemUserLookupRepository {

    private static final String FIND_BY_IDENTIFIER_SQL = """
            SELECT AAVUSERID, AAVEMAILID, AAVPSWD
            FROM TMS3T.AEM_USER
            WHERE AAVUSERID = ? OR AAVEMAILID = ?
            """;

    private final DataSource dataSource;

    public JdbcAemUserLookupRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Optional<AemUserLookupResult> findByIdentifier(String identifier) {
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(FIND_BY_IDENTIFIER_SQL)) {
            statement.setString(1, identifier);
            statement.setString(2, identifier);

            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) {
                    return Optional.empty();
                }

                AemUserLookupResult user = new AemUserLookupResult(
                        resultSet.getString("AAVUSERID"),
                        resultSet.getString("AAVEMAILID"),
                        resultSet.getString("AAVPSWD")
                );

                if (resultSet.next()) {
                    throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
                }
                return Optional.of(user);
            }
        } catch (SQLException exception) {
            System.err.printf("[AEM AUTH DB ERROR] User lookup failed. SQLState=%s ErrorCode=%d%n",
                    exception.getSQLState(), exception.getErrorCode());
            throw new DatabaseUnavailableException(
                    "Unable to authenticate at this time. Please try again later.", exception);
        }
    }
}
