package com.cris.customerportal.repository;

import com.cris.customerportal.exception.DatabaseUnavailableException;
import com.cris.customerportal.exception.InvalidCredentialsException;
import com.cris.customerportal.service.AemUserLookupResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Repository;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Repository
public class JdbcAemUserLookupRepository implements AemUserLookupRepository {

    private static final Logger LOGGER = LoggerFactory.getLogger(JdbcAemUserLookupRepository.class);
    private static final String FIND_BY_IDENTIFIER_SQL =
            "SELECT AAVUSERID, AAVEMAILID, AAVPSWD," +
            " CASE WHEN AACUSERDELTFLAG = 'N' THEN 1 ELSE 0 END AS ACCOUNT_NOT_DELETED," +
            " CASE WHEN AADRTRMNTDATE > SYSDATE THEN 1 ELSE 0 END AS TERMINATION_IN_FUTURE," +
            " CASE WHEN AADPSWDXPRYTIME > SYSDATE THEN 1 ELSE 0 END AS PASSWORD_NOT_EXPIRED," +
            " CASE WHEN AACEDSPFLAG = 'E' THEN 1 ELSE 0 END AS ELIGIBLE_EDSP_FLAG," +
            " CASE WHEN AAVDSGN = 'SR.DCM' THEN 1 ELSE 0 END AS ELIGIBLE_DESIGNATION" +
            " FROM TMS3T.AEM_USER" +
            " WHERE UPPER(AAVUSERID) = UPPER(?) OR UPPER(AAVEMAILID) = UPPER(?)";

    private final DataSource dataSource;

    public JdbcAemUserLookupRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public Optional<AemUserLookupResult> findByIdentifier(String identifier) {
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = prepareLookup(connection, identifier)) {
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) {
                    LOGGER.debug("TMS3T.AEM_USER lookup returned no account");
                    return Optional.empty();
                }

                AemUserLookupResult user = new AemUserLookupResult(
                        resultSet.getString("AAVUSERID"),
                        resultSet.getString("AAVEMAILID"),
                        null,
                        resultSet.getString("AAVPSWD"),
                        "Y",
                        eligibilityFailures(resultSet)
                );

                if (resultSet.next()) {
                    LOGGER.info("AEM credential authentication rejected: identifier matched multiple accounts");
                    throw new InvalidCredentialsException("Invalid User ID/Email or Password.");
                }
                LOGGER.debug("TMS3T.AEM_USER lookup returned one account");
                return Optional.of(user);
            }
        } catch (SQLException exception) {
            LOGGER.error("AEM account lookup failed in TMS3T.AEM_USER. SQLState={} ErrorCode={}",
                    exception.getSQLState(), exception.getErrorCode());
            throw new DatabaseUnavailableException(
                    "Unable to authenticate at this time. Please try again later.", exception);
        }
    }

    private List<String> eligibilityFailures(ResultSet resultSet) throws SQLException {
        List<String> failures = new ArrayList<>();
        addFailureIfConditionNotMet(resultSet, failures, "AACUSERDELTFLAG must be N", "ACCOUNT_NOT_DELETED");
        addFailureIfConditionNotMet(resultSet, failures, "AADRTRMNTDATE must be later than Oracle SYSDATE",
                "TERMINATION_IN_FUTURE");
        addFailureIfConditionNotMet(resultSet, failures, "AADPSWDXPRYTIME must be later than Oracle SYSDATE",
                "PASSWORD_NOT_EXPIRED");
        addFailureIfConditionNotMet(resultSet, failures, "AACEDSPFLAG must be E", "ELIGIBLE_EDSP_FLAG");
        addFailureIfConditionNotMet(resultSet, failures, "AAVDSGN must be SR.DCM", "ELIGIBLE_DESIGNATION");
        return failures;
    }

    private void addFailureIfConditionNotMet(
            ResultSet resultSet,
            List<String> failures,
            String reason,
            String columnLabel) throws SQLException {
        if (resultSet.getInt(columnLabel) != 1) {
            failures.add(reason);
        }
    }

    private PreparedStatement prepareLookup(Connection connection, String identifier) throws SQLException {
        logDatasourceContext(connection);
        PreparedStatement statement = connection.prepareStatement(FIND_BY_IDENTIFIER_SQL);
        statement.setString(1, identifier);
        statement.setString(2, identifier);
        return statement;
    }

    private void logDatasourceContext(Connection connection) {
        try {
            DatabaseMetaData metadata = connection.getMetaData();
            LOGGER.info("AEM auth datasource connected: databaseProduct={}, currentSchema={}, table=TMS3T.AEM_USER",
                    metadata.getDatabaseProductName(), connection.getSchema());
        } catch (SQLException exception) {
            LOGGER.warn("Unable to read Oracle datasource metadata for AEM authentication. SQLState={} ErrorCode={}",
                    exception.getSQLState(), exception.getErrorCode());
        }
    }
}
