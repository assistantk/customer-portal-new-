package com.cris.customerportal.service;

import com.cris.customerportal.dto.ImageOcrResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ImageOcrServiceImpl implements ImageOcrService {
    private static final Logger LOGGER = LoggerFactory.getLogger(ImageOcrServiceImpl.class);

    private static final Pattern GSTIN_PATTERN = Pattern.compile("\\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\\b");
    private static final Pattern PAN_PATTERN = Pattern.compile("\\b([A-Z]{5}[0-9]{4}[A-Z])\\b");
    private static final Pattern PINCODE_PATTERN = Pattern.compile("\\b([1-9][0-9]{5})\\b");

    private static final String GSTIN_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    private static final Map<Character, Character> LETTER_TO_DIGIT = new HashMap<>();
    private static final Map<Character, Character> DIGIT_TO_LETTER = new HashMap<>();
    static {
        LETTER_TO_DIGIT.put('O', '0');
        LETTER_TO_DIGIT.put('D', '0');
        LETTER_TO_DIGIT.put('Q', '0');
        LETTER_TO_DIGIT.put('I', '1');
        LETTER_TO_DIGIT.put('L', '1');
        LETTER_TO_DIGIT.put('Z', '2');
        LETTER_TO_DIGIT.put('S', '5');
        LETTER_TO_DIGIT.put('G', '6');
        LETTER_TO_DIGIT.put('B', '8');

        DIGIT_TO_LETTER.put('0', 'O');
        DIGIT_TO_LETTER.put('1', 'I');
        DIGIT_TO_LETTER.put('2', 'Z');
        DIGIT_TO_LETTER.put('5', 'S');
        DIGIT_TO_LETTER.put('6', 'G');
        DIGIT_TO_LETTER.put('8', 'B');
    }

    private static final Map<String, String> STATE_CODE_MAP = new HashMap<>();
    static {
        STATE_CODE_MAP.put("01", "Jammu and Kashmir");
        STATE_CODE_MAP.put("02", "Himachal Pradesh");
        STATE_CODE_MAP.put("03", "Punjab");
        STATE_CODE_MAP.put("04", "Chandigarh");
        STATE_CODE_MAP.put("05", "Uttarakhand");
        STATE_CODE_MAP.put("06", "Haryana");
        STATE_CODE_MAP.put("07", "Delhi");
        STATE_CODE_MAP.put("08", "Rajasthan");
        STATE_CODE_MAP.put("09", "Uttar Pradesh");
        STATE_CODE_MAP.put("10", "Bihar");
        STATE_CODE_MAP.put("11", "Sikkim");
        STATE_CODE_MAP.put("12", "Arunachal Pradesh");
        STATE_CODE_MAP.put("13", "Nagaland");
        STATE_CODE_MAP.put("14", "Manipur");
        STATE_CODE_MAP.put("15", "Mizoram");
        STATE_CODE_MAP.put("16", "Tripura");
        STATE_CODE_MAP.put("17", "Meghalaya");
        STATE_CODE_MAP.put("18", "Assam");
        STATE_CODE_MAP.put("19", "West Bengal");
        STATE_CODE_MAP.put("20", "Jharkhand");
        STATE_CODE_MAP.put("21", "Odisha");
        STATE_CODE_MAP.put("22", "Chhattisgarh");
        STATE_CODE_MAP.put("23", "Madhya Pradesh");
        STATE_CODE_MAP.put("24", "Gujarat");
        STATE_CODE_MAP.put("25", "Dadra and Nagar Haveli and Daman and Diu");
        STATE_CODE_MAP.put("26", "Dadra and Nagar Haveli and Daman and Diu");
        STATE_CODE_MAP.put("27", "Maharashtra");
        STATE_CODE_MAP.put("28", "Andhra Pradesh");
        STATE_CODE_MAP.put("29", "Karnataka");
        STATE_CODE_MAP.put("30", "Goa");
        STATE_CODE_MAP.put("31", "Lakshadweep");
        STATE_CODE_MAP.put("32", "Kerala");
        STATE_CODE_MAP.put("33", "Tamil Nadu");
        STATE_CODE_MAP.put("34", "Puducherry");
        STATE_CODE_MAP.put("35", "Andaman and Nicobar Islands");
        STATE_CODE_MAP.put("36", "Telangana");
        STATE_CODE_MAP.put("37", "Andhra Pradesh");
        STATE_CODE_MAP.put("38", "Ladakh");
    }

    private final String tesseractPath;
    private final String tessdataPath;

    public ImageOcrServiceImpl(
            @Value("${tesseract.executable-path:tesseract}") String tesseractPath,
            @Value("${tesseract.tessdata-path:}") String tessdataPath) {
        this.tesseractPath = (tesseractPath != null && !tesseractPath.trim().isEmpty()) ? tesseractPath.trim() : "tesseract";
        this.tessdataPath = (tessdataPath != null) ? tessdataPath.trim() : "";
    }

    @Override
    public ImageOcrResponse processImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return ImageOcrResponse.failure("No image file provided.");
        }

        String originalFilename = file.getOriginalFilename();
        String extension = getFileExtension(originalFilename);
        if (!isSupportedExtension(extension)) {
            return ImageOcrResponse.failure("Unsupported file format. Please upload a PNG, JPG, or JPEG image.");
        }

        BufferedImage originalImage;
        try (InputStream is = file.getInputStream()) {
            originalImage = ImageIO.read(is);
        } catch (Exception ex) {
            LOGGER.error("Failed to read image stream: {}", ex.getMessage());
            return ImageOcrResponse.failure("Corrupted or unreadable image file: " + ex.getMessage());
        }

        if (originalImage == null) {
            return ImageOcrResponse.failure("Unable to decode image. Please upload a valid PNG, JPG, or JPEG file.");
        }

        String executable = resolveTesseractExecutable();
        if (executable == null) {
            LOGGER.warn("Tesseract executable not found or not configured.");
            return ImageOcrResponse.failure(
                    "Tesseract executable or language data is missing or not configured. Please ensure Tesseract is installed and configured in application.properties or TESSERACT_PATH.",
                    true
            );
        }

        File tempInput = null;
        File tempOutputBase = null;
        File tempOutputFile = null;

        try {
            BufferedImage preprocessed = preprocessImage(originalImage);
            tempInput = File.createTempFile("ocr_input_", ".png");
            ImageIO.write(preprocessed, "png", tempInput);

            tempOutputBase = File.createTempFile("ocr_output_", "");
            String outputBasePath = tempOutputBase.getAbsolutePath();

            String rawText = executeTesseract(executable, tempInput, outputBasePath, "3");
            tempOutputFile = new File(outputBasePath + ".txt");

            if (rawText == null || rawText.trim().length() < 30) {
                // Try PSM 6 (single uniform block of text)
                String altText = executeTesseract(executable, tempInput, outputBasePath, "6");
                if (altText != null && altText.trim().length() > (rawText != null ? rawText.trim().length() : 0)) {
                    rawText = altText;
                }
            }

            if (rawText == null || rawText.trim().isEmpty()) {
                ImageOcrResponse res = new ImageOcrResponse();
                res.setSuccess(true);
                res.setMessage("Image scanned, but no text could be recognized.");
                res.setRawText("");
                return res;
            }

            ImageOcrResponse response = parseExtractedText(rawText);
            response.setSuccess(true);
            response.setMessage("Image OCR completed successfully.");
            return response;

        } catch (Exception ex) {
            LOGGER.error("Error executing image OCR: {}", ex.getMessage(), ex);
            return ImageOcrResponse.failure("Image OCR processing failed: " + ex.getMessage());
        } finally {
            cleanupFile(tempInput);
            cleanupFile(tempOutputBase);
            cleanupFile(tempOutputFile);
        }
    }

    private String resolveTesseractExecutable() {
        if (!"tesseract".equalsIgnoreCase(tesseractPath)) {
            File f = new File(tesseractPath);
            if (f.exists() && f.canExecute()) {
                return f.getAbsolutePath();
            }
        }

        // Check if tesseract command is in system PATH
        if (canExecuteCommand(tesseractPath)) {
            return tesseractPath;
        }

        // Standard Windows paths
        String[] standardPaths = {
                "C:\\Program Files\\Tesseract-OCR\\tesseract.exe",
                "C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe",
                "C:\\Tesseract-OCR\\tesseract.exe",
                "/usr/bin/tesseract",
                "/usr/local/bin/tesseract"
        };

        for (String path : standardPaths) {
            File candidate = new File(path);
            if (candidate.exists() && candidate.canExecute()) {
                return candidate.getAbsolutePath();
            }
        }

        return null;
    }

    private boolean canExecuteCommand(String cmd) {
        try {
            Process p = new ProcessBuilder(cmd, "--version").redirectErrorStream(true).start();
            boolean finished = p.waitFor(3, TimeUnit.SECONDS);
            return finished && p.exitValue() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    public BufferedImage preprocessImage(BufferedImage source) {
        int width = source.getWidth();
        int height = source.getHeight();

        // 1. Rescale if low resolution (target min dimension ~1600-2400px)
        double scale = 1.0;
        int maxDim = Math.max(width, height);
        if (maxDim < 1800) {
            scale = Math.min(2.5, 2200.0 / maxDim);
        } else if (maxDim > 3200) {
            scale = 2600.0 / maxDim;
        }

        int targetWidth = (int) Math.round(width * scale);
        int targetHeight = (int) Math.round(height * scale);

        BufferedImage scaled = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g2d = scaled.createGraphics();
        g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g2d.drawImage(source, 0, 0, targetWidth, targetHeight, null);
        g2d.dispose();

        // 2. Grayscale contrast stretching & threshold normalization
        return enhanceContrast(scaled);
    }

    private BufferedImage enhanceContrast(BufferedImage grayImage) {
        int width = grayImage.getWidth();
        int height = grayImage.getHeight();
        int[] histogram = new int[256];

        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int rgb = grayImage.getRGB(x, y) & 0xFF;
                histogram[rgb]++;
            }
        }

        int totalPixels = width * height;
        int low = 0;
        int count = 0;
        for (; low < 255; low++) {
            count += histogram[low];
            if (count >= totalPixels * 0.02) break;
        }

        int high = 255;
        count = 0;
        for (; high > 0; high--) {
            count += histogram[high];
            if (count >= totalPixels * 0.03) break;
        }

        double contrastFactor = 255.0 / Math.max(1, high - low);
        int threshold = (low + high) / 2;

        BufferedImage result = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int gray = grayImage.getRGB(x, y) & 0xFF;
                int enhanced = (int) Math.round((gray - low) * contrastFactor);
                enhanced = Math.max(0, Math.min(255, enhanced));

                // Binarize / sharpen text
                int sharpened = enhanced < threshold * 0.85
                        ? (int) (enhanced * 0.8)
                        : (enhanced > threshold * 1.15 ? Math.min(255, (int)(enhanced * 1.15)) : enhanced);

                int rgb = (sharpened << 16) | (sharpened << 8) | sharpened;
                result.setRGB(x, y, rgb);
            }
        }
        return result;
    }

    private String executeTesseract(String executable, File inputFile, String outputBasePath, String psm) throws Exception {
        List<String> command = new ArrayList<>();
        command.add(executable);
        command.add(inputFile.getAbsolutePath());
        command.add(outputBasePath);
        command.add("-l");
        command.add("eng");
        command.add("--psm");
        command.add(psm);

        if (tessdataPath != null && !tessdataPath.trim().isEmpty()) {
            command.add("--tessdata-dir");
            command.add(tessdataPath.trim());
        }

        ProcessBuilder pb = new ProcessBuilder(command);
        if (tessdataPath != null && !tessdataPath.trim().isEmpty()) {
            pb.environment().put("TESSDATA_PREFIX", tessdataPath.trim());
        }
        pb.redirectErrorStream(true);

        Process process = pb.start();
        boolean completed = process.waitFor(30, TimeUnit.SECONDS);
        if (!completed) {
            process.destroyForcibly();
            throw new RuntimeException("Tesseract OCR execution timed out after 30 seconds.");
        }

        File resultFile = new File(outputBasePath + ".txt");
        if (!resultFile.exists()) {
            return "";
        }

        return new String(Files.readAllBytes(resultFile.toPath()), StandardCharsets.UTF_8);
    }

    public ImageOcrResponse parseExtractedText(String text) {
        ImageOcrResponse response = new ImageOcrResponse();
        response.setRawText(text);

        // 1. GSTIN Extraction
        String gstin = extractGstin(text);
        response.setGstin(gstin);

        // State Code & State Name from GSTIN
        if (gstin != null && gstin.length() >= 2) {
            String stateCode = gstin.substring(0, 2);
            response.setStateCode(stateCode);
            response.setState(STATE_CODE_MAP.get(stateCode));
            response.setStateName(STATE_CODE_MAP.get(stateCode));
        }

        // 2. PAN Extraction & Cross-Validation with GSTIN
        String explicitPan = extractExplicitPan(text);
        String gstinDerivedPan = (gstin != null && gstin.length() >= 12) ? gstin.substring(2, 12) : null;

        if (explicitPan != null && gstinDerivedPan != null) {
            if (!explicitPan.equalsIgnoreCase(gstinDerivedPan)) {
                response.setPanMismatch(true);
                response.setPan(explicitPan);
            } else {
                response.setPanMismatch(false);
                response.setPan(explicitPan);
            }
        } else if (explicitPan != null) {
            response.setPan(explicitPan);
            response.setPanMismatch(false);
        } else if (gstinDerivedPan != null) {
            response.setPan(gstinDerivedPan);
            response.setPanMismatch(false);
        }

        // 3. Trade Name & Legal Name
        String tradeName = extractTradeName(text);
        String legalName = extractLegalName(text);
        response.setTradeName(tradeName);
        response.setLegalName(legalName);

        String businessName = (tradeName != null && !tradeName.isEmpty()) ? tradeName : legalName;
        response.setBusinessName(businessName);
        if (businessName != null && businessName.length() > 40) {
            response.setCompanyNameTooLong(true);
        } else {
            response.setCompanyNameTooLong(false);
        }

        // 4. Address, City, District, PIN Code
        String address = extractAddress(text);
        response.setAddress(cleanAndShortenAddress(address, 100));

        String pincode = extractPincode(text);
        response.setPincode(pincode);

        String city = extractCity(text);
        response.setCity(city);

        String district = extractDistrict(text);
        response.setDistrict(district);

        return response;
    }

    public static String correctGstinCandidate(String candidate) {
        if (candidate == null) return null;
        String clean = candidate.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (clean.length() == 16 && clean.matches(".*Z0[A-Z0-9]$")) {
            clean = clean.substring(0, clean.length() - 3) + "Z" + clean.charAt(clean.length() - 1);
        }
        if (clean.length() != 15) return null;
        char[] chars = clean.toCharArray();
        for (int i = 0; i < 2; i++) {
            if (Character.isLetter(chars[i])) chars[i] = LETTER_TO_DIGIT.getOrDefault(chars[i], chars[i]);
        }
        for (int i = 2; i < 7; i++) {
            if (Character.isDigit(chars[i])) chars[i] = DIGIT_TO_LETTER.getOrDefault(chars[i], chars[i]);
        }
        for (int i = 7; i < 11; i++) {
            if (Character.isLetter(chars[i])) chars[i] = LETTER_TO_DIGIT.getOrDefault(chars[i], chars[i]);
        }
        if (Character.isDigit(chars[11])) {
            chars[11] = DIGIT_TO_LETTER.getOrDefault(chars[11], chars[11]);
        }
        if (chars[13] != 'Z' && (chars[13] == '2' || chars[13] == '7' || chars[13] == 'S')) {
            chars[13] = 'Z';
        }
        String corrected = new String(chars);
        return GSTIN_PATTERN.matcher(corrected).matches() ? corrected : null;
    }

    private String extractGstin(String text) {
        String firstPatternMatch = null;
        Matcher matcher = GSTIN_PATTERN.matcher(text);
        while (matcher.find()) {
            String candidate = matcher.group(1).toUpperCase(Locale.ROOT);
            if (isValidGstinChecksum(candidate)) {
                return candidate;
            }
            if (firstPatternMatch == null) {
                firstPatternMatch = candidate;
            }
        }

        // Structural and confusable character repair
        Pattern loosePattern = Pattern.compile("\\b([0-9A-Z]{15})\\b");
        Matcher looseMatcher = loosePattern.matcher(text.toUpperCase(Locale.ROOT));
        while (looseMatcher.find()) {
            String candidate = looseMatcher.group(1);
            String structurallyCorrected = correctGstinCandidate(candidate);
            if (structurallyCorrected != null) {
                if (isValidGstinChecksum(structurallyCorrected)) {
                    return structurallyCorrected;
                }
                String repaired = repairGstinByChecksum(structurallyCorrected);
                if (repaired != null) {
                    return repaired;
                }
                if (firstPatternMatch == null) {
                    firstPatternMatch = structurallyCorrected;
                }
            } else {
                String repaired = repairGstinByChecksum(candidate);
                if (repaired != null) {
                    return repaired;
                }
            }
        }

        return firstPatternMatch;
    }

    private String extractExplicitPan(String text) {
        Pattern explicitPattern = Pattern.compile("(?:Permanent\\s+Account\\s+Number|PAN)\\s*[:\\-]?\\s*([A-Z]{5}[0-9]{4}[A-Z])\\b", Pattern.CASE_INSENSITIVE);
        Matcher matcher = explicitPattern.matcher(text);
        if (matcher.find()) {
            return matcher.group(1).toUpperCase(Locale.ROOT);
        }

        Matcher panMatcher = PAN_PATTERN.matcher(text);
        while (panMatcher.find()) {
            return panMatcher.group(1).toUpperCase(Locale.ROOT);
        }
        return null;
    }

    private String extractLegalName(String text) {
        Pattern pattern = Pattern.compile("(?:1\\.?\\s*)?(?:Legal\\s+Name(?:\\s+of\\s+Business)?)\\s*[:\\-]?\\s*([^\\n\\r|]+)", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            return cleanName(matcher.group(1));
        }
        return null;
    }

    private String extractTradeName(String text) {
        Pattern pattern = Pattern.compile("(?:2\\.?\\s*)?(?:Trade\\s+Name(?:\\s*,\\s*if\\s+any)?)\\s*[:\\-]?\\s*([^\\n\\r|]+)", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(text);
        if (matcher.find()) {
            return cleanName(matcher.group(1));
        }
        return null;
    }

    private String cleanName(String name) {
        if (name == null) return null;
        String cleaned = name.replaceAll("(?i)\\b(?:NA|N/A|None|Not Applicable)\\b", "")
                .replaceAll("[|;:_~*]+", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return cleaned.isEmpty() ? null : cleaned;
    }

    private String extractAddress(String text) {
        Pattern addressPattern = Pattern.compile("(?:Address\\s+of\\s+Principal\\s+Place\\s+of\\s+Business|Principal\\s+Place\\s+of\\s+Business)\\s*[:\\-]?\\s*([\\s\\S]*?)(?:\\b(?:Date\\s+of\\s+Liability|Date\\s+of\\s+Validity|Type\\s+of\\s+Registration|Registration\\s+Period|Details\\s+of\\s+Additional)\\b|\\n\\s*\\d{1,2}\\s*[.)])", Pattern.CASE_INSENSITIVE);
        Matcher matcher = addressPattern.matcher(text);
        if (matcher.find()) {
            String raw = matcher.group(1).replaceAll("[|\\r\\n]+", ", ")
                    .replaceAll("\\s+", " ")
                    .replaceAll(",\\s*,+", ",")
                    .trim();
            return raw;
        }

        // Fallback: look for Building/Premises/Road
        Pattern structuredPattern = Pattern.compile("(?:Building\\s+No|Floor\\s+No|Name\\s+Of\\s+Premises|Road\\s*/\\s*Street)[\\s\\S]*?(?=\\n\\s*\\d{1,2}\\s*[.)]|$)", Pattern.CASE_INSENSITIVE);
        Matcher structMatcher = structuredPattern.matcher(text);
        if (structMatcher.find()) {
            return structMatcher.group(0).replaceAll("[|\\r\\n]+", ", ").replaceAll("\\s+", " ").trim();
        }

        return null;
    }

    private String extractCity(String text) {
        Pattern cityPattern = Pattern.compile("(?:City\\s*/\\s*Town\\s*/\\s*Village|City)\\s*[:\\-]?\\s*([A-Za-z\\s]+?)(?:,|\\n|District|State|PIN)", Pattern.CASE_INSENSITIVE);
        Matcher matcher = cityPattern.matcher(text);
        if (matcher.find()) {
            String city = matcher.group(1).trim();
            if (city.length() > 2 && city.length() < 30) {
                return city;
            }
        }
        return null;
    }

    private String extractDistrict(String text) {
        Pattern distPattern = Pattern.compile("(?:District)\\s*[:\\-]?\\s*([A-Za-z\\s]+?)(?:,|\\n|State|PIN)", Pattern.CASE_INSENSITIVE);
        Matcher matcher = distPattern.matcher(text);
        if (matcher.find()) {
            String dist = matcher.group(1).trim();
            if (dist.length() > 2 && dist.length() < 30) {
                return dist;
            }
        }
        return null;
    }

    private String extractPincode(String text) {
        Pattern pinPattern = Pattern.compile("(?:PIN\\s*Code|Pincode)\\s*[:\\-]?\\s*([1-9][0-9]{5})\\b", Pattern.CASE_INSENSITIVE);
        Matcher matcher = pinPattern.matcher(text);
        if (matcher.find()) {
            return matcher.group(1);
        }
        Matcher generalMatcher = PINCODE_PATTERN.matcher(text);
        if (generalMatcher.find()) {
            return generalMatcher.group(1);
        }
        return null;
    }

    public static String cleanAndShortenAddress(String address, int maxLength) {
        if (address == null || address.trim().isEmpty() || maxLength <= 0) {
            return "";
        }

        String normalized = address
                .replaceAll("[\\r\\n]+", ",")
                .replaceAll("[|;]", ",")
                .replaceAll("\\s+", " ")
                .replaceAll("[,;:]\\s*[,;:]+", ",")
                .replaceAll("\\s*,\\s*", ",")
                .trim();

        if (normalized.length() <= maxLength) {
            return normalized;
        }

        String[] tokens = normalized.split(",");
        StringBuilder sb = new StringBuilder();
        for (String token : tokens) {
            String trimmed = token.trim();
            if (trimmed.isEmpty()) continue;
            if (sb.length() > 0 && sb.length() + 1 + trimmed.length() > maxLength) {
                break;
            }
            if (sb.length() > 0) {
                sb.append(", ");
            }
            sb.append(trimmed);
        }

        if (sb.length() == 0) {
            return normalized.substring(0, Math.min(normalized.length(), maxLength)).trim();
        }
        return sb.toString();
    }

    private boolean isValidGstinChecksum(String gstin) {
        if (gstin == null || gstin.length() != 15) return false;
        try {
            int sum = 0;
            for (int i = 0; i < 14; i++) {
                int codePoint = GSTIN_CHARSET.indexOf(gstin.charAt(i));
                if (codePoint < 0) return false;
                int factor = (i % 2 == 0) ? 1 : 2;
                int product = codePoint * factor;
                sum += (product / 36) + (product % 36);
            }
            int remainder = sum % 36;
            int checkCodePoint = (36 - remainder) % 36;
            return GSTIN_CHARSET.charAt(checkCodePoint) == gstin.charAt(14);
        } catch (Exception e) {
            return false;
        }
    }

    private String repairGstinByChecksum(String candidate) {
        if (candidate == null || candidate.length() != 15) return null;
        char[] chars = candidate.toCharArray();

        // Check if already valid
        if (isValidGstinChecksum(candidate)) return candidate;

        // Try single character replacements for confusables (0 <-> O, 1 <-> I, etc.)
        Map<Character, char[]> confusables = new HashMap<>();
        confusables.put('0', new char[]{'O', 'D'});
        confusables.put('O', new char[]{'0'});
        confusables.put('1', new char[]{'I'});
        confusables.put('I', new char[]{'1'});
        confusables.put('5', new char[]{'S'});
        confusables.put('S', new char[]{'5'});
        confusables.put('8', new char[]{'B'});
        confusables.put('B', new char[]{'8'});
        confusables.put('2', new char[]{'Z'});
        confusables.put('Z', new char[]{'2'});

        for (int i = 0; i < 15; i++) {
            char original = chars[i];
            char[] alts = confusables.get(original);
            if (alts != null) {
                for (char alt : alts) {
                    chars[i] = alt;
                    String test = new String(chars);
                    if (isValidGstinChecksum(test)) {
                        return test;
                    }
                }
                chars[i] = original;
            }
        }
        return null;
    }

    private String getFileExtension(String filename) {
        if (filename == null || !filename.contains(".")) return "";
        return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
    }

    private boolean isSupportedExtension(String ext) {
        return "png".equals(ext) || "jpg".equals(ext) || "jpeg".equals(ext);
    }

    private void cleanupFile(File file) {
        if (file != null && file.exists()) {
            try {
                file.delete();
            } catch (Exception ignored) {}
        }
    }
}
