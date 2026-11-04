package com.cris.customerportal.config;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.sift.AbstractDiscriminator;

public class ClassNameDiscriminator extends AbstractDiscriminator<ILoggingEvent> {

    @Override
    public String getDiscriminatingValue(ILoggingEvent event) {
        String loggerName = event.getLoggerName();
        if (loggerName == null || !loggerName.startsWith("com.cris.customerportal.")) {
            return "Application";
        }

        String packageName = loggerName.substring(0, loggerName.lastIndexOf('.'));
        String simpleName = loggerName.substring(loggerName.lastIndexOf('.') + 1);
        if ("com.cris.customerportal".equals(packageName)) {
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

        return folder + "/" + simpleName.replaceAll("[^A-Za-z0-9_$.-]", "_");
    }

    @Override
    public String getKey() {
        return "classFile";
    }
}
