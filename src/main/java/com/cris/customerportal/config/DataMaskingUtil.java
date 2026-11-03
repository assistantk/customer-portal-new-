package com.cris.customerportal.config;

import org.springframework.web.multipart.MultipartFile;

import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Array;
import java.util.Collection;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Production-grade data masking utility for sensitive data in logs.
 * Masks passwords, OTPs, tokens, PAN, GSTIN, Aadhaar, and mobile numbers.
 * Safely summarizes MultipartFile without reading or dumping binary content.
 */
public final class DataMaskingUtil {

    private DataMaskingUtil() {}

    // Regex for key-value pairs (JSON or toString: key="val", key='val', key=val, "key":"val")
    private static final Pattern SENSITIVE_KEY_PATTERN = Pattern.compile(
            "(?i)([\"']?\\b(password(hash)?|pswd|passwd|pwd|otp|f_otp|totp|(?:access|refresh|auth|id)?token|secret|clientsecret|credential(s)?|db[_-]?username|database[_-]?username|db[_-]?password|database[_-]?password|authorization|captchaInput|cookie|set-cookie|(?:j)?session[_-]?(id|cookie|token)?|sid|username|user(name|id)?|login(id|name)?|email|mobile|phone|address|company(name)?|trade(name)?|legal(name)?|pan(number)?|gstin(number)?|aadhaar|pin(code)?)\\b[\"']?\\s*[:=]\\s*)(?:\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|[^,\\s\\}\\]&]+)");
    private static final Pattern JDBC_ORACLE_CREDENTIALS = Pattern.compile(
            "(?i)(jdbc:oracle:thin:)[^/@:\\s]+/[^@:\\s]+(@)");

    // PAN: 5 uppercase letters, 4 digits, 1 uppercase letter (10 chars)
    private static final Pattern PAN_PATTERN = Pattern.compile(
            "\\b([A-Z]{5}[0-9]{4}[A-Z])\\b", Pattern.CASE_INSENSITIVE);

    // GSTIN: 2 digits, 5 letters, 4 digits, 1 letter, 1 alphanum, 'Z', 1 alphanum (15 chars)
    private static final Pattern GSTIN_PATTERN = Pattern.compile(
            "\\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z])\\b", Pattern.CASE_INSENSITIVE);

    // Aadhaar: 12 digits (continuous or 4-4-4 separated by space or hyphen)
    private static final Pattern AADHAAR_PATTERN = Pattern.compile(
            "\\b(\\d{4}[ -]?\\d{4}[ -]?)(\\d{4})\\b");

    // Indian mobile number: 10 digits starting with 6, 7, 8, 9
    private static final Pattern MOBILE_PATTERN = Pattern.compile(
            "\\b([6-9]\\d{5})(\\d{4})\\b");
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
            "\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b", Pattern.CASE_INSENSITIVE);

    /**
     * Formats an argument safely for logging, masking sensitive fields and
     * summarizing MultipartFile objects without reading file content.
     */
    public static String formatArg(Object arg) {
        if (arg == null) {
            return "null";
        }
        if (arg instanceof MultipartFile) {
            MultipartFile file = (MultipartFile) arg;
            return String.format("MultipartFile[name=redacted, size=%d bytes, type=%s]",
                    file.getSize(), file.getContentType());
        }
        if (arg instanceof Collection<?>) {
            return "Collection[size=" + ((Collection<?>) arg).size() + "]";
        }
        if (arg instanceof Map<?, ?>) {
            return "Map[size=" + ((Map<?, ?>) arg).size() + "]";
        }
        if (arg.getClass().isArray()) {
            return arg.getClass().getComponentType().getSimpleName()
                    + "[length=" + Array.getLength(arg) + "]";
        }
        if (arg instanceof HttpServletRequest) {
            HttpServletRequest req = (HttpServletRequest) arg;
            return String.format("HttpServletRequest[%s %s]", req.getMethod(), req.getRequestURI());
        }
        if (arg instanceof HttpServletResponse) {
            HttpServletResponse res = (HttpServletResponse) arg;
            return String.format("HttpServletResponse[status=%d]", res.getStatus());
        }
        if (arg instanceof HttpSession) {
            return "HttpSession[redacted]";
        }
        if (arg instanceof ServletRequest || arg instanceof ServletResponse) {
            return arg.getClass().getSimpleName();
        }

        return maskSensitive(String.valueOf(arg));
    }

    /**
     * Applies masking rules to a String:
     * 1. Sensitive key-value pairs (passwords, OTPs, tokens) -> masked with ***
     * 2. PAN (10-char) -> show last 4 chars (e.g. ******123F)
     * 3. GSTIN (15-char) -> show last 4 chars (e.g. ***********1Z5)
     * 4. Aadhaar (12-digit) -> show last 4 chars (e.g. ********9012)
     * 5. Mobile (10-digit) -> show last 4 chars (e.g. ******4567)
     */
    public static String maskSensitive(String input) {
        if (input == null || input.isEmpty()) {
            return input;
        }

        // 1. Mask sensitive key-value pairs
        Matcher keyMatcher = SENSITIVE_KEY_PATTERN.matcher(input);
        StringBuffer sb1 = new StringBuffer();
        while (keyMatcher.find()) {
            String prefix = keyMatcher.group(1);
            keyMatcher.appendReplacement(sb1, Matcher.quoteReplacement(prefix + "***"));
        }
        keyMatcher.appendTail(sb1);
        String result = JDBC_ORACLE_CREDENTIALS.matcher(sb1.toString()).replaceAll("$1***:***$2");

        // 2. Mask GSTIN (must run before PAN since GSTIN contains PAN)
        Matcher gstinMatcher = GSTIN_PATTERN.matcher(result);
        StringBuffer sb2 = new StringBuffer();
        while (gstinMatcher.find()) {
            String gstin = gstinMatcher.group(1);
            String masked = "***********" + gstin.substring(11);
            gstinMatcher.appendReplacement(sb2, Matcher.quoteReplacement(masked));
        }
        gstinMatcher.appendTail(sb2);
        result = sb2.toString();

        // 3. Mask PAN (10 chars, show last 4)
        Matcher panMatcher = PAN_PATTERN.matcher(result);
        StringBuffer sb3 = new StringBuffer();
        while (panMatcher.find()) {
            String pan = panMatcher.group(1);
            String masked = "******" + pan.substring(6);
            panMatcher.appendReplacement(sb3, Matcher.quoteReplacement(masked));
        }
        panMatcher.appendTail(sb3);
        result = sb3.toString();

        // 4. Mask Aadhaar (12 digits, show last 4)
        Matcher aadhaarMatcher = AADHAAR_PATTERN.matcher(result);
        StringBuffer sb4 = new StringBuffer();
        while (aadhaarMatcher.find()) {
            String last4 = aadhaarMatcher.group(2);
            aadhaarMatcher.appendReplacement(sb4, Matcher.quoteReplacement("********" + last4));
        }
        aadhaarMatcher.appendTail(sb4);
        result = sb4.toString();

        // 5. Mask Mobile (10 digits starting with 6-9, show last 4)
        Matcher mobileMatcher = MOBILE_PATTERN.matcher(result);
        StringBuffer sb5 = new StringBuffer();
        while (mobileMatcher.find()) {
            String last4 = mobileMatcher.group(2);
            mobileMatcher.appendReplacement(sb5, Matcher.quoteReplacement("******" + last4));
        }
        mobileMatcher.appendTail(sb5);

        return EMAIL_PATTERN.matcher(sb5.toString()).replaceAll("***@***");
    }

    public static String formatThrowable(Throwable error) {
        if (error == null) {
            return "null";
        }
        StringWriter trace = new StringWriter();
        error.printStackTrace(new PrintWriter(trace));
        return maskSensitive(trace.toString());
    }
}
