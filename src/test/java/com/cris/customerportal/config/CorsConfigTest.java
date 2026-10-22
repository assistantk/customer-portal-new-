package com.cris.customerportal.config;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.cors.CorsConfiguration;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CorsConfigTest {

    @Test
    void allowsAngularDevelopmentOriginsForApiRequests() {
        ExposedCorsRegistry registry = new ExposedCorsRegistry();
        new CorsConfig(null).addCorsMappings(registry);
        CorsConfiguration configuration = registry.configurations().get("/api/**");

        assertEquals("http://localhost:4200", configuration.checkOrigin("http://localhost:4200"));
        assertEquals("http://127.0.0.1:4200", configuration.checkOrigin("http://127.0.0.1:4200"));
    }

    private static class ExposedCorsRegistry extends CorsRegistry {
        Map<String, CorsConfiguration> configurations() {
            return getCorsConfigurations();
        }
    }
}
