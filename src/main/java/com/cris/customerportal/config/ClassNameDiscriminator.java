package com.cris.customerportal.config;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.sift.AbstractDiscriminator;

import java.io.File;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class ClassNameDiscriminator extends AbstractDiscriminator<ILoggingEvent> {

    private static final Set<String> CREATED_DIRS = ConcurrentHashMap.newKeySet();

    @Override
    public String getDiscriminatingValue(ILoggingEvent event) {
        String loggerName = event.getLoggerName();
        if (loggerName == null || !loggerName.startsWith("com.cris.customerportal.")) {
            ensureDirectoryCreated("Application");
            return "Application";
        }

        String packageName = loggerName.substring(0, loggerName.lastIndexOf('.'));
        String simpleName = loggerName.substring(loggerName.lastIndexOf('.') + 1);
        if ("com.cris.customerportal".equals(packageName)) {
            ensureDirectoryCreated("Application");
            return "Application";
        }
        String folder;
        if (packageName.endsWith(".controller")) {
            folder = "Controllers";
        } else if (packageName.endsWith(".service")) {
            folder = "Services";
        } else if (packageName.endsWith(".repository")) {
            folder = "Repositories";
        } else if (packageName.endsWith(".audit")) {
            folder = "DAO";
        } else if (packageName.endsWith(".config")) {
            folder = "Configuration";
        } else if (packageName.endsWith(".security")) {
            folder = "Security";
        } else if (packageName.endsWith(".dto")) {
            folder = "DTO";
        } else if (packageName.endsWith(".entity")) {
            folder = "Entities";
        } else if (packageName.endsWith(".exception")) {
            folder = "Exceptions";
        } else {
            folder = "Application";
        }

        ensureDirectoryCreated(folder);
        return folder + "/" + simpleName.replaceAll("[^A-Za-z0-9_$.-]", "_");
    }

    private void ensureDirectoryCreated(String folder) {
        if (folder == null || folder.isEmpty() || CREATED_DIRS.contains(folder)) {
            return;
        }
        try {
            String basePath = System.getProperty("logging.file.path");
            if (basePath == null || basePath.trim().isEmpty()) {
                basePath = System.getenv("LOG_PATH");
            }
            if (basePath == null || basePath.trim().isEmpty()) {
                basePath = "/switch/applogs/WEBAPPI/FreightCodeLog";
            }
            File dir = new File(basePath, folder);
            if (!dir.exists()) {
                dir.mkdirs();
            }
            File archiveDir = new File(basePath + "/archive", folder);
            if (!archiveDir.exists()) {
                archiveDir.mkdirs();
            }
            CREATED_DIRS.add(folder);
        } catch (Exception ignored) {
        }
    }

    @Override
    public String getKey() {
        return "classFile";
    }
}
