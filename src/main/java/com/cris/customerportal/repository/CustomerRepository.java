package com.cris.customerportal.repository;
import com.cris.customerportal.entity.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface CustomerRepository extends JpaRepository<Customer, Long> {
  boolean existsByCustomerCode(String code);
  Optional<Customer> findByCustomerCode(String code);
  List<Customer> findByCustomerCodeStartingWith(String prefix);
}
