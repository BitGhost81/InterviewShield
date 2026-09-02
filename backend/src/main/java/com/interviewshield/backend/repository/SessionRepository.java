package com.interviewshield.backend.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.interviewshield.backend.model.InterviewSession;
 

public interface SessionRepository extends JpaRepository<InterviewSession, Long>{
	Optional<InterviewSession> findBySessionCode(String sessionCode);
	boolean existsBySessionCode(String sessionCode);
}
