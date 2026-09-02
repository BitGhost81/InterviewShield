package com.interviewshield.backend.service;

import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.interviewshield.backend.dto.LoginRequest;
import com.interviewshield.backend.dto.RegisterRequest;
import com.interviewshield.backend.model.User;
import com.interviewshield.backend.repository.UserRepository;
import com.interviewshield.backend.security.JwtUtil;

@Service
public class AuthService {
	
	@Autowired	
	private UserRepository userRepository;
	
	@Autowired
	private PasswordEncoder passwordEncoder;
	
	@Autowired
	private JwtUtil jwtUtil;
	
	public Map<String, Object> register(RegisterRequest request){
		Map<String, Object> response = new HashMap<>();
		
		if(userRepository.existsByEmail(request.getEmail())) {
			response.put("Error", "Email already exists");
			return response;
		}
		
		User user = new User();
		user.setName(request.getName());
		user.setEmail(request.getEmail());
		user.setPassword(passwordEncoder.encode(request.getPassword()));
		user.setRole(request.getRole());
		
		User saved = userRepository.save(user);
		
		String token = jwtUtil.generateToken(saved.getEmail(), saved.getRole());
		
		response.put("token", token);
		response.put("id", saved.getId());
		response.put("name", saved.getName());
		response.put("email", saved.getEmail());
		response.put("role", saved.getRole());
		
		return response;
		
	} 
	
	public Map<String, Object> login(LoginRequest request){
		Map<String, Object> response = new HashMap<>();
		
		User user = userRepository.findByEmail(request.getEmail()).orElse(null);
		
		if(user == null || !passwordEncoder.matches(request.getPassword(), user.getPassword())) {
			response.put("Error", "Invalid email or password");
			return response;
		}
		
		String token = jwtUtil.generateToken(user.getEmail(), user.getRole());
		
		response.put("token", token);
		response.put("id", user.getId());
		response.put("name", user.getName());
		response.put("email", user.getEmail());
		response.put("role", user.getRole());
		
		return response;
	}
}
