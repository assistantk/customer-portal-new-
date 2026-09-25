package com.cris.customerportal.service;

import com.cris.customerportal.audit.DatabaseOperationAudit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

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
            message.setTo(dbaEmail);
            message.setSubject("Customer Registration Portal – Database Operation Executed (" + audit.getOperationType() + " - " + audit.getCustomerCode() + ")");

            StringBuilder sb = new StringBuilder();
            sb.append("Dear DBA Team,\n\n");
            sb.append("This is an automated notification from the Customer Registration Portal.\n\n");
            sb.append("Database Operation Details\n");
            sb.append("--------------------------------\n\n");
            sb.append("Operation:\n").append(audit.getOperationType()).append("\n\n");
            sb.append("Page:\n").append(audit.getPageName()).append("\n\n");
            sb.append("Table:\n").append(audit.getTableName()).append("\n\n");
            sb.append("Customer Code:\n").append(audit.getCustomerCode() != null ? audit.getCustomerCode() : "").append("\n\n");
            sb.append("Company Name:\n").append(audit.getCompanyName() != null ? audit.getCompanyName() : "").append("\n\n");
            sb.append("Execution Date/Time:\n").append(audit.getFormattedExecutionTime()).append("\n\n");
            sb.append("Rows Affected:\n").append(audit.getRowsAffected()).append("\n\n");
            sb.append("Status:\n").append(audit.getStatus()).append("\n\n");
            String sqlStatement = audit.getSqlStatement();
            if ("INSERT".equalsIgnoreCase(audit.getOperationType()) && sqlStatement != null) {
                sqlStatement = sqlStatement.replaceAll("\\R+", " ").trim();
            }
            sb.append("SQL Executed:\n").append(sqlStatement).append("\n\n");

            sb.append("Parameters:\n");
            if (audit.getParameters() != null && !audit.getParameters().isEmpty()) {
                for (DatabaseOperationAudit.ParameterEntry p : audit.getParameters()) {
                    sb.append(p.getIndex()).append(". ").append(p.getName()).append(" = ").append(p.getFormattedValue()).append("\n");
                }
            } else {
                sb.append("None\n");
            }
            sb.append("\n--------------------------------\n\n");

            if ("SUCCESS".equalsIgnoreCase(audit.getStatus())) {
                sb.append("This notification confirms that the above database operation was successfully executed by the Customer Registration Portal.\n\n");
            } else {
                sb.append("ATTENTION: The above database operation FAILED during execution.\n");
                if (audit.getErrorMessage() != null) {
                    sb.append("Error details: ").append(audit.getErrorMessage()).append("\n\n");
                }
            }

            sb.append("Regards,\nCustomer Registration Portal\nIT Team");

            message.setText(sb.toString());
            mailSender.send(message);
            System.out.println("[DBA EMAIL AUDIT] SMTP accepted notification to " + dbaEmail + " for " + audit.getOperationType() + " on " + audit.getTableName() + " (Code: " + audit.getCustomerCode() + ")");
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
}
