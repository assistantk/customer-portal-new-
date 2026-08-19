package com.cris.customerportal.entity;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "customer_gstins")
public class CustomerGstin {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String state;

    @Column(nullable = false, length = 15)
    private String gstin;

    @Column(nullable = false)
    private String gstinFileName;

    @Column(nullable = false)
    private String gstinFilePath;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void created() {
        createdAt = Instant.now();
    }

    // Getters and Setters
    public Long getId() { return id; }
    public String getState() { return state; }
    public void setState(String state) { this.state = state; }
    public String getGstin() { return gstin; }
    public void setGstin(String gstin) { this.gstin = gstin; }
    public String getGstinFileName() { return gstinFileName; }
    public void setGstinFileName(String gstinFileName) { this.gstinFileName = gstinFileName; }
    public String getGstinFilePath() { return gstinFilePath; }
    public void setGstinFilePath(String gstinFilePath) { this.gstinFilePath = gstinFilePath; }
    public Customer getCustomer() { return customer; }
    public void setCustomer(Customer customer) { this.customer = customer; }
    public Instant getCreatedAt() { return createdAt; }
}
