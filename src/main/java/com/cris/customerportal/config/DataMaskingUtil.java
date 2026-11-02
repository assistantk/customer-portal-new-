package com.cris.customerportal.config;

import org.springframework.web.multipart.MultipartFile;

import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpSession;
import java.lang.reflect.Array;
import java.util.Collection;
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
            "(?i)(\"?\\b(password|pswd|passwd|pwd|otp|f_otp|totp|token|secret|authorization|captchaInput)\\b\"?\\s*[:=]\\s*[\"']?)([^\"',\\s\\}\\]&]+)([\"']?)");

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
            return String.format("MultipartFile[name=%s, size=%d bytes, type=%s]",
                    file.getOriginalFilename(), file.getSize(), file.getContentType());
        }
        if (arg instanceof Collection<?>) {
            Collection<?> coll = (Collection<?>) arg;
            if (!coll.isEmpty() && coll.iterator().next() instanceof MultipartFile) {
                StringBuilder sb = new StringBuilder("[");
                int idx = 0;
                for (Object item : coll) {
                    if (idx++ > 0) sb.append(", ");
                    if (item instanceof MultipartFile) {
                        MultipartFile file = (MultipartFile) item;
                        sb.append(String.format("MultipartFile[name=%s, size=%d bytes]",
                                file.getOriginalFilename(), file.getSize()));
                    } else {
                        sb.append(formatArg(item));
                    }
                }
                return sb.append("]").toString();
            }
        }
        if (arg.getClass().isArray()) {
            int length = Array.getLength(arg);
            if (length > 0 && Array.get(arg, 0) instanceof MultipartFile) {
                StringBuilder sb = new StringBuilder("[");
                for (int i = 0; i < length; i++) {
                    if (i > 0) sb.append(", ");
                    MultipartFile file = (MultipartFile) Array.get(arg, i);
                    sb.append(String.format("MultipartFile[name=%s, size=%d bytes]",
                            file.getOriginalFilename(), file.getSize()));
                }
                return sb.append("]").toString();
            }
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
            HttpSession session = (HttpSession) arg;
            return String.format("HttpSession[id=%s]", session.getId());
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
            String suffix = keyMatcher.group(4);
            keyMatcher.appendReplacement(sb1, Matcher.quoteReplacement(prefix + "***" + suffix));
        }
        keyMatcher.appendTail(sb1);
        String result = sb1.toString();

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

        return sb5.toString();
    }
}

