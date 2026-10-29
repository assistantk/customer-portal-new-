package com.cris.customerportal.service;

import javax.imageio.ImageIO;
import javax.annotation.PostConstruct;
import javax.servlet.http.HttpSession;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class CaptchaService {

    static {
        System.setProperty("java.awt.headless", "true");
    }

    private static final Logger LOGGER = LoggerFactory.getLogger(CaptchaService.class);
    private static final String SESSION_KEY = CaptchaService.class.getName() + ".answer";
    private static final String CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    private static final int WIDTH = 150;
    private static final int HEIGHT = 40;
    private static final String[] FONT_FAMILIES = {
            Font.SANS_SERIF,
            Font.DIALOG,
            Font.MONOSPACED
    };
    private final SecureRandom random = new SecureRandom();

    @PostConstruct
    public void verifyFontRendering() {
        try {
            renderImage(generateAnswer());
            LOGGER.info("CAPTCHA AWT font rendering self-check succeeded (headless={}).",
                    System.getProperty("java.awt.headless"));
        } catch (Throwable failure) {
            LOGGER.error("CAPTCHA AWT font rendering self-check failed.", failure);
        }
    }

    public String createChallengeImage(HttpSession session) {
        try {
            String answer = generateAnswer();
            session.setAttribute(SESSION_KEY, answer);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(renderImage(answer));
        } catch (Throwable failure) {
            LOGGER.error("Unable to generate CAPTCHA image in the current AWT environment.", failure);
            throw new CaptchaGenerationException("Unable to generate CAPTCHA image.", failure);
        }
    }

    private byte[] renderImage(String answer) {
        Throwable lastFailure = null;
        for (String fontFamily : FONT_FAMILIES) {
            try {
                return renderImage(answer, fontFamily);
            } catch (Throwable failure) {
                lastFailure = failure;
            }
        }
        throw new IllegalStateException("CAPTCHA image rendering failed with all logical font fallbacks.",
                lastFailure);
    }

    private byte[] renderImage(String answer, String fontFamily) throws IOException {
        BufferedImage image = new BufferedImage(WIDTH, HEIGHT, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.setColor(new Color(30, 41, 59));
            graphics.fillRect(0, 0, WIDTH, HEIGHT);

            for (int i = 0; i < 5; i++) {
                graphics.setColor(new Color(random.nextInt(256), random.nextInt(256), random.nextInt(256), 180));
                graphics.drawLine(random.nextInt(WIDTH), random.nextInt(HEIGHT),
                        random.nextInt(WIDTH), random.nextInt(HEIGHT));
            }

            graphics.setFont(new Font(fontFamily, Font.BOLD | Font.ITALIC, 25));
            for (int i = 0; i < answer.length(); i++) {
                graphics.setColor(new Color(220 + random.nextInt(36), 220 + random.nextInt(36),
                        220 + random.nextInt(36)));
                graphics.drawString(String.valueOf(answer.charAt(i)), 10 + i * 22, 30 + random.nextInt(5));
            }

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!ImageIO.write(image, "png", output)) {
                throw new IllegalStateException("PNG image encoder is unavailable.");
            }
            return output.toByteArray();
        } finally {
            graphics.dispose();
        }
    }

    public boolean consumeChallenge(HttpSession session, String submittedAnswer) {
        Object storedAnswer = session.getAttribute(SESSION_KEY);
        session.removeAttribute(SESSION_KEY);

        if (!(storedAnswer instanceof String) || submittedAnswer == null) {
            return false;
        }

        return MessageDigest.isEqual(
                ((String) storedAnswer).getBytes(StandardCharsets.UTF_8),
                submittedAnswer.getBytes(StandardCharsets.UTF_8));
    }

    private String generateAnswer() {
        StringBuilder answer = new StringBuilder(6);
        for (int i = 0; i < 6; i++) {
            answer.append(CAPTCHA_CHARS.charAt(random.nextInt(CAPTCHA_CHARS.length())));
        }
        return answer.toString();
    }

    public static class CaptchaGenerationException extends RuntimeException {
        public CaptchaGenerationException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
