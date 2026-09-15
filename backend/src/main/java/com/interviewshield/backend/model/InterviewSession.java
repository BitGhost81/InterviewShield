package com.interviewshield.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "sessions")
public class InterviewSession {
	
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private long id;
	
	@Column(unique = true)
	private String sessionCode;
	
	
	private String title;
	
	@Column(columnDefinition = "TEXT")
	private String problemStatement;
	
	private Long createdBy;
	
	private String status;
	
	@Column(columnDefinition = "LONGTEXT")
	private String aiTranscript;

	@Column(columnDefinition = "LONGTEXT")
	private String aiReportJson;

	@Column(length = 30)
	private String aiStatus;
	
	private LocalDateTime createdAt;
	
	@PrePersist
	public void prePersist() {
		this.createdAt = LocalDateTime.now();
		this.status = "ACTIVE";
		if (this.aiStatus == null) {
			this.aiStatus = "PENDING";
		}
	}

	public long getId() {
		return id;
	}

	public void setId(long id) {
		this.id = id;
	}

	public String getSessionCode() {
		return sessionCode;
	}

	public void setSessionCode(String sessionCode) {
		this.sessionCode = sessionCode;
	}

	public String getTitle() {
		return title;
	}

	public void setTitle(String title) {
		this.title = title;
	}

	public String getProblemStatement() {
		return problemStatement;
	}

	public void setProblemStatement(String problemStatement) {
		this.problemStatement = problemStatement;
	}

	public Long getCreatedBy() {
		return createdBy;
	}

	public void setCreatedBy(Long createdBy) {
		this.createdBy = createdBy;
	}

	public String getStatus() {
		return status;
	}

	public void setStatus(String status) {
		this.status = status;
	}

	public String getAiTranscript() {
		return aiTranscript;
	}

	public void setAiTranscript(String aiTranscript) {
		this.aiTranscript = aiTranscript;
	}

	public String getAiReportJson() {
		return aiReportJson;
	}

	public void setAiReportJson(String aiReportJson) {
		this.aiReportJson = aiReportJson;
	}

	public String getAiStatus() {
		return aiStatus;
	}

	public void setAiStatus(String aiStatus) {
		this.aiStatus = aiStatus;
	}

	public LocalDateTime getCreatedAt() {
		return createdAt;
	}

	public void setCreatedAt(LocalDateTime createdAt) {
		this.createdAt = createdAt;
	}
	
}
