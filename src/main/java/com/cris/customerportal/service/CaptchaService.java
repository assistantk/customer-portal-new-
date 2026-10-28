package com.cris.customerportal.service;

import javax.imageio.ImageIO;
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

import org.springframework.stereotype.Service;

@Service
public class CaptchaService {

    private static final String SESSION_KEY = CaptchaService.class.getName() + ".answer";
    private static final String CAPTCHA_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    private static final int WIDTH = 150;
    private static final int HEIGHT = 40;
    private final SecureRandom random = new SecureRandom();

    public String createChallengeImage(HttpSession session) {
        String answer = generateAnswer();
        session.setAttribute(SESSION_KEY, answer);

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

            graphics.setFont(new Font(Font.SANS_SERIF, Font.BOLD | Font.ITALIC, 25));
            for (int i = 0; i < answer.length(); i++) {
                graphics.setColor(new Color(220 + random.nextInt(36), 220 + random.nextInt(36),
                        220 + random.nextInt(36)));
                graphics.drawString(String.valueOf(answer.charAt(i)), 10 + i * 22, 30 + random.nextInt(5));
            }

            ByteArrayOutputStream output = new ByteArrayOutputStream();
            if (!ImageIO.write(image, "png", output)) {
                throw new IllegalStateException("PNG image encoder is unavailable.");
            }
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(output.toByteArray());
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to generate CAPTCHA image.", exception);
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
}
