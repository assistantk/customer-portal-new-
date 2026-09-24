package com.cris.customerportal.controller;

import com.cris.customerportal.dto.CustomerLookupResponse;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import com.cris.customerportal.service.CustomerService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.Map;
import org.springframework.http.*; import org.springframework.web.bind.annotation.*; import org.springframework.web.multipart.MultipartFile;
import java.util.Map;
@RestController @RequestMapping("/api/customers")
@CrossOrigin("*")
public class CustomerController { private final CustomerService service; public CustomerController(CustomerService s){service=s;}
 @PostMapping(value="/register", consumes=MediaType.MULTIPART_FORM_DATA_VALUE) public ResponseEntity<?> register(@Valid @RequestPart("customer") CustomerRegistrationRequest customer,@RequestPart("gstinFiles") java.util.List<MultipartFile> files){Long id=service.register(customer,files);return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success",true,"message","Customer registration submitted successfully","id",id));}
 @GetMapping("/master-data") public Map<String,Object> master(){return Map.of("cities",Map.of("Delhi",new String[]{"110001","110002"},"Mumbai",new String[]{"400001","400002"},"Kolkata",new String[]{"700001","700002"},"Chennai",new String[]{"600001","600002"}),"divisionZones",Map.of("Northern Railway",new String[]{"Delhi","Ambala","Firozpur","Lucknow","Moradabad"},"Eastern Railway",new String[]{"Howrah","Sealdah","Asansol","Malda"},"Western Railway",new String[]{"Mumbai Central","Vadodara","Ratlam","Ahmedabad","Rajkot","Bhavnagar"},"Southern Railway",new String[]{"Chennai","Madurai","Palakkad","Salem","Thiruvananthapuram"},"Central Railway",new String[]{"Mumbai","Bhusawal","Nagpur","Pune","Solapur"},"North Central Railway",new String[]{"Prayagraj","Jhansi","Agra"},"South Central Railway",new String[]{"Secunderabad","Hyderabad","Vijayawada","Guntakal","Nanded"},"North Eastern Railway",new String[]{"Varanasi","Lucknow","Izzatnagar"},"North Western Railway",new String[]{"Jaipur","Ajmer","Bikaner","Jodhpur"}));}
 @GetMapping("/lookup") public CustomerLookupResponse lookup(@RequestParam String code){return service.lookupByCode(code);}
 @GetMapping("/old-lookup") public com.cris.customerportal.dto.OldCustomerResponse lookupOld(@RequestParam String code){return service.lookupOldCustomerByCode(code);}
 @GetMapping("/gstin-lookup") public java.util.List<com.cris.customerportal.dto.OldCustomerResponse> lookupGstin(@RequestParam String gstin){return service.lookupOldCustomerByGstin(gstin);}
 @GetMapping("/agent-lookup") public com.cris.customerportal.dto.GlobalAgentResponse lookupAgent(@RequestParam String code){return service.lookupHandlingAgentByCode(code);}
 @GetMapping("/generate-code") public Map<String,String> generateCode(@RequestParam String base){return Map.of("code",service.generateUniqueCode(base));}

 @PostMapping("/new-generate-code")
 public Map<String,Object> newGenerateCode(@RequestParam String type, @RequestBody Map<String, String> payload) {
  return Map.of("code", service.generateUniqueCodeJDBC(payload.get("companyName"), type), "available", true);
 }

 @PostMapping(value="/new-register", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
 public ResponseEntity<?> newRegister(@RequestParam Map<String, String> formData,
                                      @RequestPart(value="gstinFiles", required=false) java.util.List<MultipartFile> gstinFiles,
                                      @RequestPart(value="panFile", required=false) MultipartFile panFile) {
  String code = service.registerNewEntryJDBC(formData);
  return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success",true,"message","Customer registration submitted successfully","customerCode",code));
 }

 @PostMapping("/old-update")
 public ResponseEntity<?> oldUpdate(@RequestBody Map<String, String> payload) {
  try {
   service.updateOldCustomerJDBC(payload);
   return ResponseEntity.ok(Map.of("success", true, "message", "Customer updated successfully"));
  } catch (Exception e) {
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("success", false, "message", "Update failed: " + e.getMessage()));
  }
 }

 // ===== Ownership Section 1: MEMWGONOWNRSHIP =====

 @GetMapping("/ownership-lookup")
 public ResponseEntity<?> ownershipLookup(@RequestParam String code) {
  try {
   java.util.Map<String, String> result = service.lookupOwnershipJDBC(code);
   if (result != null) {
    return ResponseEntity.ok(Map.of("success", true, "found", true, "data", result));
   } else {
    return ResponseEntity.ok(Map.of("success", true, "found", false));
   }
  } catch (Exception e) {
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
    .body(Map.of("success", false, "message", e.getMessage()));
  }
 }

 @PostMapping("/ownership-save")
 public ResponseEntity<?> ownershipSave(@RequestBody Map<String, String> payload) {
  try {
   String code = payload.get("ownershipCode");
   String desc = payload.get("ownershipDesc");
   if (code == null || code.trim().isEmpty()) {
    return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Ownership Code is required"));
   }
   service.saveOwnershipJDBC(code.trim(), desc);
   return ResponseEntity.ok(Map.of("success", true, "message", "Ownership record saved successfully"));
  } catch (Exception e) {
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
    .body(Map.of("success", false, "message", e.getMessage()));
  }
 }

 // ===== Ownership Section 2: MEMWGONOWNRPRTY =====

 @GetMapping("/ownership-party-lookup")
 public ResponseEntity<?> ownershipPartyLookup(@RequestParam String code) {
  try {
   java.util.Map<String, String> result = service.lookupOwnershipPartyJDBC(code);
   if (result != null) {
    return ResponseEntity.ok(Map.of("success", true, "found", true, "data", result));
   } else {
    return ResponseEntity.ok(Map.of("success", true, "found", false));
   }
  } catch (Exception e) {
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
    .body(Map.of("success", false, "message", e.getMessage()));
  }
 }

 @PostMapping("/ownership-party-save")
 public ResponseEntity<?> ownershipPartySave(@RequestBody Map<String, String> payload) {
  try {
   String code = payload.get("partyCode");
   String desc = payload.get("partyDesc");
   if (code == null || code.trim().isEmpty()) {
    return ResponseEntity.badRequest().body(Map.of("success", false, "message", "Ownership Party Code is required"));
   }
   service.saveOwnershipPartyJDBC(code.trim(), desc);
   return ResponseEntity.ok(Map.of("success", true, "message", "Ownership Party record saved successfully"));
  } catch (Exception e) {
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
    .body(Map.of("success", false, "message", e.getMessage()));
  }
 }
}

