package com.cris.customerportal.service;
import com.cris.customerportal.dto.CustomerLookupResponse;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import com.cris.customerportal.entity.Customer;
import com.cris.customerportal.exception.ResourceAlreadyExistsException;
import com.cris.customerportal.exception.ResourceNotFoundException;
import com.cris.customerportal.repository.CustomerRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException; import java.nio.file.*; import java.util.*;
import java.util.stream.Collectors;

@Service
public class CustomerServiceImpl implements CustomerService {
 private final CustomerRepository repo; private final Path uploadPath;
 public CustomerServiceImpl(CustomerRepository repo, @Value("${app.upload-dir:uploads/gstin}") String dir) { this.repo=repo; this.uploadPath=Paths.get(dir).toAbsolutePath().normalize(); }

 public Long register(CustomerRegistrationRequest r, MultipartFile file) {
  // Use server-side unique code generation to guarantee no duplicates
  String uniqueCode = generateUniqueCode(r.customerCode());
  if(repo.existsByGstin(r.gstin())) throw new ResourceAlreadyExistsException("GSTIN already registered");
  validateFile(file); String ext = Optional.ofNullable(file.getOriginalFilename()).filter(n->n.contains(".")).map(n->n.substring(n.lastIndexOf('.')).toLowerCase()).orElse("");
  try { Files.createDirectories(uploadPath); String name=UUID.randomUUID()+ext; Path saved=uploadPath.resolve(name).normalize(); if(!saved.startsWith(uploadPath)) throw new IllegalArgumentException("Invalid file path"); Files.copy(file.getInputStream(),saved,StandardCopyOption.REPLACE_EXISTING);
    Customer c=new Customer(); c.setCompanyName(r.companyName());c.setCustomerCode(uniqueCode);c.setAddress(r.address());c.setCity(r.city());c.setPincode(r.pincode());c.setGstin(r.gstin());c.setPanNumber(r.panNumber());c.setOperatingDivision(r.operatingDivision());c.setZone(r.zone());c.setEmail(r.email());c.setMobile(r.mobile());c.setGstinFileName(name);c.setGstinFilePath(saved.toString());c.setCodeType(r.codeType()); return repo.save(c).getId();
  } catch(IOException e){throw new IllegalStateException("Could not save uploaded file");}
 }

 public CustomerLookupResponse lookupByCode(String customerCode) {
  Customer c = repo.findByCustomerCode(customerCode)
    .orElseThrow(() -> new ResourceNotFoundException("Customer Code not found. Please check the code or register as a New User."));
  return new CustomerLookupResponse(
    c.getCompanyName(), c.getCustomerCode(), c.getAddress(), c.getCity(),
    c.getPincode(), c.getGstin(), c.getPanNumber(), c.getOperatingDivision(),
    c.getZone(), c.getEmail(), c.getMobile(), c.getCodeType(), c.getGstinFileName()
  );
 }

 public String generateUniqueCode(String baseCode) {
  if(baseCode == null || baseCode.isBlank()) throw new IllegalArgumentException("Base code cannot be empty");
  String upper = baseCode.toUpperCase().trim();
  if(!repo.existsByCustomerCode(upper)) return upper;
  // Find all codes starting with this base and determine next available suffix
  List<String> existing = repo.findByCustomerCodeStartingWith(upper)
    .stream().map(Customer::getCustomerCode).collect(Collectors.toList());
  int suffix = 1;
  while(existing.contains(upper + suffix)) { suffix++; }
  return upper + suffix;
 }

 private void validateFile(MultipartFile f) { if(f==null||f.isEmpty())throw new IllegalArgumentException("GSTIN file is required"); if(f.getSize()>5*1024*1024)throw new IllegalArgumentException("File size must not exceed 5MB"); String type=Optional.ofNullable(f.getContentType()).orElse(""); if(!Set.of("application/pdf","image/jpeg","image/png").contains(type))throw new IllegalArgumentException("Only PDF, JPG and PNG files are allowed"); }
}
