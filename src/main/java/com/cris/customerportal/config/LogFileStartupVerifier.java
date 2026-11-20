package com.cris.customerportal.config;

import com.cris.customerportal.CustomerPortalApplication;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;

/**
 * Startup diagnostic runner that verifies the existence and write permissions
 * of the required logging directory at {@code /switch/applogs/WEBAPPI/FreightCodeLog}
 * and its internal structure.
 */
@Component
public class LogFileStartupVerifier implements ApplicationRunner {

    private static final Logger LOGGER = LoggerFactory.getLogger(LogFileStartupVerifier.class);

    @Value("${logging.file.path:/switch/applogs/WEBAPPI/FreightCodeLog}")
    private String configuredLogPath;

    @Override
    public void run(ApplicationArguments args) {
        String logPath = configuredLogPath != null && !configuredLogPath.trim().isEmpty()
                ? configuredLogPath.trim()
                : CustomerPortalApplication.DEFAULT_LOG_PATH;

        LOGGER.info("Verifying application log directory configuration: {}", logPath);
        File logDir = new File(logPath);

        if (!logDir.exists()) {
            boolean created = logDir.mkdirs();
            if (created) {
                LOGGER.info("Log directory did not exist and was created successfully: {}", logDir.getAbsolutePath());
            } else {
                LOGGER.error("CRITICAL: Failed to create log directory: {}. "
                        + "Please ensure the WebLogic OS user has write permissions on /switch/applogs/WEBAPPI. "
                        + "Run: sudo mkdir -p {} && sudo chown -R <weblogic_user>:<group> {} && sudo chmod -R 775 {}",
                        logPath, logPath, logPath, logPath);
                return;
            }
        }

        if (!logDir.canWrite()) {
            LOGGER.error("CRITICAL: Log directory exists but is NOT writable: {}. "
                    + "Please fix permissions using: sudo chmod -R 775 {}", logPath, logPath);
            return;
        }

        // Verify subdirectories
        for (String sub : CustomerPortalApplication.LOG_SUBDIRECTORIES) {
            File subDir = new File(logDir, sub);
            if (!subDir.exists()) {
                boolean created = subDir.mkdirs();
                if (created) {
                    LOGGER.debug("Created internal log subdirectory: {}", sub);
                } else if (!subDir.exists()) {
                    LOGGER.warn("Could not create internal log subdirectory: {}", subDir.getAbsolutePath());
                }
            }
        }

        // Verify test file creation
        File testFile = new File(logDir, ".log_verify_test");
        try {
            if (testFile.createNewFile()) {
                testFile.delete();
                LOGGER.info("Log directory write verification PASSED: {} (All subdirectories verified)", logPath);
            }
        } catch (IOException e) {
            LOGGER.warn("Log directory test file creation failed: {}. Logging may fail if permissions are restricted.",
                    e.getMessage());
        }
    }
}
