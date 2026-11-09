package com.cris.customerportal.service;

import com.cris.customerportal.dto.ImageOcrResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

class ImageOcrServiceTest {

    private ImageOcrServiceImpl service;

    @BeforeEach
    void setUp() {
        service = new ImageOcrServiceImpl("nonexistent_tesseract_binary_xyz", "");
    }

    private byte[] createDummyImage(String format, int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, width, height);
        g.setColor(Color.BLACK);
        g.drawString("07AAAAA0000A1Z5", 20, 20);
        g.dispose();

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(image, format, baos);
        return baos.toByteArray();
    }

    @Test
    void testProcessImage_nullFile() {
        ImageOcrResponse response = service.processImage(null);
        assertNotNull(response);
        assertFalse(response.isSuccess());
        assertTrue(response.getMessage().contains("No image file provided"));
    }

    @Test
    void testProcessImage_emptyFile() {
        MockMultipartFile file = new MockMultipartFile("file", "test.png", "image/png", new byte[0]);
        ImageOcrResponse response = service.processImage(file);
        assertNotNull(response);
        assertFalse(response.isSuccess());
        assertTrue(response.getMessage().contains("No image file provided"));
    }

    @Test
    void testProcessImage_unsupportedExtension() {
        MockMultipartFile file = new MockMultipartFile("file", "document.pdf", "application/pdf", new byte[]{1, 2, 3});
        ImageOcrResponse response = service.processImage(file);
        assertNotNull(response);
        assertFalse(response.isSuccess());
        assertTrue(response.getMessage().contains("Unsupported file format"));
    }

    @Test
    void testProcessImage_unsupportedTxt() {
        MockMultipartFile file = new MockMultipartFile("file", "document.txt", "text/plain", "hello".getBytes());
        ImageOcrResponse response = service.processImage(file);
        assertNotNull(response);
        assertFalse(response.isSuccess());
        assertTrue(response.getMessage().contains("Unsupported file format"));
    }

    @Test
    void testProcessImage_corruptImageBytes() {
        MockMultipartFile file = new MockMultipartFile("file", "photo.png", "image/png", new byte[]{1, 2, 3, 4, 5});
        ImageOcrResponse response = service.processImage(file);
        assertNotNull(response);
        assertFalse(response.isSuccess());
        assertTrue(response.getMessage().contains("Unable to decode image"));
    }

    @Test
    void testPreprocessImage_validImage() throws IOException {
        byte[] bytes = createDummyImage("png", 300, 200);
        BufferedImage original = ImageIO.read(new java.io.ByteArrayInputStream(bytes));
        BufferedImage processed = service.preprocessImage(original);

        assertNotNull(processed);
        assertTrue(processed.getWidth() >= 600); // scaled up
        assertEquals(BufferedImage.TYPE_BYTE_GRAY, processed.getType());
    }

    @Test
    void testParseOcrText_extractsFullDetails() {
        String ocrText = "GOVERNMENT OF INDIA\n" +
                "Registration Certificate\n" +
                "Registration Number: 07AAAAA0000A1Z4\n" +
                "Legal Name: ACME LOGISTICS PRIVATE LIMITED\n" +
                "Trade Name: ACME FREIGHT SERVICES\n" +
                "Principal Place of Business: 123 CONNAUGHT PLACE, NEW DELHI, 110001\n" +
                "PAN Number: AAAAA0000A\n";

        ImageOcrResponse response = service.parseExtractedText(ocrText);

        assertEquals("07AAAAA0000A1Z4", response.getGstin());
        assertEquals("AAAAA0000A", response.getPan());
        assertEquals("ACME FREIGHT SERVICES", response.getTradeName());
        assertEquals("ACME LOGISTICS PRIVATE LIMITED", response.getLegalName());
        assertEquals("ACME FREIGHT SERVICES", response.getBusinessName());
        assertEquals("110001", response.getPincode());
        assertEquals("Delhi", response.getState());
        assertEquals("07", response.getStateCode());
        assertFalse(Boolean.TRUE.equals(response.getPanMismatch()));
    }

    @Test
    void testParseOcrText_detectsPanMismatch() {
        String ocrText = "GSTIN: 07AAAAA0000A1Z4\n" +
                "PAN: BBBBB9999B\n";

        ImageOcrResponse response = service.parseExtractedText(ocrText);

        assertEquals("07AAAAA0000A1Z4", response.getGstin());
        assertEquals("BBBBB9999B", response.getPan());
        assertTrue(Boolean.TRUE.equals(response.getPanMismatch()));
    }

    @Test
    void testParseOcrText_handlesCompanyNameLength() {
        String ocrText = "GSTIN: 07AAAAA0000A1Z4\n" +
                "Trade Name: A VERY LONG COMPANY NAME THAT EXCEEDS FORTY CHARACTERS IN TOTAL LENGTH\n";

        ImageOcrResponse response = service.parseExtractedText(ocrText);

        assertTrue(Boolean.TRUE.equals(response.getCompanyNameTooLong()));
    }

    @Test
    void testParseOcrText_handlesOcrConfusablesInGstin() {
        // 'O' instead of '0', 'I' instead of '1'
        String ocrText = "GSTIN: O7AAAAAOOOOAIZ4\n";

        ImageOcrResponse response = service.parseExtractedText(ocrText);

        assertEquals("07AAAAA0000A1Z4", response.getGstin());
    }

    @Test
    void testProcessImage_missingTesseractReturnsCleanDiagnostic() throws IOException {
        byte[] bytes = createDummyImage("jpg", 200, 100);
        MockMultipartFile file = new MockMultipartFile("file", "certificate.jpg", "image/jpeg", bytes);

        ImageOcrResponse response = service.processImage(file);
        assertNotNull(response);
        assertFalse(response.isSuccess());
        assertTrue(Boolean.TRUE.equals(response.getTesseractMissing()));
        assertTrue(response.getMessage().contains("Tesseract"));
    }
}
