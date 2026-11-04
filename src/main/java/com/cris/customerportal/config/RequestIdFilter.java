package com.cris.customerportal.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Assigns a unique requestId to every HTTP request, places it in MDC so all log statements
 * in the request thread automatically include it, logs request and response metrics,
 * and returns it as the X-Request-Id HTTP response header.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestIdFilter.class);
    public static final String REQUEST_ID_MDC_KEY = "requestId";
    public static final String REQUEST_ID_HEADER = "X-Request-Id";
    private static final Pattern SAFE_REQUEST_ID = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String requestId = request.getHeader(REQUEST_ID_HEADER);
        if (requestId == null || !SAFE_REQUEST_ID.matcher(requestId).matches()) {
            requestId = UUID.randomUUID().toString();
        }
        String previousRequestId = MDC.get(REQUEST_ID_MDC_KEY);
        String previousClassName = MDC.get("className");
        String previousMethodName = MDC.get("methodName");
        MDC.put(REQUEST_ID_MDC_KEY, requestId);
        MDC.put("className", getClass().getSimpleName());
        MDC.put("methodName", "doFilterInternal");
        response.setHeader(REQUEST_ID_HEADER, requestId);

        long start = System.currentTimeMillis();
        String method = request.getMethod();
        String uri = request.getRequestURI();

        if (log.isInfoEnabled()) {
            log.info("REQ  START: {} {}", method, uri);
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            long duration = System.currentTimeMillis() - start;
            int status = response.getStatus();
            try {
                log.info("RESP END  : {} {} -> status={} duration={}ms",
                        method, uri, status, duration);
            } finally {
                restoreMdc(REQUEST_ID_MDC_KEY, previousRequestId);
                restoreMdc("className", previousClassName);
                restoreMdc("methodName", previousMethodName);
            }
        }
    }

    private void restoreMdc(String key, String previousValue) {
        if (previousValue == null) {
            MDC.remove(key);
        } else {
            MDC.put(key, previousValue);
        }
    }
}
