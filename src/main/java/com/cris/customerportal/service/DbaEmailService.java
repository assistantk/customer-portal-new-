package com.cris.customerportal.service;

import com.cris.customerportal.audit.DatabaseOperationAudit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class DbaEmailService {

    private final JavaMailSender mailSender;
    private final String fromEmail;
    private final String dbaEmail;

    @Autowired
    public DbaEmailService(
            JavaMailSender mailSender,
            @Value("${spring.mail.username:mondal.prasanta@cris.org.in}") String fromEmail,
            @Value("${app.dba-email:sura767848@gmail.com}") String dbaEmail) {
        this.mailSender = mailSender;
        this.fromEmail = fromEmail;
        this.dbaEmail = dbaEmail;
    }

    public void sendDbaAuditEmail(DatabaseOperationAudit audit) {
        if (audit == null) return;
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(dbaEmail, "mondal.prasanta@cris.org.in");
            message.setCc("mondal.prasanta@cris.org.in", "malhotra.poonam@cris.org.in");
            message.setSubject("Customer Registration Portal Database Query");

            String operation = audit.getOperationType() == null
                    ? "QUERY"
                    : audit.getOperationType().toUpperCase(Locale.ROOT);
            String sql = formatStringLiterals(toEmailSql(audit));
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

    public void sendDbaQueryEmail(String operation, String table, String customerCode, String sql) {
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType(operation);
        audit.setTableName(table);
        audit.setCustomerCode(customerCode);
        audit.setSqlStatement(sql);
        sendDbaAuditEmail(audit);
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
