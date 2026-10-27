package com.cris.customerportal.controller;

import com.cris.customerportal.dto.CustomerLookupResponse;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import com.cris.customerportal.exception.ResourceAlreadyExistsException;
import com.cris.customerportal.exception.ResourceNotFoundException;
import com.cris.customerportal.service.CustomerService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.HashMap;
import java.util.Map;
@RestController @RequestMapping("/api/customers")
public class CustomerController { private final CustomerService service; public CustomerController(CustomerService s){service=s;}
 @PostMapping(value="/register", consumes=MediaType.MULTIPART_FORM_DATA_VALUE) public ResponseEntity<?> register(@Valid @RequestPart("customer") CustomerRegistrationRequest customer,@RequestPart("gstinFiles") java.util.List<MultipartFile> files){String code=service.register(customer,files);Map<String,Object> body=new HashMap<>();body.put("success",true);body.put("message","Request email sent to DBA. Database changes are pending DBA execution.");body.put("customerCode",code);return ResponseEntity.ok(body);}
 @GetMapping("/master-data") public Map<String,Object> master(){Map<String,Object> cities=new HashMap<>();cities.put("Delhi",new String[]{"110001","110002"});cities.put("Mumbai",new String[]{"400001","400002"});cities.put("Kolkata",new String[]{"700001","700002"});cities.put("Chennai",new String[]{"600001","600002"});Map<String,Object> divZones=new HashMap<>();divZones.put("Northern Railway",new String[]{"Delhi","Ambala","Firozpur","Lucknow","Moradabad"});divZones.put("Eastern Railway",new String[]{"Howrah","Sealdah","Asansol","Malda"});divZones.put("Western Railway",new String[]{"Mumbai Central","Vadodara","Ratlam","Ahmedabad","Rajkot","Bhavnagar"});divZones.put("Southern Railway",new String[]{"Chennai","Madurai","Palakkad","Salem","Thiruvananthapuram"});divZones.put("Central Railway",new String[]{"Mumbai","Bhusawal","Nagpur","Pune","Solapur"});divZones.put("North Central Railway",new String[]{"Prayagraj","Jhansi","Agra"});divZones.put("South Central Railway",new String[]{"Secunderabad","Hyderabad","Vijayawada","Guntakal","Nanded"});divZones.put("North Eastern Railway",new String[]{"Varanasi","Lucknow","Izzatnagar"});divZones.put("North Western Railway",new String[]{"Jaipur","Ajmer","Bikaner","Jodhpur"});Map<String,Object> result=new HashMap<>();result.put("cities",cities);result.put("divisionZones",divZones);return result;}
 @GetMapping("/lookup") public CustomerLookupResponse lookup(@RequestParam String code){return service.lookupByCode(code);}
 @GetMapping("/old-lookup") public com.cris.customerportal.dto.OldCustomerResponse lookupOld(@RequestParam String code){return service.lookupOldCustomerByCode(code);}
 @GetMapping("/gstin-lookup") public java.util.List<com.cris.customerportal.dto.OldCustomerResponse> lookupGstin(@RequestParam String gstin){return service.lookupOldCustomerByGstin(gstin);}
 @GetMapping("/agent-lookup") public com.cris.customerportal.dto.GlobalAgentResponse lookupAgent(@RequestParam String code){return service.lookupHandlingAgentByCode(code);}
 @GetMapping("/generate-code") public Map<String,String> generateCode(@RequestParam String base){Map<String,String> r=new HashMap<>();r.put("code",service.generateUniqueCode(base));return r;}

 @PostMapping("/new-generate-code")
 public Map<String,Object> newGenerateCode(@RequestParam String type, @RequestBody Map<String, String> payload) {
  Map<String,Object> r=new HashMap<>();r.put("code",service.generateUniqueCodeJDBC(payload.get("companyName"),type));r.put("available",true);return r;
 }

 @PostMapping(value="/new-register", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
 public ResponseEntity<?> newRegister(@RequestParam Map<String, String> formData,
                                      @RequestPart(value="gstinFiles", required=false) java.util.List<MultipartFile> gstinFiles,
                                      @RequestPart(value="panFile", required=false) MultipartFile panFile) {
  try {
   String code = service.registerNewEntryJDBC(formData);
   Map<String,Object> body=new HashMap<>();body.put("success",true);body.put("message","Request email sent to DBA. Database changes are pending DBA execution.");body.put("customerCode",code);
   return ResponseEntity.ok(body);
  } catch (IllegalArgumentException e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
   return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
  } catch (ResourceAlreadyExistsException e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
   return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
  } catch (Exception e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message","Registration failed: "+e.getMessage());
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
  }
 }

 @PostMapping("/old-update")
 public ResponseEntity<?> oldUpdate(@RequestBody Map<String, String> payload) {
  try {
   service.updateOldCustomerJDBC(payload);
   Map<String,Object> body=new HashMap<>();body.put("success",true);body.put("message","Request email sent to DBA. Database changes are pending DBA execution.");
   return ResponseEntity.ok(body);
  } catch (IllegalArgumentException e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
   return ResponseEntity.badRequest().body(body);
  } catch (ResourceNotFoundException e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
   return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
  } catch (Exception e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message","Update failed: "+e.getMessage());
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
  }
 }

 @DeleteMapping("/global-delete")
 public ResponseEntity<?> disableDirectGlobalDelete() {
  Map<String,Object> body=new HashMap<>();
  body.put("success",false);
  body.put("message","Direct deletion is disabled. Submit a Delete Request for DBA execution.");
  return ResponseEntity.status(HttpStatus.GONE).body(body);
 }

 // ===== Ownership Section 1: MEMWGONOWNRSHIP =====

 @GetMapping("/ownership-lookup")
 public ResponseEntity<?> ownershipLookup(@RequestParam String code) {
  try {
   java.util.Map<String, String> result = service.lookupOwnershipJDBC(code);
   if (result != null) {
    Map<String,Object> body=new HashMap<>();body.put("success",true);body.put("found",true);body.put("data",result);
    return ResponseEntity.ok(body);
   } else {
    Map<String,Object> body=new HashMap<>();body.put("success",true);body.put("found",false);
    return ResponseEntity.ok(body);
   }
  } catch (Exception e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
  }
 }

 @PostMapping("/ownership-save")
 public ResponseEntity<?> ownershipSave(@RequestBody Map<String, String> payload) {
  try {
   String code = payload.get("ownershipCode");
   String desc = payload.get("ownershipDesc");
   if (code == null || code.trim().isEmpty()) {
    Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message","Ownership Code is required");
    return ResponseEntity.badRequest().body(body);
   }
   service.saveOwnershipJDBC(code.trim(), desc);
   Map<String,Object> body=new HashMap<>();body.put("success",true);body.put("message","Request email sent to DBA. Database changes are pending DBA execution.");
   return ResponseEntity.ok(body);
  } catch (IllegalArgumentException e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
   return ResponseEntity.badRequest().body(body);
  } catch (Exception e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message","Could not send the request email: "+e.getMessage());
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
  }
 }

 @PostMapping("/ownership-submit")
 public ResponseEntity<?> ownershipSubmit(@RequestBody Map<String, String> payload) {
  try {
   service.submitOwnershipJDBC(
    payload.get("ownershipCode"),
    payload.get("ownershipDesc"),
    payload.get("partyCode"),
    payload.get("partyDesc"));
   Map<String,Object> body=new HashMap<>();body.put("success",true);body.put("message","Request email sent to DBA. Database changes are pending DBA execution.");
   return ResponseEntity.ok(body);
  } catch (IllegalArgumentException e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
   return ResponseEntity.badRequest().body(body);
  } catch (Exception e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message","Could not send the request email: "+e.getMessage());
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
  }
 }

 // ===== Ownership Section 2: MEMWGONOWNRPRTY =====

 @GetMapping("/ownership-party-lookup")
 public ResponseEntity<?> ownershipPartyLookup(@RequestParam String code) {
  try {
   java.util.Map<String, String> result = service.lookupOwnershipPartyJDBC(code);
   if (result != null) {
    Map<String,Object> body=new HashMap<>();body.put("success",true);body.put("found",true);body.put("data",result);
    return ResponseEntity.ok(body);
   } else {
    Map<String,Object> body=new HashMap<>();body.put("success",true);body.put("found",false);
    return ResponseEntity.ok(body);
   }
  } catch (Exception e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
  }
 }

 @PostMapping("/ownership-party-save")
 public ResponseEntity<?> ownershipPartySave(@RequestBody Map<String, String> payload) {
  try {
   String code = payload.get("partyCode");
   String desc = payload.get("partyDesc");
   if (code == null || code.trim().isEmpty()) {
    Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message","Ownership Party Code is required");
    return ResponseEntity.badRequest().body(body);
   }
   service.saveOwnershipPartyJDBC(code.trim(), desc);
   Map<String,Object> body=new HashMap<>();body.put("success",true);body.put("message","Request email sent to DBA. Database changes are pending DBA execution.");
   return ResponseEntity.ok(body);
  } catch (Exception e) {
   Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
   return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
  }
 }

  // ===== Duplicate Code Checks =====

  @GetMapping("/ownership-check")
  public ResponseEntity<?> ownershipCheck(@RequestParam String code) {
   try {
    boolean dup = service.checkOwnershipDuplicate(code);
    Map<String,Object> body=new HashMap<>();body.put("duplicate",dup);
    return ResponseEntity.ok(body);
   } catch (Exception e) {
    Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
   }
  }

  @GetMapping("/ownership-party-check")
  public ResponseEntity<?> ownershipPartyCheck(@RequestParam String code) {
   try {
    boolean dup = service.checkOwnershipPartyDuplicate(code);
    Map<String,Object> body=new HashMap<>();body.put("duplicate",dup);
    return ResponseEntity.ok(body);
   } catch (Exception e) {
    Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",e.getMessage());
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
   }
  }
}
