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
  }

  public static void main(String[] args) {
    SpringApplication.run(CustomerPortalApplication.class, args);
  }

  @Override
  protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
    return application.sources(CustomerPortalApplication.class);
  }
}


//JCIB
/*$env:ORACLE_DB_URL = "jdbc:oracle:thin:@//10.30.6.65:1521/test.crisexacc.org"
$env:ORACLE_DB_USERNAME = "tms3t"
$env:ORACLE_DB_PASSWORD = Read-Host "Oracle database password"

.\mvnw.cmd spring-boot:run*/