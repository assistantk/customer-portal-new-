package com.cris.customerportal.service;

import com.cris.customerportal.audit.DatabaseOperationAudit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
            @Value("${spring.mail.username:shurak949@gmail.com}") String fromEmail,
            @Value("${app.dba-email:shurak949@gmail.com}") String dbaEmail) {
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
            sb.append("SQL Executed:\n").append(audit.getSqlStatement()).append("\n\n");

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
            System.out.println("[DBA EMAIL AUDIT] Sent DBA notification for " + audit.getOperationType() + " on " + audit.getTableName() + " (Code: " + audit.getCustomerCode() + ")");
        } catch (Exception e) {
            System.err.println("[DBA EMAIL AUDIT ERROR] Failed to send DBA notification email: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
