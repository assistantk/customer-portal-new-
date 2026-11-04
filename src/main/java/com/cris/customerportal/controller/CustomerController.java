package com.cris.customerportal.controller;

import com.cris.customerportal.config.DataMaskingUtil;
import com.cris.customerportal.dto.CustomerLookupResponse;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import com.cris.customerportal.exception.ResourceAlreadyExistsException;
import com.cris.customerportal.exception.ResourceNotFoundException;
import com.cris.customerportal.service.CustomerService;
import javax.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

@RestController
@RequestMapping("/api/customers")
public class CustomerController {
    private static final Logger LOGGER = LoggerFactory.getLogger(CustomerController.class);
    private final CustomerService service;

    public CustomerController(CustomerService s) {
        this.service = s;
    }

    private String sanitizeErrorMessage(String prefix, Exception e, String fallback) {
        LOGGER.error(prefix + ": {} stackTrace={}",
                DataMaskingUtil.maskSensitive(e.getMessage()), DataMaskingUtil.formatThrowable(e));
        String msg = e.getMessage();
        if (msg == null || msg.trim().isEmpty()) {
            return fallback;
        }
        String upper = msg.toUpperCase(Locale.ROOT);
        if (upper.contains("MEMGLBL") || upper.contains("MEMWGON") || upper.contains("ORA-")
                || upper.contains("SQLSTATE") || upper.contains("SQL SYNTAX") || upper.contains("EXCEPTION")
                || msg.length() > 200) {
            return fallback;
        }
        return prefix.isEmpty() ? msg : prefix + msg;
    }

    @PostMapping(value = "/register", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> register(@Valid @RequestPart("customer") CustomerRegistrationRequest customer,
            @RequestPart("gstinFiles") java.util.List<MultipartFile> files) {
        LOGGER.info("Customer register request: codeType={} code={} filesCount={}",
                customer.codeType(), customer.customerCode(), (files != null ? files.size() : 0));
        String code = service.register(customer, files);
        LOGGER.info("Customer register succeeded: customerCode={}", code);
        Map<String, Object> body = new HashMap<>();
        body.put("success", true);
        body.put("message", "Request email sent to DBA. Database changes are pending DBA execution.");
        body.put("customerCode", code);
        return ResponseEntity.ok(body);
    }

    @GetMapping("/master-data")
    public Map<String, Object> master() {
        LOGGER.debug("Master data requested");
        Map<String, Object> cities = new HashMap<>();
        cities.put("Delhi", new String[] { "110001", "110002" });
        cities.put("Mumbai", new String[] { "400001", "400002" });
        cities.put("Kolkata", new String[] { "700001", "700002" });
        cities.put("Chennai", new String[] { "600001", "600002" });
        Map<String, Object> divZones = new HashMap<>();
        divZones.put("Northern Railway", new String[] { "Delhi", "Ambala", "Firozpur", "Lucknow", "Moradabad" });
        divZones.put("Eastern Railway", new String[] { "Howrah", "Sealdah", "Asansol", "Malda" });
        divZones.put("Western Railway", new String[] { "Mumbai Central", "Vadodara", "Ratlam", "Ahmedabad", "Rajkot", "Bhavnagar" });
        divZones.put("Southern Railway", new String[] { "Chennai", "Madurai", "Palakkad", "Salem", "Thiruvananthapuram" });
        divZones.put("Central Railway", new String[] { "Mumbai", "Bhusawal", "Nagpur", "Pune", "Solapur" });
        divZones.put("North Central Railway", new String[] { "Prayagraj", "Jhansi", "Agra" });
        divZones.put("South Central Railway", new String[] { "Secunderabad", "Hyderabad", "Vijayawada", "Guntakal", "Nanded" });
        divZones.put("North Eastern Railway", new String[] { "Varanasi", "Lucknow", "Izzatnagar" });
        divZones.put("North Western Railway", new String[] { "Jaipur", "Ajmer", "Bikaner", "Jodhpur" });
        Map<String, Object> result = new HashMap<>();
        result.put("cities", cities);
        result.put("divisionZones", divZones);
        return result;
    }

    @GetMapping("/lookup")
    public CustomerLookupResponse lookup(@RequestParam String code) {
        LOGGER.info("Customer lookup request: code={}", code);
        CustomerLookupResponse resp = service.lookupByCode(code);
        LOGGER.info("Customer lookup succeeded for code={}", code);
        return resp;
    }

    @GetMapping("/old-lookup")
    public com.cris.customerportal.dto.OldCustomerResponse lookupOld(@RequestParam String code) {
        LOGGER.info("Old customer lookup request: code={}", code);
        com.cris.customerportal.dto.OldCustomerResponse resp = service.lookupOldCustomerByCode(code);
        LOGGER.info("Old customer lookup succeeded for code={}", code);
        return resp;
    }

    @GetMapping("/gstin-lookup")
    public java.util.List<com.cris.customerportal.dto.OldCustomerResponse> lookupGstin(@RequestParam String gstin) {
        LOGGER.info("GSTIN lookup request: gstin={}", DataMaskingUtil.maskSensitive(gstin));
        java.util.List<com.cris.customerportal.dto.OldCustomerResponse> list = service.lookupOldCustomerByGstin(gstin);
        LOGGER.info("GSTIN lookup returned {} matches", (list != null ? list.size() : 0));
        return list;
    }

    @GetMapping("/agent-lookup")
    public com.cris.customerportal.dto.GlobalAgentResponse lookupAgent(@RequestParam String code) {
        LOGGER.info("Handling agent lookup request: code={}", code);
        com.cris.customerportal.dto.GlobalAgentResponse resp = service.lookupHandlingAgentByCode(code);
        LOGGER.info("Handling agent lookup succeeded for code={}", code);
        return resp;
    }

    @GetMapping("/generate-code")
    public Map<String, String> generateCode(@RequestParam String base) {
        LOGGER.info("Generate code request: base={}", base);
        Map<String, String> r = new HashMap<>();
        String generated = service.generateUniqueCode(base);
        r.put("code", generated);
        LOGGER.info("Generated code: {}", generated);
        return r;
    }

    @PostMapping("/new-generate-code")
    public ResponseEntity<?> newGenerateCode(@RequestParam String type, @RequestBody Map<String, String> payload) {
        LOGGER.info("New generate code request: type={}", type);
        try {
            Map<String, Object> r = new HashMap<>();
            String code = service.generateUniqueCodeJDBC(payload.get("companyName"), type);
            r.put("code", code);
            r.put("available", true);
            LOGGER.info("New generate code succeeded: code={}", code);
            return ResponseEntity.ok(r);
        } catch (IllegalArgumentException e) {
            LOGGER.warn("New generate code rejected: {}", DataMaskingUtil.maskSensitive(e.getMessage()));
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(body);
        }
    }

    @PostMapping(value = "/new-register", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> newRegister(@RequestParam Map<String, String> formData,
            @RequestPart(value = "gstinFiles", required = false) java.util.List<MultipartFile> gstinFiles,
            @RequestPart(value = "panFile", required = false) MultipartFile panFile) {
        String codeType = formData.get("codeType");
        LOGGER.info("New register request received: codeType={}", codeType);
        try {
            String code = service.registerNewEntryJDBC(formData);
            LOGGER.info("New register succeeded: customerCode={}", code);
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Request email sent to DBA. Database changes are pending DBA execution.");
            body.put("customerCode", code);
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            LOGGER.warn("New register validation failed: {}", DataMaskingUtil.maskSensitive(e.getMessage()));
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
        } catch (ResourceAlreadyExistsException e) {
            LOGGER.warn("New register conflict: {}", DataMaskingUtil.maskSensitive(e.getMessage()));
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
        } catch (Exception e) {
            String safeMsg = sanitizeErrorMessage("Registration failed: ", e,
                    "Registration failed. Please check your details and try again.");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", safeMsg);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @PostMapping("/old-update")
    public ResponseEntity<?> oldUpdate(@RequestBody Map<String, String> payload) {
        String customerCode = payload.get("customerCode");
        LOGGER.info("Old customer update request: code={}", customerCode);
        try {
            service.updateOldCustomerJDBC(payload);
            LOGGER.info("Old customer update succeeded: code={}", customerCode);
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Request email sent to DBA. Database changes are pending DBA execution.");
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            LOGGER.warn("Old customer update validation failed for code={}: {}",
                    customerCode, DataMaskingUtil.maskSensitive(e.getMessage()));
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(body);
        } catch (ResourceNotFoundException e) {
            LOGGER.warn("Old customer update not found for code={}: {}",
                    customerCode, DataMaskingUtil.maskSensitive(e.getMessage()));
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
        } catch (Exception e) {
            String safeMsg = sanitizeErrorMessage("Update failed: ", e,
                    "Update failed. Please check your details and try again.");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", safeMsg);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @DeleteMapping("/global-delete")
    public ResponseEntity<?> disableDirectGlobalDelete() {
        LOGGER.info("Direct global-delete endpoint accessed (disabled)");
        Map<String, Object> body = new HashMap<>();
        body.put("success", false);
        body.put("message", "Direct deletion is disabled. Submit a Delete Request for DBA execution.");
        return ResponseEntity.status(HttpStatus.GONE).body(body);
    }

    // ===== Ownership Section 1: Ownership Code =====

    @GetMapping("/ownership-lookup")
    public ResponseEntity<?> ownershipLookup(@RequestParam String code) {
        LOGGER.info("Ownership lookup request: code={}", code);
        try {
            java.util.Map<String, String> result = service.lookupOwnershipJDBC(code);
            Map<String, Object> body = new HashMap<>();
            if (result != null) {
                LOGGER.info("Ownership lookup succeeded for code={}", code);
                body.put("success", true);
                body.put("found", true);
                body.put("data", result);
            } else {
                LOGGER.info("Ownership lookup returned not found for code={}", code);
                body.put("success", true);
                body.put("found", false);
            }
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            String safeMsg = sanitizeErrorMessage("", e, "Unable to verify ownership code. Please try again later.");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", safeMsg);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @PostMapping("/ownership-save")
    public ResponseEntity<?> ownershipSave(@RequestBody Map<String, String> payload) {
        String code = payload.get("ownershipCode");
        String desc = payload.get("ownershipDesc");
        LOGGER.info("Ownership save request: code={}", code);
        try {
            if (code == null || code.trim().isEmpty()) {
                LOGGER.warn("Ownership save rejected: code is required");
                Map<String, Object> body = new HashMap<>();
                body.put("success", false);
                body.put("message", "Ownership Code is required");
                return ResponseEntity.badRequest().body(body);
            }
            service.saveOwnershipJDBC(code.trim(), desc);
            LOGGER.info("Ownership save succeeded: code={}", code);
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Request email sent to DBA. Database changes are pending DBA execution.");
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            LOGGER.warn("Ownership save validation failed for code={}: {}",
                    code, DataMaskingUtil.maskSensitive(e.getMessage()));
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(body);
        } catch (Exception e) {
            String safeMsg = sanitizeErrorMessage("Could not send the request email: ", e,
                    "Could not send the request email. Please try again later.");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", safeMsg);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @PostMapping("/ownership-submit")
    public ResponseEntity<?> ownershipSubmit(@RequestBody Map<String, String> payload) {
        String ownershipCode = payload.get("ownershipCode");
        String partyCode = payload.get("partyCode");
        LOGGER.info("Ownership submit request: ownershipCode={} partyCode={}", ownershipCode, partyCode);
        try {
            service.submitOwnershipJDBC(
                    ownershipCode,
                    payload.get("ownershipDesc"),
                    partyCode,
                    payload.get("partyDesc"));
            LOGGER.info("Ownership submit succeeded: ownershipCode={} partyCode={}", ownershipCode, partyCode);
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Request email sent to DBA. Database changes are pending DBA execution.");
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            LOGGER.warn("Ownership submit validation failed: {}", DataMaskingUtil.maskSensitive(e.getMessage()));
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(body);
        } catch (Exception e) {
            String safeMsg = sanitizeErrorMessage("Could not send the request email: ", e,
                    "Could not send the request email. Please try again later.");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", safeMsg);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    // ===== Ownership Section 2: Ownership Party Code =====

    @GetMapping("/ownership-party-lookup")
    public ResponseEntity<?> ownershipPartyLookup(@RequestParam String code) {
        LOGGER.info("Ownership party lookup request: code={}", code);
        try {
            java.util.Map<String, String> result = service.lookupOwnershipPartyJDBC(code);
            Map<String, Object> body = new HashMap<>();
            if (result != null) {
                LOGGER.info("Ownership party lookup succeeded for code={}", code);
                body.put("success", true);
                body.put("found", true);
                body.put("data", result);
            } else {
                LOGGER.info("Ownership party lookup returned not found for code={}", code);
                body.put("success", true);
                body.put("found", false);
            }
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            String safeMsg = sanitizeErrorMessage("", e, "Unable to verify ownership party code. Please try again later.");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", safeMsg);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @PostMapping("/ownership-party-save")
    public ResponseEntity<?> ownershipPartySave(@RequestBody Map<String, String> payload) {
        String code = payload.get("partyCode");
        String desc = payload.get("partyDesc");
        LOGGER.info("Ownership party save request: code={}", code);
        try {
            if (code == null || code.trim().isEmpty()) {
                LOGGER.warn("Ownership party save rejected: code is required");
                Map<String, Object> body = new HashMap<>();
                body.put("success", false);
                body.put("message", "Ownership Party Code is required");
                return ResponseEntity.badRequest().body(body);
            }
            service.saveOwnershipPartyJDBC(code.trim(), desc);
            LOGGER.info("Ownership party save succeeded: code={}", code);
            Map<String, Object> body = new HashMap<>();
            body.put("success", true);
            body.put("message", "Request email sent to DBA. Database changes are pending DBA execution.");
            return ResponseEntity.ok(body);
        } catch (IllegalArgumentException e) {
            LOGGER.warn("Ownership party save validation failed for code={}: {}",
                    code, DataMaskingUtil.maskSensitive(e.getMessage()));
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", e.getMessage());
            return ResponseEntity.badRequest().body(body);
        } catch (Exception e) {
            String safeMsg = sanitizeErrorMessage("", e, "Could not submit the ownership party request. Please try again later.");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", safeMsg);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    // ===== Duplicate Code Checks =====

    @GetMapping("/ownership-check")
    public ResponseEntity<?> ownershipCheck(@RequestParam String code) {
        LOGGER.info("Ownership duplicate check request: code={}", code);
        try {
            boolean dup = service.checkOwnershipDuplicate(code);
            LOGGER.info("Ownership duplicate check result: code={} duplicate={}", code, dup);
            Map<String, Object> body = new HashMap<>();
            body.put("duplicate", dup);
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            String safeMsg = sanitizeErrorMessage("", e, "Unable to verify duplicate status. Please try again later.");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", safeMsg);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }

    @GetMapping("/ownership-party-check")
    public ResponseEntity<?> ownershipPartyCheck(@RequestParam String code) {
        LOGGER.info("Ownership party duplicate check request: code={}", code);
        try {
            boolean dup = service.checkOwnershipPartyDuplicate(code);
            LOGGER.info("Ownership party duplicate check result: code={} duplicate={}", code, dup);
            Map<String, Object> body = new HashMap<>();
            body.put("duplicate", dup);
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            String safeMsg = sanitizeErrorMessage("", e, "Unable to verify duplicate status. Please try again later.");
            Map<String, Object> body = new HashMap<>();
            body.put("success", false);
            body.put("message", safeMsg);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
        }
    }
}
