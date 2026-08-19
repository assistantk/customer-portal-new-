package com.cris.customerportal.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity @Table(name = "customers", uniqueConstraints = {@UniqueConstraint(columnNames = "customerCode")})
public class Customer {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
  @Column(nullable=false) private String companyName;
  @Column(nullable=false) private String customerCode;
  @Column(nullable=false, length=1000) private String address;
  @Column(nullable=false) private String city;
  @Column(nullable=false, length=6) private String pincode;
  @Column(nullable=false, length=10) private String panNumber;
  @Column(nullable=false) private String operatingDivision;
  @Column(nullable=false) private String zone;
  @Column(nullable=false) private String email;
  @Column(nullable=false, length=10) private String mobile;
  @OneToMany(mappedBy = "customer", cascade = CascadeType.ALL, orphanRemoval = true)
  private java.util.List<CustomerGstin> gstins = new java.util.ArrayList<>();
  @Column(nullable=false) private String codeType;
  @Column(nullable=false, updatable=false) private Instant createdAt;
  @PrePersist void created() { createdAt = Instant.now(); }

  // Getters
  public Long getId(){return id;}
  public String getCompanyName(){return companyName;}
  public String getCustomerCode(){return customerCode;}
  public String getAddress(){return address;}
  public String getCity(){return city;}
  public String getPincode(){return pincode;}
  public String getPanNumber(){return panNumber;}
  public String getOperatingDivision(){return operatingDivision;}
  public String getZone(){return zone;}
  public String getEmail(){return email;}
  public String getMobile(){return mobile;}
  public String getCodeType(){return codeType;}
  public Instant getCreatedAt(){return createdAt;}
  public java.util.List<CustomerGstin> getGstins(){return gstins;}

  // Setters
  public void setCompanyName(String v){companyName=v;} public void setCustomerCode(String v){customerCode=v;} public void setAddress(String v){address=v;} public void setCity(String v){city=v;} public void setPincode(String v){pincode=v;} public void setPanNumber(String v){panNumber=v;} public void setOperatingDivision(String v){operatingDivision=v;} public void setZone(String v){zone=v;} public void setEmail(String v){email=v;} public void setMobile(String v){mobile=v;} public void setCodeType(String v){codeType=v;} public void setGstins(java.util.List<CustomerGstin> v){gstins=v;}
}
