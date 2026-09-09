package com.interviewshield.backend.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

import com.interviewshield.backend.model.ActivityLog;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, Long>{
	List<ActivityLog> findBySessionCodeAndCandidateId(String sessionCode, Long CandidateId);
	List<ActivityLog> findBySessionCode(String sessionCode);
	Optional<ActivityLog> findTopBySessionCodeAndCandidateIdIsNotNullOrderByCreatedAtDesc(String sessionCode);

	@Modifying
	@Transactional
	void deleteBySessionCode(String sessionCode);
}
