package com.cris.customerportal.repository;
import com.cris.customerportal.entity.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
public interface CustomerRepository extends JpaRepository<Customer, Long> { boolean existsByCustomerCode(String code); boolean existsByGstin(String gstin); }
