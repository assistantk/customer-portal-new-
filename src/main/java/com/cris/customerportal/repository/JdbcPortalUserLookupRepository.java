package com.cris.customerportal.repository;

import com.cris.customerportal.config.DataMaskingUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Repository;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

@Repository
public class JdbcPortalUserLookupRepository {

    private static final Logger log = LoggerFactory.getLogger(JdbcPortalUserLookupRepository.class);

    private static final String FIND_USER_ID_SQL =
            "SELECT AAVUSERID FROM TMS3T.AEM_USER WHERE UPPER(TRIM(AAVUSERID)) = UPPER(TRIM(?))";

    private final DataSource dataSource;

    public JdbcPortalUserLookupRepository(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public Optional<String> findUserId(String authenticatedUserId) {
        if (authenticatedUserId == null || authenticatedUserId.trim().isEmpty()) {
            log.debug("JdbcPortalUserLookupRepository.findUserId: blank identifier, skipping lookup");
            return Optional.empty();
        }

        log.debug("JdbcPortalUserLookupRepository.findUserId: querying TMS3T.AEM_USER");
        try (Connection connection = dataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(FIND_USER_ID_SQL)) {
            statement.setString(1, authenticatedUserId.trim());
            try (ResultSet resultSet = statement.executeQuery()) {
                if (!resultSet.next()) {
                    log.debug("JdbcPortalUserLookupRepository.findUserId: no match found in TMS3T.AEM_USER");
                    return Optional.empty();
                }
                String userId = resultSet.getString("AAVUSERID");
                if (resultSet.next()) {
                    throw new IllegalStateException("Multiple TMS3T.AEM_USER rows matched the authenticated user ID.");
                }
                log.debug("JdbcPortalUserLookupRepository.findUserId: resolved userId from TMS3T.AEM_USER");
                return Optional.ofNullable(userId)
                        .map(String::trim)
                        .filter(value -> !value.isEmpty());
            }
        } catch (SQLException exception) {
            log.error("JdbcPortalUserLookupRepository.findUserId: query failed in TMS3T.AEM_USER stackTrace={}",
                    DataMaskingUtil.formatThrowable(exception));
            throw new IllegalStateException("Unable to resolve authenticated user ID from TMS3T.AEM_USER.", exception);
        }
    }
}
