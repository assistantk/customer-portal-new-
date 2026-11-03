package com.cris.customerportal.config;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.lang.reflect.Array;
import java.util.Collection;
import java.util.Optional;

/**
 * Cross-cutting AOP logging aspect covering controller, service, and repository layers:
 * - Records class.method, sanitized/masked arguments, return value (truncated to 500 chars),
 *   execution time, and exceptions with stack traces.
 * - For repositories: explicitly logs operation and result count.
 * - Adheres strictly to security masking (no credentials, masked PAN/GSTIN/mobile/Aadhaar).
 */
@Aspect
@Component
public class LoggingAspect {

    private static final Logger log = LoggerFactory.getLogger(LoggingAspect.class);
    private static final int MAX_VALUE_LENGTH = 500;

    @Pointcut("within(com.cris.customerportal.controller..*)")
    public void controllerLayer() {}

    @Pointcut("within(com.cris.customerportal.service..*)")
    public void serviceLayer() {}

    @Pointcut("within(com.cris.customerportal.repository..*)")
    public void repositoryLayer() {}

    @Around("controllerLayer()")
    public Object logController(ProceedingJoinPoint joinPoint) throws Throwable {
        String className = joinPoint.getSignature().getDeclaringType().getSimpleName();
        String methodName = joinPoint.getSignature().getName();
        Object[] args = joinPoint.getArgs();

        if (log.isInfoEnabled()) {
            log.info("CONTROLLER ENTER: {}.{}() args={}", className, methodName, sanitizeArgs(args));
        }

        long start = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();
            long elapsed = System.currentTimeMillis() - start;
            if (log.isInfoEnabled()) {
                log.info("CONTROLLER EXIT : {}.{}() result={} duration={}ms",
                        className, methodName, truncateAndMask(result), elapsed);
            }
            return result;
        } catch (Exception ex) {
            long elapsed = System.currentTimeMillis() - start;
            log.error("CONTROLLER EXCEPTION: {}.{}() failed after {}ms: {}",
                    className, methodName, elapsed, ex.getMessage(), ex);
            throw ex;
        }
    }

    @Around("serviceLayer()")
    public Object logService(ProceedingJoinPoint joinPoint) throws Throwable {
        String className = joinPoint.getSignature().getDeclaringType().getSimpleName();
        String methodName = joinPoint.getSignature().getName();
        Object[] args = joinPoint.getArgs();

        if (log.isDebugEnabled()) {
            log.debug("SERVICE ENTER: {}.{}() args={}", className, methodName, sanitizeArgs(args));
        }

        long start = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();
            long elapsed = System.currentTimeMillis() - start;
            if (log.isDebugEnabled()) {
                log.debug("SERVICE EXIT : {}.{}() result={} duration={}ms",
                        className, methodName, truncateAndMask(result), elapsed);
            }
            return result;
        } catch (Exception ex) {
            long elapsed = System.currentTimeMillis() - start;
            log.error("SERVICE EXCEPTION: {}.{}() failed after {}ms: {}",
                    className, methodName, elapsed, ex.getMessage(), ex);
            throw ex;
        }
    }

    @Around("repositoryLayer()")
    public Object logRepository(ProceedingJoinPoint joinPoint) throws Throwable {
        String className = joinPoint.getSignature().getDeclaringType().getSimpleName();
        String methodName = joinPoint.getSignature().getName();
        Object[] args = joinPoint.getArgs();

        if (log.isDebugEnabled()) {
            log.debug("REPO OPERATION: {}.{}() args={}", className, methodName, sanitizeArgs(args));
        }

        long start = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();
            long elapsed = System.currentTimeMillis() - start;
            if (log.isDebugEnabled()) {
                log.debug("REPO RESULT   : {}.{}() count={} duration={}ms",
                        className, methodName, determineResultCount(result), elapsed);
            }
            return result;
        } catch (Exception ex) {
            long elapsed = System.currentTimeMillis() - start;
            log.error("REPO EXCEPTION: {}.{}() failed after {}ms: {}",
                    className, methodName, elapsed, ex.getMessage(), ex);
            throw ex;
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private String sanitizeArgs(Object[] args) {
        if (args == null || args.length == 0) return "[]";
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < args.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append(DataMaskingUtil.formatArg(args[i]));
        }
        sb.append("]");
        return truncate(sb.toString());
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

    private String determineResultCount(Object result) {
        if (result == null) {
            return "0 (null)";
        }
        if (result instanceof Collection<?>) {
            return ((Collection<?>) result).size() + " rows";
        }
        if (result instanceof Optional<?>) {
            return ((Optional<?>) result).isPresent() ? "1 row" : "0 rows";
        }
        if (result.getClass().isArray()) {
            return Array.getLength(result) + " items";
        }
        if (result instanceof Boolean) {
            return (Boolean) result ? "matched (true)" : "not matched (false)";
        }
        if (result instanceof Number) {
            return result.toString();
        }
        return "1 record";
    }
}
