package com.cris.customerportal.exception;
import org.springframework.http.*; import org.springframework.web.bind.MethodArgumentNotValidException; import org.springframework.web.bind.annotation.*; import java.time.Instant; import java.util.*;
@RestControllerAdvice public class GlobalExceptionHandler {
 @ExceptionHandler(MethodArgumentNotValidException.class) ResponseEntity<?> validation(MethodArgumentNotValidException e){String m=e.getBindingResult().getFieldErrors().stream().findFirst().map(x->x.getDefaultMessage()).orElse("Validation failed");return error(HttpStatus.BAD_REQUEST,m);}
 @ExceptionHandler({InvalidCredentialsException.class}) ResponseEntity<?> invalidCredentials(RuntimeException e){return error(HttpStatus.UNAUTHORIZED, e.getMessage());}
 @ExceptionHandler({AccountInactiveException.class}) ResponseEntity<?> accountInactive(RuntimeException e){return error(HttpStatus.FORBIDDEN, e.getMessage());}
 @ExceptionHandler({DatabaseUnavailableException.class}) ResponseEntity<?> databaseUnavailable(RuntimeException e){return error(HttpStatus.SERVICE_UNAVAILABLE, e.getMessage());}
 @ExceptionHandler({ResourceAlreadyExistsException.class}) ResponseEntity<?> duplicate(RuntimeException e){return error(HttpStatus.CONFLICT,e.getMessage());}
 @ExceptionHandler({ResourceNotFoundException.class}) ResponseEntity<?> notFound(RuntimeException e){return error(HttpStatus.NOT_FOUND,e.getMessage());}
 @ExceptionHandler({IllegalArgumentException.class}) ResponseEntity<?> bad(RuntimeException e){return error(HttpStatus.BAD_REQUEST,e.getMessage());}
 @ExceptionHandler(Exception.class) ResponseEntity<?> general(Exception e){return error(HttpStatus.INTERNAL_SERVER_ERROR, e.getMessage() + " - " + Arrays.toString(e.getStackTrace()));}
 private ResponseEntity<?> error(HttpStatus s,String m){Map<String,Object> body=new HashMap<>();body.put("success",false);body.put("message",m);body.put("timestamp",Instant.now().toString());return ResponseEntity.status(s).body(body);}
}
