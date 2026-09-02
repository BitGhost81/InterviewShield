package com.interviewshield.backend.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.interviewshield.backend.model.ActivityLog;

public interface ActivityLogRepository extends JpaRepository<ActivityLog, Long>{
	List<ActivityLog> findBySessionCodeAndCandidateId(String sessionCode, Long CandidateId);
	List<ActivityLog> findBySessionCode(String sessionCode);
}
