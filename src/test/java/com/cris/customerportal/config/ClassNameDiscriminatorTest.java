package com.cris.customerportal.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.joran.JoranConfigurator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ClassNameDiscriminatorTest {

    private final ClassNameDiscriminator discriminator = new ClassNameDiscriminator();

    @Test
    void routesApplicationLoggersToTheirPackageFolders() {
        assertEquals("Controllers/CustomerController",
                discriminatingValue("com.cris.customerportal.controller.CustomerController"));
        assertEquals("Services/CustomerServiceImpl",
                discriminatingValue("com.cris.customerportal.service.CustomerServiceImpl"));
        assertEquals("Repositories/CustomerRepository",
                discriminatingValue("com.cris.customerportal.repository.CustomerRepository"));
    }

    @Test
    void routesThirdPartyAndApplicationLoggerEventsToApplicationLog() {
        assertEquals("Application", discriminatingValue("org.springframework.web.DispatcherServlet"));
        assertEquals("Application", discriminatingValue("com.cris.customerportal.CustomerPortalApplication"));
    }

    @Test
    void siftingAppenderCreatesTheOriginatingClassLogFile(@TempDir Path temporaryDirectory) throws Exception {
        LoggerContext context = new LoggerContext();
        try {
            context.putProperty("LOG_PATH", temporaryDirectory.toString());
            String configuration = "<configuration>"
                    + "<appender name=\"CLASS_FILES\" class=\"ch.qos.logback.classic.sift.SiftingAppender\">"
                    + "<timeout>30 minutes</timeout><maxAppenderCount>100</maxAppenderCount>"
                    + "<discriminator class=\"com.cris.customerportal.config.ClassNameDiscriminator\"/>"
                    + "<sift><appender name=\"CLASS-${classFile}\" class=\"ch.qos.logback.core.rolling.RollingFileAppender\">"
                    + "<file>${LOG_PATH}/${classFile}.log</file>"
                    + "<rollingPolicy class=\"ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy\">"
                    + "<fileNamePattern>${LOG_PATH}/archive/${classFile}.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>"
                    + "<maxFileSize>20MB</maxFileSize><maxHistory>30</maxHistory>"
                    + "<totalSizeCap>1GB</totalSizeCap></rollingPolicy>"
                    + "<encoder class=\"ch.qos.logback.classic.encoder.PatternLayoutEncoder\">"
                    + "<pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} | %-5level | class=%X{className:-n/a} [%logger] | method=%X{methodName:-n/a} caller=%M | [%thread] | [requestId=%X{requestId:-no-rid}] | %msg%n%ex{full}</pattern>"
                    + "</encoder></appender></sift></appender>"
                    + "<root level=\"INFO\"><appender-ref ref=\"CLASS_FILES\"/></root>"
                    + "</configuration>";
            JoranConfigurator configurator = new JoranConfigurator();
            configurator.setContext(context);
            configurator.doConfigure(new ByteArrayInputStream(configuration.getBytes(StandardCharsets.UTF_8)));

            Logger logger = context.getLogger("com.cris.customerportal.controller.CustomerController");
            logger.info("class-specific output verified");

            Path classLog = temporaryDirectory.resolve("Controllers").resolve("CustomerController.log");
            assertTrue(Files.isRegularFile(classLog));
            assertTrue(new String(Files.readAllBytes(classLog), StandardCharsets.UTF_8)
                    .contains("class-specific output verified"));
        } finally {
            context.stop();
        }
    }

    private String discriminatingValue(String loggerName) {
        ILoggingEvent event = mock(ILoggingEvent.class);
        when(event.getLoggerName()).thenReturn(loggerName);
        return discriminator.getDiscriminatingValue(event);
    }
}
