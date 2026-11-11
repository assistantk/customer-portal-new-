package com.cris.customerportal.service;

import com.cris.customerportal.config.DataMaskingUtil;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(DbaEmailService.class);

    private static final Set<String> ADDRESS_COLUMNS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            "MAVGLBLCUSTADDRTEXT",
            "MAVHNDGAGNTADDRTEXT",
            "MAVHNDAGNTADDRTEXT")));

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
            boolean formatRegistrationInsert = "INSERT".equalsIgnoreCase(audit.getOperationType())
                    && ("MEMGLBLCUST".equalsIgnoreCase(audit.getTableName())
                        || "MEMGLBLHNDGAGNT".equalsIgnoreCase(audit.getTableName()))
                    && auditSql.regionMatches(
                            true, 0, "INSERT INTO " + audit.getTableName(),
                            0, ("INSERT INTO " + audit.getTableName()).length());
            boolean formatUpdate = "UPDATE".equalsIgnoreCase(audit.getOperationType());
            String sql = formatRegistrationInsert || formatUpdate
                    ? formatSqlForEmail(new SqlRequest(
                            audit.getOperationType(), audit.getTableName(), audit.getCustomerCode(), auditSql))
                    : formatStringLiterals(toEmailSql(audit));
            String text = buildEmailBody(operation, tableName, customerCode, sql, userFooter());

            message.setText(text);
            mailSender.send(message);
            log.info("DbaEmailService.sendDbaAuditEmail: SMTP accepted notification for {} on {}",
                    audit.getOperationType(), audit.getTableName());
        } catch (MailException e) {
            Throwable cause = e.getCause();
            if (cause != null && cause.getClass().getName().contains("SendFailedException")) {
                log.error("DbaEmailService.sendDbaAuditEmail: SendFailedException - failed to send DBA notification email: {} stackTrace={}",
                        DataMaskingUtil.maskSensitive(e.getMessage()), DataMaskingUtil.formatThrowable(e));
            } else if (cause != null && cause.getClass().getName().contains("MessagingException")) {
                log.error("DbaEmailService.sendDbaAuditEmail: MessagingException - failed to send DBA notification email: {} stackTrace={}",
                        DataMaskingUtil.maskSensitive(e.getMessage()), DataMaskingUtil.formatThrowable(e));
            } else {
                log.error("DbaEmailService.sendDbaAuditEmail: MailException - failed to send DBA notification email: {} stackTrace={}",
                        DataMaskingUtil.maskSensitive(e.getMessage()), DataMaskingUtil.formatThrowable(e));
            }
            // Notification failure is logged without stopping the calling process.
        } catch (Exception e) {
            log.error("DbaEmailService.sendDbaAuditEmail: unexpected error while sending DBA notification email: {} stackTrace={}",
                    DataMaskingUtil.maskSensitive(e.getMessage()), DataMaskingUtil.formatThrowable(e));
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
        sendDbaSqlEmail(requests, null);
    }

    public void sendDbaRegistrationSqlEmail(Collection<SqlRequest> requests) {
        try {
            List<SqlRequest> registrationInserts = orderedRegistrationInsertSet(requests);
            if (registrationInserts == null) {
                throw new IllegalArgumentException("Registration email requires a parent INSERT and GSTIN detail INSERT queries.");
            }
            sendDbaSqlEmail(requests, registrationInserts);
        } catch (IllegalArgumentException e) {
            log.error("DbaEmailService.sendDbaRegistrationSqlEmail: invalid registration SQL set; email not sent: {}",
                    DataMaskingUtil.maskSensitive(e.getMessage()));
            throw e;
        }
    }

    private void sendDbaSqlEmail(Collection<SqlRequest> requests, List<SqlRequest> registrationInserts) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromEmail);
        message.setTo(dbaEmail);

        List<SqlRequest> ownershipPair = registrationInserts == null
                ? orderedOwnershipInsertPair(requests)
                : null;
        List<SqlRequest> orderedPair = registrationInserts != null ? registrationInserts : ownershipPair;
        SqlRequest firstRequest = orderedPair != null
                ? orderedPair.get(0)
                : requests == null || requests.isEmpty() ? null : requests.iterator().next();
        String tableField = registrationInserts != null
                ? registrationInserts.get(0).table() + ", " + registrationInserts.get(1).table()
                : ownershipPair == null
                    ? firstRequest == null ? null : firstRequest.table()
                    : "MEMWGONOWNRSHIP, MEMWGONOWNRPRTY";
        message.setSubject(buildEmailSubject(
                firstRequest == null ? "QUERY" : firstRequest.operation(),
                ownershipPair == null
                        ? firstRequest == null ? null : firstRequest.table()
                        : tableField,
                firstRequest == null ? null : firstRequest.code()));

        StringBuilder body = new StringBuilder("Dear DBA Team,\n\n"
                + "Kindly execute the attached/below script on rfrn3t and training.\n\n");
        if (registrationInserts != null) {
            appendRegistrationInsertSet(body, registrationInserts, tableField);
        } else if (ownershipPair != null) {
            appendOwnershipInsertPair(body, ownershipPair);
        } else if (requests != null) {
            appendSqlRequests(body, requests);
        }
        body.append(userFooter());
        message.setText(body.toString());

        Collection<SqlRequest> orderedRequests = orderedPair == null ? requests : orderedPair;
        String combinedSqlForLog = orderedRequests == null ? "" : orderedRequests.stream()
                .map(request -> DataMaskingUtil.maskSqlLiteralsForLog(request.sql()))
                .collect(java.util.stream.Collectors.joining("\n"));
        log.info("DbaEmailService.sendDbaSqlEmail: Combined SQL passed to email utility statements={} tables={}\n{}",
                requests == null ? 0 : requests.size(), tableField, combinedSqlForLog);
        log.info("DbaEmailService.sendDbaSqlEmail: Final email body immediately before sending:\n{}",
                DataMaskingUtil.maskEmailBodyForLog(message.getText()));
        log.info("DbaEmailService.sendDbaSqlEmail: Initiating DBA notification email (Requests: {})...",
                requests == null ? 0 : requests.size());
        try {
            mailSender.send(message);
            log.info("DbaEmailService.sendDbaSqlEmail: Email successfully dispatched to DBA");
        } catch (Exception e) {
            log.error("DbaEmailService.sendDbaSqlEmail: Failed to send DBA SQL notification email: {} stackTrace={}",
                    DataMaskingUtil.maskSensitive(e.getMessage()), DataMaskingUtil.formatThrowable(e));
            throw e;
        }
    }

    private void appendSqlRequests(StringBuilder body, Collection<SqlRequest> requests) {
        int index = 1;
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
    }

    private void appendRegistrationInsertSet(StringBuilder body, List<SqlRequest> requests, String tableField) {
        SqlRequest parent = requests.get(0);
        body.append("Operation: INSERT\n")
                .append("Table: ").append(tableField).append('\n')
                .append("Code: ").append(parent.code()).append("\n\n")
                .append("SQL QUERY:\n")
                .append("----------------------------------------1 PARENT INSERT---------------------------\n\n")
                .append(formatSqlForEmail(parent))
                .append("\n\n");
        for (int i = 1; i < requests.size(); i++) {
            body.append("----------------------------------------")
                    .append(i + 1)
                    .append(" GSTIN DETAIL INSERT---------------------------\n\n")
                    .append(formatSqlForEmail(requests.get(i)))
                    .append("\n\n");
        }
    }

    private List<SqlRequest> orderedRegistrationInsertSet(Collection<SqlRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return null;
        }

        SqlRequest parent = null;
        String detailTable = null;
        for (SqlRequest request : requests) {
            if (request == null || !"INSERT".equalsIgnoreCase(request.operation())) {
                continue;
            }
            if (isRegistrationParentTable(request.table())) {
                if (parent != null) {
                    throw new IllegalArgumentException("Registration email must contain exactly one parent INSERT query.");
                }
                parent = request;
                detailTable = "MEMGLBLCUST".equalsIgnoreCase(request.table())
                        ? "MEMGLBLCUSTDTLS"
                        : "MEMGLBLHNDGAGNTDTLS";
            }
        }
        if (parent == null) {
            return null;
        }

        if (requests.size() < 2 || parent.code() == null || parent.sql() == null
                || !startsWithInsertForTable(parent.sql(), parent.table())) {
            throw new IllegalArgumentException("Registration email is missing a valid parent or GSTIN detail INSERT query.");
        }
        List<SqlRequest> details = new ArrayList<>();
        for (SqlRequest request : requests) {
            if (request == parent) {
                continue;
            }
            if (request == null
                    || !"INSERT".equalsIgnoreCase(request.operation())
                    || !detailTable.equalsIgnoreCase(request.table())
                    || !parent.code().equalsIgnoreCase(request.code())
                    || !startsWithInsertForTable(request.sql(), detailTable)) {
                throw new IllegalArgumentException("Registration email contains an invalid GSTIN detail INSERT query.");
            }
            details.add(request);
        }
        if (details.isEmpty()) {
            throw new IllegalArgumentException("Registration email requires at least one GSTIN detail INSERT query.");
        }

        List<SqlRequest> ordered = new ArrayList<>(details.size() + 1);
        ordered.add(parent);
        ordered.addAll(details);
        return ordered;
    }

    private boolean isRegistrationParentTable(String table) {
        return "MEMGLBLCUST".equalsIgnoreCase(table) || "MEMGLBLHNDGAGNT".equalsIgnoreCase(table);
    }

    private boolean startsWithInsertForTable(String sql, String table) {
        if (sql == null || table == null) {
            return false;
        }
        String prefix = "INSERT INTO " + table;
        String normalized = sql.trim();
        if (!normalized.regionMatches(true, 0, prefix, 0, prefix.length())) {
            return false;
        }
        return normalized.length() > prefix.length()
                && (Character.isWhitespace(normalized.charAt(prefix.length()))
                    || normalized.charAt(prefix.length()) == '(');
    }

    private void appendOwnershipInsertPair(StringBuilder body, List<SqlRequest> requests) {
        SqlRequest ownership = requests.get(0);
        SqlRequest party = requests.get(1);
        body.append("Operation: INSERT\n")
                .append("Table: MEMWGONOWNRSHIP, MEMWGONOWNRPRTY\n")
                .append("Code: ").append(ownership.code()).append("\n\n")
                .append("SQL QUERY:\n")
                .append("----------------------------------------1 INSERT---------------------------\n\n")
                .append(formatSqlForEmail(ownership))
                .append("\n\n")
                .append("----------------------------------------2 INSERT---------------------------\n\n")
                .append(formatSqlForEmail(party))
                .append("\n\n");
    }

    private List<SqlRequest> orderedOwnershipInsertPair(Collection<SqlRequest> requests) {
        if (requests == null || requests.size() != 2) {
            return null;
        }
        SqlRequest ownership = null;
        SqlRequest party = null;
        for (SqlRequest request : requests) {
            if (request == null || !"INSERT".equalsIgnoreCase(request.operation())) {
                return null;
            }
            if ("MEMWGONOWNRSHIP".equalsIgnoreCase(request.table()) && ownership == null) {
                ownership = request;
            } else if ("MEMWGONOWNRPRTY".equalsIgnoreCase(request.table()) && party == null) {
                party = request;
            } else {
                return null;
            }
        }
        if (ownership == null || party == null
                || ownership.code() == null || party.code() == null
                || !ownership.code().equalsIgnoreCase(party.code())) {
            return null;
        }
        return Arrays.asList(ownership, party);
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
        JdbcPortalUserLookupRepository.UserContactDetails user = resolveUserContactDetailsFromRequest();
        String userId = user == null ? null : user.userId();
        String emailId = user == null ? null : user.emailId();
        String phoneNumber = user == null ? null : user.phoneNumber();

        StringBuilder footer = new StringBuilder();
        footer.append("UserID: ").append(valueOrNotAvailable(userId)).append("\n");
        footer.append("Email ID: ").append(valueOrNotAvailable(emailId)).append("\n");
        footer.append("Phone Number: ").append(valueOrNotAvailable(phoneNumber));
        return footer.toString();
    }

    private JdbcPortalUserLookupRepository.UserContactDetails resolveUserContactDetailsFromRequest() {
        Object requestAttributes = RequestContextHolder.getRequestAttributes();
        if (!(requestAttributes instanceof ServletRequestAttributes) || portalUserLookupRepository == null) {
            return null;
        }

        HttpSession session = ((ServletRequestAttributes) requestAttributes)
                .getRequest()
                .getSession(false);
        Object sessionUser = session == null ? null : session.getAttribute(AuthController.AUTH_SESSION_KEY);
        if (!(sessionUser instanceof AuthUserDto)) {
            return null;
        }

        String authenticatedUserId = ((AuthUserDto) sessionUser).getUserId();
        return portalUserLookupRepository.findUserContactDetails(authenticatedUserId).orElse(null);
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
            sql = normalizeAddressUpdates(sql);
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
        String normalizedValues = normalizeHandlingAgentInsertName(valuesPart);
        return (insertPrefix + " " + compactSqlValues(normalizedValues)).toUpperCase(Locale.ROOT);
    }

    private String normalizeHandlingAgentInsertName(String valuesPart) {
        int valuesOpen = valuesPart.indexOf('(', "VALUES".length());
        if (valuesOpen < 0) {
            return valuesPart;
        }

        int valuesClose = findClosingParenthesis(valuesPart, valuesOpen);
        int firstComma = findCommaOutsideString(valuesPart, valuesOpen + 1, valuesClose);
        if (firstComma < 0) {
            return valuesPart;
        }

        int nameStart = firstComma + 1;
        while (nameStart < valuesClose && Character.isWhitespace(valuesPart.charAt(nameStart))) {
            nameStart++;
        }
        int nameEnd = findCommaOutsideString(valuesPart, nameStart, valuesClose);
        if (nameEnd < 0) {
            nameEnd = valuesClose;
        }
        while (nameEnd > nameStart && Character.isWhitespace(valuesPart.charAt(nameEnd - 1))) {
            nameEnd--;
        }

        String expression = valuesPart.substring(nameStart, nameEnd);
        String normalizedName = normalizeCompanyNameLiteral(expression);
        if (normalizedName == null || normalizedName.equals(expression)) {
            return valuesPart;
        }
        return valuesPart.substring(0, nameStart) + normalizedName + valuesPart.substring(nameEnd);
    }

    private int findCommaOutsideString(String sql, int start, int end) {
        boolean inString = false;
        for (int i = start; i < end; i++) {
            char current = sql.charAt(i);
            if (current == '\'') {
                if (inString && i + 1 < end && sql.charAt(i + 1) == '\'') {
                    i++;
                } else {
                    inString = !inString;
                }
            } else if (current == ',' && !inString) {
                return i;
            }
        }
        return -1;
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

    private String normalizeAddressUpdates(String sql) {
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
            if (!ADDRESS_COLUMNS.contains(column)) {
                continue;
            }
            String expression = assignment.substring(equalsIndex + 1).trim();
            String normalizedLiteral = normalizeAddressLiteral(expression);
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

    private String normalizeAddressLiteral(String expression) {
        if (expression.length() < 2 || expression.charAt(0) != '\''
                || expression.charAt(expression.length() - 1) != '\'') {
            return null;
        }
        String value = expression.substring(1, expression.length() - 1).replace("''", "'");
        String normalized = value.replaceAll(",\\s+", ",").trim();
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
