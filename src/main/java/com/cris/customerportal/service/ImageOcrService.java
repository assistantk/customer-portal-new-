package com.cris.customerportal.service;

import com.cris.customerportal.dto.ImageOcrResponse;
import org.springframework.web.multipart.MultipartFile;

public interface ImageOcrService {
    ImageOcrResponse processImage(MultipartFile file);
}

