package com.cris.customerportal.service;

import com.cris.customerportal.audit.DatabaseOperationAudit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;

@Service
public class DbaEmailService {

    private final JavaMailSender mailSender;
    private final String fromEmail;
    private final String dbaEmail;

    @Autowired
    public DbaEmailService(
            JavaMailSender mailSender,
            @Value("${spring.mail.username:mondal.prasanta@cris.org.in}") String fromEmail,
            @Value("${app.dba-email:mondal.prasanta@cris.org.in}") String dbaEmail) {
        this.mailSender = mailSender;
        this.fromEmail = fromEmail;
        this.dbaEmail = dbaEmail;
    }

    public void sendDbaAuditEmail(DatabaseOperationAudit audit) {
        if (audit == null) return;
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(dbaEmail);
            List<String> ccRecipients = new ArrayList<>(List.of(
                    "sharma.ashish@cris.org.in",
                    "rajeevsiloiya@cris.org.in"));
            if (fromEmail != null && !fromEmail.isBlank()
                    && (dbaEmail == null || !fromEmail.equalsIgnoreCase(dbaEmail))
                    && ccRecipients.stream().noneMatch(fromEmail::equalsIgnoreCase)) {
                ccRecipients.add(fromEmail);
            }
            message.setCc(ccRecipients.toArray(new String[0]));
            message.setSubject("Customer Registration Portal Database Query");

            String operation = audit.getOperationType() == null
                    ? "QUERY"
                    : audit.getOperationType().toUpperCase(Locale.ROOT);
            String sql = formatStringLiterals(audit.getSqlStatement() == null ? "" : audit.getSqlStatement());
            String text = "Dear DBA Team,\n\n"
                    + "Kindly execute attached/below script on rfrn3t and training.\n\n"
                    + "SQL QUERY:\n"
                    + "----------------------------------------1 " + operation + "---------------------------\n\n"
                    + sql + "\n\n"
                    + "---\n\n"
                    + "Prasanta Mondal\n"
                    + "Chief Manager / FOIS\n"
                    + "Centre for Railway Information Systems\n"
                    + "Mob:-8130797454";

            message.setText(text);
            mailSender.send(message);
            System.out.println("[DBA EMAIL AUDIT] SMTP accepted notification to DBA and sender mailbox for " + audit.getOperationType() + " on " + audit.getTableName() + " (Code: " + audit.getCustomerCode() + ")");
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
        sendDbaSqlEmail(List.of(new SqlRequest(operation, null, null, sql)));
    }

    public void sendDbaSqlEmail(Collection<SqlRequest> requests) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(fromEmail);
        message.setTo(dbaEmail);
        message.setSubject("Customer Registration Portal Database Query");

        StringBuilder body = new StringBuilder("Dear DBA Team,\n"
                + "Kindly execute attached/below script on rfrn3t and training.\n\n");
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
            body.append("\nSQL QUERY:\n")
                    .append("----------------------------------------")
                    .append(index)
                    .append(' ')
                    .append(request.operation().toUpperCase(Locale.ROOT))
                    .append("---------------------------\n\n")
                    .append(formatSqlForEmail(request))
                    .append("\n\n----------------------------------------\n\n");
            if (index++ < requests.size()) {
                body.append('\n');
            }
        }
        body.append("Prasanta Mondal\n"
                + "Chief Manager / FOIS\n"
                + "Centre for Railway information systems\n"
                + "Mob:-8130797454");
        message.setText(body.toString());
        mailSender.send(message);
    }

    public record SqlRequest(String operation, String table, String code, String sql) {}

    private String formatSqlForEmail(SqlRequest request) {
        String sql = request.sql();
        if (!"INSERT".equalsIgnoreCase(request.operation())
                || !"MEMGLBLCUST".equalsIgnoreCase(request.table())) {
            return sql.toUpperCase(Locale.ROOT);
        }

        String insertPrefix = "INSERT INTO MEMGLBLCUST";
        if (!sql.regionMatches(true, 0, insertPrefix, 0, insertPrefix.length())) {
            throw new IllegalArgumentException("Expected an INSERT statement for MEMGLBLCUST.");
        }

        int columnListStart = insertPrefix.length();
        while (columnListStart < sql.length() && Character.isWhitespace(sql.charAt(columnListStart))) {
            columnListStart++;
        }
        if (columnListStart >= sql.length() || sql.charAt(columnListStart) != '(') {
            throw new IllegalArgumentException("Expected a column list in the MEMGLBLCUST INSERT statement.");
        }

        int columnListEnd = findClosingParenthesis(sql, columnListStart);
        int valuesStart = columnListEnd + 1;
        while (valuesStart < sql.length() && Character.isWhitespace(sql.charAt(valuesStart))) {
            valuesStart++;
        }
        if (!sql.regionMatches(true, valuesStart, "VALUES", 0, "VALUES".length())) {
            throw new IllegalArgumentException("Expected VALUES after the MEMGLBLCUST INSERT column list.");
        }

        return insertPrefix + " " + sql.substring(valuesStart).toUpperCase(Locale.ROOT);
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
        throw new IllegalArgumentException("Unclosed column list in the MEMGLBLCUST INSERT statement.");
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
