package com.cris.customerportal;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

@SpringBootApplication
public class CustomerPortalApplication extends SpringBootServletInitializer {
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
  }

  public static void main(String[] args) {
    SpringApplication.run(CustomerPortalApplication.class, args);
  }

  @Override
  protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
    return application.sources(CustomerPortalApplication.class);
  }
}
