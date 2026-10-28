package com.cris.customerportal.service;

/**
 * Service for calculating password hashes using the Oracle-side DBA formula:
 * LTRIM(TO_CHAR(DBMS_UTILITY.GET_HASH_VALUE(UPPER(username) || '/' || UPPER(password), 1000000000, POWER(2, 30)), RPAD('X', 29, 'X') || 'X'))
 */
public interface OraclePasswordHashService {
    String calculatePasswordHash(String username, String password);
}
