package com.cris.customerportal.exception;
import org.springframework.http.*; import org.springframework.web.bind.MethodArgumentNotValidException; import org.springframework.web.bind.annotation.*; import java.time.Instant; import java.util.*;
@RestControllerAdvice public class GlobalExceptionHandler {
 @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<?> validation(MethodArgumentNotValidException e){String m=e.getBindingResult().getFieldErrors().stream().findFirst().map(x->x.getDefaultMessage()).orElse("Validation failed");return error(HttpStatus.BAD_REQUEST,m);}
 @ExceptionHandler({ResourceAlreadyExistsException.class}) ResponseEntity<?> duplicate(RuntimeException e){return error(HttpStatus.CONFLICT,e.getMessage());}
 @ExceptionHandler({ResourceNotFoundException.class}) ResponseEntity<?> notFound(RuntimeException e){return error(HttpStatus.NOT_FOUND,e.getMessage());}
 @ExceptionHandler({IllegalArgumentException.class}) ResponseEntity<?> bad(RuntimeException e){return error(HttpStatus.BAD_REQUEST,e.getMessage());}
 @ExceptionHandler(Exception.class) ResponseEntity<?> general(Exception e){return error(HttpStatus.INTERNAL_SERVER_ERROR,"Unable to process the request");}
 private ResponseEntity<?> error(HttpStatus s,String m){return ResponseEntity.status(s).body(Map.of("success",false,"message",m,"timestamp",Instant.now().toString()));}
}
