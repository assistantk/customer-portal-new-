package com.cris.customerportal;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CustomerPortalApplication {
  static {
    // Ensure local/internal hosts bypass any configured HTTP/SOCKS proxy
    // (fixes proxy errors when connecting to the Oracle DB / internal services).
    System.setProperty("http.nonProxyHosts", "localhost|127.0.0.1|db.internal.net");
    System.setProperty("socksNonProxyHosts", "localhost|127.0.0.1|db.internal.net");
  }

  public static void main(String[] args) { SpringApplication.run(CustomerPortalApplication.class, args); }
}