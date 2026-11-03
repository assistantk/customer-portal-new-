package com.cris.customerportal.config;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.Appender;
import ch.qos.logback.core.FileAppender;
import ch.qos.logback.core.rolling.RollingFileAppender;
import ch.qos.logback.classic.sift.SiftingAppender;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import javax.annotation.PreDestroy;

@Component
public class LogFileStartupVerifier implements ApplicationRunner {

    private static final String FILE_APPENDER_NAME = "FILE_ALL";
    private static final String CLASS_APPENDER_NAME = "CLASS_FILES";
    private static final org.slf4j.Logger LOGGER =
            LoggerFactory.getLogger(LogFileStartupVerifier.class);
    private final String configuredLogDirectory;

    public LogFileStartupVerifier(@Value("${logging.file.path}") String configuredLogDirectory) {
        this.configuredLogDirectory = configuredLogDirectory;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            Path logDirectory = Paths.get(configuredLogDirectory).toAbsolutePath().normalize();
            Files.createDirectories(logDirectory);
            if (!Files.isDirectory(logDirectory) || !Files.isWritable(logDirectory)) {
                throw startupFailure(logDirectory, "directory is not writable");
            }

            LoggerContext loggerContext = (LoggerContext) LoggerFactory.getILoggerFactory();
            Appender<ILoggingEvent> appender =
                    loggerContext.getLogger(Logger.ROOT_LOGGER_NAME).getAppender(FILE_APPENDER_NAME);
            if (!(appender instanceof RollingFileAppender) || !appender.isStarted()) {
                throw startupFailure(logDirectory, "rolling file appender is not running");
            }

            String activeFile = ((FileAppender<ILoggingEvent>) appender).getFile();
            if (activeFile == null) {
                throw startupFailure(logDirectory, "active log file is not configured");
            }
            Path logFile = Paths.get(activeFile).toAbsolutePath().normalize();
            if (!logFile.startsWith(logDirectory)
                    || !Files.isRegularFile(logFile)
                    || !Files.isWritable(logFile)) {
                throw startupFailure(logDirectory, "active log file is missing or not writable");
            }

            Appender<ILoggingEvent> classAppender =
                    loggerContext.getLogger(Logger.ROOT_LOGGER_NAME).getAppender(CLASS_APPENDER_NAME);
            if (!(classAppender instanceof SiftingAppender) || !classAppender.isStarted()) {
                throw startupFailure(logDirectory, "class-specific rolling file appender is not running");
            }
            LOGGER.info("File logging initialized at {}", logFile);
            Path classLogFile = logDirectory.resolve("Configuration")
                    .resolve("LogFileStartupVerifier.log");
            if (!Files.isRegularFile(classLogFile) || !Files.isWritable(classLogFile)) {
                throw startupFailure(logDirectory, "class-specific log file was not created or is not writable");
            }
        } catch (IOException | InvalidPathException | SecurityException ex) {
            throw new IllegalStateException(
                    "File logging could not initialize under '" + configuredLogDirectory
                            + "'. Grant the application server user write access to this directory.",
                    ex);
        }
    }

    @PreDestroy
    public void logShutdown() {
        LOGGER.info("Application context is shutting down");
    }

    private IllegalStateException startupFailure(Path logDirectory, String reason) {
        return new IllegalStateException(
                "File logging could not initialize under '" + logDirectory + "': " + reason
                        + ". Grant the application server user write access to the directory.");
    }
}
