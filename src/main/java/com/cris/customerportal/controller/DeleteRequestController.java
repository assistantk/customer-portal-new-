package com.cris.customerportal.controller;

import com.cris.customerportal.dto.DeleteRequestPayload;
import com.cris.customerportal.exception.DatabaseUnavailableException;
import com.cris.customerportal.service.DeleteRequestService;
import com.cris.customerportal.service.DeleteRequestService.VerifiedRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.MailException;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/customers/delete-requests")
public class DeleteRequestController {

    private static final Logger log = LoggerFactory.getLogger(DeleteRequestController.class);

    private final DeleteRequestService deleteRequestService;

    public DeleteRequestController(DeleteRequestService deleteRequestService) {
        this.deleteRequestService = deleteRequestService;
    }

    @PostMapping("/verify")
    public ResponseEntity<Map<String, Object>> verify(@RequestBody DeleteRequestPayload payload) {
        if (payload == null) {
            return error(HttpStatus.BAD_REQUEST, "A delete request payload is required.");
        }
        log.info("DELETE-REQUEST verify: codeType={}", payload.getCodeType());
        try {
            VerifiedRecord record = deleteRequestService.verify(payload.getCodeType(), payload.getCode());
            log.info("DELETE-REQUEST verify: codeType={} found={}", payload.getCodeType(), record != null);
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("success", true);
            response.put("found", record != null);
            if (record != null) {
                response.put("code", record.getCode());
                response.put("companyName", record.getCompanyName());
            }
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            log.warn("DELETE-REQUEST verify rejected: codeType={} reason={}", payload.getCodeType(), e.getMessage());
            return error(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (DatabaseUnavailableException e) {
            log.error("DELETE-REQUEST verify: database unavailable for codeType={}", payload.getCodeType(), e);
            return error(HttpStatus.SERVICE_UNAVAILABLE, "Unable to verify the code at this time. Please try again later.");
        } catch (IllegalStateException e) {
            log.warn("DELETE-REQUEST verify conflict: codeType={} reason={}", payload.getCodeType(), e.getMessage());
            return error(HttpStatus.CONFLICT, e.getMessage());
        }
    }

    @PostMapping("/submit")
    public ResponseEntity<Map<String, Object>> submit(@RequestBody DeleteRequestPayload payload) {
        if (payload == null) {
            return error(HttpStatus.BAD_REQUEST, "A delete request payload is required.");
        }
        log.info("DELETE-REQUEST submit: codeType={}", payload.getCodeType());
        try {
            deleteRequestService.sendRequest(
                    payload.getCodeType(), payload.getCode(), payload.getCompanyName());
            log.info("DELETE-REQUEST submit: success, DBA email queued for codeType={}", payload.getCodeType());
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("success", true);
            response.put("message", "Delete request sent successfully. The SQL has been sent to the DBA for execution.");
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            log.warn("DELETE-REQUEST submit rejected: codeType={} reason={}", payload.getCodeType(), e.getMessage());
            return error(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (DatabaseUnavailableException e) {
            log.error("DELETE-REQUEST submit: database unavailable for codeType={}", payload.getCodeType(), e);
            return error(HttpStatus.SERVICE_UNAVAILABLE, "Unable to verify the code at this time. Please try again later.");
        } catch (IllegalStateException e) {
            log.warn("DELETE-REQUEST submit conflict: codeType={} reason={}", payload.getCodeType(), e.getMessage());
            return error(HttpStatus.CONFLICT, e.getMessage());
        } catch (MailException e) {
            log.error("DELETE-REQUEST submit: mail delivery failed for codeType={}", payload.getCodeType(), e);
            return error(HttpStatus.BAD_GATEWAY, "Unable to send the delete request. Please try again later.");
        }
    }

    private ResponseEntity<Map<String, Object>> error(HttpStatus status, String message) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", false);
        response.put("message", message);
        return ResponseEntity.status(status).body(response);
    }
}
