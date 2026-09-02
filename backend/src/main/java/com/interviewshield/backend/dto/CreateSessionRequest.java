package com.interviewshield.backend.dto;

public class CreateSessionRequest {
    private String title;
    private String problemStatement;
    private Long createdBy;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getProblemStatement() { return problemStatement; }
    public void setProblemStatement(String problemStatement) { this.problemStatement = problemStatement; }

    public Long getCreatedBy() { return createdBy; }
    public void setCreatedBy(Long createdBy) { this.createdBy = createdBy; }
}