package com.cris.customerportal.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity @Table(name = "customers", uniqueConstraints = {@UniqueConstraint(columnNames = "customerCode"), @UniqueConstraint(columnNames = "gstin")})
public class Customer {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
  @Column(nullable=false) private String companyName;
  @Column(nullable=false) private String customerCode;
  @Column(nullable=false, length=1000) private String address;
  @Column(nullable=false) private String city;
  @Column(nullable=false, length=6) private String pincode;
  @Column(nullable=false, length=15) private String gstin;
  @Column(nullable=false, length=10) private String panNumber;
  @Column(nullable=false) private String operatingDivision;
  @Column(nullable=false) private String zone;
  @Column(nullable=false) private String email;
  @Column(nullable=false, length=10) private String mobile;
  @Column(nullable=false) private String gstinFileName;
  @Column(nullable=false) private String gstinFilePath;
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
  public String getGstin(){return gstin;}
  public String getPanNumber(){return panNumber;}
  public String getOperatingDivision(){return operatingDivision;}
  public String getZone(){return zone;}
  public String getEmail(){return email;}
  public String getMobile(){return mobile;}
  public String getGstinFileName(){return gstinFileName;}
  public String getGstinFilePath(){return gstinFilePath;}
  public String getCodeType(){return codeType;}
  public Instant getCreatedAt(){return createdAt;}

  // Setters
  public void setCompanyName(String v){companyName=v;} public void setCustomerCode(String v){customerCode=v;} public void setAddress(String v){address=v;} public void setCity(String v){city=v;} public void setPincode(String v){pincode=v;} public void setGstin(String v){gstin=v;} public void setPanNumber(String v){panNumber=v;} public void setOperatingDivision(String v){operatingDivision=v;} public void setZone(String v){zone=v;} public void setEmail(String v){email=v;} public void setMobile(String v){mobile=v;} public void setGstinFileName(String v){gstinFileName=v;} public void setGstinFilePath(String v){gstinFilePath=v;} public void setCodeType(String v){codeType=v;}
}
