package com.cris.customerportal.repository;

import com.cris.customerportal.service.AemUserLookupResult;

import java.util.Optional;

public interface AemUserLookupRepository {
    Optional<AemUserLookupResult> findByIdentifier(String identifier);
}
