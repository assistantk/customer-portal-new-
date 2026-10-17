package com.cris.customerportal.service;

import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.exception.AccountInactiveException;
import com.cris.customerportal.exception.DatabaseUnavailableException;
import com.cris.customerportal.exception.InvalidCredentialsException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCrypt;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

@Service
public class AuthServiceImpl implements AuthService {

    private final DataSource dataSource;

    @Autowired
    public AuthServiceImpl(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public AuthUserDto authenticate(String userId, String password) {
        // Step 1: Validate that User ID and Password are not empty
        if (userId == null || userId.trim().isEmpty() || password == null || password.isEmpty()) {
            throw new IllegalArgumentException("User ID and Password are required.");
        }

        String normalizedUserId = userId.trim();

        // Step 2: Query the Oracle database using the entered User ID
        String sql = "SELECT USER_ID, PASSWORD, USER_NAME, USER_ROLE, IS_ACTIVE FROM PORTAL_AUTH_USERS WHERE USER_ID = ?";

        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {

            ps.setString(1, normalizedUserId);

            try (ResultSet rs = ps.executeQuery()) {
                // Step 3: If no matching user exists, reject the login
                if (!rs.next()) {
                    throw new InvalidCredentialsException("Invalid User ID or Password.");
                }

                String dbUserId = rs.getString("USER_ID");
                String storedPassword = rs.getString("PASSWORD");
                String userName = rs.getString("USER_NAME");
                String userRole = rs.getString("USER_ROLE");
                String isActive = rs.getString("IS_ACTIVE");

                // Step 4: Verify the entered password against the stored password
                boolean passwordValid = verifyAndMigratePassword(conn, dbUserId, password, storedPassword);
                if (!passwordValid) {
                    throw new InvalidCredentialsException("Invalid User ID or Password.");
                }

                // Step 5: Check whether IS_ACTIVE = 'Y'
                if (isActive == null || !"Y".equalsIgnoreCase(isActive.trim())) {
                    throw new AccountInactiveException("Your account is inactive. Please contact the administrator.");
                }

                // Normalize user role (defaulting to USER if null)
                String normalizedRole = (userRole != null && userRole.trim().equalsIgnoreCase("ADMIN")) ? "ADMIN" : "USER";

                // Step 6: Return authenticated user info
                return new AuthUserDto(dbUserId, userName, normalizedRole, isActive);
            }
        } catch (SQLException e) {
            System.err.printf("[AUTH DB ERROR] Failed to query PORTAL_AUTH_USERS. SQLState=%s ErrorCode=%d Message=%s%n",
                    e.getSQLState(), e.getErrorCode(), e.getMessage());
            throw new DatabaseUnavailableException("Unable to authenticate at this time. Please try again later.", e);
        }
    }

    /**
     * Verifies the password using BCrypt.
     * If the stored password is in plaintext (e.g. initial DBA manual insert),
     * it validates using a timing-safe comparison and seamlessly upgrades
     * the stored password in PORTAL_AUTH_USERS to a secure BCrypt hash.
     */
    private boolean verifyAndMigratePassword(Connection conn, String userId, String enteredPassword, String storedPassword) {
        if (storedPassword == null || enteredPassword == null) {
            return false;
        }

        // Standard BCrypt hashes start with $2a$, $2b$, or $2y$
        if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2y$")) {
            try {
                return BCrypt.checkpw(enteredPassword, storedPassword);
            } catch (Exception e) {
                return false;
            }
        }

        // Plaintext legacy verification with constant-time comparison
        boolean match = MessageDigest.isEqual(
                enteredPassword.getBytes(StandardCharsets.UTF_8),
                storedPassword.getBytes(StandardCharsets.UTF_8)
        );

        if (match) {
            // Automatically upgrade plaintext to BCrypt hash in the database
            try {
                String newHash = BCrypt.hashpw(enteredPassword, BCrypt.gensalt(10));
                String updateSql = "UPDATE PORTAL_AUTH_USERS SET PASSWORD = ? WHERE USER_ID = ?";
                try (PreparedStatement updatePs = conn.prepareStatement(updateSql)) {
                    updatePs.setString(1, newHash);
                    updatePs.setString(2, userId);
                    updatePs.executeUpdate();
                }
            } catch (Exception ex) {
                // Non-fatal for current authentication, log safely without exposing password
                System.err.println("[AUTH] Notice: Unable to auto-upgrade legacy password: " + ex.getMessage());
            }
            return true;
        }

        return false;
    }
}
