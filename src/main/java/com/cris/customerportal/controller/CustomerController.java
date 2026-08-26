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
public class CustomerController { private final CustomerService service; public CustomerController(CustomerService s){service=s;}
 @PostMapping(value="/register", consumes=MediaType.MULTIPART_FORM_DATA_VALUE) public ResponseEntity<?> register(@Valid @RequestPart("customer") CustomerRegistrationRequest customer,@RequestPart("gstinFiles") java.util.List<MultipartFile> files){Long id=service.register(customer,files);return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success",true,"message","Customer registration submitted successfully","id",id));}
 @GetMapping("/master-data") public Map<String,Object> master(){return Map.of("cities",Map.of("Delhi",new String[]{"110001","110002"},"Mumbai",new String[]{"400001","400002"},"Kolkata",new String[]{"700001","700002"},"Chennai",new String[]{"600001","600002"}),"divisionZones",Map.of("Northern Railway",new String[]{"Delhi","Ambala","Firozpur","Lucknow","Moradabad"},"Eastern Railway",new String[]{"Howrah","Sealdah","Asansol","Malda"},"Western Railway",new String[]{"Mumbai Central","Vadodara","Ratlam","Ahmedabad","Rajkot","Bhavnagar"},"Southern Railway",new String[]{"Chennai","Madurai","Palakkad","Salem","Thiruvananthapuram"},"Central Railway",new String[]{"Mumbai","Bhusawal","Nagpur","Pune","Solapur"},"North Central Railway",new String[]{"Prayagraj","Jhansi","Agra"},"South Central Railway",new String[]{"Secunderabad","Hyderabad","Vijayawada","Guntakal","Nanded"},"North Eastern Railway",new String[]{"Varanasi","Lucknow","Izzatnagar"},"North Western Railway",new String[]{"Jaipur","Ajmer","Bikaner","Jodhpur"}));}
 @GetMapping("/lookup") public CustomerLookupResponse lookup(@RequestParam String code){return service.lookupByCode(code);}
 @GetMapping("/old-lookup") public com.cris.customerportal.dto.OldCustomerResponse lookupOld(@RequestParam String code){return service.lookupOldCustomerByCode(code);}
 @GetMapping("/generate-code") public Map<String,String> generateCode(@RequestParam String base){return Map.of("code",service.generateUniqueCode(base));}

 @PostMapping("/new-generate-code")
 public Map<String,String> newGenerateCode(@RequestParam String type, @RequestBody Map<String, String> payload) {
  try {
   String companyName = payload.get("companyName");
   return Map.of("code", service.generateUniqueCodeJDBC(companyName, type));
  } catch (Exception e) {
   java.io.StringWriter sw = new java.io.StringWriter();
   e.printStackTrace(new java.io.PrintWriter(sw));
   return Map.of("code", "ERR: " + e.getMessage() + " | " + sw.toString());
  }
 }

 @PostMapping(value="/new-register", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
 public ResponseEntity<?> newRegister(@RequestParam Map<String, String> formData,
                                      @RequestPart(value="gstinFiles", required=false) java.util.List<MultipartFile> gstinFiles,
                                      @RequestPart(value="panFile", required=false) MultipartFile panFile) {
  String code = service.registerNewEntryJDBC(formData);
  return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("success",true,"message","Customer registration submitted successfully","customerCode",code));
 }
}
