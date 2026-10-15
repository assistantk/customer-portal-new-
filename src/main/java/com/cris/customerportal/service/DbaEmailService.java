package com.cris.customerportal.service;

import com.cris.customerportal.audit.DatabaseOperationAudit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
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
            @Value("${app.dba-email:dbafois@cris.org.in}") String dbaEmail) {
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

    public void sendDbaQueryEmail(String operation, String table, String customerCode, String sql) {
        DatabaseOperationAudit audit = new DatabaseOperationAudit();
        audit.setOperationType(operation);
        audit.setTableName(table);
        audit.setCustomerCode(customerCode);
        audit.setSqlStatement(sql);
        sendDbaAuditEmail(audit);
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
