package com.cris.customerportal.service;
import com.cris.customerportal.dto.CustomerRegistrationRequest;
import org.springframework.web.multipart.MultipartFile;
public interface CustomerService { Long register(CustomerRegistrationRequest request, MultipartFile file); }
