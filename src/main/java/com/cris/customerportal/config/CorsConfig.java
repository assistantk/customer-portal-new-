package com.cris.customerportal.config;
import org.springframework.context.annotation.*; import org.springframework.web.servlet.config.annotation.*;
@Configuration public class CorsConfig implements WebMvcConfigurer { @Override public void addCorsMappings(CorsRegistry r){r.addMapping("/api/**").allowedOrigins("http://localhost:5173").allowedMethods("GET","POST").allowedHeaders("*");} }
