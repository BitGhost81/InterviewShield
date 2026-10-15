package com.interviewshield.backend.repository;

import java.util.Optional;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import com.interviewshield.backend.model.InterviewSession;
 

public interface SessionRepository extends JpaRepository<InterviewSession, Long>{
	Optional<InterviewSession> findBySessionCode(String sessionCode);
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select s from InterviewSession s where s.sessionCode = :code")
	Optional<InterviewSession> findBySessionCodeForUpdate(@Param("code") String code);
	boolean existsBySessionCode(String sessionCode);
	List<InterviewSession> findByCreatedByOrderByCreatedAtDesc(Long createdBy);
}
