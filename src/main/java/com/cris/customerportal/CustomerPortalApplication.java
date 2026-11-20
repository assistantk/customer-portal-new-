package com.cris.customerportal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

import java.io.File;

@SpringBootApplication
public class CustomerPortalApplication extends SpringBootServletInitializer {

  private static final Logger LOGGER = LoggerFactory.getLogger(CustomerPortalApplication.class);

  public static final String DEFAULT_LOG_PATH = "/switch/applogs/WEBAPPI/FreightCodeLog";

  public static final String[] LOG_SUBDIRECTORIES = {
      "Controllers",
      "Services",
      "Repositories",
      "DAO",
      "Configuration",
      "Security",
      "DTO",
      "Entities",
      "Exceptions",
      "Application",
      "archive",
      "archive/Controllers",
      "archive/Services",
      "archive/Repositories",
      "archive/DAO",
      "archive/Configuration",
      "archive/Security",
      "archive/DTO",
      "archive/Entities",
      "archive/Exceptions",
      "archive/Application"
  };

  static {
    // Ensure local/internal hosts bypass any configured HTTP/SOCKS proxy
    // (fixes proxy errors when connecting to the Oracle DB / internal services).
    System.setProperty("http.nonProxyHosts",
        "localhost|127.0.0.1|*.crisexacc.org|tndexaccvm-scan.crisexacc.org|db.internal.net|smtp.gmail.com");
    System.setProperty("socksNonProxyHosts",
        "localhost|127.0.0.1|*.crisexacc.org|tndexaccvm-scan.crisexacc.org|db.internal.net|smtp.gmail.com");
    System.setProperty("java.net.preferIPv4Stack", "true");
    // Ensure headless mode for Java AWT (Graphics2D / BufferedImage) on server/Linux/WebLogic environments
    System.setProperty("java.awt.headless", "true");

    // Initialize base and child logging directories very early, before Logback appenders bind
    initializeLoggingDirectories();
  }

  public static void initializeLoggingDirectories() {
    String logPath = System.getProperty("logging.file.path");
    if (logPath == null || logPath.trim().isEmpty()) {
      logPath = System.getenv("LOG_PATH");
    }
    if (logPath == null || logPath.trim().isEmpty()) {
      logPath = DEFAULT_LOG_PATH;
    }

    try {
      File baseDir = new File(logPath);
      if (!baseDir.exists()) {
        boolean created = baseDir.mkdirs();
        if (!created && !baseDir.exists()) {
          System.err.println("[EARLY-LOG-INIT] Warning: Could not create base log directory: " + logPath
              + ". If deploying on Linux/WebLogic, verify permissions (e.g. chown/chmod) on /switch/applogs/WEBAPPI.");
        }
      }

      if (baseDir.exists() && baseDir.canWrite()) {
        for (String sub : LOG_SUBDIRECTORIES) {
          File subDir = new File(baseDir, sub);
          if (!subDir.exists()) {
            subDir.mkdirs();
          }
        }
      }
    } catch (Exception ex) {
      System.err.println("[EARLY-LOG-INIT] Error during directory initialization for " + logPath + ": " + ex.getMessage());
    }
  }

  public static void main(String[] args) {
    initializeLoggingDirectories();
    SpringApplication.run(CustomerPortalApplication.class, args);
  }

  @Override
  protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
    initializeLoggingDirectories();
    return application.sources(CustomerPortalApplication.class);
  }
}
