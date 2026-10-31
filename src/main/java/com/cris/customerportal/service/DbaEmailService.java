package com.cris.customerportal.service;

import com.cris.customerportal.audit.DatabaseOperationAudit;
import com.cris.customerportal.controller.AuthController;
import com.cris.customerportal.dto.AuthUserDto;
import com.cris.customerportal.repository.JdbcPortalUserLookupRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.stereotype.Service;

import javax.servlet.http.HttpSession;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class DbaEmailService {

    private static final Set<String> COMPANY_NAME_COLUMNS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "MAVGLBLCUSTNAME",
            "MAVHNDGAGNTNAME",
            "MAVHNDAGNTNAME",
            "MAVWGONOWNRSHIPDESC",
            "MAVWGONOWNRPRTYDESC")));

    private final JavaMailSender mailSender;
    private final String fromEmail;
    private final String dbaEmail;
    private final JdbcPortalUserLookupRepository portalUserLookupRepository;

    @Autowired
    public DbaEmailService(
            JavaMailSender mailSender,
            @Value("${spring.mail.username:mondal.prasanta@cris.org.in}") String fromEmail,
            @Value("${app.dba-email:mondal.prasanta@cris.org.in}") String dbaEmail,
            JdbcPortalUserLookupRepository portalUserLookupRepository) {
        this.mailSender = mailSender;
        this.fromEmail = fromEmail;
        this.dbaEmail = dbaEmail;
        this.portalUserLookupRepository = portalUserLookupRepository;
    }

    public DbaEmailService(JavaMailSender mailSender, String fromEmail, String dbaEmail) {
        this(mailSender, fromEmail, dbaEmail, null);
    }

    public void sendDbaAuditEmail(DatabaseOperationAudit audit) {
        if (audit == null) return;
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(dbaEmail, "mondal.prasanta@cris.org.in");
            message.setCc("mondal.prasanta@cris.org.in");

            String operation = audit.getOperationType() == null
                    ? "QUERY"
                    : audit.getOperationType().toUpperCase(Locale.ROOT);
            String tableName = audit.getTableName();
            String customerCode = audit.getCustomerCode();
            message.setSubject(buildEmailSubject(operation, tableName, customerCode));

            String auditSql = audit.getSqlStatement() == null ? "" : audit.getSqlStatement();
            boolean formatCustomerInsert = "INSERT".equalsIgnoreCase(audit.getOperationType())
                    && "MEMGLBLCUST".equalsIgnoreCase(audit.getTableName())
                    && auditSql.regionMatches(true, 0, "INSERT INTO MEMGLBLCUST", 0, "INSERT INTO MEMGLBLCUST".length());
            boolean formatUpdate = "UPDATE".equalsIgnoreCase(audit.getOperationType());
            String sql = formatCustomerInsert || formatUpdate
                    ? formatSqlForEmail(new SqlRequest(
                            audit.getOperationType(), audit.getTableName(), audit.getCustomerCode(), auditSql))
                    : formatStringLiterals(toEmailSql(audit));
            String text = buildEmailBody(operation, tableName, customerCode, sql, userFooter());

            message.setText(text);
            mailSender.send(message);
            System.out.println("[DBA EMAIL AUDIT] SMTP accepted notification to DBA and CC recipient for " + audit.getOperationType() + " on " + audit.getTableName() + " (Code: " + audit.getCustomerCode() + ")");
        } catch (MailException e) {
            Throwable cause = e.getCause();
            if (cause != null && cause.getClass().getName().contains("SendFailedException")) {
                System.err.println("[DBA EMAIL AUDIT ERROR] SendFailedException: Failed to send DBA notification email: " + e.getMessage());
            } else if (cause != null && cause.getClass().getName().contains("MessagingException")) {
                System.err.println("[DBA EMAIL AUDIT ERROR] MessagingException: Failed to send DBA notification email: " + e.getMessage());
            } else {
                System.err.println("[DBA EMAIL AUDIT ERROR] MailException: Failed to send DBA notification email: " + e.getMessage());
            }
            // Log without stopping the calling process (core Oracle transaction will continue)
            e.printStackTrace();
        } catch (Exception e) {
            System.err.println("[DBA EMAIL AUDIT ERROR] Unexpected error while sending DBA notification email: " + e.getMessage());
            e.printStackTrace();
        }
    }

    public void sendDbaSqlEmail(String operation, String sql) {
        List<SqlRequest> requests = new ArrayList<>();
        requests.add(new SqlRequest(operation, null, null, sql));
        sendDbaSqlEmail(requests);
    }

    public void sendDbaQueryEmail(String operation, String table, String customerCode, String sql) {
        List<SqlRequest> requests = new ArrayList<>();
        requests.add(new SqlRequest(operation, table, customerCode, sql));
        sendDbaSqlEmail(requests);
    }

    public void sendDbaQueryEmail(String operation, String table, String customerCode, String companyName, String sql) {
        List<SqlRequest> requests = new ArrayList<>();
        requests.add(new SqlRequest(operation, table, customerCode, companyName, sql));
        sendDbaSqlEmail(requests);
    }

    public void sendDbaSqlEmail(Collection<SqlRequest> requests) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromEmail);
        message.setTo(dbaEmail);

        SqlRequest firstRequest = requests == null || requests.isEmpty() ? null : requests.iterator().next();
        message.setSubject(buildEmailSubject(
                firstRequest == null ? "QUERY" : firstRequest.operation(),
                firstRequest == null ? null : firstRequest.table(),
                firstRequest == null ? null : firstRequest.code()));

        StringBuilder body = new StringBuilder("Dear DBA Team,\n\n"
                + "Kindly execute the attached/below script on rfrn3t and training.\n\n");
        int index = 1;
        String resolvedEmailId = null;
        for (SqlRequest request : requests) {
            body.append("Operation: ")
                    .append(request.operation().toUpperCase(Locale.ROOT))
                    .append('\n');
            if (request.table() != null) {
                body.append("Table: ").append(request.table()).append('\n');
            }
            if (request.code() != null) {
                body.append("Code: ").append(request.code()).append('\n');
            }
            if (request.companyName() != null && !request.companyName().trim().isEmpty()) {
                body.append("Company Name: ").append(request.companyName()).append('\n');
            }
            if (request.emailId() != null && !request.emailId().trim().isEmpty()) {
                resolvedEmailId = request.emailId().trim();
            }
            body.append("\nSQL QUERY:\n")
                    .append("----------------------------------------")
                    .append(index)
                    .append(' ')
                    .append(request.operation().toUpperCase(Locale.ROOT))
                    .append("---------------------------\n\n")
                    .append(formatSqlForEmail(request))
                    .append("\n\n");
            if (index++ < requests.size()) {
                body.append('\n');
            }
        }
        body.append(buildUserFooter(resolvedEmailId));
        message.setText(body.toString());

        System.out.println("[DBA EMAIL] Initiating DBA notification email to " + dbaEmail + " (From: " + fromEmail + ", Requests: " + requests.size() + ")...");
        try {
            mailSender.send(message);
            System.out.println("[DBA EMAIL] Email successfully dispatched to DBA (" + dbaEmail + ")");
        } catch (Exception e) {
            System.err.println("[DBA EMAIL ERROR] Failed to send DBA SQL notification email: " + e.getMessage());
            e.printStackTrace();
            throw e;
        }
    }

    private String buildEmailBody(String operation, String table, String code, String sql, String footer) {
        String normalizedOperation = normalizeOperation(operation);
        StringBuilder body = new StringBuilder();
        body.append("Dear DBA Team,\n\n")
                .append("Kindly execute the attached/below script on rfrn3t and training.\n\n")
                .append("Operation: ").append(normalizedOperation).append('\n')
                .append("Table: ").append(table == null || table.trim().isEmpty() ? "N/A" : table).append('\n')
                .append("Code: ").append(code == null || code.trim().isEmpty() ? "N/A" : code).append("\n\n")
                .append("SQL QUERY:\n")
                .append("----------------------------------------1 ").append(normalizedOperation).append("---------------------------\n\n")
                .append(sql)
                .append("\n\n")
                .append(footer == null ? "" : footer);
        return body.toString();
    }

    private String buildEmailSubject(String operation, String table, String code) {
        return "Request for " + normalizeOperation(operation)
                + " – " + (table == null || table.trim().isEmpty() ? "N/A" : table)
                + " – " + (code == null || code.trim().isEmpty() ? "N/A" : code);
    }

    private String normalizeOperation(String operation) {
        return operation == null || operation.trim().isEmpty() ? "QUERY" : operation.trim().toUpperCase(Locale.ROOT);
    }

    private String userFooter() {
        return buildUserFooter(null);
    }

    private String buildUserFooter(String providedEmailId) {
        String userId = resolveUserIdFromRequest();
        String emailId = firstNonBlank(providedEmailId, resolveUserEmailFromSession(), resolveUserEmailFromRequest());
        String phoneNumber = resolveUserPhoneNumberFromSession();

        StringBuilder footer = new StringBuilder();
        footer.append("UserID: ").append(userId == null ? "Not available" : userId).append("\n");
        footer.append("Email ID: ").append(emailId == null ? "Not available" : emailId).append("\n");
        footer.append("Phone Number: ").append(phoneNumber == null ? "Not available" : phoneNumber);
        return footer.toString();
    }

    private String resolveUserIdFromRequest() {
        Object requestAttributes = RequestContextHolder.getRequestAttributes();
        if (!(requestAttributes instanceof ServletRequestAttributes)) {
            return null;
        }

        HttpSession session = ((ServletRequestAttributes) requestAttributes)
                .getRequest()
                .getSession(false);
        if (session == null) {
            return null;
        }
        Object sessionUser = session.getAttribute(AuthController.AUTH_SESSION_KEY);
        if (!(sessionUser instanceof AuthUserDto) || portalUserLookupRepository == null) {
            return null;
        }

        return portalUserLookupRepository.findUserId(((AuthUserDto) sessionUser).getUserId()).orElse(null);
    }

    private String resolveUserEmailFromSession() {
        Object requestAttributes = RequestContextHolder.getRequestAttributes();
        if (!(requestAttributes instanceof ServletRequestAttributes)) {
            return null;
        }

        HttpSession session = ((ServletRequestAttributes) requestAttributes)
                .getRequest()
                .getSession(false);
        Object sessionUser = session == null ? null : session.getAttribute(AuthController.AUTH_SESSION_KEY);
        if (!(sessionUser instanceof AuthUserDto)) {
            return null;
        }

        AuthUserDto user = (AuthUserDto) sessionUser;
        return user.getEmail();
    }

    private String resolveUserPhoneNumberFromSession() {
        Object requestAttributes = RequestContextHolder.getRequestAttributes();
        if (!(requestAttributes instanceof ServletRequestAttributes)) {
            return null;
        }

        HttpSession session = ((ServletRequestAttributes) requestAttributes)
                .getRequest()
                .getSession(false);
        Object sessionUser = session == null ? null : session.getAttribute(AuthController.AUTH_SESSION_KEY);
        if (!(sessionUser instanceof AuthUserDto)) {
            return null;
        }

        return ((AuthUserDto) sessionUser).getPhoneNumber();
    }

    private String resolveUserEmailFromRequest() {
        Object requestAttributes = RequestContextHolder.getRequestAttributes();
        if (!(requestAttributes instanceof ServletRequestAttributes)) {
            return null;
        }

        HttpSession session = ((ServletRequestAttributes) requestAttributes)
                .getRequest()
                .getSession(false);
        if (session == null) {
            return null;
        }
        Object rawEmail = session.getAttribute("CURRENT_USER_EMAIL");
        if (!(rawEmail instanceof String)) {
            return null;
        }
        String email = ((String) rawEmail).trim();
        return email.isEmpty() ? null : email;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) {
                return value.trim();
            }
        }
        return null;
    }

    private String valueOrNotAvailable(String value) {
        return value == null || value.trim().isEmpty() ? "Not available" : value.trim();
    }

    /**
     * Value-object replacing the Java 16 record SqlRequest.
     */
    public static final class SqlRequest {
        private final String operation;
        private final String table;
        private final String code;
        private final String companyName;
        private final String sql;
        private final String userId;
        private final String emailId;

        public SqlRequest(String operation, String table, String code, String sql) {
            this(operation, table, code, null, sql, null, null);
        }

        public SqlRequest(String operation, String table, String code, String companyName, String sql) {
            this(operation, table, code, companyName, sql, null, null);
        }

        public SqlRequest(String operation, String table, String code, String sql, String userId, String emailId) {
            this(operation, table, code, null, sql, userId, emailId);
        }

        public SqlRequest(String operation, String table, String code, String companyName, String sql, String userId, String emailId) {
            this.operation = operation;
            this.table = table;
            this.code = code;
            this.companyName = companyName;
            this.sql = sql;
            this.userId = userId;
            this.emailId = emailId;
        }

        public String operation() { return operation; }
        public String table() { return table; }
        public String code() { return code; }
        public String companyName() { return companyName; }
        public String sql() { return sql; }
        public String userId() { return userId; }
        public String emailId() { return emailId; }
    }

    private String formatSqlForEmail(SqlRequest request) {
        String sql = request.sql();
        if ("DELETE".equalsIgnoreCase(request.operation())
                && ("MEMGLBLCUST".equalsIgnoreCase(request.table())
                    || "MEMGLBLHNDGAGNT".equalsIgnoreCase(request.table()))) {
            return sql;
        }
        if ("UPDATE".equalsIgnoreCase(request.operation())) {
            sql = normalizeCompanyNameUpdates(sql);
            if ("MEMGLBLCUST".equalsIgnoreCase(request.table())
                    || "MEMGLBLHNDGAGNT".equalsIgnoreCase(request.table())) {
                return formatUpdateForEmail(sql, request.table()).toUpperCase(Locale.ROOT);
            }
            return sql.toUpperCase(Locale.ROOT);
        }
        if (!"INSERT".equalsIgnoreCase(request.operation())
                || (!"MEMGLBLCUST".equalsIgnoreCase(request.table())
                    && !"MEMGLBLHNDGAGNT".equalsIgnoreCase(request.table()))) {
            return sql.toUpperCase(Locale.ROOT);
        }

        String table = "MEMGLBLCUST".equalsIgnoreCase(request.table())
                ? "MEMGLBLCUST"
                : "MEMGLBLHNDGAGNT";
        String insertPrefix = "INSERT INTO " + table;
        if (!sql.regionMatches(true, 0, insertPrefix, 0, insertPrefix.length())) {
            throw new IllegalArgumentException("Expected an INSERT statement for " + table + ".");
        }

        int columnListStart = insertPrefix.length();
        while (columnListStart < sql.length() && Character.isWhitespace(sql.charAt(columnListStart))) {
            columnListStart++;
        }
        if (columnListStart >= sql.length() || sql.charAt(columnListStart) != '(') {
            throw new IllegalArgumentException("Expected a column list in the " + table + " INSERT statement.");
        }

        int columnListEnd = findClosingParenthesis(sql, columnListStart);
        int valuesStart = columnListEnd + 1;
        while (valuesStart < sql.length() && Character.isWhitespace(sql.charAt(valuesStart))) {
            valuesStart++;
        }
        if (!sql.regionMatches(true, valuesStart, "VALUES", 0, "VALUES".length())) {
            throw new IllegalArgumentException("Expected VALUES after the " + table + " INSERT column list.");
        }

        String valuesPart = sql.substring(valuesStart);
        if ("MEMGLBLCUST".equalsIgnoreCase(table)) {
            return (insertPrefix + " " + compactSqlValues(valuesPart)).toUpperCase(Locale.ROOT);
        }
        return (insertPrefix + " " + valuesPart).toUpperCase(Locale.ROOT);
    }

    private String compactSqlValues(String sql) {
        StringBuilder sb = new StringBuilder(sql.length());
        boolean inString = false;
        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (c == '\'') {
                sb.append(c);
                if (inString && i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                    sb.append(sql.charAt(++i));
                } else {
                    inString = !inString;
                }
            } else if (inString || !Character.isWhitespace(c)) {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private String formatUpdateForEmail(String sql, String table) {
        String updatePrefix = "UPDATE " + table;
        if (!sql.regionMatches(true, 0, updatePrefix, 0, updatePrefix.length())) {
            throw new IllegalArgumentException("Expected an UPDATE statement for " + table + ".");
        }

        int setStart = updatePrefix.length();
        while (setStart < sql.length() && Character.isWhitespace(sql.charAt(setStart))) {
            setStart++;
        }
        if (!sql.regionMatches(true, setStart, "SET", 0, 3)) {
            throw new IllegalArgumentException("Expected SET in the UPDATE statement for " + table + ".");
        }

        int assignmentsStart = setStart + 3;
        int whereStart = findKeywordOutsideString(sql, "WHERE", assignmentsStart);
        if (whereStart < 0) {
            throw new IllegalArgumentException("Expected WHERE in the UPDATE statement for " + table + ".");
        }

        List<String> assignments = splitSqlAssignments(sql.substring(assignmentsStart, whereStart));
        if (assignments.isEmpty()) {
            throw new IllegalArgumentException("Expected at least one assignment in the UPDATE statement for " + table + ".");
        }

        String whereClause = sql.substring(whereStart).trim();
        return updatePrefix + " SET\n"
                + String.join(",\n", assignments)
                + "\n" + whereClause;
    }

    private String normalizeCompanyNameUpdates(String sql) {
        int setStart = findKeywordOutsideString(sql, "SET", 0);
        if (setStart < 0) {
            return sql;
        }
        int assignmentsStart = setStart + "SET".length();
        int whereStart = findKeywordOutsideString(sql, "WHERE", assignmentsStart);
        if (whereStart < 0) {
            return sql;
        }

        List<String> assignments = splitSqlAssignments(sql.substring(assignmentsStart, whereStart));
        boolean changed = false;
        for (int i = 0; i < assignments.size(); i++) {
            String assignment = assignments.get(i);
            int equalsIndex = findEqualsOutsideString(assignment);
            if (equalsIndex < 0) {
                continue;
            }
            String column = assignment.substring(0, equalsIndex).trim().toUpperCase(Locale.ROOT);
            if (!COMPANY_NAME_COLUMNS.contains(column)) {
                continue;
            }
            String expression = assignment.substring(equalsIndex + 1).trim();
            String normalizedLiteral = normalizeCompanyNameLiteral(expression);
            if (normalizedLiteral != null && !normalizedLiteral.equals(expression)) {
                assignments.set(i, assignment.substring(0, equalsIndex + 1) + " " + normalizedLiteral);
                changed = true;
            }
        }

        if (!changed) {
            return sql;
        }
        return sql.substring(0, assignmentsStart)
                + " " + String.join(", ", assignments)
                + " " + sql.substring(whereStart).trim();
    }

    private String normalizeCompanyNameLiteral(String expression) {
        if (expression.length() < 2 || expression.charAt(0) != '\''
                || expression.charAt(expression.length() - 1) != '\'') {
            return null;
        }
        String value = expression.substring(1, expression.length() - 1).replace("''", "'");
        String normalized = value.trim();
        if (normalized.length() > 3
                && normalized.regionMatches(true, 0, "M/S", 0, 3)
                && Character.isWhitespace(normalized.charAt(3))) {
            normalized = "M/S " + normalized.substring(4).trim();
        } else {
            normalized = "M/S " + normalized;
        }
        return "'" + normalized.replace("'", "''") + "'";
    }

    private int findEqualsOutsideString(String assignment) {
        boolean inString = false;
        for (int i = 0; i < assignment.length(); i++) {
            char current = assignment.charAt(i);
            if (current == '\'') {
                if (inString && i + 1 < assignment.length() && assignment.charAt(i + 1) == '\'') {
                    i++;
                } else {
                    inString = !inString;
                }
            } else if (current == '=' && !inString) {
                return i;
            }
        }
        return -1;
    }

    private int findKeywordOutsideString(String sql, String keyword, int start) {
        boolean inString = false;
        for (int i = start; i <= sql.length() - keyword.length(); i++) {
            char current = sql.charAt(i);
            if (current == '\'') {
                if (inString && i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                    i++;
                } else {
                    inString = !inString;
                }
            } else if (!inString
                    && sql.regionMatches(true, i, keyword, 0, keyword.length())
                    && (i == 0 || !Character.isLetterOrDigit(sql.charAt(i - 1)))
                    && (i + keyword.length() == sql.length()
                        || !Character.isLetterOrDigit(sql.charAt(i + keyword.length())))) {
                return i;
            }
        }
        return -1;
    }

    private List<String> splitSqlAssignments(String assignments) {
        List<String> result = new ArrayList<>();
        boolean inString = false;
        int start = 0;
        for (int i = 0; i < assignments.length(); i++) {
            char current = assignments.charAt(i);
            if (current == '\'') {
                if (inString && i + 1 < assignments.length() && assignments.charAt(i + 1) == '\'') {
                    i++;
                } else {
                    inString = !inString;
                }
            } else if (current == ',' && !inString) {
                addAssignment(result, assignments.substring(start, i));
                start = i + 1;
            }
        }
        addAssignment(result, assignments.substring(start));
        return result;
    }

    private void addAssignment(List<String> assignments, String assignment) {
        String trimmed = assignment.trim();
        if (!trimmed.isEmpty()) {
            assignments.add(trimmed);
        }
    }

    private int findClosingParenthesis(String sql, int openingParenthesis) {
        boolean inString = false;
        for (int i = openingParenthesis + 1; i < sql.length(); i++) {
            char current = sql.charAt(i);
            if (current == '\'') {
                if (inString && i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                    i++;
                } else {
                    inString = !inString;
                }
            } else if (current == ')' && !inString) {
                return i;
            }
        }
        throw new IllegalArgumentException("Unclosed column list in the customer registration statement.");
    }

    private String toEmailSql(DatabaseOperationAudit audit) {
        String sql = audit.getSqlStatement() == null ? "" : audit.getSqlStatement();
        String tableName = audit.getTableName();
        if (!"INSERT".equalsIgnoreCase(audit.getOperationType())
                || tableName == null
                || (!"MEMGLBLCUST".equalsIgnoreCase(tableName)
                    && !"MEMGLBLHNDGAGNT".equalsIgnoreCase(tableName))) {
            return sql;
        }

        Pattern columnListInsert = Pattern.compile(
                "^(\\s*INSERT\\s+INTO\\s+" + Pattern.quote(tableName) + ")\\s*\\([^)]*\\)(\\s+VALUES\\b.*)$",
                Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
        Matcher matcher = columnListInsert.matcher(sql);
        return matcher.matches() ? matcher.group(1) + matcher.group(2) : sql;
    }

    private String formatStringLiterals(String sql) {
        StringBuilder formatted = new StringBuilder(sql.length());
        boolean inString = false;
        for (int i = 0; i < sql.length(); i++) {
            char current = sql.charAt(i);
            if (current == '\'') {
                formatted.append(current);
                if (inString && i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                    formatted.append(sql.charAt(++i));
                } else {
                    inString = !inString;
                }
            } else if (inString) {
                String character = String.valueOf(current);
                formatted.append(character.equals("&") ? "AND" : character.toUpperCase(Locale.ROOT));
            } else {
                formatted.append(current);
            }
        }
        return formatted.toString();
    }
}
