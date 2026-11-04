package com.cris.customerportal.config;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.aop.support.AopUtils;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Logs public calls crossing the controller, service, repository, audit, and exception
 * Spring proxy boundaries. Logback routes each event using its originating class logger.
 */
@Aspect
@Component
public class LoggingAspect {

    private static final int MAX_VALUE_LENGTH = 500;

    @Pointcut("execution(public * com.cris.customerportal.controller..*(..))"
            + " || execution(public * com.cris.customerportal.service..*(..))"
            + " || execution(public * com.cris.customerportal.repository..*(..))"
            + " || execution(public * com.cris.customerportal.audit..*(..))"
            + " || execution(public * com.cris.customerportal.exception..*(..))"
            + " || (execution(public * com.cris.customerportal.config..*(..))"
            + " && !within(com.cris.customerportal.config.CorsConfig)"
            + " && !within(com.cris.customerportal.config.LoggingAspect))")
    public void applicationOperation() {}

    @Around("applicationOperation()")
    public Object logApplicationOperation(ProceedingJoinPoint joinPoint) throws Throwable {
        Class<?> targetClass = AopUtils.getTargetClass(joinPoint.getTarget());
        if (targetClass == null || !targetClass.getName().startsWith("com.cris.customerportal.")) {
            targetClass = joinPoint.getSignature().getDeclaringType();
        }
        String className = targetClass.getSimpleName();
        String methodName = joinPoint.getSignature().getName();
        Logger logger = LoggerFactory.getLogger(targetClass);
        String previousClassName = MDC.get("className");
        String previousMethodName = MDC.get("methodName");
        MDC.put("className", className);
        MDC.put("methodName", methodName);

        long start = System.nanoTime();
        try {
            logger.info("METHOD START args={}", sanitizeArgs(joinPoint.getArgs()));
            Object result = joinPoint.proceed();
            logger.info("METHOD COMPLETE result={} duration={}ms",
                    truncateAndMask(result), elapsedMillis(start));
            return result;
        } catch (Throwable error) {
            logger.error("METHOD FAILED duration={}ms stackTrace={}",
                    elapsedMillis(start), sanitizedStackTrace(error));
            throw error;
        } finally {
            restoreMdc("className", previousClassName);
            restoreMdc("methodName", previousMethodName);
        }
    }

    private String sanitizeArgs(Object[] args) {
        if (args == null || args.length == 0) return "[]";
        List<String> formatted = new ArrayList<String>(args.length);
        for (Object arg : args) {
            formatted.add(DataMaskingUtil.formatArg(arg));
        }
        return truncate(formatted.toString());
    }

    private String truncateAndMask(Object value) {
        if (value == null) return "null";
        String formatted = DataMaskingUtil.formatArg(value);
        return truncate(formatted);
    }

    private String truncate(String s) {
        if (s == null) return "null";
        if (s.length() <= MAX_VALUE_LENGTH) return s;
        return s.substring(0, MAX_VALUE_LENGTH) + "…[truncated]";
    }

    private String sanitizedStackTrace(Throwable error) {
        return DataMaskingUtil.formatThrowable(error);
    }

    private long elapsedMillis(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000L;
    }

    private void restoreMdc(String key, String previousValue) {
        if (previousValue == null) {
            MDC.remove(key);
        } else {
            MDC.put(key, previousValue);
        }
    }
}
