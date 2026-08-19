package com.cris.customerportal.repository;
import com.cris.customerportal.entity.CustomerGstin;
import org.springframework.data.jpa.repository.JpaRepository;
public interface CustomerGstinRepository extends JpaRepository<CustomerGstin, Long> {
  boolean existsByGstin(String gstin);
}
